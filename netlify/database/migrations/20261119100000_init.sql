CREATE TABLE members (
  id SERIAL PRIMARY KEY,
  identity_id TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  postal_code TEXT,
  city TEXT,
  affiliation TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'pending',
  fee_paid_year INTEGER,
  privacy_accepted_at TIMESTAMPTZ,
  deletion_requested_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  location TEXT,
  online_url TEXT,
  capacity INTEGER,
  visibility TEXT NOT NULL DEFAULT 'members',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE event_signups (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, member_id)
);

CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'andet',
  url TEXT,
  body TEXT,
  visibility TEXT NOT NULL DEFAULT 'board',
  doc_date DATE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  owner TEXT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'todo',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE year_wheel (
  id SERIAL PRIMARY KEY,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  day INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  owner TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE articles (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  body TEXT,
  tags TEXT,
  source_url TEXT,
  visibility TEXT NOT NULL DEFAULT 'public',
  published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  actor TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO year_wheel (month, day, title, description) VALUES
 (1, 31, 'Kontingentopkrævning', 'Send opkrævning af årets kontingent til alle aktive medlemmer.'),
 (2, 28, 'Årsregnskab afsluttes', 'Kasserer afslutter regnskab og sender til revisor.'),
 (3, 15, 'Indkaldelse til ordinær generalforsamling', 'Indkald senest jf. vedtægterne med dagsorden og forslag.'),
 (4, 15, 'Ordinær generalforsamling', 'Beretning, regnskab, valg til bestyrelse.'),
 (5, 1, 'Konstituering af ny bestyrelse', 'Fordel poster og opdater medlemslisten for bestyrelsen.'),
 (8, 15, 'Planlægning af efterårets arrangementer', 'Temaaftener, fællesskabsmøder og webinarer.'),
 (11, 15, 'Stiftelsesdag', 'RCA blev stiftet 15. november 2026.'),
 (12, 1, 'GDPR-gennemgang', 'Slet data om udmeldte medlemmer og gennemgå samtykker.');

INSERT INTO articles (title, summary, body, tags, visibility, published) VALUES
 ('Velkommen til videnscentret', 'Her samler RCA viden, forskning og ressourcer om adoption.', 'Videnscentret er under opbygning. Bestyrelsen og medlemmer kan foreslå artikler, rapporter og ressourcer, som vi deler her.', 'om RCA', 'public', true);
