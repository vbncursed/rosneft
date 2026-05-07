// Package config builds mesh-service configuration via Viper. Layered as
// flag > env (MESH_*) > default. Both mesh-api and mesh-worker consume the
// same Config; unused fields are simply ignored by whichever binary runs.
package config

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

// Config aggregates all runtime knobs.
type Config struct {
	GRPCAddr         string        `mapstructure:"grpc-addr"`
	RedisAddr        string        `mapstructure:"redis-addr"`
	RedisDB          int           `mapstructure:"redis-db"`
	CatalogGRPCAddr  string        `mapstructure:"catalog-grpc-addr"`
	BlobDir          string        `mapstructure:"blob-dir"`
	SourceDir        string        `mapstructure:"source-dir"`
	WorkerName       string        `mapstructure:"worker-name"`
	BlockTimeout     time.Duration `mapstructure:"block-timeout"`
	MaxConcurrentJobs int          `mapstructure:"max-concurrent-jobs"`
	LogLevel         string        `mapstructure:"log-level"`
	LogFormat        string        `mapstructure:"log-format"`
	ShutdownTimeout  time.Duration `mapstructure:"shutdown-timeout"`
	// DracoEnabled toggles KHR_draco_mesh_compression on freshly converted
	// GLBs. The frontend's DRACOLoader must be configured when this is on.
	DracoEnabled bool `mapstructure:"draco-enabled"`
	// KTX2Enabled toggles KHR_texture_basisu (KTX2 / Basis Universal) for
	// embedded textures. Frontend KTX2Loader MUST be configured when this
	// is on — without it, drei fails to decode KTX2 and textures render
	// as solid colour. Encoder-heavy (large textures take seconds), but
	// dramatically reduces VRAM at runtime.
	KTX2Enabled bool `mapstructure:"ktx2-enabled"`
	// DracoBin is the path/name of the gltfpack binary used by both Draco
	// and KTX2 encoders. Empty falls back to "gltfpack" resolved on $PATH.
	DracoBin string `mapstructure:"draco-bin"`
	// LODRatios are simplification ratios for additional LOD artifacts.
	// Each ratio in (0,1) produces one extra LOD beyond LOD0. Example:
	// "0.5,0.25" → LOD1 (50% triangles), LOD2 (25% triangles). Empty → no
	// extra LODs. Order matters: ratios should be descending so LOD
	// numbers increase as quality decreases.
	//
	// Stored as []string here because Viper's default decoder cannot
	// convert a CSV env var into []float64 — ParsedLODRatios validates
	// and converts on demand at boot.
	LODRatios []string `mapstructure:"lod-ratios"`
}

// ParsedLODRatios converts the raw string list into floats and validates
// that each one falls in (0, 1). Bootstrap calls this once; downstream
// code never sees the raw strings.
func (c Config) ParsedLODRatios() ([]float64, error) {
	if len(c.LODRatios) == 0 {
		return nil, nil
	}
	out := make([]float64, 0, len(c.LODRatios))
	for _, raw := range c.LODRatios {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		f, err := strconv.ParseFloat(raw, 64)
		if err != nil {
			return nil, fmt.Errorf("config: invalid lod-ratio %q: %w", raw, err)
		}
		if f <= 0 || f >= 1 {
			return nil, fmt.Errorf("config: lod-ratio %v out of range (0,1)", f)
		}
		out = append(out, f)
	}
	return out, nil
}

const envPrefix = "MESH"

// Load resolves configuration from cobra flags + env.
func Load(cmd *cobra.Command) (Config, error) {
	v := viper.New()
	v.SetEnvPrefix(envPrefix)
	v.SetEnvKeyReplacer(strings.NewReplacer("-", "_", ".", "_"))
	v.AutomaticEnv()

	v.SetDefault("grpc-addr", ":9002")
	v.SetDefault("redis-addr", "redis:6379")
	v.SetDefault("redis-db", 0)
	v.SetDefault("catalog-grpc-addr", "catalog:9001")
	v.SetDefault("worker-name", "mesh-worker-1")
	v.SetDefault("block-timeout", 5*time.Second)
	v.SetDefault("max-concurrent-jobs", 0) // 0 → runtime.GOMAXPROCS
	v.SetDefault("log-level", "info")
	v.SetDefault("log-format", "json")
	v.SetDefault("shutdown-timeout", 30*time.Second)
	v.SetDefault("draco-enabled", true)
	v.SetDefault("ktx2-enabled", true)
	v.SetDefault("draco-bin", "gltfpack")
	v.SetDefault("lod-ratios", []string{"0.5", "0.25"})

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

// ValidateAPI checks fields required by mesh-api.
func (c Config) ValidateAPI() error {
	if c.RedisAddr == "" {
		return fmt.Errorf("config: redis-addr is required")
	}
	return nil
}

// ValidateWorker checks fields required by mesh-worker.
func (c Config) ValidateWorker() error {
	if c.RedisAddr == "" {
		return fmt.Errorf("config: redis-addr is required")
	}
	if c.CatalogGRPCAddr == "" {
		return fmt.Errorf("config: catalog-grpc-addr is required")
	}
	if c.BlobDir == "" {
		return fmt.Errorf("config: blob-dir is required")
	}
	if c.SourceDir == "" {
		return fmt.Errorf("config: source-dir is required")
	}
	return nil
}
