// Conversion helpers between the angular units carried in the domain
// (radians, server contract) and the units rendered to humans (degrees,
// in the placement form).
const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

export function radToDeg(rad: number): number {
  return rad * RAD_TO_DEG;
}

export function degToRad(deg: number): number {
  return deg * DEG_TO_RAD;
}

// roundAxis trims a transform component to 4 decimals — enough precision
// for sub-millimetre placement at the scale the converter produces, while
// keeping form inputs readable.
export function roundAxis(n: number): number {
  return Number(n.toFixed(4));
}
