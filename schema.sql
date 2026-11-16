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

-- Ориентировочная стоимость ремонта
ALTER TABLE objects ADD COLUMN IF NOT EXISTS repair_budget NUMERIC;

-- Язык интерфейса
ALTER TABLE users ADD COLUMN IF NOT EXISTS lang TEXT NOT NULL DEFAULT 'ru';

-- Ссылки на договор для открытия в браузере (печать / PDF)
CREATE TABLE IF NOT EXISTS contract_links (
  token TEXT PRIMARY KEY,
  object_id INT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Данные для договора и подписи
ALTER TABLE users ADD COLUMN IF NOT EXISTS idnp TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE objects ADD COLUMN IF NOT EXISTS contract_fields JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE IF NOT EXISTS contract_versions (
  id SERIAL PRIMARY KEY,
  object_id INT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  terms_hash TEXT NOT NULL,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS contract_signatures (
  version_id INT NOT NULL REFERENCES contract_versions(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signature BYTEA NOT NULL,
  idnp TEXT,
  address TEXT,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (version_id, user_id)
);
CREATE INDEX IF NOT EXISTS contract_versions_object_idx ON contract_versions(object_id);

-- Личные данные и администрирование
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- Авансы от покупателя
CREATE TABLE IF NOT EXISTS advances (
  id SERIAL PRIMARY KEY,
  object_id INT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id),
  buyer TEXT,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  received_date DATE NOT NULL DEFAULT current_date,
  valid_until DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'applied', 'kept', 'returned')),
  note TEXT,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS advances_object_idx ON advances(object_id);

-- Договор аванса (задатка) с покупателем
ALTER TABLE advances ADD COLUMN IF NOT EXISTS buyer_idnp TEXT;
ALTER TABLE advances ADD COLUMN IF NOT EXISTS buyer_address TEXT;
ALTER TABLE advances ADD COLUMN IF NOT EXISTS buyer_phone TEXT;
ALTER TABLE advances ADD COLUMN IF NOT EXISTS sale_price NUMERIC;
ALTER TABLE advances ADD COLUMN IF NOT EXISTS return_mode TEXT NOT NULL DEFAULT 'double';
ALTER TABLE advances ADD COLUMN IF NOT EXISTS city TEXT;
CREATE TABLE IF NOT EXISTS advance_signatures (
  advance_id INT NOT NULL REFERENCES advances(id) ON DELETE CASCADE,
  party TEXT NOT NULL CHECK (party IN ('seller', 'buyer')),
  name TEXT,
  signature BYTEA NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (advance_id, party)
);
CREATE TABLE IF NOT EXISTS advance_links (
  token TEXT PRIMARY KEY,
  advance_id INT NOT NULL REFERENCES advances(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Аренда, исправления операций, суммы в леях
ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_kind_check;
ALTER TABLE entries ADD CONSTRAINT entries_kind_check CHECK (kind IN ('in', 'out', 'plan', 'rent'));
ALTER TABLE entries ADD COLUMN IF NOT EXISTS orig_amount NUMERIC;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS orig_currency TEXT;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS rate NUMERIC;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS edit_proposal JSONB;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS edit_requested_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS entry_edit_votes (
  entry_id INT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, user_id)
);

-- Закрытие сделки
ALTER TABLE objects ADD COLUMN IF NOT EXISTS sold_price NUMERIC;
ALTER TABLE objects ADD COLUMN IF NOT EXISTS sold_at DATE;
ALTER TABLE objects ADD COLUMN IF NOT EXISTS sold_receiver_id INT REFERENCES users(id);
CREATE TABLE IF NOT EXISTS deal_payouts (
  object_id INT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  from_user INT NOT NULL REFERENCES users(id),
  to_user INT NOT NULL REFERENCES users(id),
  amount NUMERIC NOT NULL,
  paid_at TIMESTAMPTZ,
  marked_by INT REFERENCES users(id),
  PRIMARY KEY (object_id, from_user, to_user)
);

-- Ссылки на отчёт
CREATE TABLE IF NOT EXISTS report_links (
  token TEXT PRIMARY KEY,
  object_id INT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  lang TEXT NOT NULL DEFAULT 'ru',
  expires_at TIMESTAMPTZ NOT NULL
);

-- Доска сделок: анкеты инвесторов, предложения сделок, отклики
CREATE TABLE IF NOT EXISTS investor_profiles (
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  amount_from NUMERIC,
  amount_to NUMERIC NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reject_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS market_offers (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  district TEXT,
  description TEXT,
  price NUMERIC,
  need_amount NUMERIC NOT NULL,
  expected_pct NUMERIC,
  term_months INT,
  status TEXT NOT NULL DEFAULT 'pending',
  reject_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS market_responses (
  id SERIAL PRIMARY KEY,
  offer_id INT NOT NULL REFERENCES market_offers(id) ON DELETE CASCADE,
  investor_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  initiator TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ,
  UNIQUE (offer_id, investor_id)
);

-- Статистика для администратора
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS bot_users (
  telegram_id TEXT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Журнал просмотров объектов администратором
CREATE TABLE IF NOT EXISTS admin_views (
  id SERIAL PRIMARY KEY,
  admin_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_id INT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Фото и комментарии к предложениям сделок
CREATE TABLE IF NOT EXISTS market_photos (
  id SERIAL PRIMARY KEY,
  offer_id INT NOT NULL REFERENCES market_offers(id) ON DELETE CASCADE,
  mime TEXT NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS market_comments (
  id SERIAL PRIMARY KEY,
  offer_id INT NOT NULL REFERENCES market_offers(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Сброс пароля (ссылка через Telegram-бота или от администратора)
CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
