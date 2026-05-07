package grpcapi

import (
	"google.golang.org/protobuf/types/known/timestamppb"

	meshv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/mesh/v1"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

func jobToProto(j domain.Job) *meshv1.Job {
	return &meshv1.Job{
		Id:           j.ID,
		ProjectSlug:  j.ProjectSlug,
		Status:       statusToProto(j.Status),
		ErrorMessage: j.ErrorMessage,
		ArtifactHash: j.ArtifactHash,
		CreatedAt:    timestamppb.New(j.CreatedAt),
		UpdatedAt:    timestamppb.New(j.UpdatedAt),
	}
}

func statusToProto(s domain.JobStatus) meshv1.JobStatus {
	switch s {
	case domain.JobStatusPending:
		return meshv1.JobStatus_JOB_STATUS_PENDING
	case domain.JobStatusRunning:
		return meshv1.JobStatus_JOB_STATUS_RUNNING
	case domain.JobStatusSucceeded:
		return meshv1.JobStatus_JOB_STATUS_SUCCEEDED
	case domain.JobStatusFailed:
		return meshv1.JobStatus_JOB_STATUS_FAILED
	default:
		return meshv1.JobStatus_JOB_STATUS_UNSPECIFIED
	}
}
