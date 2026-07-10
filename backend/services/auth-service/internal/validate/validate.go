// Package validate enforces the credential format rules shared by user
// creation, login, and password changes.
package validate

import (
	"fmt"
	"net/mail"
	"unicode"
	"unicode/utf8"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

const (
	usernameMin = 3
	usernameMax = 50
	passwordMin = 8
	passwordMax = 256
	emailMax    = 254 // RFC 5321 address length ceiling
	tourIDMax   = 32
)

// TourID accepts a lower-case slug. The set of tours lives in the frontend, so
// this validates the shape rather than the membership — but it is still a trust
// boundary: the value is appended to an array the client can grow.
func TourID(s string) error {
	if len(s) == 0 || len(s) > tourIDMax {
		return fmt.Errorf("validate: %w: tour id must be 1–%d characters", domain.ErrInvalidInput, tourIDMax)
	}
	for i, r := range s {
		alnum := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')
		if !alnum && !(r == '-' && i > 0) {
			return fmt.Errorf("validate: %w: tour id must be lower-case letters, digits, and dashes", domain.ErrInvalidInput)
		}
	}
	return nil
}

// Username requires 3–50 characters.
func Username(s string) error {
	if n := utf8.RuneCountInString(s); n < usernameMin || n > usernameMax {
		return fmt.Errorf("validate: %w: username must be %d–%d characters", domain.ErrInvalidInput, usernameMin, usernameMax)
	}
	return nil
}

// Email requires a syntactically valid address within the RFC length ceiling.
func Email(s string) error {
	if len(s) > emailMax {
		return fmt.Errorf("validate: %w: email too long", domain.ErrInvalidInput)
	}
	if _, err := mail.ParseAddress(s); err != nil {
		return fmt.Errorf("validate: %w: invalid email", domain.ErrInvalidInput)
	}
	return nil
}

// Password requires 8–256 characters with at least one upper-case, lower-case,
// digit, and special (anything else) character.
func Password(s string) error {
	if n := utf8.RuneCountInString(s); n < passwordMin || n > passwordMax {
		return fmt.Errorf("validate: %w: password must be %d–%d characters", domain.ErrInvalidInput, passwordMin, passwordMax)
	}
	var upper, lower, digit, special bool
	for _, r := range s {
		switch {
		case unicode.IsUpper(r):
			upper = true
		case unicode.IsLower(r):
			lower = true
		case unicode.IsDigit(r):
			digit = true
		default:
			special = true
		}
	}
	if !upper || !lower || !digit || !special {
		return fmt.Errorf("validate: %w: password needs an upper-case, lower-case, digit, and special character", domain.ErrInvalidInput)
	}
	return nil
}
