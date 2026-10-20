-- +goose Up
-- +goose StatementBegin
-- The uncompressed ("plain") GLB mesh-worker keeps beside each LOD0, used by the
-- compatible export. Keyed by the LOD0's content hash rather than stored on the
-- artifact row: the previous release's artifact upsert lists its columns, so a
-- column would keep an old plain hash next to a new LOD0 after a rollback; keyed
-- by hash, a LOD0 with new bytes simply has no mapping. No FK: a hash is not a row.
CREATE TABLE plain_artifacts (
    lod0_hash  text PRIMARY KEY,
    plain_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
-- ResolveBlobAccess looks a plain blob up by plain_hash.
CREATE INDEX plain_artifacts_plain_hash ON plain_artifacts (plain_hash);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS plain_artifacts;
-- +goose StatementEnd
