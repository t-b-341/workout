/** Compute plates per side for a barbell load (45 lb bar). */
export function platesPerSide(totalLb: number, barLb = 45): string | null {
  const side = (totalLb - barLb) / 2;
  if (side <= 0 || !Number.isFinite(side)) return null;
  const denominations = [45, 35, 25, 10, 5, 2.5];
  let remaining = side;
  const used: number[] = [];
  for (const d of denominations) {
    while (remaining + 1e-6 >= d) {
      used.push(d);
      remaining -= d;
    }
  }
  if (Math.abs(remaining) > 0.01) return null;
  return used.map((p) => (Number.isInteger(p) ? `${p}` : `${p}`)).join(' + ');
}
