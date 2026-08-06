-- +goose Up
-- +goose StatementBegin
-- The ::text casts are explicit on purpose, though not strictly required today.
-- users.email is CITEXT, which compares case-insensitively — but there is no
-- lower(citext) overload, so `lower(email)` resolves to lower(text) via the
-- implicit cast and yields text, making the predicate case-sensitive after all.
-- That is a subtle chain to rely on silently, and it would invert into an
-- always-false predicate if a lower(citext) overload ever appeared. Spelling
-- the casts out costs nothing and says what the comparison means.
--
-- The WHERE clause is an audit constraint, not an optimization. users carries
-- the audit_capture() trigger and email is not in its ignore list — verified:
-- the statement files a user.update entry per changed row — so an unfiltered
-- UPDATE would journal every user in the table. This migration runs outside
-- audittx.Run, so those entries would carry no actor.
UPDATE users SET email = lower(email::text)
WHERE email::text <> lower(email::text);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
SELECT 1;  -- irreversible: the original casing is not recoverable
-- +goose StatementEnd
