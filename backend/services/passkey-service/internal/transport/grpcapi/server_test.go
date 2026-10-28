package grpcapi_test

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
)

// fakeService records the last management call so a test can assert both what
// reached the business layer and that nothing did.
type fakeService struct {
	calls                                  int
	userID, displayName, flowID, name, cid string
}

func (f *fakeService) BeginRegistration(_ context.Context, userID, displayName string) (string, string, error) {
	f.calls++
	f.userID, f.displayName = userID, displayName
	return "{}", "flow-1", nil
}

func (f *fakeService) FinishRegistration(
	_ context.Context,
	userID, flowID, _, name string,
) (domain.Credential, error) {
	f.calls++
	f.userID, f.flowID, f.name = userID, flowID, name
	return domain.Credential{Name: name}, nil
}

func (f *fakeService) List(_ context.Context, userID string) ([]domain.Credential, error) {
	f.calls++
	f.userID = userID
	return nil, nil
}

func (f *fakeService) Delete(_ context.Context, userID, credentialID string) error {
	f.calls++
	f.userID, f.cid = userID, credentialID
	return nil
}

func (f *fakeService) BeginLogin(context.Context) (string, string, error) { return "", "", nil }

func (f *fakeService) FinishLogin(context.Context, string, string) (string, error) { return "", nil }

func (f *fakeService) CredentialedUsers(context.Context, []string) ([]string, error) {
	return nil, nil
}
