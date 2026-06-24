// Package domain contains the auth service's data model — pure Go types, no
// proto, no SQL.
package domain

import "time"

// Account status values.
const (
	StatusActive  = "active"
	StatusFrozen  = "frozen"
	StatusDeleted = "deleted"
)

// User is an account. PasswordHash and TOTPSecret never leave the service
// boundary (transport omits them).
type User struct {
	ID           string
	Email        string
	Username     string
	PasswordHash string
	Status       string
	TOTPEnabled  bool
	TOTPSecret   []byte // AES-GCM ciphertext at rest; nil when 2FA off
	RoleSlugs    []string
	Permissions  []string
	CreatedAt    time.Time
	UpdatedAt    time.Time
	DeletedAt    *time.Time
	CreatedBy    *string // who created this account; nil for bootstrap admin
}
