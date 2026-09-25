import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {applyRatingGame} from '../dist/lib/rating.js';
import {connectToDatabase} from '../dist/lib/sqlDatabase.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const database=process.env.DB_NAME || 'uiucriichi_data';
const connection=await connectToDatabase();
const lock=`riichi-games-${createHash('sha256').update(database).digest('hex').slice(0,32)}`;

function blocks(source) {
  return Object.fromEntries([...source.matchAll(/^-- BLOCK (\w+)\n([\s\S]*?)(?=^-- BLOCK |$(?![\s\S]))/gm)]
    .map(([,name,query])=>[name,query.trim()]));
}
function groups(rows) {
  const games=[];
  for(const row of rows) {
    const id=String(row.game_id);
    if(games.at(-1)?.id!==id) games.push({id,semester:row.semester,time:row.game_time,players:[]});
    games.at(-1).players.push({id:String(row.player_id),placement:Number(row.placement)});
  }
  return games;
}

let locked=false;
try {
  const [lockRows]=await connection.execute('SELECT GET_LOCK(?, 10) AS acquired',[lock]);
  if(Number(lockRows[0].acquired)!==1) throw new Error('Game writes are busy; retry the migration.');
  locked=true;
  const schema=fs.readFileSync(path.join(root,'migrations/001_derived_stats.sql'),'utf8');
  for(const statement of schema.split(';').map(s=>s.trim()).filter(Boolean)) {
    if(statement.startsWith('ALTER TABLE semesters')) {
      const [[column]]=await connection.query(`SELECT COUNT(*) AS count FROM information_schema.columns
        WHERE table_schema=? AND table_name='semesters' AND column_name='rate_closed'`,[database]);
      if(Number(column.count)) continue;
    }
    await connection.query(statement);
  }
  const [[ratingCount]]=await connection.query('SELECT COUNT(*) AS count FROM player_ratings');
  const [[rivalryCount]]=await connection.query('SELECT COUNT(*) AS count FROM player_rivalries');
  if(Number(ratingCount.count)||Number(rivalryCount.count))
    throw new Error('Derived tables already contain data; refusing to overwrite them.');
  const sql=blocks(fs.readFileSync(path.join(root,'src/lib/derivedStats.sql'),'utf8'));
  await connection.beginTransaction();
  try {
    const [semesters]=await connection.query('SELECT semester FROM semesters WHERE active=1');
    if(semesters.length!==1) throw new Error('Exactly one semester must be active before migration.');
    const active=semesters[0].semester;
    await connection.execute('UPDATE semesters SET rate_closed=(semester<>?)',[active]);
    const [rows]=await connection.query(sql.rating_games);
    const games=groups(rows);
    const state=new Map();
    let opening=null;
    for(const game of games) {
      if(game.semester===active && opening===null)
        opening=new Map([...state].map(([id,r])=>[id,{...r}]));
      if(game.semester!==active && opening!==null)
        throw new Error('Historical and active games overlap chronologically; review season order before freezing Rate.');
      applyRatingGame(state,game);
    }
    opening??=new Map([...state].map(([id,r])=>[id,{...r}]));
    for(const [id,r] of state) {
      const prior=opening.get(id);
      await connection.execute(`INSERT INTO player_ratings
        (player_id,rate,games_played,last_played_ms,rookie_handicap,
         opening_rate,opening_games,opening_last_played_ms,opening_rookie_handicap)
        VALUES (?,?,?,?,?,?,?,?,?)`,[id,r.rate,r.games,r.lastPlayed,r.rookieHandicap,
        prior?.rate??null,prior?.games??null,prior?.lastPlayed??null,prior?.rookieHandicap??null]);
    }
    await connection.query(sql.rebuild_rivalries);
    await connection.commit();
    const [[rivals]]=await connection.query('SELECT COUNT(*) AS count FROM player_rivalries');
    console.log(`Migrated ${games.length} games: ${state.size} current Rates, ${rivals.count} season-opponent summaries; active semester ${active}.`);
  } catch(error) {await connection.rollback();throw error;}
} finally {
  if(locked) await connection.execute('DO RELEASE_LOCK(?)',[lock]);
  await connection.end();
}
