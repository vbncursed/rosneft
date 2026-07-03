// Package domain holds the gateway service's data model. Pure Go types —
// no proto, no openapi-generated DTOs — and the only place models live
// (alongside pb).
package domain

import "time"

// JobStatus mirrors the mesh-service job lifecycle.
type JobStatus string

const (
	JobStatusPending   JobStatus = "pending"
	JobStatusRunning   JobStatus = "running"
	JobStatusSucceeded JobStatus = "succeeded"
	JobStatusFailed    JobStatus = "failed"
)

// Kind is which catalog domain a Job's artifacts belong to.
type Kind string

const (
	KindTerritory Kind = "territory"
	KindModel     Kind = "model"
)

// Vec3 is a 3D point used for bounding-box corners and placement transforms.
type Vec3 struct {
	X, Y, Z float64
}

// Territory is the gateway view of a catalog territory.
type Territory struct {
	Slug                string
	Title               string
	Description         string
	ExternalPanoramaURL string
	SourceBlobHash      string
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

// TerritoryUpdate carries the mutable fields of PATCH /api/territories/{slug}.
// Each field is a pointer: nil means "leave unchanged", so a caller can clear
// a value (empty string) distinctly from not touching it.
type TerritoryUpdate struct {
	ExternalPanoramaURL *string
}

// ModelUpdate carries the mutable model fields a PATCH may set. Nil = leave
// unchanged (read-modify-write over UpsertModel, mirroring TerritoryUpdate).
type ModelUpdate struct {
	ThumbnailBlobHash *string
}

// Model is the gateway view of a catalog model.
type Model struct {
	Slug              string
	Title             string
	Description       string
	SourceBlobHash    string
	ThumbnailBlobHash string
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// LodArtifact is the minimal descriptor for one LOD level.
type LodArtifact struct {
	LOD      uint32
	Hash     string
	Size     int64
	Vertices uint64
	Faces    uint64
}

// Artifact is the gateway view of a converted artifact. Top-level fields
// (bbox, contentType, createdAt) reflect LOD0 — they are LOD-invariant for
// our pipeline. LODs is the optional full chain.
type Artifact struct {
	Slug        string
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

// Job is the gateway view of a conversion job. Progress (0..1) + Stage
// are coarse worker checkpoints, surfaced through SSE so the frontend can
// render a determinate progress bar.
type Job struct {
	ID           string
	Kind         Kind
	Slug         string
	Status       JobStatus
	ErrorMessage string
	ArtifactHash string
	Progress     float32
	Stage        string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// AssetOption is one entry in the placement-picker dropdown — a model the
// user can drop onto a territory. LODs carries every available level;
// empty when the model has no successful conversion yet. BBoxMin/Max
// hold the source mesh's pre-normalize bounds so the client can size a
// freshly-placed model against the territory's real-world dimensions.
type AssetOption struct {
	Slug              string
	Title             string
	ThumbnailBlobHash string
	BBoxMin           *Vec3
	BBoxMax           *Vec3
	LODs              []LodArtifact
}

// SceneBundle is the single-shot payload for the viewer page. Artifact is
// nil if the territory has no LOD0 yet (conversion pending). Panoramas is
// the list of equirect captures anchored to this territory; the viewer
// shows them as toggleable alternate camera modes that reuse the same
// placement set.
type SceneBundle struct {
	Territory    Territory
	Artifact     *Artifact
	Placements   []Placement
	ModelOptions []AssetOption
	Panoramas    []Panorama
	Documents    []Document
}

// Placement is the gateway view of a positioned model on a territory.
type Placement struct {
	ID            int64
	TerritorySlug string
	ModelSlug     string
	Position      Vec3
	Rotation      Vec3
	Scale         Vec3
	Label         string
	CreatedAt     time.Time
	UpdatedAt     time.Time
	// VisiblePanoramaIDs is the allowlist of panoramas this placement shows
	// in (panorama mode only; the 3D view always shows every placement).
	VisiblePanoramaIDs []int64
}

// UploadSession mirrors the upload-service session for the frontend.
type UploadSession struct {
	ID          string
	Size        int64
	Offset      int64
	ContentType string
}

// FinalizedBlob is what /api/uploads/{id}/finalize returns.
type FinalizedBlob struct {
	Hash string
	Size int64
}
