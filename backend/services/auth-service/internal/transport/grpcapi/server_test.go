package grpcapi

import (
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
