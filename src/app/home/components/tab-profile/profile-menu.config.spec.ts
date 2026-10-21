import { describe, expect, it } from 'vitest';

import { createProfileMenuGroups } from './profile-menu.config';
import { environment } from 'src/environments/environment';
import { cloudBetaCapabilities, localCapabilities } from 'src/environments/deployment';

const originalDeployment = environment.deployment;
beforeEach(() => { environment.deployment = localCapabilities; });
afterEach(() => { environment.deployment = originalDeployment; });

describe('profile automation entry', () => {
  it('hides closed automation while retaining non-directed sharing', () => {
    environment.deployment = cloudBetaCapabilities;
    try {
      const items = createProfileMenuGroups({ roomNum: 0, sharedDeviceNum: 0 }, key => key).flatMap(group => group.items);
      expect(items.some(item => item.id === 'automation')).toBe(false);
      expect(items.find(item => item.id === 'sharing')?.route).toBe('/share-manager');
    } finally { environment.deployment = localCapabilities; }
  });
  it('opens the real automation list without a legacy scene count', () => {
    const menu = createProfileMenuGroups({ roomNum: 2, sharedDeviceNum: 1 }, key => key);
    const automation = menu.flatMap(group => group.items).find(item => item.id === 'automation');
    expect(automation?.route).toBe('/automation-manager');
    expect(automation?.title).toBe('PROFILE.AUTOMATION');
    expect(automation?.value).toBeUndefined();
  });
  it('adds only one automation entry when automation alone is available', () => {
    environment.deployment = cloudBetaCapabilities;
    const stats = { roomNum: 2, sharedDeviceNum: 1 };
    const closed = createProfileMenuGroups(stats, key => key);
    environment.deployment = { ...cloudBetaCapabilities, automation: true };
    const opened = createProfileMenuGroups(stats, key => key);
    const entries = opened.flatMap(group => group.items);
    expect(entries.filter(item => item.id === 'automation')).toEqual([{
      id: 'automation', title: 'PROFILE.AUTOMATION', icon: 'fa-bullseye-pointer', route: '/automation-manager',
    }]);
    expect(opened.map(group => ({ ...group, items: group.items.filter(item => item.id !== 'automation') }))).toEqual(closed);
    expect(Object.entries(environment.deployment).filter(([, enabled]) => enabled).map(([feature]) => feature)).toEqual(['automation']);
  });
});
