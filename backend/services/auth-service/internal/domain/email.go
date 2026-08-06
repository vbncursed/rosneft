package domain

import "strings"

// Fold mirrors in Go what the citext columns (users.email, users.username)
// already do in Postgres: compare case-insensitively. Applying it before a
// write makes the stored form match the compared form, so an address typed as
// Ernest.Sayapov@Gmail.COM is stored — and displayed — the way every mail
// provider treats it.
//
// The trim is not cosmetic: a clipboard-pasted address with surrounding
// whitespace fails mail.ParseAddress on create and misses the row on login.
//
// It also folds usernames, which share the citext column type — hence the
// neutral name.
func Fold(s string) string { return strings.ToLower(strings.TrimSpace(s)) }
