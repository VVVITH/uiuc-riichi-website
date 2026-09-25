-- BLOCK season_stats
SELECT p.id, p.player_name AS name, COALESCE(d.ranking, 0) AS rank_index,
    COALESCE(d.points, 0) AS points, COUNT(*) AS games,
    SUM(gp.placement = 1) AS firsts, SUM(gp.placement = 2) AS seconds,
    SUM(gp.placement = 3) AS thirds, SUM(gp.placement = 4) AS fourths,
    AVG(gp.placement) AS average_placement,
    MAX(gp.score) AS highest_score, AVG(gp.score) AS average_score
FROM games g
JOIN game_players gp ON gp.game_id = g.id
JOIN players p ON p.id = gp.player_id
LEFT JOIN player_semester_data d ON d.player_id = p.id AND d.semester = :semester
WHERE g.semester = :semester AND NOT g.is_team_game
GROUP BY p.id, p.player_name, d.ranking, d.points
ORDER BY points DESC, p.id ASC;

-- BLOCK player
SELECT p.id, p.player_name, COALESCE(d.ranking, 0) AS rank_index
FROM players p
LEFT JOIN player_semester_data d ON d.player_id = p.id AND d.semester = :semester
WHERE p.id = :player_id;

-- BLOCK recent
SELECT gp.placement FROM game_players gp JOIN games g ON g.id = gp.game_id
WHERE gp.player_id = :player_id AND g.semester = :semester AND NOT g.is_team_game
ORDER BY g.id DESC LIMIT 30;

-- BLOCK opponents
SELECT r.opponent_id AS id,
    p.player_name AS name, SUM(r.meetings) AS meetings,
    SUM(CASE WHEN r.is_low THEN r.low_wins
      ELSE r.meetings - r.low_wins - r.ties END) AS wins,
    SUM(r.ties) AS ties,
    SUM(CASE WHEN r.is_low THEN r.low_placement_sum ELSE r.high_placement_sum END)
      / SUM(r.meetings) AS my_average,
    SUM(CASE WHEN r.is_low THEN r.high_placement_sum ELSE r.low_placement_sum END)
      / SUM(r.meetings) AS opponent_average,
    SUM(CASE WHEN r.is_low THEN r.pt_difference ELSE -r.pt_difference END) AS rivalry_pt,
    100 * SUM(CASE WHEN r.is_low THEN r.softened_sum ELSE -r.softened_sum END)
      / (SUM(r.meetings) + 10) AS rivalry_index
FROM (SELECT r.*, r.low_player_id = :player_id AS is_low,
    CASE WHEN r.low_player_id = :player_id THEN r.high_player_id ELSE r.low_player_id END AS opponent_id
    FROM player_rivalries r WHERE r.low_player_id = :player_id OR r.high_player_id = :player_id) r
JOIN players p ON p.id = r.opponent_id
GROUP BY r.opponent_id, p.player_name
ORDER BY meetings DESC, id ASC;

-- BLOCK opponents_semester
SELECT r.opponent_id AS id,
    p.player_name AS name, SUM(r.meetings) AS meetings,
    SUM(CASE WHEN r.is_low THEN r.low_wins
      ELSE r.meetings - r.low_wins - r.ties END) AS wins,
    SUM(r.ties) AS ties,
    SUM(CASE WHEN r.is_low THEN r.low_placement_sum ELSE r.high_placement_sum END)
      / SUM(r.meetings) AS my_average,
    SUM(CASE WHEN r.is_low THEN r.high_placement_sum ELSE r.low_placement_sum END)
      / SUM(r.meetings) AS opponent_average,
    SUM(CASE WHEN r.is_low THEN r.pt_difference ELSE -r.pt_difference END) AS rivalry_pt,
    100 * SUM(CASE WHEN r.is_low THEN r.softened_sum ELSE -r.softened_sum END)
      / (SUM(r.meetings) + 10) AS rivalry_index
FROM (SELECT r.*, r.low_player_id = :player_id AS is_low,
    CASE WHEN r.low_player_id = :player_id THEN r.high_player_id ELSE r.low_player_id END AS opponent_id
    FROM player_rivalries r WHERE r.semester = :semester
      AND (r.low_player_id = :player_id OR r.high_player_id = :player_id)) r
JOIN players p ON p.id = r.opponent_id
GROUP BY r.opponent_id, p.player_name
ORDER BY meetings DESC, id ASC;

-- BLOCK search
SELECT p.id, p.player_name FROM players p
WHERE p.player_name LIKE :pattern ESCAPE '!'
AND EXISTS (
    SELECT 1 FROM game_players gp JOIN games g ON g.id = gp.game_id
    WHERE gp.player_id = p.id AND g.semester = :semester AND NOT g.is_team_game
)
ORDER BY (player_name = :term) DESC, (player_name LIKE :prefix ESCAPE '!') DESC, player_name, id
LIMIT 51;

-- BLOCK history
SELECT gp.*, g.game_time, g.is_team_game, p.player_name
FROM (
    SELECT g.id FROM games g
    JOIN game_players gp ON gp.game_id = g.id
    WHERE gp.player_id = :player_id AND g.semester = :semester AND NOT g.is_team_game
    ORDER BY g.game_time DESC, g.id DESC LIMIT :limit OFFSET :offset
) selected
JOIN games g ON g.id = selected.id
JOIN game_players gp ON gp.game_id = g.id
JOIN players p ON p.id = gp.player_id
ORDER BY g.game_time DESC, g.id DESC, gp.placement, gp.player_id;

-- BLOCK history_count
SELECT COUNT(*) AS games FROM games g
JOIN game_players gp ON gp.game_id = g.id
WHERE gp.player_id = :player_id AND g.semester = :semester AND NOT g.is_team_game;
