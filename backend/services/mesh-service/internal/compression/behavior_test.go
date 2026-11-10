package compression

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type ProcessSuite struct{ suite.Suite }

func TestProcessSuite(t *testing.T) { suite.Run(t, new(ProcessSuite)) }

func (s *ProcessSuite) executable(body string) (string, string) {
	s.T().Helper()
	dir := s.T().TempDir()
	record := filepath.Join(dir, "argv")
	bin := filepath.Join(dir, "gltfpack")
	script := "#!/bin/sh\nprintf '%s\\n' \"$@\" > '" + record + "'\n" + body + "\n"
	assert.NilError(s.T(), os.WriteFile(bin, []byte(script), 0o700))
	return bin, record
}

func (s *ProcessSuite) TestValidationAndDisabled() {
	o := New(filepath.Join(s.T().TempDir(), "missing"))
	_, err := o.Compress(s.T().Context(), nil)
	assert.ErrorContains(s.T(), err, "empty GLB input")
	got, err := o.Compress(s.T().Context(), []byte("input"))
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, []byte("input"))
	_, err = o.Simplify(s.T().Context(), nil, 0.5)
	assert.ErrorContains(s.T(), err, "empty GLB input")
	for _, ratio := range []float64{-1, 0, 1, 2} {
		_, err = o.Simplify(s.T().Context(), []byte("input"), ratio)
		assert.ErrorContains(s.T(), err, "simplify ratio must be in (0,1)")
	}
}

func (s *ProcessSuite) TestProcessRoundTrip() {
	for _, simplify := range []bool{false, true} {
		s.Run(map[bool]string{false: "compress", true: "simplify"}[simplify], func() {
			bin, record := s.executable("cat \"$2\" > \"$4\"\nprintf ':processed' >> \"$4\"")
			o := New(bin, WithMeshopt(), WithKTX2(1024))
			var got []byte
			var err error
			if simplify {
				got, err = o.Simplify(s.T().Context(), []byte("input"), 0.5)
			} else {
				got, err = o.Compress(s.T().Context(), []byte("input"))
			}
			assert.NilError(s.T(), err)
			assert.Equal(s.T(), string(got), "input:processed")
			raw, err := os.ReadFile(record)
			assert.NilError(s.T(), err)
			args := strings.Split(strings.TrimSpace(string(raw)), "\n")
			assert.Equal(s.T(), args[0], "-i")
			assert.Equal(s.T(), args[2], "-o")
			assert.Assert(s.T(), strings.HasSuffix(args[1], "/in.glb"))
			assert.Equal(s.T(), filepath.Dir(args[1]), filepath.Dir(args[3]))
			assert.Equal(s.T(), argValue(args, "-tl"), map[bool]string{false: "1024", true: "512"}[simplify])
			if simplify {
				assert.Equal(s.T(), argValue(args, "-si"), "0.5")
				assert.Equal(s.T(), argValue(args, "-ts"), "0.5")
			}
			_, err = os.Stat(filepath.Dir(args[1]))
			assert.Assert(s.T(), os.IsNotExist(err), "temporary directory was not removed: %v", err)
		})
	}
}

func (s *ProcessSuite) TestProcessFailures() {
	for _, simplify := range []bool{false, true} {
		for _, tc := range []struct{ name, script, message string }{
			{"exit", "echo deliberate-failure >&2; exit 3", "deliberate-failure"},
			{"missing output", ":", "read output"},
			{"empty output", ": > \"$4\"; echo no-data >&2", "produced empty output"},
		} {
			s.Run(map[bool]string{false: "compress/", true: "simplify/"}[simplify]+tc.name, func() {
				bin, record := s.executable(tc.script)
				o := New(bin, WithMeshopt())
				var err error
				if simplify {
					_, err = o.Simplify(s.T().Context(), []byte("input"), 0.5)
				} else {
					_, err = o.Compress(s.T().Context(), []byte("input"))
				}
				assert.ErrorContains(s.T(), err, tc.message)
				raw, readErr := os.ReadFile(record)
				assert.NilError(s.T(), readErr)
				args := strings.Split(strings.TrimSpace(string(raw)), "\n")
				_, statErr := os.Stat(filepath.Dir(args[1]))
				assert.Assert(s.T(), os.IsNotExist(statErr), "temporary directory was not removed: %v", statErr)
			})
		}
	}
}

func (s *ProcessSuite) TestCancellation() {
	for _, simplify := range []bool{false, true} {
		ctx, cancel := context.WithCancel(s.T().Context())
		cancel()
		bin, _ := s.executable(":")
		o := New(bin, WithMeshopt())
		var err error
		if simplify {
			_, err = o.Simplify(ctx, []byte("input"), 0.5)
		} else {
			_, err = o.Compress(ctx, []byte("input"))
		}
		assert.ErrorContains(s.T(), err, "context canceled")
	}
}

func (s *ProcessSuite) TestAvailable() {
	assert.NilError(s.T(), New("sh").Available(s.T().Context()))
	assert.ErrorContains(s.T(), New("rosneft-missing-gltfpack-test").Available(s.T().Context()), "gltfpack not found")

	bin, record := s.executable("exit 3")
	assert.NilError(s.T(), New(bin).Available(s.T().Context()))
	raw, err := os.ReadFile(record)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), string(raw), "-h\n")

	missing := filepath.Join(s.T().TempDir(), "missing")
	err = New(missing).Available(s.T().Context())
	assert.ErrorContains(s.T(), err, "gltfpack not found")
	assert.ErrorContains(s.T(), err, missing)
}
