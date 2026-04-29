/** Calories from macros: 4 kcal/g protein & carbs, 9 kcal/g fat. */
export function kcalFromMacros(proteinG: number, carbsG: number, fatG: number): number {
  const p = Math.max(0, proteinG);
  const c = Math.max(0, carbsG);
  const f = Math.max(0, fatG);
  return Math.round(4 * p + 4 * c + 9 * f);
}
