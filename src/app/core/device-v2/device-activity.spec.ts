import { ACTIVITY_MAX_AGE_MS, ACTIVITY_MAX_PAGE_LIMIT, ACTIVITY_PAGE_LIMIT,
  activityDeviceId, activityQuery, parseActivityPage } from './device-activity';

const id = 'device_a', query = { from: 1000, to: 2000, limit: 20 };
const item = { id: '3', endpointKey: 'power', status: 'acknowledged', attemptCount: 1, createdAt: 1500, updatedAt: 1600 };
const page = { logicalDeviceId: id, from: 1000, to: 2000, items: [item], nextCursor: null,
  retention: { maxAgeMs: ACTIVITY_MAX_AGE_MS }, timeBasis: 'serverRecordedAt', source: 'broker-command' };

describe('Device activity strict bounded read contract', () => {
  it('defaults to twenty and admits the exact seven-day boundary without coercion', () => {
    expect(ACTIVITY_PAGE_LIMIT).toBe(20); expect(ACTIVITY_MAX_PAGE_LIMIT).toBe(50);
    expect(activityQuery({ from: 0, to: ACTIVITY_MAX_AGE_MS })).toEqual({ from: 0, to: ACTIVITY_MAX_AGE_MS, limit: 20 });
    expect(activityQuery({ ...query, limit: 50, before: 'YWJj' })).toEqual({ ...query, limit: 50, before: 'YWJj' });
  });
  it.each([
    { ...query, from: -1 }, { ...query, from: '1000' }, { ...query, to: 1000 }, { ...query, to: 999 },
    { ...query, to: 1000 + ACTIVITY_MAX_AGE_MS + 1 }, { ...query, limit: 0 }, { ...query, limit: 51 },
    { ...query, limit: 1.5 }, { ...query, before: '' }, { ...query, before: 'A' },
    { ...query, before: 'YQ==' }, { ...query, before: 'YR' }, { ...query, before: 'a'.repeat(513) },
    { ...query, token: 'forbidden' },
  ])('rejects malformed, oversized or extra query fields %j', candidate => {
    expect(() => activityQuery(candidate as any)).toThrow('DEVICE_V2_ACTIVITY_RESPONSE_INVALID');
  });
  it('requires a bounded safe device identifier', () => {
    expect(() => activityDeviceId('device_a-0')).not.toThrow();
    for (const candidate of ['', ' device_a', 'a/b', 'a?b', 'a'.repeat(129), null]) {
      expect(() => activityDeviceId(candidate)).toThrow();
    }
  });
  it('keeps each authoritative status distinct rather than inferring State or physical execution', () => {
    for (const status of ['inflight', 'acknowledged', 'rejected', 'outcome_unknown', 'not_sent']) {
      expect(parseActivityPage({ ...page, items: [{ ...item, status }] }, id, query).items[0].status).toBe(status);
    }
    expect(parseActivityPage({ ...page, items: [] }, id, query).items).toEqual([]);
  });
  it('orders by timestamp then decimal int64 ID, not by globally descending ID', () => {
    const items = [{ ...item, id: '10', createdAt: 1700 }, { ...item, id: '9', createdAt: 1700 },
      { ...item, id: '9223372036854775807', createdAt: 1600 }];
    expect(parseActivityPage({ ...page, items, nextCursor: 'YWJj' }, id, query).items).toEqual(items);
    for (const invalid of [[items[1], items[0]], [items[2], items[0]], [items[0], { ...items[0], createdAt: 1600 }]]) {
      expect(() => parseActivityPage({ ...page, items: invalid }, id, query)).toThrow();
    }
  });
  it('retains server update time despite wall-clock rollback or a later query boundary', () => {
    for (const updatedAt of [1, 2000, 8640000000000000]) {
      expect(parseActivityPage({ ...page, items: [{ ...item, updatedAt }] }, id, query).items[0].updatedAt).toBe(updatedAt);
    }
  });
  it.each([
    { ...item, id: '0' }, { ...item, id: '01' }, { ...item, id: '9223372036854775808' },
    { ...item, id: 3 }, { ...item, endpointKey: '' }, { ...item, endpointKey: 'a\0b' },
    { ...item, endpointKey: '温'.repeat(22) }, { ...item, endpointKey: '\ud800' },
    { ...item, status: 'executed' }, { ...item, attemptCount: -1 }, { ...item, attemptCount: '1' },
    { ...item, attemptCount: Number.MAX_SAFE_INTEGER + 1 }, { ...item, createdAt: 999 },
    { ...item, createdAt: 2000 }, { ...item, updatedAt: 0 }, { ...item, updatedAt: NaN },
    { ...item, payload: 'private' }, { ...item, requestId: 'private' },
  ])('rejects malformed or sensitive activity item fields %j', candidate => {
    expect(() => parseActivityPage({ ...page, items: [candidate] }, id, query)).toThrow('DEVICE_V2_ACTIVITY_RESPONSE_INVALID');
  });
  it('accepts exact UTF-8 key and lower range boundaries with an explicit zero attempt count', () => {
    const candidate = { ...item, endpointKey: '温'.repeat(21) + 'a', createdAt: query.from, attemptCount: 0 };
    expect(parseActivityPage({ ...page, items: [candidate] }, id, query).items[0]).toEqual(candidate);
  });
  it('rejects target/range/source/retention drift, malformed paging and extra page fields', () => {
    for (const candidate of [{ ...page, logicalDeviceId: 'other' }, { ...page, from: 999 }, { ...page, to: 2001 },
      { ...page, timeBasis: 'deviceExecutedAt' }, { ...page, source: 'local-journal' },
      { ...page, retention: { maxAgeMs: ACTIVITY_MAX_AGE_MS - 1 } },
      { ...page, retention: { maxAgeMs: ACTIVITY_MAX_AGE_MS, extra: 1 } }, { ...page, token: 'private' },
      { ...page, items: [item, item] }, { ...page, items: [], nextCursor: 'YWJj' },
      { ...page, nextCursor: 'YQ==' }, { ...page, nextCursor: '' }]) {
      expect(() => parseActivityPage(candidate, id, query)).toThrow();
    }
    expect(() => parseActivityPage(page, id, { ...query, limit: 0 })).toThrow();
    expect(() => parseActivityPage({ ...page, items: [item, { ...item, id: '2' }] }, id, { ...query, limit: 1 })).toThrow();
    expect(() => parseActivityPage({ ...page, nextCursor: 'YWJj' }, id, { ...query, before: 'YWJj' })).toThrow();
  });
});
