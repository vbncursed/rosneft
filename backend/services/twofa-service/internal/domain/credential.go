// Package domain holds twofa-service value types and sentinel errors.
package domain

import "time"

// Credential is a user's TOTP enrollment state.
type Credential struct {
	UserID  string
	Secret  []byte // AES-GCM ciphertext; empty until Setup
	Enabled bool
	// EnabledAt is when 2FA actually went on. Zero when it is off, and zero
	// for enrolments that predate the enabled_at column — the moment was never
	// recorded and is not invented.
	EnabledAt time.Time
}

// Status is a user's 2FA posture as the account screen shows it.
type Status struct {
	Enabled           bool
	EnabledAt         time.Time
	RecoveryRemaining int
	RecoveryTotal     int
}
