package glbexport

import (
	"math"

	"github.com/qmuntal/gltf"
)

// quatFromEulerXYZ is three.js Quaternion.setFromEuler for order 'XYZ', in
// glTF component order (x, y, z, w).
func quatFromEulerXYZ(x, y, z float64) [4]float64 {
	s1, c1 := math.Sincos(x / 2)
	s2, c2 := math.Sincos(y / 2)
	s3, c3 := math.Sincos(z / 2)
	return [4]float64{
		s1*c2*c3 + c1*s2*s3,
		c1*s2*c3 - s1*c2*s3,
		c1*c2*s3 + s1*s2*c3,
		c1*c2*c3 - s1*s2*s3,
	}
}

// sceneRoots lists the nodes the viewer would draw: the default scene's, or
// every parentless node when the document has no scenes.
func sceneRoots(doc *gltf.Document) ([]int, error) {
	if len(doc.Scenes) == 0 {
		hasParent := map[int]bool{}
		for _, n := range doc.Nodes {
			for _, c := range n.Children {
				hasParent[c] = true
			}
		}
		var roots []int
		for i := range doc.Nodes {
			if !hasParent[i] {
				roots = append(roots, i)
			}
		}
		return roots, nil
	}
	i := 0
	if doc.Scene != nil {
		i = *doc.Scene
	}
	if i < 0 || i >= len(doc.Scenes) {
		return nil, malformed("scene %d out of range [0, %d)", i, len(doc.Scenes))
	}
	return doc.Scenes[i].Nodes, nil
}

// addPlacement appends the placement's node to scene 0, with a fresh copy of
// the input's root subtrees as its children. The copies share the input's
// meshes, so geometry, materials and textures exist once.
func (b *builder) addPlacement(in *instance, p Placement) error {
	node := &gltf.Node{
		Name:        p.Name,
		Translation: p.Translation,
		Rotation:    quatFromEulerXYZ(p.Rotation[0], p.Rotation[1], p.Rotation[2]),
		Scale:       p.Scale,
	}
	b.doc.Scenes[0].Nodes = append(b.doc.Scenes[0].Nodes, len(b.doc.Nodes))
	b.doc.Nodes = append(b.doc.Nodes, node)
	seen := map[int]bool{}
	for _, root := range in.roots {
		c, err := b.copySubtree(in, root, seen)
		if err != nil {
			return err
		}
		node.Children = append(node.Children, c)
	}
	return nil
}

// copySubtree copies node i and everything below it into the output and
// returns the copy's index. glTF nodes form a tree, so reaching one twice
// (a cycle, or two parents) is malformed.
func (b *builder) copySubtree(in *instance, i int, seen map[int]bool) (int, error) {
	if i < 0 || i >= len(in.src.Nodes) {
		return 0, malformed("node %d out of range [0, %d)", i, len(in.src.Nodes))
	}
	if seen[i] {
		return 0, malformed("node %d reached twice", i)
	}
	seen[i] = true
	n := *in.src.Nodes[i]
	if n.Camera != nil || n.Skin != nil {
		return 0, unsupported("node %d uses a camera or skin", i)
	}
	if n.Mesh != nil {
		if *n.Mesh < 0 || *n.Mesh >= len(in.src.Meshes) {
			return 0, malformed("mesh %d out of range [0, %d)", *n.Mesh, len(in.src.Meshes))
		}
		n.Mesh = new(*n.Mesh + in.meshBase)
	}
	idx := len(b.doc.Nodes)
	b.doc.Nodes = append(b.doc.Nodes, &n)
	n.Children = nil
	for _, c := range in.src.Nodes[i].Children {
		ci, err := b.copySubtree(in, c, seen)
		if err != nil {
			return 0, err
		}
		n.Children = append(n.Children, ci)
	}
	return idx, nil
}
