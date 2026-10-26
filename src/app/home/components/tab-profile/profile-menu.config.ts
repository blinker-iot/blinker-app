import type { MenuListItem } from '../../../core/components/menu-list/menu-list';
import { environment } from 'src/environments/environment';

export interface ProfileMenuStats {
  roomNum: number;
  sharedDeviceNum: number;
}

export interface ProfileMenuGroup {
  id: 'devices' | 'connections' | 'support';
  title?: string;
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
      id: 'devices',
      title: translate('PROFILE.DEVICE_MANAGEMENT'),
      items: [
        {
          id: 'room',
          title: translate('PROFILE.REGION_MANAGEMENT'),
          icon: 'fa-house',
          value: translate('PROFILE.REGION_COUNT', { count: stats.roomNum }),
          route: '/room-manager',
        },
        ...(environment.deployment.automation ? [{
          id: 'automation',
          title: translate('PROFILE.AUTOMATION'),
          icon: 'fa-bullseye-pointer',
          route: '/automation-manager',
        }] : []),
        {
          id: 'sharing',
          title: translate('PROFILE.DEVICE_SHARING'),
          icon: 'fa-user-group',
          value: translate('PROFILE.SHARED_DEVICE_COUNT', {
            count: stats.sharedDeviceNum,
          }),
          route: '/share-manager',
        },
      ],
    },
    {
      id: 'connections',
      title: translate('PROFILE.CONNECTION_AND_SERVICES'),
      items: [
        {
          id: 'selfhost',
          title: translate('PROFILE.SELF_HOSTED_SERVER'),
          icon: 'fa-server',
          route: '/self-hosted-server',
        },
        {
          id: 'third-party-services',
          title: translate('PROFILE.THIRD_PARTY_SERVICES'),
          icon: 'fa-plug',
          route: '/third-party-services',
        },
      ],
    },
    {
      id: 'support',
      items: [
        {
          id: 'feedback',
          title: translate('PROFILE.FEEDBACK'),
          route: '/feedback',
        },
        {
          id: 'about',
          title: translate('PROFILE.ABOUT_US'),
          route: '/about',
        },
        {
          id: 'logout',
          title: translate('PROFILE.LOGOUT'),
          danger: true,
          showChevron: false,
        },
      ],
    },
  ];
}
