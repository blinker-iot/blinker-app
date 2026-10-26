import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { TabCommunityComponent } from './tab-community';

const labels: Record<string, string> = {
  SEARCH: 'Search content', CLOSE_SEARCH: 'Close search', CATEGORY_FILTER: 'Filter content',
  SEARCH_PLACEHOLDER: 'Search ideas, products, and tips',
  CATEGORY_RECOMMENDED: 'Recommended', CATEGORY_INSPIRATION: 'Smart ideas',
  CATEGORY_PRODUCTS: 'Product guide', CATEGORY_TIPS: 'Tips', CATEGORY_EVENTS: 'Events',
  SMART_INSPIRATION: 'Smart ideas', COMING_SOON: 'Coming soon',
  VIEW_ALL: 'View all', PRODUCT_PREVIEW: 'Product preview',
  PREVIOUS_PAGE: 'Previous page', NEXT_PAGE: 'Next page',
  PAGE_STATUS: 'Page {{page}} of {{total}}', PAGINATION: 'Content pages',
  DAILY_CLEANING_TITLE: 'Everyday cleaning automation',
  DAILY_CLEANING_DESCRIPTION: 'Set a schedule and come home to a tidy space',
  KITCHEN_AIR_TITLE: 'Kitchen air management guide',
  KITCHEN_AIR_DESCRIPTION: 'Link cooking-fume detection with air purification',
  OMNI_STATION_NAME: 'Omni Base Station',
  OMNI_STATION_DESCRIPTION: 'Cleaning, dust collection, and drying in one',
  LOCAL_PREVIEW_NOTE: 'Local examples for preview only.',
  PRODUCT_PREVIEW_STATUS: 'Product example, not a release announcement.',
  NO_RESULTS: 'No matching content. Change category or keyword.',
  DAILY_CLEANING_META: '8 min read · 12K views',
  KITCHEN_AIR_META: '6 min read · 8,643 views',
  OMNI_STATION_LAUNCH: 'Coming in Q3 2026',
};

const categories = [
  ['recommended', 2, 1], ['inspiration', 1, 0], ['products', 0, 1],
  ['tips', 1, 0], ['events', 0, 0],
] as const;

describe('discover local content filtering', () => {
  function component() {
    return new TabCommunityComponent({
      instant: (key: string) => labels[key.replace(/^COMMUNITY\./, '')] ?? key,
    } as TranslateService);
  }

  it.each(categories)('filters %s consistently across stories and products', (id, stories, products) => {
    const page = component();
    page.selectCategory(id);
    expect(page.filteredCards).toHaveLength(stories);
    expect(page.filteredProducts).toHaveLength(products);
  });

  it.each([
    ['  CLEANING AUTOMATION  ', 1, 0], ['tidy', 1, 0], ['FUME', 1, 0],
    ['  OMNI  ', 0, 1], ['DRYING', 0, 1], ['not-in-local-content', 0, 0],
  ] as const)('matches translated titles and descriptions for %s', (keyword, stories, products) => {
    const page = component();
    page.searchKeyword = keyword;
    expect(page.filteredCards).toHaveLength(stories);
    expect(page.filteredProducts).toHaveLength(products);
  });

  it('does not let search bypass category filtering and clears it only when closed', () => {
    const page = component();
    page.toggleSearch();
    page.searchKeyword = 'omni';
    page.selectCategory('inspiration');
    expect(page.searchKeyword).toBe('omni');
    expect(page.filteredCards).toHaveLength(0);
    expect(page.filteredProducts).toHaveLength(0);
    page.toggleSearch();
    expect(page.searchVisible).toBe(false);
    expect(page.searchKeyword).toBe('');
    expect(page.filteredCards).toHaveLength(1);
    expect(page.filteredProducts).toHaveLength(0);
  });
});

