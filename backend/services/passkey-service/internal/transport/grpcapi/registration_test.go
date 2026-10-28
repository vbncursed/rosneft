package grpcapi_test

import (
	"context"
	"testing"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	passkeyv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/passkey/v1"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/transport/grpcapi"
)

func TestBeginRegistrationUsesTheRequestDisplayName(t *testing.T) {
	svc := &fakeService{}
	_, err := grpcapi.New(svc).BeginRegistration(
		context.Background(),
		&passkeyv1.BeginRegistrationRequest{UserId: "u-1", DisplayName: "alice"},
	)
	assert.NilError(t, err)
	assert.Equal(t, svc.displayName, "alice")
}

func TestBeginRegistrationRejectsAnEmptyDisplayNameWithoutTouchingTheService(t *testing.T) {
	svc := &fakeService{}
	_, err := grpcapi.New(svc).BeginRegistration(
		context.Background(),
		&passkeyv1.BeginRegistrationRequest{UserId: "u-1"},
	)
	assert.Equal(t, status.Code(err), codes.InvalidArgument)
	assert.Equal(t, status.Convert(err).Message(), "invalid input: display_name is required")
	assert.Equal(t, svc.calls, 0)
}

func TestFinishRegistrationPassesFlowAndName(t *testing.T) {
	svc := &fakeService{}
	_, err := grpcapi.New(svc).FinishRegistration(context.Background(), &passkeyv1.FinishRegistrationRequest{
		UserId: "u-1", FlowId: "flow-9", CredentialJson: "{}", Name: "MacBook",
	})
	assert.NilError(t, err)
	assert.Equal(t, svc.flowID, "flow-9")
	assert.Equal(t, svc.name, "MacBook")
}
