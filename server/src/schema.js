// Ordered migrations. PRAGMA user_version tracks how many have run.
// Never edit an applied migration: append a new one.
export const migrations = [
  /* 1: initial schema */ `
CREATE TABLE admins (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  notif_seen_at TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE login_attempts (
  id INTEGER PRIMARY KEY,
  email TEXT,
  ip_hash TEXT,
  ok INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_login_attempts_email ON login_attempts(email, created_at);
CREATE INDEX idx_login_attempts_ip ON login_attempts(ip_hash, created_at);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  plural TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE cities (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL COLLATE NOCASE,
  state TEXT NOT NULL COLLATE NOCASE,
  UNIQUE (name, state)
);

CREATE TABLE artists (
  id INTEGER PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  -- private identity & contact (never leaves the admin API)
  full_name TEXT NOT NULL,
  stage_name TEXT,
  phone TEXT NOT NULL UNIQUE,
  alt_phone TEXT,
  email TEXT,
  instagram TEXT,
  youtube TEXT,
  website TEXT,
  gender TEXT,
  city_id INTEGER REFERENCES cities(id),
  -- public profile text (admin-curated, scanned for leaks)
  headline TEXT,
  public_summary TEXT,
  years_experience INTEGER,
  events_done INTEGER,
  group_type TEXT,
  team_size INTEGER,
  -- commercials (private)
  price_min INTEGER,
  price_max INTEGER,
  price_notes TEXT,
  commission_pct REAL,
  -- logistics & internal (private)
  equipment TEXT,
  requirements TEXT,
  travel_notes TEXT,
  internal_notes TEXT,
  source TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','pending','archived')),
  photo_private TEXT,   -- file name under data/private/ (admin only)
  photo_public TEXT,    -- random key of the pre-blurred derivative under data/public/
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_artists_status ON artists(status);
CREATE INDEX idx_artists_city ON artists(city_id);

CREATE TABLE artist_categories (
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (artist_id, category_id)
);
CREATE TABLE artist_cities (  -- cities an artist is willing to travel to
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  city_id INTEGER NOT NULL REFERENCES cities(id),
  PRIMARY KEY (artist_id, city_id)
);
CREATE TABLE artist_languages (
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  language TEXT NOT NULL COLLATE NOCASE,
  PRIMARY KEY (artist_id, language)
);
CREATE TABLE artist_occasions (
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  occasion TEXT NOT NULL COLLATE NOCASE,
  PRIMARY KEY (artist_id, occasion)
);
CREATE TABLE artist_tags (
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  tag TEXT NOT NULL COLLATE NOCASE,
  PRIMARY KEY (artist_id, tag)
);
CREATE TABLE artist_links (  -- private portfolio links
  id INTEGER PRIMARY KEY,
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  label TEXT,
  url TEXT NOT NULL
);

CREATE TABLE enquiries (
  id INTEGER PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  artist_id INTEGER REFERENCES artists(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  event_date TEXT,
  event_city TEXT,
  occasion TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','options_sent','booked','lost')),
  assigned_to INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  page_url TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_enquiries_status ON enquiries(status, created_at);

CREATE TABLE enquiry_notes (
  id INTEGER PRIMARY KEY,
  enquiry_id INTEGER NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE wa_clicks (
  id INTEGER PRIMARY KEY,
  artist_id INTEGER REFERENCES artists(id) ON DELETE SET NULL,
  ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE bookings (
  id INTEGER PRIMARY KEY,
  artist_id INTEGER NOT NULL REFERENCES artists(id),
  enquiry_id INTEGER REFERENCES enquiries(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_phone TEXT,
  event_date TEXT,
  event_city TEXT,
  occasion TEXT,
  amount INTEGER,
  commission_amount INTEGER,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','completed','cancelled')),
  notes TEXT,
  created_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE review_requests (
  id INTEGER PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  artist_id INTEGER NOT NULL REFERENCES artists(id),
  token_hash TEXT NOT NULL UNIQUE,   -- sha256 of the token; the raw token only exists in the link
  created_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  revoked_at TEXT
);

CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  review_request_id INTEGER NOT NULL UNIQUE REFERENCES review_requests(id),
  artist_id INTEGER NOT NULL REFERENCES artists(id),
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  reviewer_name TEXT NOT NULL,
  r_punctuality INTEGER NOT NULL,
  r_performance INTEGER NOT NULL,
  r_professionalism INTEGER NOT NULL,
  r_communication INTEGER NOT NULL,
  r_value INTEGER NOT NULL,
  rating_overall REAL NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  moderated_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  moderated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_reviews_artist ON reviews(artist_id, status);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE import_batches (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  committed_at TEXT
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`,
];
