PRAGMA foreign_keys = ON;

CREATE TABLE games (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
);

CREATE TABLE boards (
  game_id TEXT NOT NULL REFERENCES games(id),
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order TEXT NOT NULL CHECK (sort_order IN ('asc', 'desc')),
  score_scale INTEGER NOT NULL CHECK (score_scale > 0),
  decimals INTEGER NOT NULL CHECK (decimals BETWEEN 0 AND 6),
  unit TEXT NOT NULL DEFAULT '',
  min_score INTEGER NOT NULL,
  max_score INTEGER NOT NULL CHECK (max_score >= min_score),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  metadata_fields TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(metadata_fields)),
  PRIMARY KEY (game_id, id)
);

CREATE TABLE players (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  nickname_key TEXT NOT NULL,
  email_hash TEXT,
  guest_id TEXT,
  website TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX players_protected_nickname ON players(nickname_key) WHERE email_hash IS NOT NULL;
CREATE UNIQUE INDEX players_guest_nickname ON players(guest_id, nickname_key) WHERE guest_id IS NOT NULL;
CREATE INDEX players_search_nickname ON players(nickname_key);

CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  board_id TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id),
  score INTEGER NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (game_id, board_id) REFERENCES boards(game_id, id),
  UNIQUE (game_id, board_id, player_id)
);
CREATE INDEX entries_rank_asc ON entries(game_id, board_id, score ASC, updated_at ASC, id ASC);
CREATE INDEX entries_rank_desc ON entries(game_id, board_id, score DESC, updated_at ASC, id ASC);
CREATE INDEX entries_player ON entries(player_id);

-- Tombstones are intentionally retained after moderation so a retry cannot restore a deleted entry.
CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  game_id TEXT NOT NULL,
  board_id TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id),
  entry_id TEXT,
  token TEXT NOT NULL,
  improved INTEGER NOT NULL DEFAULT 0 CHECK (improved IN (0, 1)),
  response_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (game_id, board_id) REFERENCES boards(game_id, id)
);
CREATE INDEX submissions_entry ON submissions(entry_id);
CREATE INDEX submissions_board ON submissions(game_id, board_id);

INSERT INTO games(id, name) VALUES ('chroma', 'Chroma Dash');
INSERT INTO boards(game_id, id, name, sort_order, score_scale, decimals, unit, min_score, max_score, metadata_fields)
VALUES
('chroma', 'accuracy', '准度挑战', 'desc', 10, 1, '%', 0, 1000, '["rounds","penaltyMs","bestRoundAccuracy","elapsedMs"]'),
('chroma', 'speed', '速度挑战', 'asc', 1000, 1, 's', 0, 86400000, '["rounds","penaltyMs","bestRoundAccuracy","elapsedMs"]'),
('chroma', 'blind', '盲猜模式', 'desc', 10, 1, '%', 0, 1000, '["rounds","penaltyMs","bestRoundAccuracy","elapsedMs"]');
