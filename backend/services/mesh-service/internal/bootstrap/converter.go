package bootstrap

import (
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/converter"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/service"
)

// Compile-time assertion: the converter satisfies the service-layer contract.
var _ service.Converter = (*converter.Converter)(nil)

// InitConverter constructs the OBJ→GLB converter with optional GLB
// post-processor (Draco/KTX2 via gltfpack) and optional LOD simplification
// ratios. Pass nil compressor to skip post-processing; pass empty cfg.LODRatios
// to skip LOD generation.
//
// Returns an error if the LOD ratios in config are malformed or out of
// range — fail-fast at boot instead of crashing on the first conversion.
func InitConverter(comp converter.Compressor, cfg config.Config) (*converter.Converter, error) {
	ratios, err := cfg.ParsedLODRatios()
	if err != nil {
		return nil, fmt.Errorf("init converter: %w", err)
	}
	opts := []converter.Option{}
	if comp != nil {
		opts = append(opts, converter.WithCompressor(comp))
	}
	if len(ratios) > 0 {
		opts = append(opts, converter.WithLODRatios(ratios))
	}
	return converter.New(opts...), nil
}
