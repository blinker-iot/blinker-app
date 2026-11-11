// Source/pure-content contracts only. Genuine Angular template and Ionic-stack
// interaction checks live beside the production component, not in this fixture.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { compile, contentModule, read, sourcePaths } from './discovery-collection.browser.mjs';

test('shared discovery content preserves exactly the original two stories and one product without fictional statistics', () => {
  const content = contentModule();
  assert.deepEqual(Array.from(content.COMMUNITY_STORIES, story => story.titleKey), [
    'COMMUNITY.DAILY_CLEANING_TITLE', 'COMMUNITY.KITCHEN_AIR_TITLE',
  ]);
  assert.deepEqual(Array.from(content.COMMUNITY_STORIES, story => story.category), ['inspiration', 'tips']);
  assert.equal(content.COMMUNITY_PRODUCTS.length, 1);
  assert.equal(content.COMMUNITY_PRODUCTS[0].nameKey, 'COMMUNITY.OMNI_STATION_NAME');
  for (const item of [...content.COMMUNITY_STORIES, ...content.COMMUNITY_PRODUCTS]) {
    assert.ok(item.imageSrc && !/^https?:/.test(item.imageSrc), 'Use existing local decorative assets');
    assert.ok(existsSync(new URL(`../public/${item.imageSrc.replace(/^\//, '')}`, import.meta.url)), item.imageSrc);
    assert.equal(Object.keys(item).some(key => /views|saves|stats|readtime|launch/i.test(key)), false, 'Do not promote prototype sample metadata to App facts');
    assert.equal(item.typeKey, undefined, 'Do not keep a second cases/tutorial type taxonomy');
    assert.equal(item.categoryKey, undefined, 'Resolve categories through the shared dictionary');
  }
});

test('the shared translated-keyword filter stays pure and keeps category and keyword constraints independent', () => {
  const source = read(sourcePaths.content), content = contentModule();
  assert.equal(typeof content.matchesTranslatedContent, 'function');
  assert.equal(typeof content.filterCommunityStories, 'function');
  assert.doesNotMatch(source, /HttpClient|fetch\s*\(|XMLHttpRequest|DataService|AuthService|@Injectable|localStorage|sessionStorage/);
  const labels = {
    'COMMUNITY.DAILY_CLEANING_TITLE': 'Everyday cleaning automation',
    'COMMUNITY.DAILY_CLEANING_DESCRIPTION': 'Come home to a tidy space',
    'COMMUNITY.KITCHEN_AIR_TITLE': 'Kitchen air management guide',
    'COMMUNITY.KITCHEN_AIR_DESCRIPTION': 'Link fume detection with air purification',
  };
  const translate = key => labels[key] ?? key;
  for (const [category, keyword, expected] of [
    ['recommended', '', 2], ['inspiration', '', 1], ['tips', '', 1],
    ['products', '', 0], ['events', '', 0], ['recommended', '  CLEANING AUTOMATION  ', 1],
    ['recommended', 'tidy', 1], ['tips', 'FUME', 1], ['inspiration', 'fume', 0],
    ['recommended', 'not-in-translated-content', 0],
  ]) assert.equal(content.filterCommunityStories(category, keyword, translate).length, expected, `${category}/${keyword}`);
  assert.equal(content.matchesTranslatedContent('  AIR  ', translate, 'COMMUNITY.KITCHEN_AIR_TITLE'), true);
  assert.equal(content.matchesTranslatedContent('COMMUNITY.DAILY', translate, 'COMMUNITY.DAILY_CLEANING_TITLE'), false,
    'Match translated content, not translation-key spelling');
  assert.match(read(`${sourcePaths.home}.ts`), /filterCommunityStories/);
  assert.doesNotMatch(read(`${sourcePaths.home}.ts`), /private\s+matchesKeyword/);
});

test('view all selects the existing same-page category and the retired independent route is gone', () => {
  const html = read(`${sourcePaths.home}.html`), routes = read(sourcePaths.routes);
  assert.match(html, /<button\b[^>]*class="view-all"/);
  assert.match(html, /data-category/);
  assert.match(html, /\(click\)="viewAll\(/);
  assert.doesNotMatch(html, /RouterLink|routerLink|ion-back-button|inspiration-collection/);
  assert.doesNotMatch(routes, /inspiration-collection/);
  for (const extension of ['ts', 'html', 'scss']) assert.equal(existsSync(new URL(`../${sourcePaths.retiredCollection}.${extension}`, import.meta.url)), false);
  assert.doesNotMatch(read(`${sourcePaths.home}.ts`), /HttpClient|DataService|AuthService|DeviceService|RouterLink|navigateRoot|replaceUrl/);
});

test('one category dictionary and same-page B directories preserve native filters without fictional stats', () => {
  const html = read(`${sourcePaths.home}.html`), source = read(`${sourcePaths.home}.ts`), content = contentModule();
  assert.deepEqual(Array.from(content.COMMUNITY_CATEGORIES, category => category.id), ['recommended', 'inspiration', 'products', 'tips', 'events']);
  assert.match(source, /COMMUNITY_CATEGORIES/);
  for (const marker of ['category-tabs', 'category-label', 'collection-directory',
    'collection-project', 'collection-title', 'collection-cover', 'collection-summary']) assert.ok(html.includes(marker), marker);
  assert.match(html, /\[attr\.aria-pressed\]/);
  assert.match(html, /aria-controls=/);
  assert.match(html, /<img\b[^>]*alt=""/);
  assert.doesNotMatch(html, /project-meta|project-stat|collection-type|category-type|\(click\)="[^\"]*(?:save|openStory)/i);
  assert.match(html, /\[attr\.aria-expanded\]="searchVisible"/);
});

test('local pagination uses twelve-item slices without adding feed data or pretending the actual categories have multiple pages', () => {
  const content = contentModule(), items = Array.from({ length: 13 }, (_, id) => ({ id }));
  assert.equal(typeof content.pageCommunityItems, 'function');
  const first = content.pageCommunityItems(items, 1), second = content.pageCommunityItems(items, 2);
  assert.equal(first.page, 1); assert.equal(first.pageCount, 2); assert.equal(first.total, 13);
  assert.deepEqual(Array.from(first.items, item => item.id), Array.from({ length: 12 }, (_, id) => id));
  assert.equal(second.page, 2); assert.deepEqual(Array.from(second.items, item => item.id), [12]);
  assert.equal(content.pageCommunityItems(items.slice(0, 12), 1).pageCount, 1);
  assert.equal(items.length, 13, 'Pure test fixtures must not be mutated');
  for (const category of ['inspiration', 'tips']) assert.equal(content.pageCommunityItems(
    content.filterCommunityStories(category, '', key => key), 1).pageCount, 1);
  assert.equal(content.pageCommunityItems(content.COMMUNITY_PRODUCTS, 1).pageCount, 1);
});

test('actual discovery styles keep horizontal recommendations, B directory and wrapping rather than clipped summaries', () => {
  const source = read(`${sourcePaths.home}.scss`);
  assert.match(source, /settings-surface/);
  assert.doesNotMatch(source, /::ng-deep|line-clamp|text-overflow:\s*ellipsis/);
  const css = compile(`${sourcePaths.home}.scss`);
  for (const selector of ['.collection-directory', '.collection-project', '.collection-cover', '.collection-summary']) assert.ok(css.includes(selector), selector);
  assert.match(css, /object-fit:\s*contain/);
  assert.match(css, /min-height:\s*48px/);
  assert.ok(css.includes('.story-card') && css.includes('.view-all'));
});
