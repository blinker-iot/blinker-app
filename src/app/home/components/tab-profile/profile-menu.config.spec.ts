import { describe, expect, it } from 'vitest';
import { createProfileMenuGroups } from './profile-menu.config';

describe('profile automation entry', () => {
  it('opens the real automation list without a legacy scene count', () => {
    const menu = createProfileMenuGroups({ roomNum: 2, sharedDeviceNum: 1 }, key => key);
    const automation = menu.flatMap(group => group.items).find(item => item.id === 'automation');
    expect(automation?.route).toBe('/automation-manager');
    expect(automation?.title).toBe('PROFILE.AUTOMATION');
    expect(automation?.value).toBeUndefined();
  });
});
