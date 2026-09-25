import {queryRows} from './sqlDatabase.js';
import {RatingState} from './rating.js';

/** Read materialized Rate; score writes maintain it in the same transaction. */
export async function getLifetimeRatings(): Promise<Map<string, RatingState>> {
  const rows = await queryRows<{ player_id: string; rate: number; games_played: number }>(
    'SELECT player_id, rate, games_played FROM player_ratings');
  return new Map(rows.map(row => [String(row.player_id),
    { rate: Number(row.rate), games: Number(row.games_played) }]));
}

export async function getPlayerRating(playerId: string): Promise<RatingState | null> {
  const rows = await queryRows<{ rate: number; games_played: number }>(
    'SELECT rate, games_played FROM player_ratings WHERE player_id = :player_id',
    { player_id: playerId });
  return rows.length ? { rate: Number(rows[0].rate), games: Number(rows[0].games_played) } : null;
}
