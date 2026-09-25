-- BLOCK rating_games
SELECT g.id AS game_id, g.semester,
  DATE_FORMAT(g.game_time, '%Y-%m-%dT%H:%i:%s.000Z') AS game_time,
  gp.player_id, gp.placement
FROM games g JOIN game_players gp ON gp.game_id = g.id
WHERE NOT g.is_team_game AND g.id IN (
  SELECT game_id FROM game_players GROUP BY game_id
  HAVING COUNT(*) = 4 AND COUNT(DISTINCT player_id) = 4)
ORDER BY g.game_time, g.id, gp.player_id;

-- BLOCK active_rating_games
SELECT g.id AS game_id, g.semester,
  DATE_FORMAT(g.game_time, '%Y-%m-%dT%H:%i:%s.000Z') AS game_time,
  gp.player_id, gp.placement
FROM games g JOIN game_players gp ON gp.game_id = g.id
WHERE g.semester = :semester AND NOT g.is_team_game AND g.id IN (
  SELECT game_id FROM game_players GROUP BY game_id
  HAVING COUNT(*) = 4 AND COUNT(DISTINCT player_id) = 4)
ORDER BY g.game_time, g.id, gp.player_id;

-- BLOCK ratings
SELECT * FROM player_ratings;

-- BLOCK game_ratings
SELECT * FROM player_ratings
WHERE player_id IN (:player_1, :player_2, :player_3, :player_4);

-- BLOCK upsert_rating
INSERT INTO player_ratings (player_id, rate, games_played, last_played_ms, rookie_handicap)
VALUES (:player_id, :rate, :games_played, :last_played_ms, :rookie_handicap)
ON DUPLICATE KEY UPDATE rate = :rate, games_played = :games_played,
  last_played_ms = :last_played_ms, rookie_handicap = :rookie_handicap;

-- BLOCK recorded_game
SELECT g.id AS game_id, g.semester, g.is_team_game,
  DATE_FORMAT(g.game_time, '%Y-%m-%dT%H:%i:%s.000Z') AS game_time,
  gp.player_id, gp.placement,
  CAST(gp.point_change AS DECIMAL(20,4)) AS pt
FROM games g JOIN game_players gp ON gp.game_id = g.id
WHERE g.id = :game_id ORDER BY gp.player_id;

-- BLOCK later_individual_game
SELECT id FROM games
WHERE semester = :semester AND NOT is_team_game
  AND (game_time, id) > (SELECT game_time, id FROM games WHERE id = :game_id)
LIMIT 1;

-- BLOCK active_semester
SELECT semester FROM semesters WHERE active = 1;

-- BLOCK add_rivalry
INSERT INTO player_rivalries (semester, low_player_id, high_player_id,
  meetings, low_wins, ties,
  low_placement_sum, high_placement_sum, pt_difference, softened_sum)
VALUES (:semester, :low_id, :high_id, 1, :low_win, :tie,
  :low_placement, :high_placement, :pt_difference, :softened)
ON DUPLICATE KEY UPDATE
  meetings = meetings + 1, low_wins = low_wins + :low_win, ties = ties + :tie,
  low_placement_sum = low_placement_sum + :low_placement,
  high_placement_sum = high_placement_sum + :high_placement,
  pt_difference = pt_difference + :pt_difference,
  softened_sum = softened_sum + :softened;

-- BLOCK subtract_rivalry
UPDATE player_rivalries SET
  meetings = meetings - 1, low_wins = low_wins - :low_win, ties = ties - :tie,
  low_placement_sum = low_placement_sum - :low_placement,
  high_placement_sum = high_placement_sum - :high_placement,
  pt_difference = pt_difference - :pt_difference,
  softened_sum = softened_sum - :softened
WHERE semester = :semester AND low_player_id = :low_id AND high_player_id = :high_id;

-- BLOCK delete_empty_rivalry
DELETE FROM player_rivalries
WHERE semester = :semester AND low_player_id = :low_id
  AND high_player_id = :high_id AND meetings = 0;

-- BLOCK rebuild_rivalries
INSERT INTO player_rivalries (semester, low_player_id, high_player_id,
  meetings, low_wins, ties,
  low_placement_sum, high_placement_sum, pt_difference, softened_sum)
SELECT g.semester, low.player_id, high.player_id,
  COUNT(*), SUM(low.placement < high.placement), SUM(low.placement = high.placement),
  SUM(low.placement), SUM(high.placement),
  SUM(CAST(high.point_change AS DECIMAL(20,4)) - CAST(low.point_change AS DECIMAL(20,4))),
  SUM((CAST(high.point_change AS DECIMAL(20,4)) - CAST(low.point_change AS DECIMAL(20,4))) /
    (ABS(CAST(high.point_change AS DECIMAL(20,4)) - CAST(low.point_change AS DECIMAL(20,4))) + 60))
FROM games g
JOIN game_players low ON low.game_id = g.id
JOIN game_players high ON high.game_id = g.id AND low.player_id < high.player_id
WHERE NOT g.is_team_game
GROUP BY g.semester, low.player_id, high.player_id;
