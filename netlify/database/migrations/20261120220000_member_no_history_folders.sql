-- Medlemsnumre (tildeles automatisk, i rækkefølge efter indmeldelse)
ALTER TABLE members ADD COLUMN member_no INTEGER;
UPDATE members m SET member_no = x.n
  FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS n FROM members) x
  WHERE m.id = x.id;
CREATE SEQUENCE member_no_seq OWNED BY members.member_no;
SELECT setval('member_no_seq', COALESCE((SELECT MAX(member_no) FROM members), 0) + 1, false);
ALTER TABLE members ALTER COLUMN member_no SET DEFAULT nextval('member_no_seq');
ALTER TABLE members ALTER COLUMN member_no SET NOT NULL;
ALTER TABLE members ADD CONSTRAINT members_member_no_key UNIQUE (member_no);

-- Medlemsperiode (bruges til opgørelse af medlemmer pr. år)
ALTER TABLE members ADD COLUMN joined_at TIMESTAMPTZ;
ALTER TABLE members ADD COLUMN ended_at TIMESTAMPTZ;
UPDATE members SET joined_at = created_at WHERE status IN ('active', 'ended');
UPDATE members SET ended_at = updated_at WHERE status = 'ended';

-- Mapper til dokumenter
CREATE TABLE folders (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES folders(id) ON DELETE RESTRICT,
  visibility TEXT NOT NULL DEFAULT 'board',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE documents ADD COLUMN folder_id INTEGER REFERENCES folders(id) ON DELETE RESTRICT;
