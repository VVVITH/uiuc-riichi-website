ALTER TABLE semesters ADD COLUMN rate_closed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS player_ratings (
  player_id BIGINT UNSIGNED PRIMARY KEY,
  rate DOUBLE NOT NULL,
  games_played INT UNSIGNED NOT NULL,
  last_played_ms BIGINT NOT NULL,
  rookie_handicap DOUBLE NOT NULL,
  opening_rate DOUBLE NULL,
  opening_games INT UNSIGNED NULL,
  opening_last_played_ms BIGINT NULL,
  opening_rookie_handicap DOUBLE NULL,
  CONSTRAINT fk_player_ratings_player FOREIGN KEY (player_id)
    REFERENCES players (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS player_rivalries (
  semester VARCHAR(191) NOT NULL,
  low_player_id BIGINT UNSIGNED NOT NULL,
  high_player_id BIGINT UNSIGNED NOT NULL,
  meetings INT UNSIGNED NOT NULL,
  low_wins INT UNSIGNED NOT NULL,
  ties INT UNSIGNED NOT NULL,
  low_placement_sum INT UNSIGNED NOT NULL,
  high_placement_sum INT UNSIGNED NOT NULL,
  pt_difference DECIMAL(20,4) NOT NULL,
  softened_sum DOUBLE NOT NULL,
  PRIMARY KEY (semester, low_player_id, high_player_id),
  KEY idx_rivalries_low (low_player_id),
  KEY idx_rivalries_high (high_player_id),
  CONSTRAINT fk_player_rivalries_low FOREIGN KEY (low_player_id)
    REFERENCES players (id) ON DELETE CASCADE,
  CONSTRAINT fk_player_rivalries_high FOREIGN KEY (high_player_id)
    REFERENCES players (id) ON DELETE CASCADE,
  CONSTRAINT chk_rivalry_pair CHECK (low_player_id < high_player_id)
) ENGINE=InnoDB;
