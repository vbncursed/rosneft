package service

import "context"

// HasUploaded reports whether owner ever finalized an upload with hash. A
// caller with no identity has uploaded nothing.
func (u *Upload) HasUploaded(ctx context.Context, owner, hash string) (bool, error) {
	if owner == "" || hash == "" {
		return false, nil
	}
	return u.store.HasUpload(ctx, hash, owner)
}
