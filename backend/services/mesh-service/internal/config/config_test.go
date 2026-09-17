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
