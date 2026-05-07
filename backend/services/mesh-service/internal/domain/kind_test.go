package domain_test

import (
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

type KindSuite struct {
	suite.Suite
}

func TestKindSuite(t *testing.T) {
	suite.Run(t, new(KindSuite))
}

func (s *KindSuite) TestStringIsLowercase() {
	assert.Equal(s.T(), domain.KindTerritory.String(), "territory")
	assert.Equal(s.T(), domain.KindModel.String(), "model")
	assert.Equal(s.T(), domain.KindUnspecified.String(), "unspecified")
}

func (s *KindSuite) TestParseKindKnownValues() {
	assert.Equal(s.T(), domain.ParseKind("territory"), domain.KindTerritory)
	assert.Equal(s.T(), domain.ParseKind("model"), domain.KindModel)
}

func (s *KindSuite) TestParseKindUnknownReturnsUnspecified() {
	assert.Equal(s.T(), domain.ParseKind(""), domain.KindUnspecified)
	assert.Equal(s.T(), domain.ParseKind("garbage"), domain.KindUnspecified)
	assert.Equal(s.T(), domain.ParseKind("Territory"), domain.KindUnspecified)
}

func (s *KindSuite) TestParseKindRoundtrip() {
	for _, k := range []domain.Kind{domain.KindTerritory, domain.KindModel} {
		assert.Equal(s.T(), domain.ParseKind(k.String()), k)
	}
}

type JobStatusSuite struct {
	suite.Suite
}

func TestJobStatusSuite(t *testing.T) {
	suite.Run(t, new(JobStatusSuite))
}

func (s *JobStatusSuite) TestStringIsLowercase() {
	assert.Equal(s.T(), domain.JobStatusPending.String(), "pending")
	assert.Equal(s.T(), domain.JobStatusRunning.String(), "running")
	assert.Equal(s.T(), domain.JobStatusSucceeded.String(), "succeeded")
	assert.Equal(s.T(), domain.JobStatusFailed.String(), "failed")
}

func (s *JobStatusSuite) TestParseRoundtrip() {
	for _, st := range []domain.JobStatus{
		domain.JobStatusPending,
		domain.JobStatusRunning,
		domain.JobStatusSucceeded,
		domain.JobStatusFailed,
	} {
		assert.Equal(s.T(), domain.ParseJobStatus(st.String()), st)
	}
}

func (s *JobStatusSuite) TestParseUnknownReturnsUnspecified() {
	assert.Equal(s.T(), domain.ParseJobStatus(""), domain.JobStatusUnspecified)
	assert.Equal(s.T(), domain.ParseJobStatus("Pending"), domain.JobStatusUnspecified)
}
