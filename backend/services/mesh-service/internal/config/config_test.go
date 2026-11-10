package config_test

import (
	"bytes"
	"log/slog"
	"os"
	"strings"
	"testing"

	"github.com/spf13/cobra"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/config"
)

type ConfigSuite struct {
	suite.Suite
}

func TestConfigSuite(t *testing.T) {
	suite.Run(t, new(ConfigSuite))
}

// loadWithCapturedLog runs config.Load against a bare command (no flags
// bound, so only env/defaults resolve) and captures anything written to the
// package-level slog default while it runs.
func loadWithCapturedLog(t *testing.T) (config.Config, string) {
	t.Helper()

	prev := slog.Default()
	var buf bytes.Buffer
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, nil)))
	defer slog.SetDefault(prev)

	cfg, err := config.Load(&cobra.Command{})
	assert.NilError(t, err)
	return cfg, buf.String()
}

func (s *ConfigSuite) TestLoadDefaultsMeshoptEnabledWhenNeitherEnvSet() {
	cfg, log := loadWithCapturedLog(s.T())

	assert.Equal(s.T(), cfg.MeshoptEnabled, true)
	assert.Equal(s.T(), cfg.GltfpackBin, "gltfpack")
	assert.Equal(s.T(), log, "")
}

func (s *ConfigSuite) TestLoadPrefersOldMeshoptEnvWhenNewIsUnsetAndWarns() {
	s.T().Setenv("MESH_DRACO_ENABLED", "false")

	cfg, log := loadWithCapturedLog(s.T())

	assert.Equal(s.T(), cfg.MeshoptEnabled, false)
	assert.Assert(s.T(), strings.Contains(log, "MESH_DRACO_ENABLED"))
	assert.Assert(s.T(), strings.Contains(log, "MESH_MESHOPT_ENABLED"))
}

func (s *ConfigSuite) TestLoadPrefersNewMeshoptEnvOverOldAndDoesNotWarn() {
	s.T().Setenv("MESH_MESHOPT_ENABLED", "true")
	s.T().Setenv("MESH_DRACO_ENABLED", "false")

	cfg, log := loadWithCapturedLog(s.T())

	assert.Equal(s.T(), cfg.MeshoptEnabled, true)
	assert.Equal(s.T(), log, "")
}

func (s *ConfigSuite) TestLoadPrefersOldGltfpackBinEnvWhenNewIsUnsetAndWarns() {
	s.T().Setenv("MESH_DRACO_BIN", "/opt/legacy-gltfpack")

	cfg, log := loadWithCapturedLog(s.T())

	assert.Equal(s.T(), cfg.GltfpackBin, "/opt/legacy-gltfpack")
	assert.Assert(s.T(), strings.Contains(log, "MESH_DRACO_BIN"))
	assert.Assert(s.T(), strings.Contains(log, "MESH_GLTFPACK_BIN"))
}

func (s *ConfigSuite) TestLoadPrefersNewGltfpackBinEnvOverOldAndDoesNotWarn() {
	s.T().Setenv("MESH_GLTFPACK_BIN", "/opt/new-gltfpack")
	s.T().Setenv("MESH_DRACO_BIN", "/opt/legacy-gltfpack")

	cfg, log := loadWithCapturedLog(s.T())

	assert.Equal(s.T(), cfg.GltfpackBin, "/opt/new-gltfpack")
	assert.Equal(s.T(), log, "")
}

func (s *ConfigSuite) TestWorkerNameDefaultsToHostname() {
	host, err := os.Hostname()
	assert.NilError(s.T(), err)

	got := config.DefaultWorkerName()

	assert.Equal(s.T(), host, got)
	// Two containers sharing one consumer name are one consumer to Redis —
	// their in-flight work would be indistinguishable in XINFO CONSUMERS.
	assert.Assert(s.T(), got != "mesh-worker-1")
}

