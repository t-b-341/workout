import { describe, expect, it } from 'vitest';
import { kcalFromMacros } from '../src/lib/macros';

describe('kcalFromMacros', () => {
  it('uses 4/4/9 kcal per gram and rounds', () => {
    expect(kcalFromMacros(200, 250, 80)).toBe(2520);
    expect(kcalFromMacros(0, 0, 0)).toBe(0);
    expect(kcalFromMacros(185, 374, 75)).toBe(2911);
  });

  it('clamps negative grams to zero per macro', () => {
    expect(kcalFromMacros(-10, 100, 10)).toBe(kcalFromMacros(0, 100, 10));
  });
});
