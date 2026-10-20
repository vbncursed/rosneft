package httpapi

import (
	"errors"
	"net/url"
)

// exportVariant is which encoding export.glb serves: the stored compressed
// LOD0s, or the plain GLBs made beside them.
type exportVariant int

const (
	variantCompressed exportVariant = iota
	variantCompatible
)

// parseExportVariant reads ?variant=: absent is compressed, exactly one
// "compatible" is compatible, anything else (empty, other case, repeated) is
// refused rather than silently served as the compressed file.
func parseExportVariant(q url.Values) (exportVariant, error) {
	switch v := q["variant"]; {
	case len(v) == 0:
		return variantCompressed, nil
	case len(v) == 1 && v[0] == "compatible":
		return variantCompatible, nil
	}
	return variantCompressed, errors.New(`variant must be "compatible" or absent`)
}

func (v exportVariant) filename(slug string) string {
	if v == variantCompatible {
		return slug + "-compatible.glb"
	}
	return slug + ".glb"
}

// pick chooses the blob hash this variant serves.
func (v exportVariant) pick(compressed, plain string) string {
	if v == variantCompatible {
		return plain
	}
	return compressed
}
