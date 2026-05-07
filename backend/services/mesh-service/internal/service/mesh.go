// Package service is the mesh business layer. mesh-api exposes SubmitConversion
// and GetJob over gRPC; mesh-worker drives ProcessJob from the Redis stream.
// One method per file — this file holds the contracts and the constructor.
package service

import (
	"context"
	"io"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// Queue is the persistence + queue contract — both API and worker use it.
type Queue interface {
	SaveJob(ctx context.Context, j domain.Job) error
	GetJob(ctx context.Context, id string) (domain.Job, error)
	EnqueueJob(ctx context.Context, jobID string) error
}

// Catalog is the catalog client surface used by ProcessJob and the reconciler.
type Catalog interface {
	GetProject(ctx context.Context, slug string) (domain.Project, error)
	ListProjects(ctx context.Context) ([]domain.Project, error)
	GetArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error)
	RegisterArtifact(ctx context.Context, a domain.Artifact) error
}

// Converter turns a source mesh into one or more ConversionResults — one
// per LOD level, ordered LOD0 → LODN. Texture and material resolution is
// driven by the OBJ's mtllib + per-material map_Kd, so the converter only
// needs the OBJ path; assets are siblings on disk.
type Converter interface {
	ConvertLODs(ctx context.Context, sourcePath string) ([]domain.ConversionResult, error)
}

// BlobStore is what the worker writes converted artifacts to.
type BlobStore interface {
	Put(ctx context.Context, hash, contentType string, r io.Reader) (blobstore.Blob, error)
}

// Mesh is the mesh business layer.
type Mesh struct {
	queue     Queue
	catalog   Catalog
	converter Converter
	blobs     BlobStore
	// sourceRoot is the directory all project source paths are resolved against.
	// Worker code joins sourceRoot + project.SourceObjPath before passing to converter.
	sourceRoot string
	// idGen returns a fresh job ID; injectable for deterministic tests.
	idGen func() string
}

// Config wires Mesh's dependencies.
type Config struct {
	Queue      Queue
	Catalog    Catalog
	Converter  Converter
	Blobs      BlobStore
	SourceRoot string
	IDGen      func() string
}

// New constructs a Mesh service.
func New(cfg Config) *Mesh {
	return &Mesh{
		queue:      cfg.Queue,
		catalog:    cfg.Catalog,
		converter:  cfg.Converter,
		blobs:      cfg.Blobs,
		sourceRoot: cfg.SourceRoot,
		idGen:      cfg.IDGen,
	}
}
