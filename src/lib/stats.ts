import { rankNames } from "./rankRules.js";
import { queryRow, queryRows } from "./sqlDatabase.js";
import { loadSqlEquiv } from "./sqlLoader.js";
import {
  Team,
  Player,
  GamePlayer,
  PlayerSemesterData,
} from "./db-types.js";

const sql = loadSqlEquiv(import.meta.url);

export type PlayerSemesterStats = {
  id: string;
  name: string;
  placements: number[];
  average_placement: number;
  ranking: string;
  points: number;
};

export async function getSemesterIndividualStats(
  player: Player,
  semester: string
): Promise<PlayerSemesterStats | null> {
  const player_games = await queryRows<GamePlayer>(
    sql.select_player_game_history,
    { semester, player_id: player.id }
  );
  if (!player_games.length) {
    return null;
  }
  const player_data = await queryRow<PlayerSemesterData>(
    sql.select_player_semester_data,
    { semester, player_id: player.id }
  );

  const placements = [0, 0, 0, 0];
  let sum_placement = 0;
  let length_placement = 0;
  for (const game of player_games) {
    placements[game.placement - 1]++;
    sum_placement += game.placement;
    length_placement++;
  }

  return {
    id: player.id,
    name: player.player_name,
    placements,
    average_placement: sum_placement / length_placement,
    ranking: rankNames[player_data.ranking],
    points: player_data.points,
  };
}

export type teamSemesterStats = {
  id: number;
  name: string;
  placements: number[];
  average_placement: number;
  points: number;
};

export async function getSemesterTeamStats(
  team: Team
): Promise<teamSemesterStats | null> {
  const player_games = await queryRows<GamePlayer>(
    sql.select_team_game_history,
    { team_id: team.id }
  );
  if (!player_games.length) {
    return null;
  }

  const placements = [0, 0, 0, 0];
  let sum_placement = 0;
  let length_placement = 0;
  for (const game of player_games) {
    placements[game.placement - 1]++;
    sum_placement += game.placement;
    length_placement++;
  }

  return {
    id: team.id,
    name: team.team_name,
    placements,
    average_placement: sum_placement / length_placement,
    points: team.points,
  };
}
