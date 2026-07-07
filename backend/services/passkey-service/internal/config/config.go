// Package config builds the passkey service configuration via Viper, layered as
// flag > env (PASSKEY_*) > default.
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
	DBDSN           string        `mapstructure:"db-dsn"`
	RedisAddr       string        `mapstructure:"redis-addr"`
	RedisDB         int           `mapstructure:"redis-db"`
	RPID            string        `mapstructure:"rp-id"`      // registrable domain, e.g. andrey.vbncursed.fun
	RPOrigins       []string      `mapstructure:"rp-origins"` // allowed origins, scheme+host
	RPName          string        `mapstructure:"rp-name"`    // display name shown by authenticators
	CeremonyTTL     time.Duration `mapstructure:"ceremony-ttl"`
	AuthGRPCAddr    string        `mapstructure:"auth-grpc-addr"`
	LogLevel        string        `mapstructure:"log-level"`
	LogFormat       string        `mapstructure:"log-format"`
	AutoMigrate     bool          `mapstructure:"auto-migrate"`
	ShutdownTimeout time.Duration `mapstructure:"shutdown-timeout"`
}

const envPrefix = "PASSKEY"

// Load resolves configuration from cobra flags + env.
func Load(cmd *cobra.Command) (Config, error) {
	v := viper.New()
	v.SetEnvPrefix(envPrefix)
	v.SetEnvKeyReplacer(strings.NewReplacer("-", "_", ".", "_"))
	v.AutomaticEnv()

	v.SetDefault("grpc-addr", ":9008")
	v.SetDefault("redis-addr", "redis:6379")
	v.SetDefault("redis-db", 3)
	v.SetDefault("rp-name", "Andrey")
	v.SetDefault("ceremony-ttl", 5*time.Minute)
	v.SetDefault("auth-grpc-addr", "auth:9004")
	v.SetDefault("log-level", "info")
	v.SetDefault("log-format", "json")
	v.SetDefault("auto-migrate", true)
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
	// PASSKEY_RP_ORIGINS is a comma-separated env string; viper leaves it as a
	// single element when it doesn't parse a list, so split defensively.
	if len(cfg.RPOrigins) == 1 && strings.Contains(cfg.RPOrigins[0], ",") {
		raw := cfg.RPOrigins[0]
		cfg.RPOrigins = cfg.RPOrigins[:0]
		for p := range strings.SplitSeq(raw, ",") {
			if t := strings.TrimSpace(p); t != "" {
				cfg.RPOrigins = append(cfg.RPOrigins, t)
			}
		}
	}
	return cfg, nil
}

// Validate fails fast on missing required values.
func (c Config) Validate() error {
	if c.DBDSN == "" {
		return fmt.Errorf("config: db-dsn is required (set --db-dsn or %s_DB_DSN)", envPrefix)
	}
	if c.RPID == "" {
		return fmt.Errorf("config: rp-id is required (set --rp-id or %s_RP_ID)", envPrefix)
	}
	if len(c.RPOrigins) == 0 {
		return fmt.Errorf("config: rp-origins is required (set --rp-origins or %s_RP_ORIGINS)", envPrefix)
	}
	return nil
}
