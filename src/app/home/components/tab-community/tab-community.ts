import { AfterViewChecked, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import {
  COMMUNITY_CATEGORIES, COMMUNITY_PRODUCTS, COMMUNITY_STORIES, CommunityCategoryId,
  filterCommunityStories, matchesTranslatedContent, pageCommunityItems,
} from '../../community-content';

@Component({
  selector: 'app-tab-community',
  templateUrl: 'tab-community.html',
  styleUrls: ['tab-community.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, TranslatePipe],
})
export class TabCommunityComponent implements AfterViewChecked, OnDestroy {
  @ViewChild(IonContent) private content?: IonContent;
  @ViewChild('categoryTabs') private categoryTabs?: ElementRef<HTMLElement>;
  readonly categories = COMMUNITY_CATEGORIES;
  readonly inspirationCards = COMMUNITY_STORIES;
  readonly products = COMMUNITY_PRODUCTS;
  activeCategory: CommunityCategoryId = 'recommended';
  searchVisible = false;
  private keyword = '';
  private readonly positions = Object.fromEntries(COMMUNITY_CATEGORIES.map(({ id }) =>
    [id, { page: 1, scrollTop: 0 }])) as Record<CommunityCategoryId, { page: number; scrollTop: number }>;
  private scrollElement?: HTMLElement;
  private restorePending = false;
  private scrollRevision = 0;
  private destroyed = false;

  get searchKeyword() { return this.keyword; }
  set searchKeyword(value: string) {
    if (value === this.keyword) return;
    this.keyword = value;
    for (const position of Object.values(this.positions)) { position.page = 1; position.scrollTop = 0; }
    this.requestScrollRestore();
  }

  get filteredCards() {
    return filterCommunityStories(this.activeCategory, this.searchKeyword, key => this.translate.instant(key));
  }

  get filteredProducts() {
    if (this.activeCategory !== 'recommended' && this.activeCategory !== 'products') return [];
    return this.products.filter(product => matchesTranslatedContent(
      this.searchKeyword, key => this.translate.instant(key), product.nameKey, product.descriptionKey,
    ));
  }

  get recommendedSections() {
    return this.categories.filter(category => category.id === 'inspiration' || category.id === 'tips')
      .map(category => ({ ...category, cards: filterCommunityStories(
        category.id, this.searchKeyword, key => this.translate.instant(key),
      ).slice(0, 2) })).filter(section => section.cards.length > 0);
  }

  get storyPage() { return pageCommunityItems(this.filteredCards, this.positions[this.activeCategory].page); }
  get productPage() { return pageCommunityItems(this.filteredProducts, this.positions[this.activeCategory].page); }
  get pagination() { return this.activeCategory === 'products' ? this.productPage : this.storyPage; }

  constructor(private translate: TranslateService) {}

  selectCategory(category: CommunityCategoryId) {
    if (category === this.activeCategory) return;
    this.rememberScroll();
    this.activeCategory = category;
    this.requestScrollRestore();
  }

  viewAll(category: CommunityCategoryId) {
    this.selectCategory(category);
    this.positions[category].scrollTop = 0;
    this.requestScrollRestore();
  }

  selectPage(page: number) {
    if (!Number.isSafeInteger(page) || page < 1 || page > this.pagination.pageCount) return;
    this.positions[this.activeCategory] = { page, scrollTop: 0 };
    this.requestScrollRestore();
  }

  toggleSearch() {
    this.searchVisible = !this.searchVisible;
    if (!this.searchVisible) this.searchKeyword = '';
  }

  rememberScroll(event?: { detail: { scrollTop: number } }) {
    if (this.restorePending) return;
    const top = this.scrollElement?.scrollTop ?? event?.detail.scrollTop;
    if (top !== undefined) this.positions[this.activeCategory].scrollTop = Math.max(0, top);
  }

  private requestScrollRestore() { this.restorePending = true; this.scrollRevision++; }

  ngAfterViewChecked() {
    if (!this.restorePending || !this.content) return;
    this.restorePending = false;
    const tabs = this.categoryTabs?.nativeElement;
    const selected = tabs?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (tabs && selected) {
      const start = selected.offsetLeft, end = start + selected.offsetWidth;
      if (start < tabs.scrollLeft) tabs.scrollLeft = start;
      else if (end > tabs.scrollLeft + tabs.clientWidth) tabs.scrollLeft = end - tabs.clientWidth;
    }
    const revision = this.scrollRevision;
    const category = this.activeCategory;
    const top = this.positions[category].scrollTop;
    // Resolve the existing Ionic owner after Angular has rendered the new list.
    // No timers or second scroll container; late results cannot scroll another view.
    void this.content.getScrollElement().then(element => {
      if (this.destroyed || revision !== this.scrollRevision || category !== this.activeCategory) return;
      this.scrollElement = element;
      element.scrollTop = top;
    }).catch(() => { /* Keep content usable without starting a scroll-owner retry loop. */ });
  }

  ngOnDestroy() { this.destroyed = true; this.scrollRevision++; this.scrollElement = undefined; }
}
