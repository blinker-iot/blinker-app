import { GatewayHttpError } from '../../../core/model/response.model';
import { Subject } from 'rxjs';

import { BleDeviceGuidePage } from './ble-device.page';

describe('BleDeviceGuidePage', () => {
  function recoveryFixture() {
    const changes = new Subject<void>();
    const data = { auth: { accessToken: 'fixture' }, sessionEpoch: 1, authDataChanged: changes };
    const ble = { pendingEnrollmentLogicalDeviceIds: vi.fn().mockResolvedValue(['ble_pending']),
      resume: vi.fn(), enroll: vi.fn(), discoverProvisioningDevices: vi.fn() };
    const nav = { navigateRoot: vi.fn().mockResolvedValue(true) };
    const users = { getAllInfo: vi.fn().mockResolvedValue(true) };
    const page = new BleDeviceGuidePage(ble as any, data as any, users as any, nav as any,
      { instant: (key: string) => key } as any, { markForCheck: () => {} } as any);
    const session = { close: vi.fn().mockResolvedValue(undefined),
      store: { snapshot: () => ({ manifest: { fields: [{ key: 'power' }] } }) } };
    return { page, ble, data, changes, nav, session, users };
  }

  it('lists pending checkpoints without scanning/connecting; an explicit choice resumes the original identity', async () => {
    const f = recoveryFixture();
    f.page.ionViewWillEnter();
    await vi.waitFor(() => expect(f.page.pendingEnrollments).toEqual(['ble_pending']));
    expect(f.ble.resume).not.toHaveBeenCalled(); expect(f.ble.discoverProvisioningDevices).not.toHaveBeenCalled();
    f.ble.resume.mockResolvedValue({ logicalDeviceId: 'ble_pending', session: f.session });
    await f.page.resumeEnrollment('ble_unlisted');
    expect(f.ble.resume).not.toHaveBeenCalled();
    await f.page.resumeEnrollment('ble_pending');
    expect(f.ble.resume).toHaveBeenCalledExactlyOnceWith('ble_pending', expect.any(AbortSignal));
    expect(f.ble.enroll).not.toHaveBeenCalled();
    expect(f.page.phase).toBe('ready'); expect(f.page.logicalDeviceId).toBe('ble_pending');
    expect(f.page.endpointCount).toBe(1); expect(f.page.pendingEnrollments).toEqual([]);
  });

  it.each(['leave', 'account'])('%s cancels recovery; late success closes without populating the page', async reason => {
    const f = recoveryFixture(); let complete!: (result: any) => void;
    f.page.pendingEnrollments = ['ble_pending'];
    f.ble.resume.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    const attempt = f.page.resumeEnrollment('ble_pending');
    const signal = f.ble.resume.mock.calls[0][1] as AbortSignal;
    await f.page.resumeEnrollment('ble_pending'); // no overlapping recovery
    expect(f.ble.resume).toHaveBeenCalledOnce();
    if (reason === 'leave') f.page.ionViewWillLeave();
    else { f.data.sessionEpoch++; f.changes.next(); }
    expect(signal.aborted).toBe(true);
    complete({ logicalDeviceId: 'ble_pending', session: f.session }); await attempt;
    expect(f.session.close).toHaveBeenCalledOnce(); expect(f.page.logicalDeviceId).toBe('');
    expect(f.page.phase).toBe('idle'); expect(f.page.pendingEnrollments).toEqual([]);
  });

  it('late failure/list result cannot overwrite a successor page or account', async () => {
    const f = recoveryFixture(); let reject!: (reason: Error) => void, list!: (ids: string[]) => void;
    f.ble.pendingEnrollmentLogicalDeviceIds.mockImplementation(() => new Promise(resolve => { list = resolve; }));
    f.page.ionViewWillEnter(); f.page.pendingEnrollments = ['ble_pending'];
    f.ble.resume.mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
    const attempt = f.page.resumeEnrollment('ble_pending');
    f.data.sessionEpoch++; f.changes.next();
    reject(Error('old failure')); list(['ble_old']); await attempt;
    expect(f.page.phase).toBe('idle'); expect(f.page.error).toBe(''); expect(f.page.pendingEnrollments).toEqual([]);
  });

  it('retired recovery is visible and remains pending rather than automatically enrolling another device', async () => {
    const f = recoveryFixture(); f.page.pendingEnrollments = ['ble_pending'];
    f.ble.resume.mockRejectedValue(new GatewayHttpError({ httpStatus: 410,
      code: 'DEVICE_V2_BLE_ENROLLMENT_DEVICE_RETIRED', message: 'retired' }));
    await f.page.resumeEnrollment('ble_pending');
    expect(f.page.phase).toBe('failed'); expect(f.page.error).toBe('DEVICE_GUIDE.BLE_DEVICE_RETIRED');
    expect(f.ble.resume).toHaveBeenCalledOnce(); expect(f.ble.enroll).not.toHaveBeenCalled();
    expect(f.page.pendingEnrollments).toEqual(['ble_pending']);
  });

  it('a storage listing failure is visible rather than silently treated as no pending transaction', async () => {
    const f = recoveryFixture(); f.ble.pendingEnrollmentLogicalDeviceIds.mockRejectedValue(Error('storage'));
    f.page.ionViewWillEnter();
    await vi.waitFor(() => expect(f.page.error).toBe('DEVICE_GUIDE.BLE_RECOVERY_LOAD_FAILED'));
    expect(f.ble.resume).not.toHaveBeenCalled(); expect(f.ble.enroll).not.toHaveBeenCalled();
  });

  it('late ordinary enrollment failure does not corrupt the successor account page', async () => {
    const f = recoveryFixture(); let reject!: (error: Error) => void;
    f.ble.enroll.mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
    f.page.phase = 'selecting';
    const attempt = f.page.selectCandidate({} as any);
    f.data.sessionEpoch++; f.changes.next(); reject(Error('old enrollment')); await attempt;
    expect(f.page.phase).toBe('idle'); expect(f.page.error).toBe('');
  });

  it('account replacement during finish cannot navigate to the previous account device', async () => {
    const f = recoveryFixture(); f.page.logicalDeviceId = 'ble_previous';
    f.users.getAllInfo.mockImplementation(async () => { f.data.sessionEpoch++; f.changes.next(); return true; });
    await f.page.finish();
    expect(f.nav.navigateRoot).toHaveBeenCalledExactlyOnceWith('/home/device');
  });
  it.each([
    [410, 'DEVICE_V2_BLE_ENROLLMENT_DEVICE_RETIRED', 'BLE_DEVICE_RETIRED'],
    [403, 'DEVICE_V2_BLE_ENROLLMENT_OWNER_INACTIVE', 'BLE_OWNER_INACTIVE'],
    [409, 'DEVICE_V2_BLE_RESET_REQUIRED', 'BLE_RESET_REQUIRED'],
    [503, 'DEVICE_V2_BLE_ENROLLMENT_UNAVAILABLE', 'BLE_ENROLL_FAILED'],
  ] as const)('shows the precise enrollment failure for HTTP %s without claiming completion', async (status, code, message) => {
    const error = new GatewayHttpError({ httpStatus: status, code, message: 'Enrollment unavailable' });
    const ble = { enroll: vi.fn().mockRejectedValue(error) };
    const nav = { navigateRoot: vi.fn() };
    const page = new BleDeviceGuidePage(
      ble as any,
      { auth: { accessToken: 'token' }, sessionEpoch: 1, authDataChanged: new Subject<void>() } as any,
      {} as any, nav as any, { instant: (key: string) => key } as any,
      { markForCheck: () => undefined } as any,
    );
    page.phase = 'selecting';
    await page.selectCandidate({} as any);
    expect(page.phase).toBe('failed');
    expect(page.error).toBe(`DEVICE_GUIDE.${message}`);
    expect(page.logicalDeviceId).toBe('');
    expect(nav.navigateRoot).not.toHaveBeenCalled();
    expect(ble.enroll).toHaveBeenCalledOnce();
  });
  it('refreshes inventory and enters the enrolled device instead of dropping the session on home', async () => {
    const logicalDeviceId = 'ble_0123456789abcdefghijkl';
    const users = { getAllInfo: vi.fn().mockResolvedValue(true) };
    const nav = { navigateRoot: vi.fn().mockResolvedValue(true) };
    const close = vi.fn().mockResolvedValue(undefined);
    const page = new BleDeviceGuidePage(
      {} as any,
      {
        auth: { accessToken: 'token' },
        sessionEpoch: 1,
        authDataChanged: new Subject<void>(),
      } as any,
      users as any,
      nav as any,
      { instant: (key: string) => key } as any,
      { markForCheck: () => undefined } as any,
    );
    page.logicalDeviceId = logicalDeviceId;
    (page as any).session = { close };

    await page.finish();

    expect(users.getAllInfo).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(nav.navigateRoot).toHaveBeenCalledWith(`/device/${logicalDeviceId}`);
  });

  it('requires an explicit choice when several provisioning devices are nearby', async () => {
    const candidates = [
      { device: { deviceId: 'AA:BB:CC:00:00:01', name: 'Blinker' }, rssi: -70 },
      { device: { deviceId: 'AA:BB:CC:00:00:02', name: 'Blinker' }, rssi: -40 },
    ];
    const ble = {
      discoverProvisioningDevices: vi.fn().mockResolvedValue(candidates),
      enroll: vi.fn(),
    };
    const page = new BleDeviceGuidePage(
      ble as any,
      {
        auth: { accessToken: 'token' },
        sessionEpoch: 1,
        authDataChanged: new Subject<void>(),
      } as any,
      {} as any,
      {} as any,
      { instant: (key: string) => key } as any,
      { markForCheck: () => undefined } as any,
    );

    await page.startDiscovery();

    expect(page.phase).toBe('selecting');
    expect(page.candidates.map(target => target.device.deviceId)).toEqual([
      'AA:BB:CC:00:00:02',
      'AA:BB:CC:00:00:01',
    ]);
    expect(page.candidateId(page.candidates[0])).toBe('00:00:02');
    expect(ble.enroll).not.toHaveBeenCalled();
  });

  it('closes an enrolled session and leaves the device context on account change', async () => {
    const authDataChanged = new Subject<void>();
    const data = {
      auth: { accessToken: 'account-a-token' },
      sessionEpoch: 1,
      authDataChanged,
    };
    const nav = { navigateRoot: vi.fn().mockResolvedValue(true) };
    const close = vi.fn().mockResolvedValue(undefined);
    const page = new BleDeviceGuidePage(
      {} as any,
      data as any,
      {} as any,
      nav as any,
      { instant: (key: string) => key } as any,
      { markForCheck: () => undefined } as any,
    );
    page.logicalDeviceId = 'ble_account_a';
    page.phase = 'ready';
    (page as any).session = { close };

    data.auth = { accessToken: 'account-b-token' };
    data.sessionEpoch += 1;
    authDataChanged.next();

    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(page.logicalDeviceId).toBe('');
    expect(page.phase).toBe('idle');
    expect(nav.navigateRoot).toHaveBeenCalledWith('/home/device');
  });
});
