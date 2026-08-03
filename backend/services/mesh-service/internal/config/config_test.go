package config_test

import (
	"os"
	"testing"

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

func (s *ConfigSuite) TestWorkerNameDefaultsToHostname() {
	host, err := os.Hostname()
	assert.NilError(s.T(), err)

	got := config.DefaultWorkerName()

	assert.Equal(s.T(), host, got)
	// Two containers sharing one consumer name are one consumer to Redis, and
	// XAUTOCLAIM can no longer tell which of them died.
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
