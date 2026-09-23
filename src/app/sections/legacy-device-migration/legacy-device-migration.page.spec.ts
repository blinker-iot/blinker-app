import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Subject } from 'rxjs';
import { LegacyDeviceMigrationPage } from './legacy-device-migration.page';

const item = { sourceCollection: 'devices', sourceId: 'a'.repeat(24), snapshot: { deviceName: 'old', displayName: 'Lamp' } };
const previewPage = (nextPage: number | null) => ({
  authorization: 'opaque', items: [item], issues: [], nextPage,
  previewComplete: nextPage === null, total: 1, expiresAt: Date.now() + 60000,
});
function harness() {
  const imports = { preview: vi.fn(), sync: vi.fn(), load: vi.fn(async () => []), records: new BehaviorSubject([]) };
  const data = { auth: { accessToken: 'test' }, sessionEpoch: 1, authDataChanged: new Subject<void>() };
  const page = new LegacyDeviceMigrationPage(imports as any, data as any,
    { snapshot: { paramMap: new Map() } } as any, { navigateRoot: vi.fn() } as any);
  page.phone = '13800000000';
  page.password = 'not-a-real-password';
  return { page, imports, data };
}
describe('legacy device one-confirmation import', () => {
  it('finishes the full preview before confirmation and does not retain the password', async () => {
    const { page, imports } = harness();
    imports.preview.mockResolvedValueOnce(previewPage(1)).mockResolvedValueOnce(previewPage(null));
    await page.beginPreview();
    expect(imports.preview.mock.calls[1][0]).toEqual({ authorization: 'opaque', page: 1 });
    expect(page.password).toBe('');
    expect(page.preview?.items).toHaveLength(1);
    expect(page.canConfirm).toBe(true);
    expect(imports.sync).not.toHaveBeenCalled();
    page.ngOnDestroy();
  });

  it('keeps interrupted preview unconfirmed and resumes the same page', async () => {
    const { page, imports } = harness();
    imports.preview.mockResolvedValueOnce(previewPage(1)).mockRejectedValueOnce(new Error('offline'));
    await page.beginPreview();
    expect(page.canConfirm).toBe(false);
    imports.preview.mockResolvedValueOnce(previewPage(null));
    await page.continuePreview();
    expect(page.canConfirm).toBe(true);
    page.ngOnDestroy();
  });

  it('continues sync batches after one confirmation and keeps incomplete distinct from finished', async () => {
    const { page, imports } = harness();
    imports.preview.mockResolvedValue(previewPage(null));
    await page.beginPreview();
    const summary = { total: 51, processed: 50, saved: 50, failed: 0, incomplete: 1, complete: false };
    imports.sync.mockResolvedValueOnce({ results: [], nextOffset: 50, summary, expiresAt: Date.now() + 60000 })
      .mockResolvedValueOnce({ results: [], nextOffset: null, summary: { ...summary, processed: 51 }, expiresAt: Date.now() + 60000 });
    await page.confirmSync();
    expect(imports.sync.mock.calls).toEqual([['opaque', 0], ['opaque', 50]]);
    expect(page.syncResult?.summary.complete).toBe(false);
    expect(imports.load).toHaveBeenCalledOnce();
    page.ngOnDestroy();
  });

  it('keeps separate malformed-source failures and shows upstream rate limits', async () => {
    const { page, imports } = harness();
    imports.preview.mockResolvedValue(previewPage(null));
    await page.beginPreview();
    imports.sync.mockResolvedValue({ results: [
      { sourceCollection: 'devices', sourceId: null, status: 'failed', code: 'INVALID_SOURCE_ID' },
      { sourceCollection: 'devices', sourceId: null, status: 'failed', code: 'INVALID_SOURCE_ID' },
    ], nextOffset: null, summary: { total: 2, processed: 2, saved: 0, failed: 2, incomplete: 0, complete: false }, expiresAt: Date.now() + 60000 });
    await page.confirmSync();
    expect(page.syncResult?.results).toHaveLength(2);
    page.password = 'test';
    imports.preview.mockRejectedValue(new HttpErrorResponse({ status: 429, error: { errorMessage: 'rate limited' } }));
    await page.beginPreview();
    expect(page.error).toBe('验证尝试过于频繁，请稍后重试');
    page.ngOnDestroy();
  });

  it('clears authorization when leaving and ignores an in-flight response', async () => {
    const { page, imports } = harness();
    let resolve!: (value: unknown) => void;
    imports.preview.mockReturnValue(new Promise(r => { resolve = r; }));
    const task = page.beginPreview();
    page.ionViewWillLeave();
    resolve(previewPage(null));
    await task;
    expect(page.preview).toBeUndefined();
    expect(page.password).toBe('');
    page.ngOnDestroy();
  });
});
