package fileheader_test

import (
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/fileheader"
)

func TestIsPDF(t *testing.T) {
	cases := []struct {
		name   string
		header []byte
		want   bool
	}{
		{"valid", []byte("%PDF-1.7\n..."), true},
		{"exact5", []byte("%PDF-"), true},
		{"tooShort", []byte("%PDF"), false},
		{"wrongMagic", []byte("PK\x03\x04zip"), false},
		{"empty", []byte{}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			assert.Equal(t, c.want, fileheader.IsPDF(c.header))
		})
	}
}
