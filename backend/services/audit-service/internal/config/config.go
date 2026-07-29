// Package config builds the audit service configuration via Viper, layered
// as flag > env (AUDIT_*) > default.
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
	GRPCAddr        string        `mapstructure:"grpc-addr"`
	MetricsAddr     string        `mapstructure:"metrics-addr"`
	DBDSN           string        `mapstructure:"db-dsn"`
	LogLevel        string        `mapstructure:"log-level"`
	LogFormat       string        `mapstructure:"log-format"`
	AutoMigrate     bool          `mapstructure:"auto-migrate"`
	ShutdownTimeout time.Duration `mapstructure:"shutdown-timeout"`

	// CheckpointInterval must exceed the longest write transaction: the digest
	// boundary is a watermark one tick old, and a transaction outliving the tick
	// lands a row inside an already-sealed range. 0 disables checkpointing.
	CheckpointInterval time.Duration `mapstructure:"checkpoint-interval"`
	// DigestFile witnesses each checkpoint outside the database. Empty disables
	// it — the chain then lives only in Postgres, where it protects against
	// nobody who can edit Postgres.
	DigestFile string `mapstructure:"digest-file"`
}

const envPrefix = "AUDIT"

// Load resolves configuration from cobra flags + env.
func Load(cmd *cobra.Command) (Config, error) {
	v := viper.New()
	v.SetEnvPrefix(envPrefix)
	v.SetEnvKeyReplacer(strings.NewReplacer("-", "_", ".", "_"))
	v.AutomaticEnv()

	v.SetDefault("grpc-addr", ":9009")
	v.SetDefault("metrics-addr", ":9101")
	v.SetDefault("log-level", "info")
	v.SetDefault("log-format", "json")
	v.SetDefault("auto-migrate", true)
	v.SetDefault("shutdown-timeout", 15*time.Second)
	v.SetDefault("checkpoint-interval", 5*time.Minute)
	v.SetDefault("digest-file", "")

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
	if c.DBDSN == "" {
		return fmt.Errorf("config: db-dsn is required (set --db-dsn or %s_DB_DSN)", envPrefix)
	}
	return nil
}
