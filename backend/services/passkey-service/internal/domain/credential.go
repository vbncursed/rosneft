// Package domain holds passkey-service value types and sentinel errors.
package domain

import "time"

// Credential is one stored WebAuthn public-key credential.
type Credential struct {
	ID           string // uuid
	UserID       string
	CredentialID []byte
	PublicKey    []byte
	SignCount    uint32
	Transports   []string
	AAGUID       []byte
	Name         string
	CreatedAt    time.Time
	LastUsedAt   *time.Time
}
