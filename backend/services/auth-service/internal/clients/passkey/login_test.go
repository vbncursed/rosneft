package passkey

import (
	"context"
	"testing"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	passkeyv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/passkey/v1"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

type failingPasskey struct {
	passkeyv1.PasskeyServiceClient
	err error
}

func (f failingPasskey) BeginLogin(
	context.Context,
	*passkeyv1.BeginLoginRequest,
	...grpc.CallOption,
) (*passkeyv1.BeginLoginResponse, error) {
	return nil, f.err
}

func (f failingPasskey) FinishLogin(
	context.Context,
	*passkeyv1.FinishLoginRequest,
	...grpc.CallOption,
) (*passkeyv1.FinishLoginResponse, error) {
	return nil, f.err
}

// A passkey refusal is the caller's fault and must reach auth as a domain
// sentinel (a 4xx); only a genuine fault may stay a foreign gRPC status (5xx).
func TestLoginTranslatesPasskeyStatus(t *testing.T) {
	cases := []struct {
		code codes.Code
		want error
	}{
		{codes.FailedPrecondition, domain.ErrPasskeyCeremonyExpired},
		{codes.Unauthenticated, domain.ErrInvalidCredential},
		{codes.NotFound, domain.ErrInvalidCredential},
		{codes.InvalidArgument, domain.ErrInvalidInput},
	}
	for _, tc := range cases {
		c := &Client{cc: failingPasskey{err: status.Error(tc.code, "boom")}}
		_, _, err := c.BeginLogin(t.Context())
		assert.ErrorIs(t, err, tc.want, tc.code.String())
		_, err = c.FinishLogin(t.Context(), "f", "{}")
		assert.ErrorIs(t, err, tc.want, tc.code.String())
	}
}

func TestLoginKeepsServerFaults(t *testing.T) {
	for _, code := range []codes.Code{codes.Internal, codes.Unavailable, codes.DeadlineExceeded} {
		c := &Client{cc: failingPasskey{err: status.Error(code, "down")}}
		_, err := c.FinishLogin(t.Context(), "f", "{}")
		assert.Equal(t, status.Code(err), code)
	}
}

// passkey-service keeps the WebAuthn library's own text in an assertion
// failure's message (for its log); the gateway puts a 4xx message in the body,
// so a login refusal must carry the sentinel alone.
func TestLoginDoesNotLeakVerificationDetail(t *testing.T) {
	const detail = "passkey assertion invalid: Error validating origin: expected https://secret.example"
	for _, code := range []codes.Code{codes.Unauthenticated, codes.NotFound} {
		c := &Client{cc: failingPasskey{err: status.Error(code, detail)}}
		_, err := c.FinishLogin(t.Context(), "f", "{}")
		assert.ErrorIs(t, err, domain.ErrInvalidCredential, code.String())
		assert.Equal(t, err.Error(), domain.ErrInvalidCredential.Error(), code.String())
	}
}
