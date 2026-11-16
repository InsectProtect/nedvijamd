CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS objects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  area NUMERIC,
  status TEXT NOT NULL DEFAULT 'покупка',
  sale_price NUMERIC,
  creator_id INT NOT NULL REFERENCES users(id),
  delete_requested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS members (
  object_id INT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('investor', 'foreman', 'viewer')),
  share_pct NUMERIC NOT NULL DEFAULT 0,
  foreman_mode TEXT NOT NULL DEFAULT 'none' CHECK (foreman_mode IN ('pct', 'fix', 'none')),
  foreman_value NUMERIC NOT NULL DEFAULT 0,
  delete_vote BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (object_id, user_id)
);

CREATE TABLE IF NOT EXISTS invites (
  token TEXT PRIMARY KEY,
  object_id INT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('investor', 'foreman', 'viewer')),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS entries (
  id SERIAL PRIMARY KEY,
  object_id INT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('in', 'out', 'plan')),
  source TEXT NOT NULL DEFAULT 'own' CHECK (source IN ('own', 'pool')),
  category TEXT,
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  note TEXT,
  entry_date DATE NOT NULL DEFAULT current_date,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS receipts (
  id SERIAL PRIMARY KEY,
  entry_id INT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id),
  mime TEXT NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entries_object_idx ON entries(object_id);
CREATE INDEX IF NOT EXISTS receipts_entry_idx ON receipts(entry_id);
CREATE INDEX IF NOT EXISTS members_user_idx ON members(user_id);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

-- Telegram
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_id BIGINT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tg_username TEXT;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN pass_hash DROP NOT NULL;

CREATE TABLE IF NOT EXISTS tg_links (
  token TEXT PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Стоимость покупки объекта
ALTER TABLE objects ADD COLUMN IF NOT EXISTS purchase_price NUMERIC;

-- Фото объекта для карточки
ALTER TABLE objects ADD COLUMN IF NOT EXISTS photo BYTEA;
ALTER TABLE objects ADD COLUMN IF NOT EXISTS photo_mime TEXT;
ALTER TABLE objects ADD COLUMN IF NOT EXISTS photo_v INT NOT NULL DEFAULT 0;

-- Рассрочка
ALTER TABLE objects ADD COLUMN IF NOT EXISTS installment BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE objects ADD COLUMN IF NOT EXISTS installment_monthly NUMERIC;

-- Удаление операции только с согласия всех участников сделки
ALTER TABLE entries ADD COLUMN IF NOT EXISTS delete_requested_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS entry_delete_votes (
  entry_id INT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, user_id)
);
