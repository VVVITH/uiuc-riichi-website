import * as express from "express";
import asyncHandler from "express-async-handler";
import { playerStats } from "./playerStats.html.js";
import { getSeasonStats, searchPlayers, searchTerm } from "../../lib/playerProfile.js";
import {getLifetimeRatings} from "../../lib/ratingStore.js";
import { orderSeasonStats, RankingSort } from "../../lib/playerRankings.js";

const router = express.Router();
router.get("/", asyncHandler(async (req, res) => {
  const term = searchTerm(req.query.q);
  const sort: RankingSort = req.query.sort === "rate" ? "rate" : "pt";
  const [allStats, results, ratings] = await Promise.all([
    getSeasonStats(res.locals.semester),
    term ? searchPlayers(term, res.locals.semester) : Promise.resolve(null),
    getLifetimeRatings(),
  ]);
  const ranked = orderSeasonStats(allStats, ratings, sort);
  const matches = results ? new Set(results.players.map(player => String(player.id))) : null;
  const visibleStats = matches ? ranked.players.filter(stats => matches.has(stats.id)) : ranked.players;
  res.send(playerStats({ allStats: visibleStats, term, sort, positions: ranked.positions,
    hasMore: results?.hasMore ?? false, ratings, resLocals: res.locals }));
}));
export default router;
