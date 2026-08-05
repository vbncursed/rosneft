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

// CredentialedUsers answers "which of these users have a passkey at all". It is
// the only way to ask about somebody else: List resolves the caller's own id
// and cannot serve the admin console.
func (s *Service) CredentialedUsers(ctx context.Context, userIDs []string) ([]string, error) {
	if len(userIDs) == 0 {
		return nil, nil
	}
	return s.store.UsersWithCredentials(ctx, userIDs)
}

// Delete removes one of the user's credentials by base64url id.
func (s *Service) Delete(ctx context.Context, userID, credentialID string) error {
	raw, err := base64.RawURLEncoding.DecodeString(credentialID)
	if err != nil {
		return domain.ErrNotFound
	}
	return s.store.DeleteByCredentialID(ctx, userID, raw)
}
