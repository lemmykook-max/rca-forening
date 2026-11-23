CREATE TABLE ideas (
  id SERIAL PRIMARY KEY,
  member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT,
  category TEXT,
  maturity TEXT,
  show_name BOOLEAN NOT NULL DEFAULT FALSE,
  wants_to_help BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'new',
  board_reply TEXT,
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ideas_member_idx ON ideas (member_id);

CREATE TABLE idea_supports (
  idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (idea_id, member_id)
);
