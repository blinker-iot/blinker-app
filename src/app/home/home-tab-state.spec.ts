import { asHomeTabId } from './home-tab-state';

describe('home tab identifiers', () => {
  it('accepts only known tab identifiers', () => {
    expect(asHomeTabId('tools')).toBe('tools');
    expect(asHomeTabId('unknown')).toBeUndefined();
    expect(asHomeTabId(null)).toBeUndefined();
  });
});
