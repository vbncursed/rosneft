package domain

import "errors"

// Sentinel errors. Storage and service return these (possibly wrapped);
// transport maps each to a user-facing gRPC status code.
var (
	ErrSessionNotFound = errors.New("upload session not found")
	ErrOffsetMismatch  = errors.New("upload offset mismatch")
	ErrSizeExceeded    = errors.New("upload size exceeds expected total")
	ErrInvalidInput    = errors.New("invalid input")
)
