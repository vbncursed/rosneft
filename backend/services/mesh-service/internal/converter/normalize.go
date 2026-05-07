package converter

const targetMaxDimension = 2.0

// normalize bakes center+scale into positions so the mesh has its centroid at
// the origin and its largest axis-aligned extent equal to targetMaxDimension.
// Returns the original (pre-normalize) bbox corners — useful metadata for
// callers that want to reason about source dimensions.
//
// Empty input is a no-op; both returned vertices are zero.
func normalize(positions []vertex) (origMin, origMax vertex) {
	if len(positions) == 0 {
		return
	}
	origMin = positions[0]
	origMax = positions[0]
	for _, p := range positions[1:] {
		for i := range 3 {
			if p[i] < origMin[i] {
				origMin[i] = p[i]
			}
			if p[i] > origMax[i] {
				origMax[i] = p[i]
			}
		}
	}
	cx := (origMin[0] + origMax[0]) / 2
	cy := (origMin[1] + origMax[1]) / 2
	cz := (origMin[2] + origMax[2]) / 2

	dx := origMax[0] - origMin[0]
	dy := origMax[1] - origMin[1]
	dz := origMax[2] - origMin[2]
	maxDim := dx
	if dy > maxDim {
		maxDim = dy
	}
	if dz > maxDim {
		maxDim = dz
	}
	scale := float32(1)
	if maxDim > 0 {
		scale = targetMaxDimension / maxDim
	}
	for i := range positions {
		positions[i][0] = (positions[i][0] - cx) * scale
		positions[i][1] = (positions[i][1] - cy) * scale
		positions[i][2] = (positions[i][2] - cz) * scale
	}
	return
}
