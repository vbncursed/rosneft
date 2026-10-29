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
		// A username is one word. Interior whitespace is the case the frontend
		// cannot be trusted to enforce, since the API is reachable without it.
		{"interior space", "Ivan Petrov", false},
		{"interior tab", "ivan\tpetrov", false},
		{"interior newline", "ivan\npetrov", false},
		{"leading space", " ivan", false},
		{"trailing space", "ivan ", false},
		{"non-breaking space", "ivan petrov", false},
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

// Each rule's exact message, and the order: length is judged before the
// character classes, so a short password lacking every class reports length.
func (s *ValidateSuite) TestPasswordMessages() {
	const (
		length  = "validate: invalid input: password must be 8–256 characters"
		classes = "validate: invalid input: password needs an upper-case, lower-case, digit, and special character"
	)
	cases := []struct {
		name string
		in   string
		want string // "" = accepted
	}{
		{"empty", "", length},
		{"short with every class", "Ab1!", length},
		{"short with no class", "abc", length},
		{"7 runes", "Abcde1!", length},
		{"8 runes", "Abcdef1!", ""},
		{"256 runes", "Aa1!" + strings.Repeat("a", 252), ""},
		{"257 runes", "Aa1!" + strings.Repeat("a", 253), length},
		{"long without classes", strings.Repeat("a", 300), length},
		{"no upper", "abcdef1!", classes},
		{"no lower", "ABCDEF1!", classes},
		{"no digit", "Abcdefg!", classes},
		{"no special", "Abcdefg1", classes},
		{"multibyte counts runes not bytes", "Аб1!", length}, // 4 runes, 7 bytes
		{"cyrillic upper and lower", "Привет1!", ""},
		{"space is special", "Abcdef1 ", ""},
		{"only letters of both cases and digit", "Abcdef12", classes},
	}
	for _, c := range cases {
		err := validate.Password(c.in)
		if c.want == "" {
			assert.NilError(s.T(), err, c.name)
			continue
		}
		assert.ErrorIs(s.T(), err, domain.ErrInvalidInput, c.name)
		assert.Equal(s.T(), err.Error(), c.want, c.name)
	}
}
