-- +goose Up
-- Which first-run tours this user has finished or skipped, by id ("viewer",
-- "panorama", …). An empty array means they have seen none.
ALTER TABLE users ADD COLUMN onboarding_tours_seen TEXT[] NOT NULL DEFAULT '{}';

-- +goose Down
ALTER TABLE users DROP COLUMN onboarding_tours_seen;
