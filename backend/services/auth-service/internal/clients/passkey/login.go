package passkey

import (
	"context"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	passkeyv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/passkey/v1"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// BeginLogin proxies the discoverable-login begin.
func (c *Client) BeginLogin(ctx context.Context) (optionsJSON, flowID string, err error) {
	resp, err := c.cc.BeginLogin(ctx, &passkeyv1.BeginLoginRequest{})
	if err != nil {
		return "", "", refusal(err)
	}
	return resp.GetOptionsJson(), resp.GetFlowId(), nil
}

// FinishLogin verifies the assertion and returns the verified user id.
func (c *Client) FinishLogin(ctx context.Context, flowID, assertionJSON string) (string, error) {
	resp, err := c.cc.FinishLogin(ctx, &passkeyv1.FinishLoginRequest{FlowId: flowID, AssertionJson: assertionJSON})
	if err != nil {
		return "", refusal(err)
	}
	return resp.GetUserId(), nil
}

// refusal turns passkey-service's client-fault statuses into auth's domain
// sentinels so they surface as 4xx; Internal, Unavailable and the rest pass
// through unchanged and stay server errors. The bare sentinel is returned, not
// the foreign message: passkey already words it with its own sentinel (the
// body would repeat itself) and, for an assertion failure, with the WebAuthn
// library's text, which a 4xx body must not show.
func refusal(err error) error {
	st, ok := status.FromError(err)
	if !ok {
		return err
	}
	switch st.Code() {
	case codes.FailedPrecondition:
		return domain.ErrPasskeyCeremonyExpired
	case codes.Unauthenticated, codes.NotFound:
		return domain.ErrInvalidCredential
	case codes.InvalidArgument:
		return domain.ErrInvalidInput
	default:
		return err
	}
}
