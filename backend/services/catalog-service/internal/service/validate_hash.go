package service

import (
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// blobHashLen is the length of a lowercase-hex-encoded SHA-256 digest — the
// format upload-service.Finalize always emits (hex.EncodeToString of a
// sha256.Sum). Every real hash in production matches it.
const blobHashLen = 64

// validateBlobHash rejects anything that is not exactly 64 hexadecimal
// characters. This is the write boundary: source_blob_hash used to reach
// the database unchecked and later got interpolated into a root shell by
// ops/backup/dump.sh — that script is now defended in depth, but the column
// itself was still an open door for any future consumer that trusts it.
//
// required distinguishes the two hash columns: Territory/Model.SourceBlobHash
// must always be present, but Model.ThumbnailBlobHash legitimately means "no
// thumbnail" when empty.
func validateBlobHash(hash string, required bool) error {
	if hash == "" {
		if required {
			return fmt.Errorf("%w: empty blob hash", domain.ErrInvalidInput)
		}
		return nil
	}
	if len(hash) != blobHashLen {
		return fmt.Errorf("%w: blob hash must be %d hex characters", domain.ErrInvalidInput, blobHashLen)
	}
	// Lowercase only, matching the OpenAPI pattern and what
	// hex.EncodeToString emits. Accepting uppercase would let a request pass
	// validation and then fail later on a blob lookup, because the file on
	// disk is named in lowercase — a confusing failure in place of a clear one.
	for _, c := range hash {
		switch {
		case c >= '0' && c <= '9':
		case c >= 'a' && c <= 'f':
		default:
			return fmt.Errorf("%w: blob hash contains non-hex character", domain.ErrInvalidInput)
		}
	}
	return nil
}
