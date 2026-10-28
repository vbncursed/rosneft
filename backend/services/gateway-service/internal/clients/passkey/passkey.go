package passkey

import (
	"context"

	passkeyv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/passkey/v1"
)

// The management calls below take the user id the gateway already
// authenticated; passkey-service trusts it and calls no one to check.

// BeginRegistration starts enrolment; displayName is the login authenticators show.
func (c *Client) BeginRegistration(
	ctx context.Context,
	userID, displayName string,
) (optionsJSON, flowID string, err error) {
	resp, err := c.cc.BeginRegistration(ctx, &passkeyv1.BeginRegistrationRequest{
		UserId: userID, DisplayName: displayName,
	})
	if err != nil {
		return "", "", err
	}
	return resp.GetOptionsJson(), resp.GetFlowId(), nil
}

func (c *Client) FinishRegistration(
	ctx context.Context,
	userID, flowID, credentialJSON, name string,
) (*passkeyv1.Credential, error) {
	resp, err := c.cc.FinishRegistration(ctx, &passkeyv1.FinishRegistrationRequest{
		UserId: userID, FlowId: flowID, CredentialJson: credentialJSON, Name: name,
	})
	if err != nil {
		return nil, err
	}
	return resp.GetCredential(), nil
}

func (c *Client) ListCredentials(ctx context.Context, userID string) ([]*passkeyv1.Credential, error) {
	resp, err := c.cc.ListCredentials(ctx, &passkeyv1.ListCredentialsRequest{UserId: userID})
	if err != nil {
		return nil, err
	}
	return resp.GetCredentials(), nil
}

// CredentialedUsers reports which of userIDs own at least one passkey. Unlike
// ListCredentials it is keyed on a set of ids rather than on one caller, which
// is what lets the admin console ask about somebody else.
func (c *Client) CredentialedUsers(ctx context.Context, userIDs []string) ([]string, error) {
	resp, err := c.cc.CredentialedUsers(ctx, &passkeyv1.CredentialedUsersRequest{UserIds: userIDs})
	if err != nil {
		return nil, err
	}
	return resp.GetUserIdsWithCredentials(), nil
}

func (c *Client) DeleteCredential(ctx context.Context, userID, credID string) error {
	_, err := c.cc.DeleteCredential(ctx, &passkeyv1.DeleteCredentialRequest{UserId: userID, CredentialId: credID})
	return err
}
