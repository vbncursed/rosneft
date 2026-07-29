-- +goose Up
-- +goose StatementBegin
-- digest() lives in pgcrypto. The auth migrations create the extension too, but
-- service migrations run independently and in no fixed order: on a fresh
-- database audit may go first, and in the testcontainers suites it goes alone.
-- Claiming the dependency here is what makes ComputeDigest work regardless.
-- IF NOT EXISTS because auth may well have created it already; the Down
-- migration deliberately does not drop it, since auth needs gen_random_uuid().
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Sealed ranges of the journal. Each row digests audit_log over (from_id, to_id]
-- and chains to its predecessor, so rewriting one checkpoint forces rewriting
-- every later one.
--
-- watermark is pg_sequence_last_value('audit_log_id_seq') as observed by the
-- tick that wrote this row. The next tick uses it as its range boundary: the
-- sequence hands out ids before commit, so a watermark one tick old is the
-- point past which every id is settled. max(id) would miss a row held by an
-- in-flight transaction and raise a false alarm once it lands.
--
-- row_count, not `rows`: ROWS is a PostgreSQL keyword.
CREATE TABLE audit_checkpoint (
    id          BIGSERIAL PRIMARY KEY,
    at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    from_id     BIGINT NOT NULL,
    to_id       BIGINT NOT NULL,
    watermark   BIGINT NOT NULL,
    row_count   INT    NOT NULL,
    digest      TEXT   NOT NULL,
    prev_digest TEXT   NOT NULL
);
-- +goose StatementEnd

-- +goose StatementBegin
-- Same guarantee as audit_log, same function: a checkpoint that can be rewritten
-- protects nothing.
CREATE TRIGGER audit_checkpoint_no_mutate BEFORE UPDATE OR DELETE ON audit_checkpoint
    FOR EACH STATEMENT EXECUTE FUNCTION audit_immutable();
CREATE TRIGGER audit_checkpoint_no_truncate BEFORE TRUNCATE ON audit_checkpoint
    FOR EACH STATEMENT EXECUTE FUNCTION audit_immutable();

REVOKE UPDATE, DELETE, TRUNCATE ON audit_checkpoint FROM PUBLIC;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TRIGGER IF EXISTS audit_checkpoint_no_truncate ON audit_checkpoint;
DROP TRIGGER IF EXISTS audit_checkpoint_no_mutate ON audit_checkpoint;
DROP TABLE IF EXISTS audit_checkpoint;
-- +goose StatementEnd
