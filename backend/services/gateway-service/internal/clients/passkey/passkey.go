package passkey

import (
	"context"

	passkeyv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/passkey/v1"
)

func (c *Client) BeginRegistration(ctx context.Context, token string) (optionsJSON, flowID string, err error) {
	resp, err := c.cc.BeginRegistration(ctx, &passkeyv1.BeginRegistrationRequest{Token: token})
	if err != nil {
		return "", "", err
	}
	return resp.GetOptionsJson(), resp.GetFlowId(), nil
}

func (c *Client) FinishRegistration(ctx context.Context, token, flowID, credentialJSON, name string) (*passkeyv1.Credential, error) {
	resp, err := c.cc.FinishRegistration(ctx, &passkeyv1.FinishRegistrationRequest{
		Token: token, FlowId: flowID, CredentialJson: credentialJSON, Name: name,
	})
	if err != nil {
		return nil, err
	}
	return resp.GetCredential(), nil
}

func (c *Client) ListCredentials(ctx context.Context, token string) ([]*passkeyv1.Credential, error) {
	resp, err := c.cc.ListCredentials(ctx, &passkeyv1.ListCredentialsRequest{Token: token})
	if err != nil {
		return nil, err
	}
	return resp.GetCredentials(), nil
}

func (c *Client) DeleteCredential(ctx context.Context, token, credID string) error {
	_, err := c.cc.DeleteCredential(ctx, &passkeyv1.DeleteCredentialRequest{Token: token, CredentialId: credID})
	return err
}
