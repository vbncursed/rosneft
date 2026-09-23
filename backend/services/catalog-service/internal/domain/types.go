// Package domain contains the catalog service's data model. Pure Go types —
// no proto, no SQL, no YAML — and the only place models live (alongside pb).
package domain

import "time"

// Territory is a parent scene the viewer renders as the canvas. Models are
// placed onto it via Placement records.
type Territory struct {
	Slug                string    `yaml:"slug"`
	Title               string    `yaml:"title"`
	Description         string    `yaml:"description"`
	ExternalPanoramaURL string    `yaml:"external_panorama_url"`
	SourceBlobHash      string    `yaml:"source_blob_hash"`
	CreatedAt           time.Time `yaml:"-"`
	UpdatedAt           time.Time `yaml:"-"`
	// PlacementCount is how many placements sit on this territory. Filled by
	// both ListTerritories and GetTerritory.
	PlacementCount int `yaml:"-"`
	// Artifacts is the LOD chain, sorted by lod. Filled by ListTerritories only:
	// the list pages need it and would otherwise ask once per row.
	Artifacts []Artifact `yaml:"-"`
}

// Model is a placeable 3D asset overlaid on a territory.
type Model struct {
	Slug              string    `yaml:"slug"`
	Title             string    `yaml:"title"`
	Description       string    `yaml:"description"`
	SourceBlobHash    string    `yaml:"source_blob_hash"`
	ThumbnailBlobHash string    `yaml:"thumbnail_blob_hash"`
	CreatedAt         time.Time `yaml:"-"`
	UpdatedAt         time.Time `yaml:"-"`
	// UsageCount is how many distinct territories place this model. Filled by
	// both ListModels and GetModel.
	UsageCount int `yaml:"-"`
	// Artifacts is the LOD chain, sorted by lod. Filled by ListModels only:
	// the list pages need it and would otherwise ask once per row.
	Artifacts []Artifact `yaml:"-"`
}

// TerritoryPatch names the territory columns a partial edit writes. Nil keeps
// the stored value; a pointer to "" clears it. Writing only these columns is
// what keeps one edit from reverting another made since it read the row.
type TerritoryPatch struct {
	Title               *string
	Description         *string
	ExternalPanoramaURL *string
	SourceBlobHash      *string
}

// ModelPatch names the model columns a partial edit writes — see TerritoryPatch.
type ModelPatch struct {
	Title             *string
	Description       *string
	ThumbnailBlobHash *string
}

// Vec3 is a 3D point used for bounding-box corners and placement transforms.
type Vec3 struct {
	X, Y, Z float64
}

// Artifact is a converted GLB output for a specific entity at a specific LOD.
// Slug refers to whichever entity owns the artifact — territory_slug for
// territory_artifacts, model_slug for model_artifacts.
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
}
