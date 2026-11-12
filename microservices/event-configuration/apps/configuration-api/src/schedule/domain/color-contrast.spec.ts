import { describe, expect, it } from 'vitest';
import { contrastRatioAgainstWhite, hasAccessibleContrast } from './color-contrast';

describe('program color contrast', () => {
  it('accepts a color at or above the WCAG 4.5:1 threshold', () => {
    expect(hasAccessibleContrast('#767676')).toBe(true);
    expect(contrastRatioAgainstWhite('#767676')).toBeGreaterThanOrEqual(4.5);
  });

  it('rejects a color below the WCAG 4.5:1 threshold', () => {
    expect(hasAccessibleContrast('#777777')).toBe(false);
  });

  it('fails closed for malformed colors', () => {
    expect(hasAccessibleContrast('not-a-color')).toBe(false);
  });
});
