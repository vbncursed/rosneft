package domain

// Vec3 is a 3D point used for bounding-box corners.
type Vec3 struct {
	X, Y, Z float64
}

// Kind discriminates whether a job's outputs belong on a Territory or a
// Model in the catalog. The conversion pipeline is identical for both;
// only the destination artifact table differs.
type Kind int

const (
	KindUnspecified Kind = iota
	KindTerritory
	KindModel
)

// String returns the lowercase canonical name for storage and logging.
func (k Kind) String() string {
	switch k {
	case KindTerritory:
		return "territory"
	case KindModel:
		return "model"
	default:
		return "unspecified"
	}
}

// ParseKind inverts String. Unknown values return KindUnspecified.
func ParseKind(s string) Kind {
	switch s {
	case "territory":
		return KindTerritory
	case "model":
		return KindModel
	default:
		return KindUnspecified
	}
}

// ConversionTarget is the mesh-service view of a territory or a model — the
// fields the worker needs to fetch source bytes and submit the result back
// to the catalog. Mapped from catalog pb at the catalog client boundary.
type ConversionTarget struct {
	Kind           Kind
	Slug           string
	Title          string
	Description    string
	SourceBlobHash string
}

// Artifact is what mesh-worker registers in the catalog after a successful
// conversion. Mirrors the catalog's notion of an artifact but lives in the
// mesh bounded context.
type Artifact struct {
	Kind        Kind
	Slug        string
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
