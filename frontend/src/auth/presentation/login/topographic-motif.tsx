export default function TopographicMotif() {
  // Concentric contour rings evoking terrain/territories. Pure SVG, GPU-cheap.
  const rings = Array.from({ length: 9 }, (_, i) => 120 + i * 64);
  return (
    <svg
      aria-hidden
      className="absolute inset-0 h-full w-full opacity-[0.18] motion-safe:animate-[drift_40s_ease-in-out_infinite]"
      viewBox="0 0 600 600"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id="c" cx="50%" cy="30%">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
        </radialGradient>
      </defs>
      {rings.map((r) => (
        <circle key={r} cx="300" cy="200" r={r} fill="none" stroke="url(#c)" strokeWidth="1" />
      ))}
    </svg>
  );
}
