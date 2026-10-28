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

// The four management RPCs, driven with a given user id so one table covers
// "acts on user_id" and "rejects an empty one" for all of them. BeginRegistration
// is exercised in registration_test.go as well (it also needs display_name).
var managementRPCs = []struct {
	name string
	call func(*grpcapi.Server, string) error
}{
	{"BeginRegistration", func(s *grpcapi.Server, uid string) error {
		_, err := s.BeginRegistration(
			context.Background(),
			&passkeyv1.BeginRegistrationRequest{UserId: uid, DisplayName: "alice"},
		)
		return err
	}},
	{"FinishRegistration", func(s *grpcapi.Server, uid string) error {
		_, err := s.FinishRegistration(context.Background(), &passkeyv1.FinishRegistrationRequest{
			UserId: uid, FlowId: "f", CredentialJson: "{}", Name: "key",
		})
		return err
	}},
	{"ListCredentials", func(s *grpcapi.Server, uid string) error {
		_, err := s.ListCredentials(context.Background(), &passkeyv1.ListCredentialsRequest{UserId: uid})
		return err
	}},
	{"DeleteCredential", func(s *grpcapi.Server, uid string) error {
		_, err := s.DeleteCredential(
			context.Background(),
			&passkeyv1.DeleteCredentialRequest{UserId: uid, CredentialId: "cid"},
		)
		return err
	}},
}

func TestManagementRPCsActOnTheRequestUserID(t *testing.T) {
	for _, tc := range managementRPCs {
		t.Run(tc.name, func(t *testing.T) {
			svc := &fakeService{}
			assert.NilError(t, tc.call(grpcapi.New(svc), "u-42"))
			assert.Equal(t, svc.calls, 1)
			assert.Equal(t, svc.userID, "u-42")
		})
	}
}

func TestManagementRPCsRejectAnEmptyUserIDWithoutTouchingTheService(t *testing.T) {
	for _, tc := range managementRPCs {
		t.Run(tc.name, func(t *testing.T) {
			svc := &fakeService{}
			err := tc.call(grpcapi.New(svc), "")
			assert.Equal(t, status.Code(err), codes.InvalidArgument)
			assert.Equal(t, status.Convert(err).Message(), "invalid input: user_id is required")
			assert.Equal(t, svc.calls, 0, "nothing may be read or written for an unidentified caller")
		})
	}
}

func TestDeleteCredentialPassesTheCredentialID(t *testing.T) {
	svc := &fakeService{}
	assert.NilError(t, managementRPCs[3].call(grpcapi.New(svc), "u-1"))
	assert.Equal(t, svc.cid, "cid")
}
