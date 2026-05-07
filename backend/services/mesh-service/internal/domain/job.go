// Package domain holds the mesh-service data model. Pure Go types — no proto,
// no Redis, no SQL — so the service layer can be tested without infrastructure.
package domain

import "time"

// JobStatus describes a conversion job's lifecycle state.
type JobStatus int

const (
	JobStatusUnspecified JobStatus = iota
	JobStatusPending
	JobStatusRunning
	JobStatusSucceeded
	JobStatusFailed
)

// String returns the lowercase canonical name for storage and logging.
func (s JobStatus) String() string {
	switch s {
	case JobStatusPending:
		return "pending"
	case JobStatusRunning:
		return "running"
	case JobStatusSucceeded:
		return "succeeded"
	case JobStatusFailed:
		return "failed"
	default:
		return "unspecified"
	}
}

// ParseJobStatus inverts String. Unknown values return JobStatusUnspecified.
func ParseJobStatus(s string) JobStatus {
	switch s {
	case "pending":
		return JobStatusPending
	case "running":
		return JobStatusRunning
	case "succeeded":
		return JobStatusSucceeded
	case "failed":
		return JobStatusFailed
	default:
		return JobStatusUnspecified
	}
}

// Job is a unit of conversion work flowing through the mesh pipeline. Kind
// + Slug together identify the catalog entity whose source bytes are being
// converted; the same Kind drives where the resulting artifact is registered.
type Job struct {
	ID           string
	Kind         Kind
	Slug         string
	Status       JobStatus
	ErrorMessage string
	ArtifactHash string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}
