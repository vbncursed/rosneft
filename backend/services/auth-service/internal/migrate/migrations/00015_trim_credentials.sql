-- +goose Up
-- +goose StatementBegin
-- 00014 lower-cased email but did not trim it, so it left rows in a shape
-- domain.Fold would never produce. This finishes the job for both columns.
--
-- The username case is the load-bearing one. Login folds the identifier, and
-- citext compares case-insensitively but NOT whitespace-insensitively, so a
-- stored " ivan " could not be matched by the folded "ivan" — the account would
-- be impossible to log into. Username is trimmed but deliberately NOT
-- lower-cased: it is a display name and its case is meaningful.
--
-- If two accounts differ only by padding, the UNIQUE index aborts this and the
-- service will not boot. That is deliberate: silently picking a winner would
-- destroy an account. Resolve the duplicate by hand, then re-run. Checked on
-- production before shipping — no padded row exists there.
UPDATE users SET email = btrim(email::text)
WHERE email::text <> btrim(email::text);

UPDATE users SET username = btrim(username::text)
WHERE username::text <> btrim(username::text);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
SELECT 1;  -- irreversible: the original padding is not recoverable
-- +goose StatementEnd
