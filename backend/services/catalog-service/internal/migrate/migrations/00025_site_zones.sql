-- +goose Up
-- +goose StatementBegin
-- Site zones (spec 2026-10-26 §7.2): named rectangles in a territory's scene
-- space, each tagged with the model tags it receives. The service enforces
-- 1–5 tags and refuses ungrouped, not SQL. A circular zone later becomes a new
-- expand migration.
CREATE TABLE site_zones (
  id BIGSERIAL PRIMARY KEY,
  territory_id BIGINT NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,                        -- trimmed 1–120, unique per territory (lower(btrim)), as 00021
  points DOUBLE PRECISION[] NOT NULL CHECK (cardinality(points) = 12), -- 4 corners, scene space, flat x,y,z
  drawing_width_m DOUBLE PRECISION, drawing_height_m DOUBLE PRECISION, -- size on the drawing; NULL when the drawing scale is unknown
  created_by UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE UNIQUE INDEX site_zones_territory_title ON site_zones(territory_id, lower(btrim(title)));
CREATE TABLE site_zone_tags (
  zone_id BIGINT NOT NULL REFERENCES site_zones(id) ON DELETE CASCADE,
  tag_id  BIGINT NOT NULL REFERENCES model_tags(id) ON DELETE RESTRICT,
  PRIMARY KEY (zone_id, tag_id));
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE site_zone_tags;
DROP TABLE site_zones;
-- +goose StatementEnd
