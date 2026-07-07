package passkey

import (
	"context"
	"encoding/base64"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
)

// List returns the user's credentials.
func (s *Service) List(ctx context.Context, userID string) ([]domain.Credential, error) {
	return s.store.ListByUser(ctx, userID)
}

// Delete removes one of the user's credentials by base64url id.
func (s *Service) Delete(ctx context.Context, userID, credentialID string) error {
	raw, err := base64.RawURLEncoding.DecodeString(credentialID)
	if err != nil {
		return domain.ErrNotFound
	}
	return s.store.DeleteByCredentialID(ctx, userID, raw)
}
