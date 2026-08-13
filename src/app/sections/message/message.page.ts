import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';

type MessageCategory = 'system' | 'device' | 'share' | 'interaction';

interface DemoMessage {
  id: number;
  title: string;
  content: string;
  time: string;
  category: MessageCategory;
  icon: string;
  unread: boolean;
}

@Component({
  selector: 'app-message',
  templateUrl: './message.page.html',
  styleUrls: ['./message.page.scss'],
  standalone: true,
  imports: [IonicModule, RouterModule],
})
export class MessagePage {
  readonly filters: Array<{ label: string; value: 'all' | MessageCategory }> = [
    { label: '全部', value: 'all' },
    { label: '系统', value: 'system' },
    { label: '设备', value: 'device' },
    { label: '分享', value: 'share' },
  ];

  activeFilter: 'all' | MessageCategory = 'all';
  messages: DemoMessage[] = [
    {
      id: 1,
      title: '系统通知',
      content: '点灯 2.4.1 版本已发布，点击查看更新内容。',
      time: '10:30',
      category: 'system',
      icon: 'fa-light fa-bell',
      unread: true,
    },
    {
      id: 2,
      title: '设备通知',
      content: '客厅的扫地机器人已完成清洁。',
      time: '09:15',
      category: 'device',
      icon: 'fa-light fa-robot',
      unread: true,
    },
    {
      id: 3,
      title: '设备分享',
      content: '李想邀请你共享「客厅的空气净化器」。',
      time: '昨天',
      category: 'share',
      icon: 'fa-light fa-share-nodes',
      unread: true,
    },
    {
      id: 4,
      title: '互动消息',
      content: '小北回复了你的评论。',
      time: '星期二',
      category: 'interaction',
      icon: 'fa-light fa-message-dots',
      unread: true,
    },
  ];

  get visibleMessages() {
    return this.activeFilter === 'all'
      ? this.messages
      : this.messages.filter(
          (message) => message.category === this.activeFilter
        );
  }

  get unreadCount() {
    return this.messages.filter((message) => message.unread).length;
  }

  selectFilter(filter: 'all' | MessageCategory) {
    this.activeFilter = filter;
  }

  openMessage(message: DemoMessage) {
    message.unread = false;
  }

  markAllRead() {
    this.messages.forEach((message) => (message.unread = false));
  }

  deleteMessage(message: DemoMessage, event: Event) {
    event.stopPropagation();
    this.messages = this.messages.filter((item) => item.id !== message.id);
  }
}
