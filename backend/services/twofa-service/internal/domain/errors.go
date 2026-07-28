package domain

import "errors"

// Sentinel errors propagated across layers; transport maps each to a gRPC code.
var (
	ErrNotFound            = errors.New("twofa credential not found")
	ErrTwoFAAlreadyEnabled = errors.New("2fa already enabled")
	ErrTwoFANotEnabled     = errors.New("2fa not enabled")
	ErrTwoFAInvalidCode    = errors.New("invalid 2fa code")
	ErrTwoFALocked         = errors.New("too many failed 2fa attempts")
)
