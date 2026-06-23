package domain

import "errors"

// Sentinel errors propagated across layers; transport maps each to a status.
var (
	ErrInvalidInput      = errors.New("invalid input")
	ErrUserNotFound      = errors.New("user not found")
	ErrRoleNotFound      = errors.New("role not found")
	ErrPermissionUnknown = errors.New("unknown permission")
	ErrEmailTaken        = errors.New("email already exists")
	ErrUsernameTaken     = errors.New("username already exists")
	ErrRoleSlugTaken     = errors.New("role slug already exists")
	ErrInvalidCredential = errors.New("invalid credentials")
	ErrAccountFrozen     = errors.New("account is frozen")
	ErrAccountDeleted    = errors.New("account is deleted")
	ErrLoginThrottled    = errors.New("too many failed attempts")
	ErrSessionInvalid    = errors.New("session invalid or expired")
	Err2FARequired       = errors.New("2fa required")
	Err2FAInvalidCode    = errors.New("invalid 2fa code")
	Err2FANotEnabled     = errors.New("2fa not enabled")
	Err2FAAlreadyEnabled = errors.New("2fa already enabled")
	ErrSystemRole        = errors.New("system role cannot be modified this way")
	ErrLastAdmin         = errors.New("cannot remove the last admin")
	ErrSelfTarget        = errors.New("cannot perform this action on yourself")
)
