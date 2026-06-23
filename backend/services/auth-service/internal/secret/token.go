package secret

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
)

// NewToken returns a URL-safe random opaque token (32 bytes of entropy).
func NewToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("secret.NewToken: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
