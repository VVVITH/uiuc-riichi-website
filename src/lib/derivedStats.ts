import { loadSqlEquiv } from "./sqlLoader.js";
import { queryRows, queryWrite, withGameTransaction } from "./sqlDatabase.js";
import { applyRatingGame, RatingGame, StoredRatingState } from "./rating.js";

const sql = loadSqlEquiv(import.meta.url);
type RatingRow = { player_id: string; rate: number; games_played: number;
  last_played_ms: number; rookie_handicap: number; opening_rate: number | null;
  opening_games: number | null; opening_last_played_ms: number | null;
  opening_rookie_handicap: number | null };
type GameRow = { game_id: string; semester: string; game_time: string;
  player_id: string; placement: number };
type RecordedRow = GameRow & { is_team_game: number; pt: number };

function ratingGames(rows: GameRow[]): RatingGame[] {
  const games: RatingGame[] = [];
  for (const row of rows) {
    const id = String(row.game_id);
    if (games.at(-1)?.id !== id) games.push({ id, time: row.game_time, players: [] });
    games.at(-1)!.players.push({ id: String(row.player_id), placement: Number(row.placement) });
  }
  return games;
}

async function activeSemester(): Promise<string> {
  const rows = await queryRows<{ semester: string }>(sql.active_semester);
  if (rows.length !== 1) throw new Error("Exactly one semester must be active.");
  return rows[0].semester;
}

function currentState(rows: RatingRow[]): Map<string, StoredRatingState> {
  return new Map(rows.map(row => [String(row.player_id), {
    rate: Number(row.rate), games: Number(row.games_played),
    lastPlayed: Number(row.last_played_ms), rookieHandicap: Number(row.rookie_handicap),
  }]));
}

async function saveRating(id: string, rating: StoredRatingState) {
  await queryWrite(sql.upsert_rating, { player_id: id, rate: rating.rate,
    games_played: rating.games, last_played_ms: rating.lastPlayed,
    rookie_handicap: rating.rookieHandicap });
}

/** Rebuild only the active season; opening_* is the frozen prior-season state. */
export async function rebuildActiveRatings(): Promise<void> {
  return withGameTransaction(async () => {
    const semester = await activeSemester();
    const rows = await queryRows<RatingRow>(sql.ratings);
    const opening = new Map(rows.filter(row => row.opening_rate !== null)
      .map(row => [String(row.player_id), row] as const));
    const state = new Map<string, StoredRatingState>([...opening].map(([id, row]) => [id, {
      rate: Number(row.opening_rate), games: Number(row.opening_games),
      lastPlayed: Number(row.opening_last_played_ms),
      rookieHandicap: Number(row.opening_rookie_handicap),
    }]));
    const games = ratingGames(await queryRows<GameRow>(sql.active_rating_games, { semester }));
    for (const game of games) applyRatingGame(state, game);
    await queryWrite("DELETE FROM player_ratings");
    for (const [id, rating] of state) {
      const prior = opening.get(id);
      await queryWrite(`INSERT INTO player_ratings
        (player_id, rate, games_played, last_played_ms, rookie_handicap,
         opening_rate, opening_games, opening_last_played_ms, opening_rookie_handicap)
        VALUES (:id, :rate, :games, :last_played, :handicap,
          :opening_rate, :opening_games, :opening_last_played, :opening_handicap)`, {
        id, rate: rating.rate, games: rating.games, last_played: rating.lastPlayed,
        handicap: rating.rookieHandicap, opening_rate: prior?.opening_rate ?? null,
        opening_games: prior?.opening_games ?? null,
        opening_last_played: prior?.opening_last_played_ms ?? null,
        opening_handicap: prior?.opening_rookie_handicap ?? null,
      });
    }
  });
}

