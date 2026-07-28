package domain

import "errors"

// ErrInvalidInput marks a malformed request; transport maps it to
// codes.InvalidArgument.
var ErrInvalidInput = errors.New("invalid input")
