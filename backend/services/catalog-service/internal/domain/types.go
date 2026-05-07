// Package domain contains the catalog service's data model. Pure Go types —
// no proto, no SQL, no YAML — and the only place models live (alongside pb).
package domain

import "time"

// Project is a 3D model project surfaced to the frontend catalog.
type Project struct {
	Slug              string    `yaml:"slug"`
	Title             string    `yaml:"title"`
	Subtitle          string    `yaml:"subtitle"`
	Description       string    `yaml:"description"`
	SourceObjPath     string    `yaml:"source_obj_path"`
	SourceMtlPath     string    `yaml:"source_mtl_path"`
	SourceTexturePath string    `yaml:"source_texture_path"`
	CreatedAt         time.Time `yaml:"-"`
	UpdatedAt         time.Time `yaml:"-"`
}

// Vec3 is a 3D point used for bounding-box corners.
type Vec3 struct {
	X, Y, Z float64
}

// Artifact is a converted binary asset (GLB) at a specific LOD.
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
}
