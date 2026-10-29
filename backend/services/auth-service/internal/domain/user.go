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
	// TOTPRequired is policy, not fact: it says an administrator has decided
	// this account must carry a second factor. Whether one is enrolled is
	// twofa-service's answer, and the two are deliberately kept apart — folded
	// together, a twofa-service outage would be indistinguishable from a user
	// who has simply not enrolled yet.
	TOTPRequired bool
	// PasswordChangedAt is nil until the password is first changed.
	PasswordChangedAt *time.Time
	// OnboardingToursSeen lists the first-run tours this user has finished or
	// skipped, by id. Empty until they complete their first one.
	OnboardingToursSeen []string
	// RoleTitles maps each slug in RoleSlugs to the role's display title. It is
	// filled by the same query that loads the slugs — the join onto roles is
	// already there, so the title is one more column rather than a second read.
	RoleTitles map[string]string
}

// NeverChangedEpoch is the password epoch of a user whose password was never
// changed. It is nonzero because zero means "session predates epochs".
const NeverChangedEpoch int64 = 1

// PasswordEpoch orders a user's passwords: it grows with every change. A
// session minted under an older epoch than the user's current one is dead.
func (u User) PasswordEpoch() int64 {
	if u.PasswordChangedAt == nil {
		return NeverChangedEpoch
	}
	return u.PasswordChangedAt.UnixMicro()
}
