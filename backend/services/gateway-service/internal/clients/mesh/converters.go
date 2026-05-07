package mesh

import (
	meshv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/mesh/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func jobFromProto(j *meshv1.Job) domain.Job {
	if j == nil {
		return domain.Job{}
	}
	return domain.Job{
		ID:           j.GetId(),
		ProjectSlug:  j.GetProjectSlug(),
		Status:       statusFromProto(j.GetStatus()),
		ErrorMessage: j.GetErrorMessage(),
		ArtifactHash: j.GetArtifactHash(),
		CreatedAt:    j.GetCreatedAt().AsTime(),
		UpdatedAt:    j.GetUpdatedAt().AsTime(),
	}
}

func statusFromProto(s meshv1.JobStatus) domain.JobStatus {
	switch s {
	case meshv1.JobStatus_JOB_STATUS_PENDING:
		return domain.JobStatusPending
	case meshv1.JobStatus_JOB_STATUS_RUNNING:
		return domain.JobStatusRunning
	case meshv1.JobStatus_JOB_STATUS_SUCCEEDED:
		return domain.JobStatusSucceeded
	case meshv1.JobStatus_JOB_STATUS_FAILED:
		return domain.JobStatusFailed
	default:
		return ""
	}
}
