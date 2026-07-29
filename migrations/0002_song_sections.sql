CREATE TABLE song_sections (
  id TEXT PRIMARY KEY,
  song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 50),
  start_beat INTEGER NOT NULL CHECK (start_beat >= 0),
  UNIQUE(song_id, start_beat)
);

CREATE INDEX song_sections_song_idx ON song_sections(song_id, start_beat);
