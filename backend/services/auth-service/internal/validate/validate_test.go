package validate_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/validate"
)

type ValidateSuite struct{ suite.Suite }

func TestValidateSuite(t *testing.T) { suite.Run(t, new(ValidateSuite)) }

// check asserts ok→no error, !ok→ErrInvalidInput.
func (s *ValidateSuite) check(name string, err error, ok bool) {
	if ok {
		assert.NilError(s.T(), err, name)
	} else {
		assert.ErrorIs(s.T(), err, domain.ErrInvalidInput, name)
	}
}

func (s *ValidateSuite) TestUsername() {
	cases := []struct {
		name string
		in   string
		ok   bool
	}{
		{"too short", "ab", false},
		{"min", "abc", true},
		{"max", strings.Repeat("a", 50), true},
		{"too long", strings.Repeat("a", 51), false},
	}
	for _, c := range cases {
		s.check(c.name, validate.Username(c.in), c.ok)
	}
}

func (s *ValidateSuite) TestEmail() {
	cases := []struct {
		name string
		in   string
		ok   bool
	}{
		{"valid", "user@example.com", true},
		{"no domain", "not-an-email", false},
		{"empty", "", false},
		{"too long", strings.Repeat("a", 250) + "@x.com", false},
	}
	for _, c := range cases {
		s.check(c.name, validate.Email(c.in), c.ok)
	}
}

func (s *ValidateSuite) TestPassword() {
	cases := []struct {
		name string
		in   string
		ok   bool
	}{
		{"valid", "Abcdef1!", true},
		{"too short", "Ab1!", false},
		{"no upper", "abcdef1!", false},
		{"no lower", "ABCDEF1!", false},
		{"no digit", "Abcdefg!", false},
		{"no special", "Abcdefg1", false},
		{"too long", strings.Repeat("Aa1!", 65), false}, // 260 chars
	}
	for _, c := range cases {
		s.check(c.name, validate.Password(c.in), c.ok)
	}
}
