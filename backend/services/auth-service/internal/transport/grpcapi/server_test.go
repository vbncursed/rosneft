package grpcapi

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

type MapErrorSuite struct{ suite.Suite }

func TestMapErrorSuite(t *testing.T) { suite.Run(t, new(MapErrorSuite)) }

// A taken login answers AlreadyExists with the one neutral message: the
// gateway forwards it verbatim as the 409 body.
func (s *MapErrorSuite) TestLoginTakenIsAlreadyExistsWithTheNeutralMessage() {
	st := status.Convert(mapError(domain.ErrLoginTaken))
	assert.Equal(s.T(), st.Code(), codes.AlreadyExists)
	assert.Equal(s.T(), st.Message(), "email or username is unavailable")
}

// A refusal reaches the gateway, and so the browser's 400, in the sentinel's
// words — never "auth.Login: invalid input: …".
func (s *MapErrorSuite) TestARefusalStartsAtItsSentinel() {
	st := status.Convert(mapError(fmt.Errorf("auth.Login: %w",
		fmt.Errorf("%w: identifier and password required", domain.ErrInvalidInput))))
	assert.Equal(s.T(), st.Code(), codes.InvalidArgument)
	assert.Equal(s.T(), st.Message(), "invalid input: identifier and password required")
}
