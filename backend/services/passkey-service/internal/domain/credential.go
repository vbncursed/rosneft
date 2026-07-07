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
	// BackupEligible (BE) is fixed for a credential's lifetime; WebAuthn login
	// rejects an assertion whose BE differs from the stored value, so it MUST be
	// persisted at registration. BackupState (BS) can change and is written back.
	BackupEligible bool
	BackupState    bool
	Name           string
	CreatedAt    time.Time
	LastUsedAt   *time.Time
}
