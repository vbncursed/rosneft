package mesh

import (
	"testing"

	"github.com/stretchr/testify/suite"

	meshv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/mesh/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"gotest.tools/v3/assert"
)

type ConvertersSuite struct {
	suite.Suite
}

func TestConvertersSuite(t *testing.T) { suite.Run(t, new(ConvertersSuite)) }

func (s *ConvertersSuite) TestStatusFromProto() {
	for _, tc := range []struct {
		name  string
		input meshv1.JobStatus
		want  domain.JobStatus
	}{
		{"pending", meshv1.JobStatus_JOB_STATUS_PENDING, domain.JobStatusPending},
		{"running", meshv1.JobStatus_JOB_STATUS_RUNNING, domain.JobStatusRunning},
		{"succeeded", meshv1.JobStatus_JOB_STATUS_SUCCEEDED, domain.JobStatusSucceeded},
		{"failed", meshv1.JobStatus_JOB_STATUS_FAILED, domain.JobStatusFailed},
		{"unspecified", meshv1.JobStatus_JOB_STATUS_UNSPECIFIED, domain.JobStatusPending},
		{"unknown", meshv1.JobStatus(999), domain.JobStatusPending},
	} {
		s.Run(tc.name, func() { assert.Equal(s.T(), statusFromProto(tc.input), tc.want) })
	}
}

func (s *ConvertersSuite) TestKindFromProto() {
	for _, tc := range []struct {
		name  string
		input meshv1.Kind
		want  domain.Kind
	}{
		{"territory", meshv1.Kind_KIND_TERRITORY, domain.KindTerritory},
		{"model", meshv1.Kind_KIND_MODEL, domain.KindModel},
		{"unspecified", meshv1.Kind_KIND_UNSPECIFIED, domain.KindTerritory},
		{"unknown", meshv1.Kind(999), domain.KindTerritory},
	} {
		s.Run(tc.name, func() { assert.Equal(s.T(), kindFromProto(tc.input), tc.want) })
	}
}

func (s *ConvertersSuite) TestKindToProto() {
	for _, tc := range []struct {
		name  string
		input domain.Kind
		want  meshv1.Kind
	}{
		{"territory", domain.KindTerritory, meshv1.Kind_KIND_TERRITORY},
		{"model", domain.KindModel, meshv1.Kind_KIND_MODEL},
		{"unknown", domain.Kind("unknown"), meshv1.Kind_KIND_UNSPECIFIED},
	} {
		s.Run(tc.name, func() { assert.Equal(s.T(), kindToProto(tc.input), tc.want) })
	}
}
