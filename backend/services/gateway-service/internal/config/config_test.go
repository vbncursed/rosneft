package config

import (
	"testing"

	"github.com/spf13/cobra"
)

func TestLoad(t *testing.T) {
	t.Setenv("GATEWAY_HTTP_ADDR", "")
	t.Setenv("GATEWAY_COOKIE_SECURE", "")
	t.Setenv("GATEWAY_ALLOWED_ORIGINS", "")

	t.Run("defaults", func(t *testing.T) {
		cfg, err := Load(&cobra.Command{})
		if err != nil {
			t.Fatal(err)
		}
		if cfg.HTTPAddr != ":8080" || !cfg.CookieSecure || len(cfg.AllowedOrigins) != 0 {
			t.Errorf("defaults: HTTPAddr=%q CookieSecure=%v AllowedOrigins=%v",
				cfg.HTTPAddr, cfg.CookieSecure, cfg.AllowedOrigins)
		}
	})

	t.Run("environment overrides default", func(t *testing.T) {
		t.Setenv("GATEWAY_HTTP_ADDR", ":1234")
		cfg, err := Load(&cobra.Command{})
		if err != nil {
			t.Fatal(err)
		}
		if cfg.HTTPAddr != ":1234" {
			t.Errorf("HTTPAddr = %q, want :1234", cfg.HTTPAddr)
		}
	})

	t.Run("flag overrides environment", func(t *testing.T) {
		t.Setenv("GATEWAY_HTTP_ADDR", ":1234")
		cmd := &cobra.Command{}
		cmd.Flags().String("http-addr", "", "")
		if err := cmd.Flags().Set("http-addr", ":5678"); err != nil {
			t.Fatal(err)
		}
		cfg, err := Load(cmd)
		if err != nil {
			t.Fatal(err)
		}
		if cfg.HTTPAddr != ":5678" {
			t.Errorf("HTTPAddr = %q, want :5678", cfg.HTTPAddr)
		}
	})
}

func TestConfig_Validate(t *testing.T) {
	valid := Config{
		CatalogGRPCAddr: "catalog", AuditGRPCAddr: "audit", ContentGRPCAddr: "content",
		MeshGRPCAddr: "mesh", UploadGRPCAddr: "upload", AuthGRPCAddr: "auth",
		AssetHTTPAddr: "asset", CSRFSecret: "secret",
	}
	if err := valid.Validate(); err != nil {
		t.Fatalf("valid configuration: %v", err)
	}

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
		t.Run(tc.name, func(t *testing.T) {
			cfg := valid
			tc.clear(&cfg)
			err := cfg.Validate()
			want := "config: " + tc.name + " is required"
			if err == nil || err.Error() != want {
				t.Errorf("Validate() = %v, want %q", err, want)
			}
		})
	}
}
