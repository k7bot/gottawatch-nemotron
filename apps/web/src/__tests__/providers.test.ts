import { describe, expect, it } from 'vitest';
import { orderServiceOptions, preselectService, providerHint, serviceOptions } from '../logic';

describe('where to watch (TMDB providers, data by JustWatch)', () => {
  it('pre-selects only a lone known service', () => {
    expect(preselectService(['apple_tv'])).toBe('apple_tv');
    expect(preselectService(['netflix', 'hulu'])).toBeNull();
    expect(preselectService([])).toBeNull();
    expect(preselectService(undefined)).toBeNull();
  });
  it('puts known services first, keeps the rest', () => {
    const opts = serviceOptions('live');
    const out = orderServiceOptions(opts, ['hulu', 'netflix']);
    expect(out.slice(0, 2).map((o) => o.value)).toEqual(['hulu', 'netflix']);
    expect(out.length).toBe(opts.length);
    expect(orderServiceOptions(opts, [])).toBe(opts);
  });
  it('gentle hint copy', () => {
    expect(providerHint(['apple_tv'])).toBe("Looks like it's on Apple TV in the US. Change it if they watch somewhere else.");
    expect(providerHint(['netflix', 'hulu', 'max'])).toBe("Looks like it's on Netflix, Hulu and Max in the US. Pick the one they use.");
    expect(providerHint([])).toBeNull();
  });
});
