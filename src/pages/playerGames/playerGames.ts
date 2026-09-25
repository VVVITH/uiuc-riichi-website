import * as express from "express";
import asyncHandler from "express-async-handler";
import { playerGames, playerHistoryContent } from "./playerGames.html.js";
import { getPlayerHistory, getPlayerProfile } from "../../lib/playerProfile.js";
import { error } from "../error/error.html.js";

const router = express.Router();
router.get("/history", asyncHandler(async (req, res) => {
  if (!res.locals.semesters.includes(res.locals.semester)) {
    res.status(404).send(error({ resLocals: res.locals }));
    return;
  }
  const history = await getPlayerHistory(res.locals.player_id, res.locals.semester,
    typeof req.query.page === "string" ? Number(req.query.page) : 1);
  if (!history) { res.status(404).send(error({ resLocals: res.locals })); return; }
  res.type("html").send(playerHistoryContent({ ...history, id: String(res.locals.player_id),
    semester: res.locals.semester, historyScopeQuery: req.query.h2h === "semester" ? "&h2h=semester" : "" }).toString());
}));
router.get("/", asyncHandler(async (req, res) => {
  if (!res.locals.semesters.includes(res.locals.semester)) {
    res.status(404).send(error({ resLocals: res.locals }));
    return;
  }
  const profile = await getPlayerProfile(res.locals.player_id, res.locals.semester,
    typeof req.query.page === "string" ? Number(req.query.page) : 1,
    req.query.h2h === "semester" ? "semester" : "all");
  if (!profile) { res.status(404).send(error({ resLocals: res.locals })); return; }
  res.send(playerGames({ profile, resLocals: res.locals }));
}));
export default router;
