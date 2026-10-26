import { COMMUNITY_CATEGORIES, COMMUNITY_PRODUCTS, COMMUNITY_STORIES, filterCommunityStories, pageCommunityItems } from './community-content';

describe('the existing complete local discovery source', () => {
  it('keeps only the original two stories, their original categories and one product', () => {
    expect(COMMUNITY_CATEGORIES.map(category => category.id)).toEqual(['recommended', 'inspiration', 'products', 'tips', 'events']);
    expect(COMMUNITY_STORIES.map(story => [story.titleKey, story.category])).toEqual([
      ['COMMUNITY.DAILY_CLEANING_TITLE', 'inspiration'], ['COMMUNITY.KITCHEN_AIR_TITLE', 'tips'],
    ]);
    expect(COMMUNITY_PRODUCTS).toHaveLength(1);
    const translate = (key: string) => key === COMMUNITY_STORIES[1].descriptionKey ? 'Cooking FUME guide' : 'Cleaning';
    expect(filterCommunityStories('tips', '  fume ', translate)).toEqual([COMMUNITY_STORIES[1]]);
    expect(filterCommunityStories('inspiration', 'fume', translate)).toEqual([]);
  });

  it.each([0, 1, 12, 13, 25])('bounds a complete local %i-record fixture to the selected page without appending', length => {
    // Synthetic integers test the helper, never the production content catalog.
    const records = Array.from({ length }, (_, i) => i);
    const first = pageCommunityItems(records, 1);
    expect(first.total).toBe(length);
    expect(first.pageCount).toBe(Math.max(1, Math.ceil(length / 12)));
    expect(first.items).toEqual(records.slice(0, 12));
    const last = pageCommunityItems(records, first.pageCount);
    expect(last.items).toEqual(records.slice((first.pageCount - 1) * 12));
    expect(last.items.length).toBeLessThanOrEqual(12);
    expect(records).toHaveLength(length);
  });

  it.each([NaN, Infinity, 1.5, -1, 0, 999])('normalizes local page boundary %s without inventing extra pages', requested => {
    const result = pageCommunityItems([0, 1], requested);
    expect(result).toEqual({ page: 1, pageCount: 1, total: 2, items: [0, 1] });
  });
});
