package httpapi

import (
	"errors"
	"net/url"
)

// exportVariant is which file an export produces: the stored compressed LOD0s
// or the plain GLBs made beside them (both served by export.glb), or the baked
// OBJ ZIP (export.obj.zip, which reads the plain copies too).
type exportVariant int

const (
	variantCompressed exportVariant = iota
	variantCompatible
	variantOBJ
)

var errBadVariant = errors.New(`variant must be "compatible" or absent`)

// parseExportVariant reads export.glb's ?variant=: absent is compressed,
// exactly one "compatible" is compatible, anything else (empty, other case,
// repeated) is refused rather than silently served as the compressed file. It
// parses the raw query itself because url.Values drops a pair it cannot decode
// (`%zz`, `;`), which would read as "absent".
func parseExportVariant(rawQuery string) (exportVariant, error) {
	q, err := url.ParseQuery(rawQuery)
	switch v := q["variant"]; {
	case err != nil:
		return variantCompressed, errBadVariant
	case len(v) == 0:
		return variantCompressed, nil
	case len(v) == 1 && v[0] == "compatible":
		return variantCompatible, nil
	}
	return variantCompressed, errBadVariant
}

// checkVariant maps export-check's ?variant= onto the variant it announces;
// false for a value outside the enum.
func checkVariant(p ExportTerritoryCheckParamsVariant) (exportVariant, bool) {
	switch p {
	case Compressed:
		return variantCompressed, true
	case Compatible:
		return variantCompatible, true
	case Obj:
		return variantOBJ, true
	}
	return variantCompressed, false
}

// filename is what Content-Disposition names the download.
func (v exportVariant) filename(slug string) string {
	switch v {
	case variantCompatible:
		return slug + "-compatible.glb"
	case variantOBJ:
		return slug + "-obj.zip"
	case variantCompressed:
	}
	return slug + ".glb"
}

func (v exportVariant) contentType() string {
	if v == variantOBJ {
		return "application/zip"
	}
	return "model/gltf-binary"
}

// plain reports whether the variant draws the plain copies.
func (v exportVariant) plain() bool { return v != variantCompressed }

// notReady is the 409 text when a plain copy is still being made.
func (v exportVariant) notReady() string {
	if v == variantOBJ {
		return "OBJ export is not ready yet"
	}
	return "compatible copy is not ready yet"
}

// pick chooses the blob hash this variant serves.
func (v exportVariant) pick(compressed, plain string) string {
	if v.plain() {
		return plain
	}
	return compressed
}
