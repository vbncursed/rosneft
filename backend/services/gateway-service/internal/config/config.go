// Package config builds the gateway service configuration via Viper.
// Layered as flag > env (GATEWAY_*) > default.
package config

import (
	"fmt"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

// Config aggregates all runtime knobs.
type Config struct {
	HTTPAddr        string        `mapstructure:"http-addr"`
	CatalogGRPCAddr string        `mapstructure:"catalog-grpc-addr"`
	ContentGRPCAddr string        `mapstructure:"content-grpc-addr"`
	MeshGRPCAddr    string        `mapstructure:"mesh-grpc-addr"`
	UploadGRPCAddr  string        `mapstructure:"upload-grpc-addr"`
	AuthGRPCAddr    string        `mapstructure:"auth-grpc-addr"`
	TwoFAGRPCAddr   string        `mapstructure:"twofa-grpc-addr"`
	AssetHTTPAddr   string        `mapstructure:"asset-http-addr"`
	AllowedOrigins  []string      `mapstructure:"allowed-origins"`
	LogLevel        string        `mapstructure:"log-level"`
	LogFormat       string        `mapstructure:"log-format"`
	ReadTimeout     time.Duration `mapstructure:"read-timeout"`
	WriteTimeout    time.Duration `mapstructure:"write-timeout"`
	IdleTimeout     time.Duration `mapstructure:"idle-timeout"`
	ShutdownTimeout time.Duration `mapstructure:"shutdown-timeout"`
}

const envPrefix = "GATEWAY"

// Load resolves configuration from cobra flags + env.
func Load(cmd *cobra.Command) (Config, error) {
	v := viper.New()
	v.SetEnvPrefix(envPrefix)
	v.SetEnvKeyReplacer(strings.NewReplacer("-", "_", ".", "_"))
	v.AutomaticEnv()

	v.SetDefault("http-addr", ":8080")
	v.SetDefault("catalog-grpc-addr", "catalog:9001")
	v.SetDefault("content-grpc-addr", "content:9007")
	v.SetDefault("mesh-grpc-addr", "mesh-api:9002")
	v.SetDefault("upload-grpc-addr", "upload:9003")
	v.SetDefault("auth-grpc-addr", "auth:9004")
	v.SetDefault("twofa-grpc-addr", "twofa:9006")
	v.SetDefault("asset-http-addr", "http://asset:8081")
	v.SetDefault("allowed-origins", []string{"*"})
	v.SetDefault("log-level", "info")
	v.SetDefault("log-format", "json")
	v.SetDefault("read-timeout", 10*time.Second)
	v.SetDefault("write-timeout", 5*time.Minute)
	v.SetDefault("idle-timeout", 2*time.Minute)
	v.SetDefault("shutdown-timeout", 15*time.Second)

	if err := v.BindPFlags(cmd.Root().PersistentFlags()); err != nil {
		return Config{}, fmt.Errorf("config: bind persistent flags: %w", err)
	}
	if err := v.BindPFlags(cmd.Flags()); err != nil {
		return Config{}, fmt.Errorf("config: bind flags: %w", err)
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return Config{}, fmt.Errorf("config: unmarshal: %w", err)
	}
	return cfg, nil
}

// Validate fails fast on missing required values.
func (c Config) Validate() error {
	if c.CatalogGRPCAddr == "" {
		return fmt.Errorf("config: catalog-grpc-addr is required")
	}
	if c.ContentGRPCAddr == "" {
		return fmt.Errorf("config: content-grpc-addr is required")
	}
	if c.MeshGRPCAddr == "" {
		return fmt.Errorf("config: mesh-grpc-addr is required")
	}
	if c.UploadGRPCAddr == "" {
		return fmt.Errorf("config: upload-grpc-addr is required")
	}
	if c.AuthGRPCAddr == "" {
		return fmt.Errorf("config: auth-grpc-addr is required")
	}
	if c.AssetHTTPAddr == "" {
		return fmt.Errorf("config: asset-http-addr is required")
	}
	return nil
}
