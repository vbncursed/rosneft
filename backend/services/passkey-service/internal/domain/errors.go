package domain

import "errors"

// Sentinel errors propagated across layers; transport maps each to a gRPC code.
var (
	ErrNotFound         = errors.New("passkey credential not found")
	ErrCeremonyExpired  = errors.New("passkey ceremony expired or unknown")
	ErrAssertionInvalid = errors.New("passkey assertion invalid")
	ErrNoCredentials    = errors.New("no passkeys enrolled")
)
