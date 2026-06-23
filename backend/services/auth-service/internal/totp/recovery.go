package totp

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base32"
	"encoding/hex"
	"fmt"
	"strings"
)

// GenerateRecovery returns n recovery codes (plaintext, shown once) and their
// SHA-256 hashes (stored). Codes are 10 base32 chars, grouped as XXXXX-XXXXX.
func GenerateRecovery(n int) (plain, hashes []string, err error) {
	plain = make([]string, 0, n)
	hashes = make([]string, 0, n)
	for range n {
		buf := make([]byte, 8)
		if _, err = rand.Read(buf); err != nil {
			return nil, nil, fmt.Errorf("totp.GenerateRecovery: %w", err)
		}
		raw := strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(buf))[:10]
		code := raw[:5] + "-" + raw[5:]
		plain = append(plain, code)
		hashes = append(hashes, hashCode(code))
	}
	return plain, hashes, nil
}

// MatchRecovery returns the index of the hash matching plain, or ok=false.
// Compares in constant time per candidate to avoid timing leaks.
func MatchRecovery(plain string, hashes []string) (int, bool) {
	want := hashCode(plain)
	idx, found := -1, false
	for i, h := range hashes {
		if subtle.ConstantTimeCompare([]byte(h), []byte(want)) == 1 {
			idx, found = i, true
		}
	}
	return idx, found
}

func hashCode(code string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(strings.ToLower(code))))
	return hex.EncodeToString(sum[:])
}
