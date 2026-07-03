// Package domain holds twofa-service value types and sentinel errors.
package domain

// Credential is a user's TOTP enrollment state.
type Credential struct {
	UserID  string
	Secret  []byte // AES-GCM ciphertext; empty until Setup
	Enabled bool
}
