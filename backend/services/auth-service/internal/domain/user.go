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

// User is an account. PasswordHash never leaves the service boundary
// (transport omits it). 2FA state lives in twofa-service.
type User struct {
	ID           string
	Email        string
	Username     string
	PasswordHash string
	Status       string
	RoleSlugs    []string
	Permissions  []string
	CreatedAt    time.Time
	UpdatedAt    time.Time
	DeletedAt    *time.Time
	CreatedBy    *string // who created this account; nil for bootstrap admin
	IsOwner      bool    // root of trust: manages admin accounts, grants owner, bypasses grant limits
}
