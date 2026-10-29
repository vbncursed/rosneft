// Package totp wraps pquerna/otp for TOTP secret generation and validation,
// plus one-time recovery codes.
package totp

import (
	"crypto/subtle"
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

// period is the RFC 6238 time step pquerna/otp uses by default.
const period = 30

// Validate reports whether code is valid for secret now (±1 step skew) and, if
// so, the time step it belongs to. Callers record that step to refuse a replay:
// the library alone accepts one code for up to ~90 s.
func Validate(secret, code string) (step int64, ok bool) {
	now := time.Now().Unix() / period
	for _, d := range []int64{0, -1, 1} {
		s := now + d
		want, err := totp.GenerateCode(secret, time.Unix(s*period, 0))
		if err == nil && subtle.ConstantTimeCompare([]byte(want), []byte(code)) == 1 {
			return s, true
		}
	}
	return 0, false
}
