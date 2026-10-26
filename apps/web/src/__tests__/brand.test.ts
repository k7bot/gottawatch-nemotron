import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { BrandLockup } from '../brand';

describe('BrandLockup', () => {
  it('always renders the eye together with the two-tone wordmark', () => {
    const html = renderToStaticMarkup(createElement(BrandLockup));
    expect(html).toContain('class="eyemark"');
    expect(html).toContain('Gotta<span class="wm-accent">watch</span>');
    expect(html).toContain('aria-label="Gottawatch"');
  });
});
