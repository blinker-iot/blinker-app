import { Component, ChangeDetectionStrategy } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-tab-community',
  templateUrl: 'tab-community.html',
  styleUrls: ['tab-community.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule, IonicModule, RouterModule],
})
export class TabCommunityComponent {
  readonly categories = ['推荐', '智能灵感', '产品百科', '使用技巧', '活动'];
  activeCategory = '推荐';
  searchVisible = false;
  searchKeyword = '';

  readonly inspirationCards = [
    {
      title: '日常清洁自动化方案',
      description: '设置清洁计划，回家即是整洁',
      meta: '8 分钟阅读 · 1.2 万次浏览',
      image: '/img/bg/f1.jpg',
      category: '智能灵感',
    },
    {
      title: '厨房空气管理指南',
      description: '油烟检测与空气净化联动',
      meta: '6 分钟阅读 · 8,643 次浏览',
      image: '/img/bg/f3.jpg',
      category: '使用技巧',
    },
  ];

  readonly products = [
    {
      name: '全能基站',
      description: '集清洁、集尘与烘干于一体',
      launch: '敬请期待 · 2026 Q3 上线',
      image: '/img/devices/icon/station.png',
    },
  ];

  get filteredCards() {
    const keyword = this.searchKeyword.trim().toLowerCase();
    return this.inspirationCards.filter((card) => {
      const categoryMatched =
        this.activeCategory === '推荐' || card.category === this.activeCategory;
      const keywordMatched =
        !keyword ||
        `${card.title}${card.description}`.toLowerCase().includes(keyword);
      return categoryMatched && keywordMatched;
    });
  }

  selectCategory(category: string) {
    this.activeCategory = category;
  }

  toggleSearch() {
    this.searchVisible = !this.searchVisible;
    if (!this.searchVisible) this.searchKeyword = '';
  }
}
