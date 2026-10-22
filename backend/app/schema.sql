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

-- One row per quote: a rule may quote several passages from the same source page.
CREATE TABLE IF NOT EXISTS rule_sources (
  rule_id   integer NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  position  integer NOT NULL,         -- order of the quote within the rule
  source_id integer NOT NULL REFERENCES sources(id),
  quote     text NOT NULL, -- verbatim passage supporting the rule; checked against the live page
  PRIMARY KEY (rule_id, position)
);