func (s *ConfigSuite) TestParsedLODRatios() {
	cases := []struct {
		name  string
		input []string
		want  []float64
		err   string
	}{
		{name: "empty"},
		{name: "whitespace entries", input: []string{" ", "\t"}, want: []float64{}},
		{name: "valid in supplied order", input: []string{" 0.25 ", "", "0.5"}, want: []float64{0.25, 0.5}},
		{name: "malformed", input: []string{"0.5", "oops"}, err: `invalid lod-ratio "oops"`},
		{name: "zero", input: []string{"0"}, err: "lod-ratio 0 out of range"},
		{name: "negative", input: []string{"-0.1"}, err: "lod-ratio -0.1 out of range"},
		{name: "one", input: []string{"1"}, err: "lod-ratio 1 out of range"},
		{name: "above one", input: []string{"1.1"}, err: "lod-ratio 1.1 out of range"},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			got, err := (config.Config{LODRatios: tc.input}).ParsedLODRatios()
			if tc.err != "" {
				assert.ErrorContains(s.T(), err, tc.err)
				assert.Assert(s.T(), got == nil)
				return
			}
			assert.NilError(s.T(), err)
			assert.DeepEqual(s.T(), got, tc.want)
		})
	}
}

func (s *ConfigSuite) TestValidateAPI() {
	assert.ErrorContains(s.T(), (config.Config{}).ValidateAPI(), "redis-addr is required")
	assert.NilError(s.T(), (config.Config{RedisAddr: "redis:6379"}).ValidateAPI())
}

func (s *ConfigSuite) TestValidateWorkerRequiredDependencies() {
	valid := config.Config{
		RedisAddr:       "redis:6379",
		CatalogGRPCAddr: "catalog:9001",
		BlobDir:         "/var/blob",
		WorkerName:      "worker-1",
	}
	cases := []struct {
		name string
		cfg  config.Config
		err  string
	}{
		{name: "valid", cfg: valid},
		{name: "redis", cfg: config.Config{}, err: "redis-addr is required"},
		{name: "catalog", cfg: config.Config{RedisAddr: valid.RedisAddr}, err: "catalog-grpc-addr is required"},
		{
			name: "blob directory",
			cfg:  config.Config{RedisAddr: valid.RedisAddr, CatalogGRPCAddr: valid.CatalogGRPCAddr},
			err:  "blob-dir is required",
		},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			err := tc.cfg.ValidateWorker()
			if tc.err != "" {
				assert.ErrorContains(s.T(), err, tc.err)
				return
			}
			assert.NilError(s.T(), err)
		})
	}
}

func (s *ConfigSuite) TestValidateWorkerRejectsEmptyWorkerName() {
	cfg := config.Config{
		RedisAddr:       "redis:6379",
		CatalogGRPCAddr: "catalog:9001",
		BlobDir:         "/var/blob",
		WorkerName:      "",
	}

	err := cfg.ValidateWorker()

	// A fixed fallback here would silently reintroduce the collision this
	// task removes, so an unavailable hostname must be a hard error.
	assert.ErrorContains(s.T(), err, "worker-name")
}

// Each conversion runs its own gltfpack, which peaks at 4.0 GB on three 8192²
// textures even encoding them one at a time — a GOMAXPROCS-wide pool OOMs the
// 4-core, 8 GB host.
func (s *ConfigSuite) TestLoadRunsOneConversionAtATimeByDefault() {
	cfg, _ := loadWithCapturedLog(s.T())

	assert.Equal(s.T(), cfg.MaxConcurrentJobs, 1)
}

func (s *ConfigSuite) TestLoadCapsTexturesAt8192ByDefault() {
	cfg, _ := loadWithCapturedLog(s.T())

	assert.Equal(s.T(), cfg.TextureMaxSize, 8192)
}

func (s *ConfigSuite) TestLoadReadsTextureMaxSizeFromEnv() {
	s.T().Setenv("MESH_TEXTURE_MAX_SIZE", "4096")

	cfg, _ := loadWithCapturedLog(s.T())

	assert.Equal(s.T(), cfg.TextureMaxSize, 4096)
}
