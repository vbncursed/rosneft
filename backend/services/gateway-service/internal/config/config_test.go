package config

import (
	"testing"

	"github.com/spf13/cobra"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type ConfigSuite struct{ suite.Suite }

func TestConfigSuite(t *testing.T) { suite.Run(t, new(ConfigSuite)) }

func (s *ConfigSuite) TestLoad() {
	t := s.T()
	t.Setenv("GATEWAY_HTTP_ADDR", "")
	t.Setenv("GATEWAY_COOKIE_SECURE", "")
	t.Setenv("GATEWAY_ALLOWED_ORIGINS", "")

	t.Run("defaults", func(t *testing.T) {
		cfg, err := Load(&cobra.Command{})
		assert.NilError(t, err)
		assert.Equal(t, cfg.HTTPAddr, ":8080")
		assert.Assert(t, cfg.CookieSecure)
		assert.Equal(t, len(cfg.AllowedOrigins), 0)
	})

	t.Run("environment overrides default", func(t *testing.T) {
		t.Setenv("GATEWAY_HTTP_ADDR", ":1234")
		cfg, err := Load(&cobra.Command{})
		assert.NilError(t, err)
		assert.Equal(t, cfg.HTTPAddr, ":1234")
	})

	t.Run("flag overrides environment", func(t *testing.T) {
		t.Setenv("GATEWAY_HTTP_ADDR", ":1234")
		cmd := &cobra.Command{}
		cmd.Flags().String("http-addr", "", "")
		assert.NilError(t, cmd.Flags().Set("http-addr", ":5678"))
		cfg, err := Load(cmd)
		assert.NilError(t, err)
		assert.Equal(t, cfg.HTTPAddr, ":5678")
	})
}

func (s *ConfigSuite) TestValidate() {
	valid := Config{
		CatalogGRPCAddr: "catalog", AuditGRPCAddr: "audit", ContentGRPCAddr: "content",
		MeshGRPCAddr: "mesh", UploadGRPCAddr: "upload", AuthGRPCAddr: "auth",
		AssetHTTPAddr: "asset", CSRFSecret: "secret",
	}
	assert.NilError(s.T(), valid.Validate())

	cases := []struct {
		name  string
		clear func(*Config)
	}{
		{"catalog-grpc-addr", func(c *Config) { c.CatalogGRPCAddr = "" }},
		{"audit-grpc-addr", func(c *Config) { c.AuditGRPCAddr = "" }},
		{"content-grpc-addr", func(c *Config) { c.ContentGRPCAddr = "" }},
		{"mesh-grpc-addr", func(c *Config) { c.MeshGRPCAddr = "" }},
		{"upload-grpc-addr", func(c *Config) { c.UploadGRPCAddr = "" }},
		{"auth-grpc-addr", func(c *Config) { c.AuthGRPCAddr = "" }},
		{"asset-http-addr", func(c *Config) { c.AssetHTTPAddr = "" }},
		{"csrf-secret", func(c *Config) { c.CSRFSecret = "" }},
	}
	for _, tc := range cases {
		s.T().Run(tc.name, func(t *testing.T) {
			cfg := valid
			tc.clear(&cfg)
			assert.Error(t, cfg.Validate(), "config: "+tc.name+" is required")
		})
	}
}
