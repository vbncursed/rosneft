// Package domain holds the gateway service's data model. Pure Go types —
// no proto, no openapi-generated DTOs — and the only place models live
// (alongside pb).
package domain

import "time"

// JobStatus mirrors the mesh-service job lifecycle. Stored as a string in
// Redis and surfaced to the frontend as enum values.
type JobStatus string

const (
	JobStatusPending   JobStatus = "pending"
	JobStatusRunning   JobStatus = "running"
	JobStatusSucceeded JobStatus = "succeeded"
	JobStatusFailed    JobStatus = "failed"
)

// Vec3 is a 3D point used for bounding-box corners.
type Vec3 struct {
	X, Y, Z float64
}

// Project is the gateway view of a catalog project.
type Project struct {
	Slug              string
	Title             string
	Subtitle          string
	Description       string
	SourceObjPath     string
	SourceMtlPath     string
	SourceTexturePath string
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// LodArtifact is the minimal descriptor for one LOD level. Used inside
// Artifact.LODs and AssetOption.LODs so a single response carries the full
// chain — frontend can pick any LOD without another request.
type LodArtifact struct {
	LOD      uint32
	Hash     string
	Size     int64
	Vertices uint64
	Faces    uint64
}

// Artifact is the gateway view of a converted artifact. Top-level fields
// (bbox, contentType, createdAt) reflect LOD0 — they are LOD-invariant for
// our pipeline. LODs is the optional full chain, populated by SceneBundle
// and left nil on standalone list/get endpoints to avoid redundancy.
type Artifact struct {
	ProjectSlug string
	LOD         uint32
	Hash        string
	ContentType string
	Size        int64
	Vertices    uint64
	Faces       uint64
	BBoxMin     Vec3
	BBoxMax     Vec3
	CreatedAt   time.Time
	LODs        []LodArtifact
}

// Job is the gateway view of a conversion job.
type Job struct {
	ID           string
	ProjectSlug  string
	Status       JobStatus
	ErrorMessage string
	ArtifactHash string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// ProjectPage is one page of catalog projects. NextCursor is empty when
// there are no more pages. Items are sorted by slug.
type ProjectPage struct {
	Items      []Project
	NextCursor string
}

// AssetOption is one entry in the placement-picker dropdown — it is a project
// the user can drop into another scene. LODs carries every available level
// for this asset; empty when the project has no successful conversion yet
// (frontend can grey it out).
type AssetOption struct {
	Slug  string
	Title string
	LODs  []LodArtifact
}

// SceneBundle is the single-shot payload for the viewer page. Artifact is a
// pointer because a freshly created project may not yet have a LOD0 artifact;
// the frontend renders a "conversion pending" placeholder in that case.
type SceneBundle struct {
	Project      Project
	Artifact     *Artifact
	Placements   []Placement
	AssetOptions []AssetOption
}

// Placement is the gateway view of a positioned asset on a parent project.
// Position is in scene units; Rotation is Euler XYZ in radians; Scale is
// per-axis to allow non-uniform stretching.
type Placement struct {
	ID         int64
	ParentSlug string
	AssetSlug  string
	Position   Vec3
	Rotation   Vec3
	Scale      Vec3
	Label      string
	CreatedAt  time.Time
	UpdatedAt  time.Time
}
