import { MenuListItem } from '../menu-list/menu-list';

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

export function createProfileMenuGroups(
  stats: ProfileMenuStats
): readonly ProfileMenuGroup[] {
  return [
    {
      id: 'account',
      ariaLabel: '账户功能',
      items: [
        {
          id: 'room',
          title: '区域管理',
          icon: 'fa-house',
          value: `${stats.roomNum} 个区域`,
          route: '/room-manager',
        },
        {
          id: 'automation',
          title: '自动化',
          icon: 'fa-bullseye-pointer',
          value: `${stats.sceneNum} 个场景`,
          route: '/scene-manager',
        },
        {
          id: 'sharing',
          title: '设备共享',
          icon: 'fa-user-group',
          value: `已共享 ${stats.sharedDeviceNum} 台设备`,
          route: '/share-manager',
        },
        {
          id: 'voice-assistant',
          title: '语音助手',
          icon: 'fa-microphone',
          value: '小智',
        },
        {
          id: 'selfhost',
          title: '自建服务器',
          icon: 'fa-server'
        },
      ],
    },
    {
      id: 'settings',
      ariaLabel: '设置与账户',
      items: [
        {
          id: 'settings',
          title: '设置',
          icon: 'fa-gear',
          value: '语言和主题设置',
          route: '/settings',
        },
        {
          id: 'feedback',
          title: '反馈',
          icon: 'fa-circle-question',
          value: '提出建议和反馈问题',
          route: '/feedback',
        },
        {
          id: 'about',
          title: '关于我们',
          icon: 'fa-building',
          value: '了解点灯科技',
          route: '/about',
        },
        {
          id: 'logout',
          title: '退出登录',
          icon: 'fa-arrow-right-from-bracket',
          danger: true,
          showChevron: false,
        },
      ],
    },
  ];
}
