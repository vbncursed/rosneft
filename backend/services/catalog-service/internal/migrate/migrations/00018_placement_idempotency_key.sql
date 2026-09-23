-- +goose Up
-- +goose StatementBegin
-- A batch create sent with an Idempotency-Key stamps each row with the key and
-- its position in the batch. A replay of the key on the same territory reads
-- those rows back instead of inserting again; the unique index is what makes a
-- concurrent pair write one batch — the second insert of (territory, key, 0)
-- waits for the first and then fails, and the loser reads the winner's rows.
-- Rows created without a key keep both columns NULL and stay out of the index.
-- Nothing ever UPDATEs these columns, so the audit trigger's ignore list does
-- not need them.
ALTER TABLE placements
    ADD COLUMN idempotency_key TEXT,
    ADD COLUMN batch_index INT;
CREATE UNIQUE INDEX placements_idempotency_key
    ON placements (territory_id, idempotency_key, batch_index)
    WHERE idempotency_key IS NOT NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX placements_idempotency_key;
ALTER TABLE placements
    DROP COLUMN idempotency_key,
    DROP COLUMN batch_index;
-- +goose StatementEnd
