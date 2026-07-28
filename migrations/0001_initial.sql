PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE songs (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  bpm INTEGER NOT NULL DEFAULT 120 CHECK (bpm BETWEEN 20 AND 400),
  initial_key INTEGER NOT NULL DEFAULT 0 CHECK (initial_key BETWEEN 0 AND 11),
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX songs_public_list_idx ON songs(status, published_at DESC);
CREATE INDEX songs_owner_idx ON songs(created_by_user_id, updated_at DESC);

CREATE TABLE chord_blocks (
  id TEXT PRIMARY KEY,
  song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  start_beat INTEGER NOT NULL CHECK (start_beat >= 0),
  duration INTEGER NOT NULL CHECK (duration BETWEEN 1 AND 4),
  degree INTEGER CHECK (degree BETWEEN 0 AND 11),
  quality TEXT CHECK (quality IN ('major', 'minor', 'dominant7', 'diminished', 'augmented', 'half_diminished7')),
  bass_degree INTEGER CHECK (bass_degree BETWEEN 0 AND 11),
  CHECK (
    (degree IS NULL AND quality IS NULL AND bass_degree IS NULL)
    OR (degree IS NOT NULL AND quality IS NOT NULL)
  ),
  UNIQUE(song_id, start_beat)
);

CREATE TABLE key_changes (
  id TEXT PRIMARY KEY,
  song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  start_beat INTEGER NOT NULL CHECK (start_beat > 0),
  key_pitch_class INTEGER NOT NULL CHECK (key_pitch_class BETWEEN 0 AND 11),
  UNIQUE(song_id, start_beat)
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE song_tags (
  song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(song_id, tag_id)
);

CREATE TABLE progression_names (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE song_progressions (
  id TEXT PRIMARY KEY,
  song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  progression_name_id TEXT NOT NULL REFERENCES progression_names(id),
  start_beat INTEGER NOT NULL CHECK (start_beat >= 0),
  end_beat INTEGER NOT NULL,
  CHECK (end_beat > start_beat)
);

CREATE INDEX chord_blocks_song_idx ON chord_blocks(song_id, start_beat);
CREATE INDEX key_changes_song_idx ON key_changes(song_id, start_beat);
CREATE INDEX song_progressions_song_idx ON song_progressions(song_id, start_beat);
