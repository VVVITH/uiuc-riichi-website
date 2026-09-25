import { RatingState } from "./rating.js";
import { SeasonStats } from "./playerProfile.js";

export type RankingSort = "pt" | "rate";

/** Rate is all-time, but only players active in this semester appear here. */
export function orderSeasonStats(stats: SeasonStats[], ratings: Map<string, RatingState>, sort: RankingSort) {
  if (sort === "pt") return {
    players: [...stats],
    positions: new Map(stats.map(player => [player.id, player.campus_rank] as const)),
  };

  // Rank by the whole-number Rate shown on the cards, so visible ties share a rank.
  const displayedRate = (id: string) => {
    const value = ratings.get(id)?.rate;
    return value === undefined ? null : Math.round(value);
  };
  const players = [...stats].sort((a, b) => {
    const first = displayedRate(a.id);
    const second = displayedRate(b.id);
    if (first === null) return second === null ? b.points - a.points || a.id.localeCompare(b.id) : 1;
    if (second === null) return -1;
    return second - first || b.points - a.points || a.id.localeCompare(b.id);
  });
  const positions = new Map<string, number | null>();
  let previous: number | null = null;
  let position = 0;
  players.forEach((player, index) => {
    const rate = displayedRate(player.id);
    if (rate !== null && rate !== previous) position = index + 1;
    positions.set(player.id, rate === null ? null : position);
    previous = rate;
  });
  return { players, positions };
}
