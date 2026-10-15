export const SERVICE_REGIONS = ['China', 'Global', 'Development'] as const;

export type ServiceRegion = (typeof SERVICE_REGIONS)[number];

const SERVICE_REGION_STORAGE_KEY = 'service-region';

export function isServiceRegion(value: unknown): value is ServiceRegion {
  return SERVICE_REGIONS.some((region) => region === value);
}

export function getServiceRegion(): ServiceRegion {
  const stored = localStorage.getItem(SERVICE_REGION_STORAGE_KEY);

  return isServiceRegion(stored) ? stored : 'China';
}

export function setServiceRegion(region: ServiceRegion): void {
  localStorage.setItem(SERVICE_REGION_STORAGE_KEY, region);
}
