// formatDistance turns a source-unit value into a human-readable label
// with an appropriate unit suffix. Source meshes for the viewer are
// territory-scale photogrammetry whose OBJ coordinates are in metres,
// so non-fallback values render as km / m / cm / mm depending on
// magnitude. When unitRatio is exactly 1 the metadata bbox was missing
// and we cannot trust the scale — the value is suffixed "u" so the
// reader knows these are raw scene units, not metres.
export function formatDistance(value: number, unitRatio: number): string {
  if (unitRatio === 1) return `${formatRaw(value)} u`;
  const abs = Math.abs(value);
  if (abs >= 1000) return `${(value / 1000).toFixed(2)} km`;
  if (abs >= 1) return `${value.toFixed(2)} m`;
  if (abs >= 0.01) return `${(value * 100).toFixed(1)} cm`;
  return `${(value * 1000).toFixed(0)} mm`;
}

function formatRaw(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100) return value.toFixed(1);
  if (abs >= 1) return value.toFixed(2);
  return value.toFixed(3);
}
