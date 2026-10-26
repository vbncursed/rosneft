-- +goose Up
-- +goose StatementBegin
-- Model tags (spec 2026-10-26 §7.1). Every model carries exactly one tag from
-- this list; a zone carries 1–5 of them. Expand and contract in one step: the
-- column is added, existing models are backfilled with ungrouped, then it is
-- NOT NULL with no DEFAULT, so a writer that forgets the tag fails instead of
-- falling back silently. The backfill fires the models audit trigger once per
-- model, with no actor — expected for a seed migration.
CREATE TABLE model_tags (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  title TEXT NOT NULL CHECK (btrim(title) <> '' AND length(title) <= 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
INSERT INTO model_tags (slug, title) VALUES
  ('ungrouped',     'Ungrouped'),
  ('camp',          'Camp & accommodation'),     -- trailers, cabins, WC, dining, medic, offices
  ('loading',       'Loading station'),          -- loading arms, metering, weigh bridge
  ('vehicles',      'Vehicles & trucks'),        -- tankers, trucks, service vehicles
  ('lifting',       'Cranes & lifting'),
  ('nitrogen',      'Nitrogen & gas'),           -- N2 units, compressors
  ('well-service',  'Well service & pumping'),   -- fluid pumping unit, slickline/CT, water tanker
  ('storage-tanks', 'Storage tanks'),
  ('process',       'Separation & treating'),    -- separators, heater/treaters, manifolds
  ('power',         'Power generation'),         -- generators, distribution panels
  ('flare',         'Flare system'),             -- flare stack, knock-out drum, burners
  ('utilities',     'Workshop & utilities');     -- workshop, stores, lab, water, diesel
ALTER TABLE models ADD COLUMN tag_id BIGINT REFERENCES model_tags(id) ON DELETE RESTRICT;
UPDATE models SET tag_id = (SELECT id FROM model_tags WHERE slug = 'ungrouped');
ALTER TABLE models ALTER COLUMN tag_id SET NOT NULL;   -- no DEFAULT
CREATE INDEX idx_models_tag ON models(tag_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_models_tag;
ALTER TABLE models DROP COLUMN tag_id;
DROP TABLE model_tags;
-- +goose StatementEnd
