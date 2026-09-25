import { queryRows } from "./sqlDatabase.js";
import { loadSqlEquiv } from "./sqlLoader.js";
import { rankNames, promotionProgress } from "./rankRules.js";
import { Player } from "./db-types.js";
import { combineGameInfo } from "./gamesTable.js";
import {getPlayerRating} from "./ratingStore.js";

const sql = loadSqlEquiv(import.meta.url);
export type SeasonStats = {
  id: string; name: string; rank_index: number; ranking: string; points: number;
  games: number; placements: number[]; average_placement: number;
  highest_score: number; average_score: number; campus_rank: number;
};
export async function getSeasonStats(semester: string): Promise<SeasonStats[]> {
  const rows = await queryRows<any>(sql.season_stats, { semester });
  let previousPoints: number | undefined;
  let campusRank = 0;
  return rows.map((r, index) => {
    const points = Number(r.points);
    if (points !== previousPoints) campusRank = index + 1;
    previousPoints = points;
    return { id: String(r.id), name: r.name, rank_index: Number(r.rank_index),
      ranking: rankNames[Number(r.rank_index)] ?? "Unknown", points,
      games: Number(r.games), placements: [r.firsts, r.seconds, r.thirds, r.fourths].map(Number),
      average_placement: Number(r.average_placement), highest_score: Number(r.highest_score),
      average_score: Number(r.average_score), campus_rank: campusRank };
  });
}

export type OpponentStats = {
  id: string; name: string; meetings: number; wins: number; ties: number;
  my_average: number; opponent_average: number;
  rivalry_pt: number; rivalry_index: number;
};
export type HeadToHeadScope = "all" | "semester";
const validPlayerId = (id: string) => /^\d+$/.test(id) && BigInt(id) <= 18446744073709551615n;
const historyPageSize = 10;

export async function getPlayerHistory(player_id: string, semester: string, requestedPage = 1) {
  if (!validPlayerId(player_id)) return null;
  const [players, counts] = await Promise.all([
    queryRows<Player>(sql.player, { player_id, semester }),
    queryRows<{ games: number }>(sql.history_count, { player_id, semester }),
  ]);
  if (!players.length) return null;
  const pages = Math.max(1, Math.ceil(Number(counts[0]?.games ?? 0) / historyPageSize));
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1));
  const rows = await queryRows<any>(sql.history, { player_id, semester, limit: String(historyPageSize), offset: String((page - 1) * historyPageSize) });
  return { games: combineGameInfo(rows), page, pages, count: Number(counts[0]?.games ?? 0) };
}

export async function getOpponentStats(player_id: string, semester: string, scope: HeadToHeadScope): Promise<OpponentStats[]> {
  const rows = await queryRows<any>(scope === "semester" ? sql.opponents_semester : sql.opponents,
    { player_id, semester });
  return rows.map(r => ({ id: String(r.id), name: r.name, meetings: Number(r.meetings),
    wins: Number(r.wins), ties: Number(r.ties),
    my_average: Number(r.my_average), opponent_average: Number(r.opponent_average),
    rivalry_pt: Number(r.rivalry_pt), rivalry_index: Number(r.rivalry_index) }))
    .sort((a, b) => b.rivalry_index - a.rivalry_index || b.meetings - a.meetings || a.id.localeCompare(b.id));
}

export async function getPlayerProfile(player_id: string, semester: string, requestedPage = 1,
  opponentsScope: HeadToHeadScope = "all") {
  // Keep Discord IDs as strings; they exceed JavaScript's safe integer range.
  if (!validPlayerId(player_id)) return null;
  const players = await queryRows<Player & { rank_index: number }>(sql.player, { player_id, semester });
  if (!players.length) return null;
  const [season, recent, ratings] = await Promise.all([
    getSeasonStats(semester),
    queryRows<{ placement: number }>(sql.recent, { player_id, semester }),
    getPlayerRating(player_id),
  ]);
  const player = players[0];
  const stats = season.find(p => p.id === String(player.id)) ?? null;
  const pages = Math.max(1, Math.ceil((stats?.games ?? 0) / historyPageSize));
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1));
  const [opponents, games] = await Promise.all([
    getOpponentStats(player_id, semester, opponentsScope),
    // mysql2 encodes JS numbers as DOUBLE; MySQL LIMIT parameters require integers.
    queryRows<any>(sql.history, { player_id, semester, limit: String(historyPageSize), offset: String((page - 1) * historyPageSize) }),
  ]);
  return { player, stats, rating: ratings,
    opponents, opponentsScope, page, pages,
    games: combineGameInfo(games),
    promotion: promotionProgress(recent.reverse().map(g => g.placement), Number(player.rank_index)) };
}
export type PlayerProfile = NonNullable<Awaited<ReturnType<typeof getPlayerProfile>>>;

export function searchTerm(input: unknown): string {
  return typeof input === "string" ? input.trim().slice(0, 100) : "";
}
export async function searchPlayers(term: string, semester: string) {
  if (!term) return { players: [] as Player[], hasMore: false };
  const pattern = `%${term.replace(/[!%_]/g, "!$&")}%`;
  const prefix = `${term.replace(/[!%_]/g, "!$&")}%`;
  const rows = await queryRows<Player>(sql.search, { term, pattern, prefix, semester });
  return { players: rows.slice(0, 50), hasMore: rows.length > 50 };
}