describe('discover production template', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function render() {
    await TestBed.configureTestingModule({
      imports: [TabCommunityComponent],
      providers: [provideRouter([]), provideIonicAngular({ animated: false }), provideTranslateService()],
    }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('discover-test', {
      NAVIGATION: { COMMUNITY: 'Discover' }, COMMUNITY: labels,
    });
    translate.use('discover-test');
    const fixture = TestBed.createComponent(TabCommunityComponent);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('keeps both original stories in truthful recommendation groups and the original product without a fictional pager', async () => {
    const h = await render();
    const header = h.element.querySelector('ion-header')!;
    for (const name of ['main-tab-header', 'home-tab-header', 'discover-header']) {
      expect(header.classList).toContain(name);
    }
    expect(h.element.querySelectorAll('.content-section')).toHaveLength(3);
    expect(h.element.querySelectorAll('.inspiration-grid .story-card')).toHaveLength(2);
    expect(h.element.querySelectorAll('.product-list .product-card')).toHaveLength(1);
    expect(h.element.querySelector('.local-preview-note')?.textContent?.trim()).toBe(labels['LOCAL_PREVIEW_NOTE']);
    expect(h.element.querySelector('.product-copy small')?.textContent?.trim()).toBe(labels['PRODUCT_PREVIEW_STATUS']);
    expect(h.element.querySelector('.no-result')).toBeNull();
    expect(h.element.querySelector('.story-copy small')).toBeNull();
    expect(h.element.querySelectorAll('.view-all')).toHaveLength(3);
    expect(h.element.querySelector('a.view-all, .product-card button, .content-pagination')).toBeNull();
    expect([...h.element.querySelectorAll('.story-image .category-label')].map(label => label.textContent?.trim()))
      .toEqual([labels['CATEGORY_INSPIRATION'], labels['CATEGORY_TIPS']]);
    for (const key of ['DAILY_CLEANING_META', 'KITCHEN_AIR_META', 'OMNI_STATION_LAUNCH']) {
      expect(h.element.textContent).not.toContain(labels[key]);
    }
    expect(h.element.textContent).not.toContain('COMMUNITY.');
  });

  it.each(categories)('selects %s through native filters without an unrelated empty section', async (id, stories, products) => {
    const h = await render();
    const filters = h.element.querySelector('.category-tabs')!;
    expect(filters.getAttribute('role')).toBe('group');
    expect(filters.getAttribute('aria-label')).toBe(labels['CATEGORY_FILTER']);
    const buttons = Array.from(filters.querySelectorAll<HTMLButtonElement>('button'));
    const index = h.fixture.componentInstance.categories.findIndex(category => category.id === id);
    buttons[index].click();
    await h.fixture.whenStable();
    expect(buttons[index].getAttribute('aria-pressed')).toBe('true');
    expect(filters.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
    expect(filters.querySelector('[role="tab"], [aria-selected]')).toBeNull();
    expect(buttons.every(button => button.getAttribute('aria-controls') === 'community-results')).toBe(true);
    expect(h.element.querySelectorAll('.story-card, .collection-project')).toHaveLength(stories);
    expect(h.element.querySelectorAll('.product-card')).toHaveLength(products);
    expect(h.element.querySelectorAll('.content-section')).toHaveLength(id === 'recommended' ? 3 : Number(stories > 0) + Number(products > 0));
    if (id !== 'recommended') {
      expect(h.element.querySelector('.story-image .category-label, .collection-type, .view-all')).toBeNull();
      expect(h.element.querySelectorAll('.collection-project')).toHaveLength(stories);
    }
    expect(h.element.querySelector('.content-pagination')).toBeNull();
    expect(h.element.querySelectorAll('.no-result')).toHaveLength(id === 'events' ? 1 : 0);
    if (id === 'events') {
      expect(h.element.querySelector('.no-result')?.getAttribute('role')).toBe('status');
    }
  });

  it.each(['inspiration', 'tips', 'products'] as const)('view all selects %s inside this component without an independent page', async category => {
    const h = await render();
    const content = h.element.querySelector('ion-content');
    h.element.querySelector<HTMLButtonElement>(`.view-all[data-category="${category}"]`)!.click();
    await h.fixture.whenStable();
    expect(h.fixture.componentInstance.activeCategory).toBe(category);
    expect(h.element.querySelector('.category-tabs [aria-pressed="true"]')?.getAttribute('data-category')).toBe(category);
    expect(h.element.querySelector('ion-content')).toBe(content);
    expect(h.element.querySelector('ion-back-button, .view-all, .category-label')).toBeNull();
    expect(h.element.querySelectorAll(category === 'products' ? '.product-card' : '.collection-project')).toHaveLength(1);
  });

  it('keeps search constraints when viewing all rather than silently showing an unrelated set', async () => {
    const h = await render();
    h.element.querySelector<HTMLElement>('.header-action')!.click();
    await h.fixture.whenStable();
    const search = h.element.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'FUME';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await h.fixture.whenStable();
    expect(h.element.querySelector('.view-all[data-category="inspiration"]')).toBeNull();
    h.element.querySelector<HTMLButtonElement>('.view-all[data-category="tips"]')!.click();
    await h.fixture.whenStable();
    expect(h.fixture.componentInstance.searchKeyword).toBe('FUME');
    expect(h.element.querySelector('.collection-title')?.textContent).toContain(labels['KITCHEN_AIR_TITLE']);
  });

  it('bounds a controlled 13-record test fixture to 12 then 1, without appending or changing the production source', async () => {
    const h = await render();
    const source = h.fixture.componentInstance.inspirationCards;
    const fixtureRecords = Array.from({ length: 13 }, (_, index) => ({ ...source[0], titleKey: `test-only-${index}` }));
    vi.spyOn(h.fixture.componentInstance, 'filteredCards', 'get').mockReturnValue(fixtureRecords);
    h.element.querySelector<HTMLButtonElement>('.category-tabs [data-category="inspiration"]')!.click();
    await h.fixture.whenStable();
    expect(h.element.querySelectorAll('.collection-project')).toHaveLength(12);
    const buttons = () => [...h.element.querySelectorAll<HTMLButtonElement>('.content-pagination button')];
    expect(buttons()[0].disabled).toBe(true);
    buttons()[1].click();
    await h.fixture.whenStable();
    expect(h.element.querySelectorAll('.collection-project')).toHaveLength(1);
    expect(buttons()[1].disabled).toBe(true);
    buttons()[0].click();
    await h.fixture.whenStable();
    expect(h.element.querySelectorAll('.collection-project')).toHaveLength(12);
    expect(source).toHaveLength(2);
  });

  it('connects the named search control to its field and filters products through real input events', async () => {
    const h = await render();
    const toggle = h.element.querySelector<HTMLElement>('.header-action')!;
    expect(toggle.getAttribute('aria-label')).toBe(labels['SEARCH']);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(h.element.querySelector(`#${toggle.getAttribute('aria-controls')}`)).not.toBeNull();
    toggle.click();
    await h.fixture.whenStable();
    expect(toggle.getAttribute('aria-label')).toBe(labels['CLOSE_SEARCH']);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const input = h.element.querySelector<HTMLInputElement>('input[type="search"]')!;
    expect(input.getAttribute('aria-label')).toBe(labels['SEARCH']);
    expect(input.getAttribute('aria-controls')).toBe('community-results');
    input.value = '  oMNi  ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await h.fixture.whenStable();
    expect(h.element.querySelectorAll('.story-card')).toHaveLength(0);
    expect(h.element.querySelectorAll('.product-card')).toHaveLength(1);
    expect(h.element.querySelectorAll('.content-section')).toHaveLength(1);
    expect(h.element.querySelector('.no-result')).toBeNull();
    toggle.click();
    await h.fixture.whenStable();
    expect(h.element.querySelector('input[type="search"]')).toBeNull();
    expect(h.fixture.componentInstance.searchKeyword).toBe('');
    expect(h.element.querySelectorAll('.story-card')).toHaveLength(2);
    expect(h.element.querySelectorAll('.product-card')).toHaveLength(1);
  });

  it('shows one status for an unmatched search and hides all decorative icons from assistive technology', async () => {
    const h = await render();
    h.element.querySelector<HTMLElement>('.header-action')!.click();
    await h.fixture.whenStable();
    const input = h.element.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = 'not-in-local-content';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await h.fixture.whenStable();
    expect(h.element.querySelectorAll('.no-result[role="status"]')).toHaveLength(1);
    expect(h.element.querySelector('.no-result')?.textContent).toContain(labels['NO_RESULTS']);
    expect(h.element.querySelectorAll('.content-section')).toHaveLength(0);
    for (const icon of h.element.querySelectorAll('i')) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    }
  });
});
