package domain_test

import (
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

type FoldSuite struct{ suite.Suite }

func TestFoldSuite(t *testing.T) { suite.Run(t, new(FoldSuite)) }

func (s *FoldSuite) TestFold() {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"mixed case", "Ernest.Sayapov@Gmail.COM", "ernest.sayapov@gmail.com"},
		{"already lower", "ernest@gmail.com", "ernest@gmail.com"},
		{"surrounding whitespace", "  Ernest@Gmail.com \t", "ernest@gmail.com"},
		{"username, not an email", "  Ivan ", "ivan"},
		{"empty", "", ""},
	}
	for _, c := range cases {
		assert.Equal(s.T(), domain.Fold(c.in), c.want, c.name)
	}
}

// Folding a folded value must not change it — the migration and the write paths
// both re-apply it to rows that are already normalized.
func (s *FoldSuite) TestFoldIsIdempotent() {
	once := domain.Fold("  Ernest.Sayapov@Gmail.COM ")
	assert.Equal(s.T(), domain.Fold(once), once)
}