function pairParams(semester: string, low: RecordedRow, high: RecordedRow) {
  const difference = Number(high.pt) - Number(low.pt);
  return { semester, low_id: String(low.player_id), high_id: String(high.player_id),
    low_win: Number(low.placement < high.placement), tie: Number(low.placement === high.placement),
    low_placement: low.placement, high_placement: high.placement,
    pt_difference: difference, softened: difference / (Math.abs(difference) + 60) };
}

/** Update only the six pairs at this table, in the caller's game transaction. */
export async function updateRivalries(game: RecordedRow[], direction: 1 | -1): Promise<void> {
  if (!game.length || game[0].is_team_game) return;
  const players = [...game].sort((a, b) => BigInt(a.player_id) < BigInt(b.player_id) ? -1 : 1);
  for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
    if (players[i].player_id === players[j].player_id) continue;
    const params = pairParams(game[0].semester, players[i], players[j]);
    if (direction === 1) await queryWrite(sql.add_rivalry, params);
    else {
      const result = await queryWrite(sql.subtract_rivalry, params);
      if (result.affectedRows !== 1) throw new Error("Rivalry summary is missing; run the migration or repair it.");
      await queryWrite(sql.delete_empty_rivalry, params);
    }
  }
}

export async function recordDerivedGame(gameId: number): Promise<void> {
  const game = await queryRows<RecordedRow>(sql.recorded_game, { game_id: gameId });
  if (!game.length || game[0].is_team_game) return;
  if (game.length !== 4 || new Set(game.map(row => String(row.player_id))).size !== 4)
    throw new Error("A rated game must have four distinct players.");
  await updateRivalries(game, 1);
  if (game[0].semester !== await activeSemester()) return; // Historical Rate is frozen.
  const later = await queryRows<{ id: string }>(sql.later_individual_game,
    { semester: game[0].semester, game_id: gameId });
  if (later.length) return rebuildActiveRatings();
  const participants = await queryRows<RatingRow>(sql.game_ratings, Object.fromEntries(
    game.map((row, index) => [`player_${index + 1}`, row.player_id])));
  const rows = participants.length === 4 ? participants : await queryRows<RatingRow>(sql.ratings);
  const state = currentState(rows);
  applyRatingGame(state, { id: String(gameId), time: game[0].game_time,
    players: game.map(row => ({ id: String(row.player_id), placement: Number(row.placement) })) });
  for (const row of game) await saveRating(String(row.player_id), state.get(String(row.player_id))!);
}

export async function removeDerivedGame(gameId: number): Promise<boolean> {
  const game = await queryRows<RecordedRow>(sql.recorded_game, { game_id: gameId });
  if (!game.length || game[0].is_team_game) return false;
  await updateRivalries(game, -1);
  return game[0].semester === await activeSemester();
}

/** Freeze current Rate and make it the next semester's opening state. */
export async function activateSemester(name: string): Promise<void> {
  return withGameTransaction(async () => {
    const current = await activeSemester();
    if (current === name) return;
    const target = await queryRows<{ semester: string; rate_closed: number }>(
      "SELECT semester, rate_closed FROM semesters WHERE semester = :name", { name });
    if (target.length !== 1) throw new Error(`Semester ${name} does not exist.`);
    if (target[0].rate_closed) throw new Error("This semester's Rate is closed and cannot be reopened.");
    const games = await queryRows<{ count: number }>(
      "SELECT COUNT(*) AS count FROM games WHERE semester = :name", { name });
    if (Number(games[0].count) !== 0) {
      throw new Error("Only a new, empty semester can become active; finished seasons are frozen.");
    }
    await queryWrite(`UPDATE player_ratings SET opening_rate = rate,
      opening_games = games_played, opening_last_played_ms = last_played_ms,
      opening_rookie_handicap = rookie_handicap`);
    await queryWrite("UPDATE semesters SET rate_closed = 1 WHERE semester = :current", { current });
    await queryWrite("UPDATE semesters SET active = (semester = :name)", { name });
  });
}
