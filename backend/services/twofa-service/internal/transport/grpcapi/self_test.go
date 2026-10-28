package grpcapi_test

import (
	"context"
	"testing"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	twofav1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/twofa/v1"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/transport/grpcapi"
)

// fakeService records the last call so a test can assert both what reached the
// business layer and that nothing did.
type fakeService struct {
	calls               int
	userID, label, code string
}

func (f *fakeService) rec(userID, code string) { f.calls++; f.userID, f.code = userID, code }

func (f *fakeService) Setup(_ context.Context, userID, label string) (string, string, error) {
	f.rec(userID, "")
	f.label = label
	return "SECRET", "otpauth://x", nil
}

func (f *fakeService) Enable(_ context.Context, userID, code string) ([]string, error) {
	f.rec(userID, code)
	return []string{"r1"}, nil
}

func (f *fakeService) Disable(_ context.Context, userID, code string) error {
	f.rec(userID, code)
	return nil
}

func (f *fakeService) Regenerate(_ context.Context, userID, code string) ([]string, error) {
	f.rec(userID, code)
	return []string{"r2"}, nil
}

func (f *fakeService) Status(_ context.Context, userID string) (domain.Status, error) {
	f.rec(userID, "")
	return domain.Status{Enabled: true, EnabledAt: time.Unix(100, 0), RecoveryRemaining: 3, RecoveryTotal: 8}, nil
}

func (f *fakeService) IsEnabled(context.Context, string) (bool, error)        { return false, nil }
func (f *fakeService) EnabledFor(context.Context, []string) ([]string, error) { return nil, nil }
func (f *fakeService) Verify(context.Context, string, string) (bool, error)   { return false, nil }

// selfRPCs drives the five self-service RPCs with a given user id, so one table
// covers "works from user_id" and "rejects an empty one" for all of them.
var selfRPCs = []struct {
	name string
	call func(*grpcapi.Server, string) error
}{
	{"Setup", func(s *grpcapi.Server, uid string) error {
		_, err := s.Setup(context.Background(), &twofav1.SetupRequest{UserId: uid, Label: "alice"})
		return err
	}},
	{"Enable", func(s *grpcapi.Server, uid string) error {
		_, err := s.Enable(context.Background(), &twofav1.EnableRequest{UserId: uid, Code: "123456"})
		return err
	}},
	{"Disable", func(s *grpcapi.Server, uid string) error {
		_, err := s.Disable(context.Background(), &twofav1.DisableRequest{UserId: uid, Code: "123456"})
		return err
	}},
	{"RegenerateRecoveryCodes", func(s *grpcapi.Server, uid string) error {
		_, err := s.RegenerateRecoveryCodes(
			context.Background(),
			&twofav1.RegenerateRequest{UserId: uid, Code: "123456"},
		)
		return err
	}},
	{"Status", func(s *grpcapi.Server, uid string) error {
		_, err := s.Status(context.Background(), &twofav1.StatusRequest{UserId: uid})
		return err
	}},
}

func TestSelfRPCsActOnTheRequestUserID(t *testing.T) {
	for _, tc := range selfRPCs {
		t.Run(tc.name, func(t *testing.T) {
			svc := &fakeService{}
			assert.NilError(t, tc.call(grpcapi.New(svc), "u-42"))
			assert.Equal(t, svc.calls, 1)
			assert.Equal(t, svc.userID, "u-42")
		})
	}
}

func TestSetupUsesTheRequestLabelAsAccountName(t *testing.T) {
	svc := &fakeService{}
	assert.NilError(t, selfRPCs[0].call(grpcapi.New(svc), "u-1"))
	assert.Equal(t, svc.label, "alice")
}

func TestSelfRPCsRejectAnEmptyUserIDWithoutTouchingTheService(t *testing.T) {
	for _, tc := range selfRPCs {
		t.Run(tc.name, func(t *testing.T) {
			svc := &fakeService{}
			err := tc.call(grpcapi.New(svc), "")
			assert.Equal(t, status.Code(err), codes.InvalidArgument)
			assert.Equal(t, status.Convert(err).Message(), "invalid input: user_id is required")
			assert.Equal(t, svc.calls, 0, "nothing may be read or written for an unidentified caller")
		})
	}
}

func TestSetupRejectsAnEmptyLabelWithoutTouchingTheService(t *testing.T) {
	svc := &fakeService{}
	_, err := grpcapi.New(svc).Setup(context.Background(), &twofav1.SetupRequest{UserId: "u-1"})
	assert.Equal(t, status.Code(err), codes.InvalidArgument)
	assert.Equal(t, status.Convert(err).Message(), "invalid input: label is required")
	assert.Equal(t, svc.calls, 0)
}
