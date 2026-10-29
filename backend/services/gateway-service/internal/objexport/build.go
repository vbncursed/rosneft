package objexport

import (
	"fmt"
	"math"

	"github.com/qmuntal/gltf"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/glbexport"
)

const defaultMaterial = "newmtl default\nKd 1 1 1\nKs 0 0 0\nNs 0\nillum 1\n\n"

// builder is Build's running state over all placements.
type builder struct {
	heads       map[string]glbexport.Head
	inputs      map[string]*input
	base        mat4
	mtl         []byte
	images      []imageRef
	matN, imgN  int
	usesDefault bool
	vertices    int64
	faces       int64
	nodes       int
}

// Build plans the export: it validates every input, numbers materials and
// images, bakes each mesh-node's matrix and counts the totals. It does no I/O.
func Build(placements []glbexport.Placement, heads map[string]glbexport.Head, opts Options) (Plan, error) {
	ratio, metric := opts.Ratio, opts.Metric
	if !metric || !(ratio > 0) || math.IsInf(ratio, 0) {
		ratio, metric = 1, false
	}
	b := &builder{heads: heads, inputs: map[string]*input{}, base: bakeBase(ratio)}
	stem, units := stemOf(opts.Stem), unitsPhrase(ratio, metric)
	plan := Plan{stem: stem, readme: readmeText(stem, units), header: headerText(stem, units), modified: opts.Modified}
	for _, p := range placements {
		obj, err := b.placement(p)
		if err != nil {
			return Plan{}, fmt.Errorf("objexport: placement %q: %w", p.Name, err)
		}
		plan.objects = append(plan.objects, obj)
	}
	if b.usesDefault {
		b.mtl = append(b.mtl, defaultMaterial...)
	}
	plan.mtl, plan.images = string(b.mtl), b.images
	return plan, nil
}

// input validates a blob the first time it is met.
func (b *builder) input(hash string) (*input, error) {
	if in, ok := b.inputs[hash]; ok {
		return in, nil
	}
	h, ok := b.heads[hash]
	if !ok {
		return nil, fmt.Errorf("no head for blob %s", hash)
	}
	if h.Doc == nil {
		return nil, malformed("blob %s has no document", hash)
	}
	in := &input{hash: hash, head: h, doc: h.Doc, meshes: map[int]*meshData{}}
	if err := checkDoc(in.doc); err != nil {
		return nil, fmt.Errorf("blob %s: %w", hash, err)
	}
	if err := b.addMaterials(in); err != nil {
		return nil, fmt.Errorf("blob %s: %w", hash, err)
	}
	b.inputs[hash] = in
	return in, nil
}

func (b *builder) placement(p glbexport.Placement) (object, error) {
	in, err := b.input(p.Hash)
	if err != nil {
		return object{}, err
	}
	if b.nodes += 1 + len(in.doc.Nodes); b.nodes > maxNodes {
		return object{}, fmt.Errorf("%w: more than %d placement nodes", ErrTooLarge, maxNodes)
	}
	roots, err := glbexport.SceneRoots(in.doc)
	if err != nil {
		return object{}, fmt.Errorf("%w: %w", ErrMalformed, err)
	}
	obj := object{name: objectName(p.Name), hash: p.Hash}
	pm := placementMatrix(p)
	seen := map[int]bool{}
	for _, root := range roots {
		if err := b.walk(in, root, pm, seen, 1, &obj); err != nil {
			return object{}, err
		}
	}
	return obj, nil
}

// walk visits node i under the matrix parent, recording every mesh-node.
// A node reached twice, a tree deeper than maxDepth, a camera or a skin are
// refused, as in glbexport.
func (b *builder) walk(in *input, i int, parent mat4, seen map[int]bool, depth int, obj *object) error {
	n, err := claimNode(in.doc, i, seen, depth)
	if err != nil {
		return err
	}
	world := parent.mul(nodeLocal(n))
	if n.Mesh != nil {
		if err := b.addInstance(in, *n.Mesh, world, obj); err != nil {
			return err
		}
	}
	for _, c := range n.Children {
		if err := b.walk(in, c, world, seen, depth+1, obj); err != nil {
			return err
		}
	}
	return nil
}

// claimNode marks node i visited and returns it. It refuses an index that
// does not exist, a tree deeper than maxDepth, a node visited before, and a
// camera or skin, in that order.
func claimNode(doc *gltf.Document, i int, seen map[int]bool, depth int) (*gltf.Node, error) {
	switch {
	case i < 0 || i >= len(doc.Nodes):
		return nil, malformed("node %d out of range [0, %d)", i, len(doc.Nodes))
	case depth > maxDepth:
		return nil, malformed("node tree deeper than %d", maxDepth)
	case seen[i]:
		return nil, malformed("node %d reached twice", i)
	}
	seen[i] = true
	n := doc.Nodes[i]
	if n.Camera != nil || n.Skin != nil {
		return nil, unsupported("node %d uses a camera or skin", i)
	}
	return n, nil
}

// addInstance records a mesh-node and counts it against the ceilings.
func (b *builder) addInstance(in *input, mesh int, world mat4, obj *object) error {
	md, err := in.resolveMesh(mesh)
	if err != nil {
		return err
	}
	b.vertices += md.vertices
	b.faces += md.faces
	if b.vertices > MaxVertices || b.faces > MaxFaces {
		return fmt.Errorf("%w: over %d vertices or %d faces", ErrTooLarge, MaxVertices, MaxFaces)
	}
	b.usesDefault = b.usesDefault || md.usesDefault
	obj.instances = append(obj.instances, instance{mesh: md, f: b.base.mul(world), flip: world.det3() < 0})
	return nil
}
