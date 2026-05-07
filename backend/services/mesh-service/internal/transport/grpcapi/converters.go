package grpcapi

import (
	"google.golang.org/protobuf/types/known/timestamppb"

	meshv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/mesh/v1"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

func jobToProto(j domain.Job) *meshv1.Job {
	return &meshv1.Job{
		Id:           j.ID,
		Kind:         kindToProto(j.Kind),
		Slug:         j.Slug,
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

func kindToProto(k domain.Kind) meshv1.Kind {
	switch k {
	case domain.KindTerritory:
		return meshv1.Kind_KIND_TERRITORY
	case domain.KindModel:
		return meshv1.Kind_KIND_MODEL
	default:
		return meshv1.Kind_KIND_UNSPECIFIED
	}
}

func kindFromProto(k meshv1.Kind) domain.Kind {
	switch k {
	case meshv1.Kind_KIND_TERRITORY:
		return domain.KindTerritory
	case meshv1.Kind_KIND_MODEL:
		return domain.KindModel
	default:
		return domain.KindUnspecified
	}
}
