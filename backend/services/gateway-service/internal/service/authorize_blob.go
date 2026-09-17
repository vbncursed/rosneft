package service

import (
	"context"
	"fmt"
	"regexp"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// errUnknownBlob is the one answer for a hash the caller may not attach,
// whether it belongs to someone else or to nobody: telling the two apart
// would confirm that another tenant's blob exists.
var errUnknownBlob = fmt.Errorf("%w: unknown blob hash", domain.ErrInvalidInput)

// blobHash is how BlobStore names content: lowercase hex SHA-256. Anything
// else names no blob, and is refused before it reaches upload-service, whose
// own validation would answer in its internal wording.
var blobHash = regexp.MustCompile(`^[0-9a-f]{64}$`)

// authorizeBlobs refuses any non-empty hash the caller neither uploaded nor
// can already read. Without it a caller who ever learned a hash — a guest
// whose access was revoked — could attach that blob to a row of their own and
// read it through RequireBlobAccess from then on; attached to a model, it
// would become readable by every tenant.
//
// Empty hashes are skipped: requiredness is each caller's own validation.
func (g *Gateway) authorizeBlobs(ctx context.Context, scope domain.BlobScope, hashes ...string) error {
	for _, hash := range hashes {
		if hash == "" || scope.AllAccess {
			continue
		}
		if err := g.authorizeBlob(ctx, scope.AdminID, hash); err != nil {
			return err
		}
	}
	return nil
}

func (g *Gateway) authorizeBlob(ctx context.Context, scopeAdminID, hash string) error {
	if !blobHash.MatchString(hash) {
		return errUnknownBlob
	}
	uploaded, err := g.upload.HasUploaded(ctx, hash)
	switch {
	case err != nil:
		return fmt.Errorf("check upload: %w", err)
	case uploaded:
		return nil
	}
	// An empty scope would make the catalog look across every tenant.
	if scopeAdminID == "" {
		return errUnknownBlob
	}
	visible, err := g.catalog.ResolveBlobAccess(ctx, hash, scopeAdminID)
	if err != nil {
		return fmt.Errorf("resolve blob access: %w", err)
	}
	if !visible {
		return errUnknownBlob
	}
	return nil
}
