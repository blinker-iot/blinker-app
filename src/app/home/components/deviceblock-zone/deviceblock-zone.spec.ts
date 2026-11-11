import { describe, expect, it, vi } from 'vitest';
import PullToRefresh from 'pulltorefreshjs';
import { DeviceblockZone } from './deviceblock-zone';

vi.mock('pulltorefreshjs', () => ({ default: { init: vi.fn(), destroyAll: vi.fn() } }));

const harness = () => {
  const zone = Object.create(DeviceblockZone.prototype) as DeviceblockZone;
  Object.assign(zone, {
    _editing: false, _roomid: 0, viewInitialized: true, destroyed: false,
    refresherEnabled: true, swipeEnabled: true,
    slides: [{ roomId: 0, role: 'current', direction: 0 }],
    scrollElement: { scrollTop: 0 }, refreshZone: { nativeElement: {} },
    deviceZone: { nativeElement: { querySelector: vi.fn() } },
    dataService: { auth: {}, room: { list: ['客厅', '卧室'] } },
    userService: { getAllInfo: vi.fn(async () => undefined) },
  });
  return zone;
};

describe('device card editor room gesture boundary', () => {
  it('rejects an external room change while editing and releases that boundary afterward', () => {
    const zone = harness();
    const programmatic = vi.spyOn(zone as any, 'startProgrammaticRoomChange').mockImplementation(() => undefined);
    zone.editing = true; zone.roomid = 1;
    expect(zone.roomid).toBe(0);
    expect(programmatic).not.toHaveBeenCalled();
    zone.editing = false; zone.roomid = 1;
    expect(programmatic).toHaveBeenCalledWith(1);
  });

  it('keeps the final pull-to-refresh check locked despite late gesture enable events', () => {
    const zone = harness();
    zone.initRefresh();
    const options = vi.mocked(PullToRefresh.init).mock.lastCall![0] as any;
    expect(options.shouldPullToRefresh()).toBe(true);
    zone.editing = true; zone.refresherEnabledChanged(true);
    expect(zone.refresherEnabled).toBe(false);
    zone.refresherEnabled = true;
    expect(options.shouldPullToRefresh()).toBe(false);
    zone.editing = false;
    expect(options.shouldPullToRefresh()).toBe(true);
  });

  it('does not call the account refresh operation while editing', async () => {
    const zone = harness();
    zone.editing = true; await zone.refresh();
    expect(zone.userService.getAllInfo).not.toHaveBeenCalled();
    zone.editing = false; await zone.refresh();
    expect(zone.userService.getAllInfo).toHaveBeenCalledOnce();
  });
});
