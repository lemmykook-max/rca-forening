CREATE TABLE hearings (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  documents_url TEXT,
  deadline DATE NOT NULL,
  sections TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE hearing_responses (
  id SERIAL PRIMARY KEY,
  hearing_id INTEGER NOT NULL REFERENCES hearings(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  section TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX hearing_responses_hearing_idx ON hearing_responses (hearing_id);

INSERT INTO hearings (title, description, documents_url, deadline, sections) VALUES (
  'Høring over de reviderede vedtægter',
  'Læs de reviderede vedtægter og oversigten over ændringerne. Skriv, hvad du er enig eller uenig i, eller hvad du savner. Du kan sende flere høringssvar. Bestyrelsen gennemgår alle svar før den ekstraordinære generalforsamling, og svarene slettes efter generalforsamlingen.',
  'https://rca-website.netlify.app/ekstraordinaer-generalforsamling',
  '2026-12-07',
  'Generelt / flere paragraffer, § 1, § 2, § 3, § 4, § 5, § 6, § 7, § 8, § 9, § 10, § 11, § 12, § 13, § 14, § 15'
);
