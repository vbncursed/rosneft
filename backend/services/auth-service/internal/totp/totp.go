// Package totp wraps pquerna/otp for TOTP secret generation and validation,
// plus one-time recovery codes.
package totp

import (
	"fmt"
	"time"

	"github.com/pquerna/otp/totp"
)

// Generate creates a new TOTP secret and its otpauth:// provisioning URL.
func Generate(issuer, account string) (secret, otpauthURL string, err error) {
	key, err := totp.Generate(totp.GenerateOpts{Issuer: issuer, AccountName: account})
	if err != nil {
		return "", "", fmt.Errorf("totp.Generate: %w", err)
	}
	return key.Secret(), key.URL(), nil
}

// Validate reports whether code is currently valid for secret (±1 step skew).
func Validate(secret, code string) bool {
	return totp.Validate(code, secret)
}

// GenerateNow returns the current code for secret — used to confirm setup.
func GenerateNow(secret string) (string, error) {
	return totp.GenerateCode(secret, time.Now())
}
