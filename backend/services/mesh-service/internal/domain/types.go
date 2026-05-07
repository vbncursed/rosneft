package domain

// Vec3 is a 3D point used for bounding-box corners.
type Vec3 struct {
	X, Y, Z float64
}

// Project is the mesh-service view of a catalog project — only the fields the
// converter needs to locate the source mesh on disk. Mapped from catalog pb
// at the catalog client boundary.
type Project struct {
	Slug              string
	Title             string
	Subtitle          string
	Description       string
	SourceObjPath     string
	SourceMtlPath     string
	SourceTexturePath string
}

// Artifact is what mesh-worker registers in the catalog after a successful
// conversion. Mirrors the catalog's notion of an artifact but lives in the
// mesh bounded context.
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
}

// ConversionResult is what the converter returns to the worker. The worker
// uses Content + ContentType to write the artifact to BlobStore, and the
// rest to populate the catalog Artifact.
type ConversionResult struct {
	ArtifactHash string
	Content      []byte
	ContentType  string
	Size         int64
	Vertices     uint64
	Faces        uint64
	BBoxMin      Vec3
	BBoxMax      Vec3
}
