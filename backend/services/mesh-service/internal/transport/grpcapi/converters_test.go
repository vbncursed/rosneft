package grpcapi

import (
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// The stored job keeps the worker's full cause for operators; what leaves the
// service is a fixed phrase, never paths, library text or hostnames.
func TestJobToProtoErrorMessageIsClassified(t *testing.T) {
	const leak = "fetch/extract source: open /data/blobs/ab/abcd.bin: permission denied on host mesh-7"
	tests := []struct {
		name string
		job  domain.Job
		want string
	}{
		{
			"bad source",
			domain.Job{Status: domain.JobStatusFailed, ErrorMessage: leak, FailedOnSource: true},
			"source archive is invalid",
		},
		{"other failure", domain.Job{Status: domain.JobStatusFailed, ErrorMessage: leak}, "conversion failed"},
		{"failed without a stored cause", domain.Job{Status: domain.JobStatusFailed}, "conversion failed"},
		{"running job has no error", domain.Job{Status: domain.JobStatusRunning}, ""},
		{"succeeded job has no error", domain.Job{Status: domain.JobStatusSucceeded}, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, jobToProto(tt.job).GetErrorMessage(), tt.want)
		})
	}
}
