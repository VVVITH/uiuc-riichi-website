import 'dotenv/config';
import {fileURLToPath} from 'node:url';
import {loadSql} from '../dist/lib/sqlLoader.js';
import {closeDatabase,queryRows,queryWrite,withGameTransaction} from '../dist/lib/sqlDatabase.js';
import {rebuildActiveRatings} from '../dist/lib/derivedStats.js';

const sql=loadSql(fileURLToPath(new URL('../dist/lib/derivedStats.sql',import.meta.url)));
try {
  await withGameTransaction(async()=>{
    const active=await queryRows('SELECT semester,rate_closed FROM semesters WHERE active=1');
    if(active.length!==1||active[0].rate_closed)
      throw new Error('Exactly one open semester must be active before repair.');
    await rebuildActiveRatings();
    await queryWrite('DELETE FROM player_rivalries');
    await queryWrite(sql.rebuild_rivalries);
  });
  const [[rates],[rivalries]]=await Promise.all([
    queryRows('SELECT COUNT(*) AS count FROM player_ratings'),
    queryRows('SELECT COUNT(*) AS count FROM player_rivalries'),
  ]);
  console.log(`Repaired ${rates.count} Rates from the current season checkpoint and ${rivalries.count} rivalry summaries.`);
} finally {await closeDatabase()}
