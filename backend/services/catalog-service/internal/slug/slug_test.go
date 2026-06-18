package slug_test

import (
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/slug"
)

type SlugSuite struct {
	suite.Suite
}

func TestSlugSuite(t *testing.T) {
	suite.Run(t, new(SlugSuite))
}

func (s *SlugSuite) TestGenerate() {
	cases := []struct {
		name  string
		title string
		want  string
	}{
		{"cyrillic", "Москва", "moskva"},
		{"cyrillic spaces", "Северная Площадка", "severnaya-ploshchadka"},
		{"mixed latin cyrillic digits", "Цех A-12", "tsekh-a-12"},
		{"already latin", "North Pad Entrance", "north-pad-entrance"},
		{"collapses separators", "  a__b  c ", "a-b-c"},
		{"strips edges", "---Hello!!!---", "hello"},
		{"soft hard signs dropped", "Подъезд", "podezd"},
		{"yo and zh", "Ёжик", "yozhik"},
		{"non-sluggable falls back", "!!! ©™ !!!", "territory"},
		{"empty falls back", "", "territory"},
	}
	for _, c := range cases {
		s.Run(c.name, func() {
			assert.Equal(s.T(), slug.Generate(c.title, "territory"), c.want)
		})
	}
}

func (s *SlugSuite) TestCandidate() {
	assert.Equal(s.T(), slug.Candidate("moskva", 1), "moskva")
	assert.Equal(s.T(), slug.Candidate("moskva", 2), "moskva-2")
	assert.Equal(s.T(), slug.Candidate("moskva", 5), "moskva-5")
}
