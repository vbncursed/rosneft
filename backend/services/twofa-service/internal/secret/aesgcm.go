// Package secret encrypts TOTP secrets at rest (AES-GCM).
package secret

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
)

// Cipher encrypts/decrypts with a fixed 32-byte key.
type Cipher struct{ aead cipher.AEAD }

// NewCipher parses key (64-char hex or base64 → 32 bytes) and builds AES-GCM.
func NewCipher(key string) (*Cipher, error) {
	raw, err := decodeKey(key)
	if err != nil {
		return nil, err
	}
	if len(raw) != 32 {
		return nil, fmt.Errorf("secret.NewCipher: key must be 32 bytes, got %d", len(raw))
	}
	block, err := aes.NewCipher(raw)
	if err != nil {
		return nil, fmt.Errorf("secret.NewCipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("secret.NewCipher: gcm: %w", err)
	}
	return &Cipher{aead: aead}, nil
}

// Encrypt prepends a random nonce to the ciphertext.
func (c *Cipher) Encrypt(plain []byte) ([]byte, error) {
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, fmt.Errorf("secret.Encrypt: nonce: %w", err)
	}
	return c.aead.Seal(nonce, nonce, plain, nil), nil
}

// Decrypt reverses Encrypt.
func (c *Cipher) Decrypt(ct []byte) ([]byte, error) {
	ns := c.aead.NonceSize()
	if len(ct) < ns {
		return nil, fmt.Errorf("secret.Decrypt: ciphertext too short")
	}
	pt, err := c.aead.Open(nil, ct[:ns], ct[ns:], nil)
	if err != nil {
		return nil, fmt.Errorf("secret.Decrypt: %w", err)
	}
	return pt, nil
}

func decodeKey(key string) ([]byte, error) {
	if raw, err := hex.DecodeString(key); err == nil && len(raw) == 32 {
		return raw, nil
	}
	raw, err := base64.StdEncoding.DecodeString(key)
	if err != nil {
		return nil, fmt.Errorf("secret: key is neither 32-byte hex nor base64: %w", err)
	}
	return raw, nil
}
