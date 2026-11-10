package grpcapi

import (
	"errors"
	"fmt"
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
)

type MapErrSuite struct{ suite.Suite }

func TestMapErrSuite(t *testing.T) { suite.Run(t, new(MapErrSuite)) }

func (s *MapErrSuite) TestMapping() {
	cases := []struct {
		name string
		err  error
		code codes.Code
	}{
		{"nil", nil, codes.OK},
		{"invalid input", domain.ErrInvalidInput, codes.InvalidArgument},
		{"not found", domain.ErrNotFound, codes.NotFound},
		{"expired ceremony", domain.ErrCeremonyExpired, codes.FailedPrecondition},
		{"invalid assertion", domain.ErrAssertionInvalid, codes.Unauthenticated},
		{"no credentials", domain.ErrNoCredentials, codes.Unauthenticated},
		{"wrapped", fmt.Errorf("context: %w", domain.ErrCeremonyExpired), codes.FailedPrecondition},
		{"unknown", errors.New("unexpected failure"), codes.Internal},
		{
			"joined priority",
			errors.Join(domain.ErrNoCredentials, domain.ErrNotFound, domain.ErrInvalidInput),
			codes.InvalidArgument,
		},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			got := mapErr(tc.err)
			assert.Equal(s.T(), status.Code(got), tc.code)
			if tc.err == nil {
				assert.NilError(s.T(), got)
				return
			}
			assert.Equal(s.T(), status.Convert(got).Message(), tc.err.Error())
		})
	}
}
