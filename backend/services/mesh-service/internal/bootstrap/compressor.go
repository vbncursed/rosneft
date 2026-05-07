package bootstrap

import (
	"context"
	"log/slog"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/compression"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/converter"
)

// InitCompressor returns the GLB post-processor wired into the converter.
//
// Each optimisation (Draco, KTX2) is opt-in via its own env flag. When all
// flags are off, returns nil — converter.New treats nil compressor as "skip
// the post-process step". When any flag is on, runs a preflight against the
// configured `gltfpack` binary so a misconfigured deployment fails at boot
// rather than at the first conversion.
func InitCompressor(ctx context.Context, cfg config.Config, logger *slog.Logger) (converter.Compressor, error) {
	opts := buildCompressorOptions(cfg)
	if len(opts) == 0 {
		logger.Info("compressor: all optimisations disabled")
		return nil, nil
	}

	o := compression.New(cfg.DracoBin, opts...)
	if err := o.Available(ctx); err != nil {
		return nil, err
	}
	logger.Info("compressor: enabled",
		slog.String("binary", cfg.DracoBin),
		slog.Bool("draco", cfg.DracoEnabled),
		slog.Bool("ktx2", cfg.KTX2Enabled),
	)
	return o, nil
}

// buildCompressorOptions translates the boolean config flags into
// functional options. Kept separate so the wiring can be tested without
// running Available().
func buildCompressorOptions(cfg config.Config) []compression.Option {
	var opts []compression.Option
	if cfg.DracoEnabled {
		opts = append(opts, compression.WithDraco())
	}
	if cfg.KTX2Enabled {
		opts = append(opts, compression.WithKTX2())
	}
	return opts
}
