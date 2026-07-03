package domain

import "errors"

// Sentinel errors propagated across layers; transport maps each to a gRPC code.
var (
	ErrNotFound          = errors.New("twofa credential not found")
	Err2FAAlreadyEnabled = errors.New("2fa already enabled")
	Err2FANotEnabled     = errors.New("2fa not enabled")
	Err2FAInvalidCode    = errors.New("invalid 2fa code")
	Err2FALocked         = errors.New("too many failed 2fa attempts")
)
