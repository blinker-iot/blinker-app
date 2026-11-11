export const COMMUNITY_CATEGORIES = [
  { id: 'recommended', labelKey: 'COMMUNITY.CATEGORY_RECOMMENDED' },
  { id: 'inspiration', labelKey: 'COMMUNITY.CATEGORY_INSPIRATION' },
  { id: 'products', labelKey: 'COMMUNITY.CATEGORY_PRODUCTS' },
  { id: 'tips', labelKey: 'COMMUNITY.CATEGORY_TIPS' },
  { id: 'events', labelKey: 'COMMUNITY.CATEGORY_EVENTS' },
] as const;
export type CommunityCategoryId = typeof COMMUNITY_CATEGORIES[number]['id'];
export type CommunityStoryCategory = Extract<CommunityCategoryId, 'inspiration' | 'tips'>;

export interface CommunityInspirationCard {
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly category: CommunityStoryCategory;
  readonly imageSrc: string;
}

export interface CommunityProduct {
  readonly nameKey: string;
  readonly descriptionKey: string;
  readonly imageSrc: string;
}

// Existing local examples, not a publishing feed or statistics service.
// Discovery categories and recommendations share these records in this order.
export const COMMUNITY_STORIES: readonly CommunityInspirationCard[] = [
  {
    titleKey: 'COMMUNITY.DAILY_CLEANING_TITLE',
    descriptionKey: 'COMMUNITY.DAILY_CLEANING_DESCRIPTION',
    category: 'inspiration',
    imageSrc: 'devices/home-living/robot-vacuum-light.webp',
  },
  {
    titleKey: 'COMMUNITY.KITCHEN_AIR_TITLE',
    descriptionKey: 'COMMUNITY.KITCHEN_AIR_DESCRIPTION',
    category: 'tips',
    imageSrc: 'devices/health-wearables/air-purifier-light.webp',
  },
];

export const COMMUNITY_PRODUCTS: readonly CommunityProduct[] = [
  {
    nameKey: 'COMMUNITY.OMNI_STATION_NAME',
    descriptionKey: 'COMMUNITY.OMNI_STATION_DESCRIPTION',
    imageSrc: 'devices/home-living/robot-vacuum-light.webp',
  },
];

export function matchesTranslatedContent(
  keyword: string,
  translate: (key: string) => unknown,
  ...keys: string[]
): boolean {
  const normalized = keyword.trim().toLowerCase();
  return !normalized || keys.some(key => String(translate(key)).toLowerCase().includes(normalized));
}

export function filterCommunityStories(
  category: CommunityCategoryId,
  keyword: string,
  translate: (key: string) => unknown,
): readonly CommunityInspirationCard[] {
  return COMMUNITY_STORIES.filter(card =>
    (category === 'recommended' || card.category === category)
    && matchesTranslatedContent(keyword, translate, card.titleKey, card.descriptionKey)
  );
}

// This source is a complete local catalog, so its total and order are known.
// No remote page count, cursor, loading state or content is fabricated here.
export function pageCommunityItems<T>(items: readonly T[], requestedPage: number) {
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Number.isSafeInteger(requestedPage) ? Math.min(pageCount, Math.max(1, requestedPage)) : 1;
  return { page, pageCount, total: items.length, items: items.slice((page - 1) * pageSize, page * pageSize) };
}
