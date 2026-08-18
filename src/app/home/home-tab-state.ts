export type HomeTabId = 'device' | 'community' | 'tools' | 'profile';

const HOME_TAB_IDS: readonly HomeTabId[] = [
  'device',
  'community',
  'tools',
  'profile',
];

export function asHomeTabId(tab: string | null): HomeTabId | undefined {
  return HOME_TAB_IDS.find((homeTab) => homeTab === tab);
}
