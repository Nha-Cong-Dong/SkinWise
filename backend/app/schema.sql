-- Idempotent schema: safe to run on every start / test run.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TABLE IF NOT EXISTS sources (
  id          serial PRIMARY KEY,
  title       text NOT NULL,
  publisher   text NOT NULL,           -- AAD, DermNet, PubMed/JAAD, CIR, CosIng, FDA, ASEAN ...
  url         text NOT NULL UNIQUE,
  accessed_at date
);

-- Canonical ingredients (EU CosIng is the reference dictionary).
CREATE TABLE IF NOT EXISTS ingredients (
  id              serial PRIMARY KEY,
  inci_name       text NOT NULL UNIQUE,
  normalized_name text NOT NULL UNIQUE, -- lowercase, diacritics stripped
  cosing_ref      text
);

-- Every known spelling of an ingredient, normalized, resolves to one canonical ingredient.
CREATE TABLE IF NOT EXISTS ingredient_synonyms (
  normalized_name text PRIMARY KEY,
  ingredient_id   integer NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS functional_groups (
  code           text PRIMARY KEY,      -- AHA, BHA, RETINOID, VITAMIN_C, EXFOLIANT_ACID ...
  name_vi        text NOT NULL,
  description_vi text
);

CREATE TABLE IF NOT EXISTS ingredient_groups (
  ingredient_id integer NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  group_code    text NOT NULL REFERENCES functional_groups(code) ON DELETE CASCADE,
  PRIMARY KEY (ingredient_id, group_code)
);

CREATE TABLE IF NOT EXISTS products (
  id                  serial PRIMARY KEY,
  brand               text NOT NULL,
  name                text NOT NULL,
  search_name         text NOT NULL, -- normalized "brand name" for trigram search
  ingredients_source  text NOT NULL
    CHECK (ingredients_source IN ('seed', 'open_beauty_facts', 'ocr', 'manual')),
  source_url          text,
  source_retrieved_at timestamptz,
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'user_confirmed', 'verified')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Added in phase 1; ALTER keeps existing databases in step with the CREATE above.
ALTER TABLE products ADD COLUMN IF NOT EXISTS slug text;            -- stable key for seed upserts
ALTER TABLE products ADD COLUMN IF NOT EXISTS market text;          -- formulas differ by market
ALTER TABLE products ADD COLUMN IF NOT EXISTS ingredients_raw text; -- verbatim list, re-checked against source_url
CREATE UNIQUE INDEX IF NOT EXISTS products_slug_key ON products (slug);
-- Added after the MVP: rinse-off (cleanser) or leave-on (serum, cream), as the EU defines them.
-- Shown only; no rule uses it until a source says rinse-off products change the warning.
ALTER TABLE products ADD COLUMN IF NOT EXISTS application text
  CHECK (application IN ('rinse_off', 'leave_on'));

CREATE INDEX IF NOT EXISTS products_search_name_trgm
  ON products USING gin (search_name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS product_ingredients (
  product_id    integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position      integer NOT NULL,       -- order on the INCI list
  ingredient_id integer REFERENCES ingredients(id),
  raw_name      text NOT NULL,          -- as written on the label, kept even if unresolved
  PRIMARY KEY (product_id, position)
);

-- Deterministic warning rules, written against functional groups.
CREATE TABLE IF NOT EXISTS rules (
  id             serial PRIMARY KEY,
  kind           text NOT NULL CHECK (kind IN ('conflict', 'duplicate', 'profile', 'myth')),
  severity       text NOT NULL CHECK (severity IN ('avoid', 'caution', 'info', 'safe')),
  scope          text NOT NULL CHECK (scope IN ('same_step', 'same_session', 'same_day')),
  evidence_level text NOT NULL CHECK (evidence_level IN ('high', 'moderate', 'low', 'expert_opinion')),
  group_a        text NOT NULL REFERENCES functional_groups(code),
  group_b        text REFERENCES functional_groups(code), -- null for single-group rules
  title_vi       text NOT NULL,
  explanation_vi text NOT NULL,
  published      boolean NOT NULL DEFAULT false, -- only after a human checked the cited source
  reviewed_by    text,
  reviewed_at    timestamptz
);

-- Added in phase 2.
ALTER TABLE rules ADD COLUMN IF NOT EXISTS key text; -- stable key for seed upserts
CREATE UNIQUE INDEX IF NOT EXISTS rules_key_key ON rules (key);

-- Added after the MVP: "usage" rules are about one group, shown for every routine product that
-- contains it (scope "routine"), e.g. sun sensitivity. Dropped and re-added so the check
-- follows the values listed here on existing databases too.
ALTER TABLE rules DROP CONSTRAINT IF EXISTS rules_kind_check;
ALTER TABLE rules ADD CONSTRAINT rules_kind_check
  CHECK (kind IN ('conflict', 'duplicate', 'profile', 'myth', 'usage'));
ALTER TABLE rules DROP CONSTRAINT IF EXISTS rules_scope_check;
ALTER TABLE rules ADD CONSTRAINT rules_scope_check
  CHECK (scope IN ('same_step', 'same_session', 'same_day', 'routine'));

-- One row per quote: a rule may quote several passages from the same source page.
CREATE TABLE IF NOT EXISTS rule_sources (
  rule_id   integer NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  position  integer NOT NULL,         -- order of the quote within the rule
  source_id integer NOT NULL REFERENCES sources(id),
  quote     text NOT NULL, -- verbatim passage supporting the rule; checked against the live page
  PRIMARY KEY (rule_id, position)
);

-- Added in phase 4: AHA/BHA/PHA belong to the umbrella EXFOLIANT_ACID. Rule lookups by group
-- pair use it so a rule written for the umbrella also answers a question about a member.
ALTER TABLE functional_groups ADD COLUMN IF NOT EXISTS parent_code text REFERENCES functional_groups(code);

-- Every ingredient name the EU lists know, with its usual functions (app/eu_lists.py,
-- data/eu_*). Separate from `ingredients`, the reviewed actives dictionary: a name here is
-- recognised and described, never counted as an active.
CREATE TABLE IF NOT EXISTS inci_names (
  normalized_name text PRIMARY KEY,
  name            text NOT NULL,               -- as printed in the EU list (upper case)
  in_glossary     boolean NOT NULL,            -- in the current glossary, Decision (EU) 2025/1175
  functions       text[] NOT NULL DEFAULT '{}' -- from the 2006 inventory, Decision 2006/257/EC
);

-- Trigram indexes for "did you mean" suggestions on names nobody recognised (typos).
CREATE INDEX IF NOT EXISTS inci_names_trgm ON inci_names USING gin (normalized_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ingredient_synonyms_trgm
  ON ingredient_synonyms USING gin (normalized_name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS cosmetic_functions (
  code           text PRIMARY KEY, -- e.g. HUMECTANT, as in the 2006 inventory
  definition_en  text,             -- official definition; null when the inventory gives none
  name_vi        text NOT NULL,
  description_vi text NOT NULL
);

-- Fragrance allergens the EU requires to be named on the label (Annex III of Regulation
-- 1223/2009, data/eu_fragrance_allergens.tsv). Shown on the ingredient only, never a warning.
CREATE TABLE IF NOT EXISTS fragrance_allergens (
  normalized_name text PRIMARY KEY,
  name            text NOT NULL,
  annex_entry     integer NOT NULL -- reference number in Annex III
);

-- Everyday names ("rau má", "Purified Water") for EU names, from data/common_names.toml.
CREATE TABLE IF NOT EXISTS common_names (
  normalized_name text PRIMARY KEY,
  name            text NOT NULL,
  lang            text NOT NULL CHECK (lang IN ('vi', 'en')),
  inci_names      text[] NOT NULL, -- EU names it may stand for; the first is used to resolve
  note            text
);

-- Reviewers sign in to the review page. Added with scripts.reviewers; passwords are scrypt hashes.
CREATE TABLE IF NOT EXISTS reviewers (
  name          text PRIMARY KEY,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviewer_sessions (
  token_hash text PRIMARY KEY, -- sha256 of the bearer token; the token itself is never stored
  reviewer   text NOT NULL REFERENCES reviewers(name) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

-- Myth card drafts written by AI from sources a reviewer chose. Deliberately not in `rules`:
-- nothing that loads rules can see a draft. A reviewer copies a draft into data/rules.toml
-- (published = false), reads the sources and publishes it like any other rule.
CREATE TABLE IF NOT EXISTS rule_drafts (
  id                serial PRIMARY KEY,
  key               text NOT NULL,
  kind              text NOT NULL DEFAULT 'myth' CHECK (kind = 'myth'),
  severity          text NOT NULL CHECK (severity IN ('info', 'safe')),
  scope             text NOT NULL CHECK (scope IN ('same_step', 'same_session', 'same_day')),
  evidence_level    text NOT NULL CHECK (evidence_level IN ('high', 'moderate', 'low', 'expert_opinion')),
  group_a           text NOT NULL REFERENCES functional_groups(code),
  group_b           text NOT NULL REFERENCES functional_groups(code),
  title_vi          text NOT NULL,
  explanation_vi    text NOT NULL,
  answerable        boolean NOT NULL, -- false: the model found the sources do not answer the question
  reviewer_notes_vi text NOT NULL,    -- what the sources do not say, for the reviewer
  sources           jsonb NOT NULL,   -- [{url, title, publisher}] as proposed by the model
  quotes            jsonb NOT NULL,   -- [{url, quote, found}]; found = verbatim on the fetched page
  model             text NOT NULL,
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'discarded')),
  created_by        text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- User questions were dropped: answers came days later with no way to reach the asker, while the
-- free-text box could hold personal data. Drop the column first, it references the table.
ALTER TABLE rule_drafts DROP COLUMN IF EXISTS question_id;
DROP TABLE IF EXISTS user_questions;

-- User accounts (direction H, plan/h-accounts.md): sign-in by email and password, sessions, and
-- the routine kept for use on several devices. Only the email, a password hash and the routine
-- are stored.
-- Not open to real users until the legal questions in plan/h-accounts.md are answered.
CREATE TABLE IF NOT EXISTS users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL UNIQUE, -- normalized: trimmed, lower case
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

-- Proof of consent (Law 91/2025/QH15 Art. 9): what was agreed to, under which policy, when.
CREATE TABLE IF NOT EXISTS consents (
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose        text NOT NULL,
  policy_version text NOT NULL,
  granted_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, purpose, policy_version)
);

-- Sign-in by password (27/10, replacing sign-in by emailed link). password_hash is a scrypt
-- hash (app/passwords.py); NULL for accounts made before passwords, which set one through
-- "forgot password". email_verified_at NULL: the address is not verified yet, so no sign-in.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
-- The policy agreed to when registering; recorded as consent on verification, then cleared.
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_policy_version text;
-- Accounts made before passwords signed in by an emailed link, which proves the mailbox: they
-- count as verified. The backfill runs only in the run that adds the column, so later runs
-- never mark a new, unverified account as verified.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'users'
      AND column_name = 'email_verified_at'
  ) THEN
    ALTER TABLE users ADD COLUMN email_verified_at timestamptz;
    UPDATE users SET email_verified_at = created_at;
  END IF;
END $$;

-- Links sent by email: verify the address (24 hours) or reset the password (30 minutes).
-- Single use; only the sha256 of the token is stored.
CREATE TABLE IF NOT EXISTS email_tokens (
  token_hash     text PRIMARY KEY,
  email          text NOT NULL,
  purpose        text NOT NULL CHECK (purpose IN ('verify', 'reset')),
  policy_version text, -- verify: the policy agreed to when registering; recorded on verification
  expires_at     timestamptz NOT NULL,
  used_at        timestamptz
);
CREATE INDEX IF NOT EXISTS email_tokens_email ON email_tokens (email);
-- Verify links only: the scrypt hash of the password registered with this link. A link
-- verifies only with that password, so registering an unverified address again with another
-- password cannot make an earlier link (in the owner's mailbox) activate it. Added 27/10.
ALTER TABLE email_tokens ADD COLUMN IF NOT EXISTS password_hash text;

-- Sign-in links were replaced by passwords (27/10); the table only ever held dev data.
DROP TABLE IF EXISTS login_tokens;

CREATE TABLE IF NOT EXISTS user_sessions (
  id_hash    text PRIMARY KEY, -- sha256 of the cookie value
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

-- The routine as the browser keeps it (frontend/src/routine.ts), with a version for sync:
-- a write names the version it started from and is refused if another device wrote since.
CREATE TABLE IF NOT EXISTS user_routines (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       jsonb NOT NULL,
  version    integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
