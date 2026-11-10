const WORDS = 8;
const RATIO = 0.7;

function bits(value: number): number {
  value -= (value >>> 1) & 0x55555555;
  value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
  return (((value + (value >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Brute-force Hamming matching with a ratio test and one query per target. */
export function matchDescriptors(query: Uint32Array, target: Uint32Array): { query: number; target: number }[] {
  const winners = new Map<number, { query: number; target: number; distance: number }>();
  for (let i = 0; i + WORDS <= query.length; i += WORDS) {
    let best = 257,
      second = 257,
      at = -1;
    for (let j = 0; j + WORDS <= target.length; j += WORDS) {
      let distance = 0;
      for (let k = 0; k < WORDS; k++) distance += bits(query[i + k] ^ target[j + k]);
      if (distance < best) {
        second = best;
        best = distance;
        at = j / WORDS;
      } else if (distance < second) second = distance;
    }
    if (at < 0 || best >= RATIO * second || second === 257) continue;
    const previous = winners.get(at);
    if (!previous || best < previous.distance) winners.set(at, { query: i / WORDS, target: at, distance: best });
  }
  return [...winners.values()].map(({ query: q, target: t }) => ({ query: q, target: t }));
}
