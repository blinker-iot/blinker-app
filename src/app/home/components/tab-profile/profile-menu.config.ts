import { MenuListItem } from '../../../core/components/menu-list/menu-list';

export interface ProfileMenuStats {
  roomNum: number;
  sceneNum: number;
  sharedDeviceNum: number;
}

export interface ProfileMenuGroup {
  id: string;
  ariaLabel: string;
  items: readonly MenuListItem[];
}

type ProfileMenuTranslate = (
  key: string,
  params?: Record<string, unknown>
) => string;

export function createProfileMenuGroups(
  stats: ProfileMenuStats,
  translate: ProfileMenuTranslate
): readonly ProfileMenuGroup[] {
  return [
    {
      id: 'account',
      ariaLabel: translate('PROFILE.ACCOUNT_FEATURES'),
      items: [
        {
          id: 'room',
          title: translate('PROFILE.REGION_MANAGEMENT'),
          icon: 'fa-house',
          value: translate('PROFILE.REGION_COUNT', { count: stats.roomNum }),
          route: '/room-manager',
        },
        {
          id: 'automation',
          title: translate('PROFILE.AUTOMATION'),
          icon: 'fa-bullseye-pointer',
          value: translate('PROFILE.SCENE_COUNT', { count: stats.sceneNum }),
          route: '/scene-manager',
        },
        {
          id: 'sharing',
          title: translate('PROFILE.DEVICE_SHARING'),
          icon: 'fa-user-group',
          value: translate('PROFILE.SHARED_DEVICE_COUNT', {
            count: stats.sharedDeviceNum,
          }),
          route: '/share-manager',
        },
        {
          id: 'selfhost',
          title: translate('PROFILE.SELF_HOSTED_SERVER'),
          icon: 'fa-server',
          value: translate('PROFILE.SELF_HOSTED_SERVER_DESCRIPTION'),
          route: '/self-hosted-server',
        },
      ],
    },
    {
      id: 'settings',
      ariaLabel: translate('PROFILE.SETTINGS_AND_ACCOUNT'),
      items: [
        {
          id: 'settings',
          title: translate('PROFILE.SETTINGS'),
          icon: 'fa-gear',
          value: translate('PROFILE.SETTINGS_DESCRIPTION'),
          route: '/settings',
        },
        {
          id: 'feedback',
          title: translate('PROFILE.FEEDBACK'),
          icon: 'fa-circle-question',
          value: translate('PROFILE.FEEDBACK_DESCRIPTION'),
          route: '/feedback',
        },
        {
          id: 'about',
          title: translate('PROFILE.ABOUT_US'),
          icon: 'fa-building',
          value: translate('PROFILE.ABOUT_US_DESCRIPTION'),
          route: '/about',
        },
        {
          id: 'logout',
          title: translate('PROFILE.LOGOUT'),
          icon: 'fa-arrow-right-from-bracket',
          danger: true,
          showChevron: false,
        },
      ],
    },
  ];
}
