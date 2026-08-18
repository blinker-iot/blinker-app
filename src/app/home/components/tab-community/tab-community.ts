import { Component, ChangeDetectionStrategy } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

type CommunityCategoryId =
  | 'recommended'
  | 'inspiration'
  | 'products'
  | 'tips'
  | 'events';

interface CommunityProduct {
  nameKey: string;
  descriptionKey: string;
  launchKey: string;
  image: string;
}

@Component({
  selector: 'app-tab-community',
  templateUrl: 'tab-community.html',
  styleUrls: ['tab-community.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule, IonicModule, RouterModule, TranslatePipe],
})
export class TabCommunityComponent {
  readonly categories: readonly {
    id: CommunityCategoryId;
    labelKey: string;
  }[] = [
    { id: 'recommended', labelKey: 'COMMUNITY.CATEGORY_RECOMMENDED' },
    { id: 'inspiration', labelKey: 'COMMUNITY.CATEGORY_INSPIRATION' },
    { id: 'products', labelKey: 'COMMUNITY.CATEGORY_PRODUCTS' },
    { id: 'tips', labelKey: 'COMMUNITY.CATEGORY_TIPS' },
    { id: 'events', labelKey: 'COMMUNITY.CATEGORY_EVENTS' },
  ];
  activeCategory: CommunityCategoryId = 'recommended';
  searchVisible = false;
  searchKeyword = '';

  readonly inspirationCards = [
    {
      titleKey: 'COMMUNITY.DAILY_CLEANING_TITLE',
      descriptionKey: 'COMMUNITY.DAILY_CLEANING_DESCRIPTION',
      metaKey: 'COMMUNITY.DAILY_CLEANING_META',
      image: '/img/bg/f1.jpg',
      category: 'inspiration' as CommunityCategoryId,
      categoryKey: 'COMMUNITY.CATEGORY_INSPIRATION',
    },
    {
      titleKey: 'COMMUNITY.KITCHEN_AIR_TITLE',
      descriptionKey: 'COMMUNITY.KITCHEN_AIR_DESCRIPTION',
      metaKey: 'COMMUNITY.KITCHEN_AIR_META',
      image: '/img/bg/f3.jpg',
      category: 'tips' as CommunityCategoryId,
      categoryKey: 'COMMUNITY.CATEGORY_TIPS',
    },
  ];

  readonly products: readonly CommunityProduct[] = [
    {
      nameKey: 'COMMUNITY.OMNI_STATION_NAME',
      descriptionKey: 'COMMUNITY.OMNI_STATION_DESCRIPTION',
      launchKey: 'COMMUNITY.OMNI_STATION_LAUNCH',
      image: '/img/devices/icon/station.png',
    },
  ];

  get filteredCards() {
    const keyword = this.searchKeyword.trim().toLowerCase();
    return this.inspirationCards.filter((card) => {
      const categoryMatched =
        this.activeCategory === 'recommended' ||
        card.category === this.activeCategory;
      const keywordMatched =
        !keyword ||
        `${this.translate.instant(card.titleKey)}${this.translate.instant(
          card.descriptionKey
        )}`
          .toLowerCase()
          .includes(keyword);
      return categoryMatched && keywordMatched;
    });
  }

  constructor(private translate: TranslateService) {}

  selectCategory(category: CommunityCategoryId) {
    this.activeCategory = category;
  }

  toggleSearch() {
    this.searchVisible = !this.searchVisible;
    if (!this.searchVisible) this.searchKeyword = '';
  }
}
