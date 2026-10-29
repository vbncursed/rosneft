package twofa

import (
	"context"
	"testing"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	twofav1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/twofa/v1"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

type failingTwoFA struct {
	twofav1.TwoFAServiceClient
	err error
}

func (f failingTwoFA) Verify(
	context.Context,
	*twofav1.VerifyRequest,
	...grpc.CallOption,
) (*twofav1.VerifyResponse, error) {
	return nil, f.err
}

// A locked-out account is a refusal (403), not a server fault.
func TestVerifyTranslatesLockout(t *testing.T) {
	c := &Client{cc: failingTwoFA{err: status.Error(codes.ResourceExhausted, "locked")}}
	_, err := c.Verify(t.Context(), "u", "123456")
	assert.ErrorIs(t, err, domain.ErrLoginThrottled)
}

func TestVerifyKeepsServerFaults(t *testing.T) {
	c := &Client{cc: failingTwoFA{err: status.Error(codes.Unavailable, "down")}}
	_, err := c.Verify(t.Context(), "u", "123456")
	assert.Equal(t, status.Code(err), codes.Unavailable)
}
