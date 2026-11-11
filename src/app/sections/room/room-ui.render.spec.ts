import { Component, Input, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { AlertController, NavController, provideIonicAngular } from '@ionic/angular/standalone';
import { Subject } from 'rxjs';
import { BDeviceImgComponent } from '../../core/components/b-device-img/b-device-img.component';
import { MenuItemComponent } from '../../core/components/menu-list/menu-item/menu-item';
import { MenuListComponent } from '../../core/components/menu-list/menu-list';
import type { OrderData } from '../../core/model/data.model';
import type { RegionSnapshot } from '../../core/model/region.model';
import { DataService } from '../../core/services/data.service';
import { RoomEditPage } from './room-edit/room-edit';
import { RoomManagerPage } from './room-manager/room-manager';
import { RoomService } from './room.service';

@Component({ selector: 'b-device-img', template: '' })
class DeviceImageStub {
  @Input() deviceId = '';
}

// Render both production templates and execute their original handlers. Only
// persistence, navigation, alerts and image loading are local doubles; these
// checks do not claim native geometry, drag gestures or HTTP integration.
describe('room management production templates', () => {
  let fixture: ComponentFixture<RoomManagerPage | RoomEditPage> | undefined;
  let snapshot: RegionSnapshot;
  let data: { sessionEpoch: number; auth: { uuid: string }; authDataChanged: Subject<void>; room: OrderData; device: {
    list: string[]; dict: Record<string, { config: { customName?: string } }>;
  } };
  let rooms: { load: ReturnType<typeof vi.fn>; saveData: ReturnType<typeof vi.fn> };
  let nav: { navigateBack: ReturnType<typeof vi.fn> };
  let router: { getCurrentNavigation: ReturnType<typeof vi.fn>; navigate: ReturnType<typeof vi.fn> };
  let alerts: { create: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    snapshot = { revision: 7, order: ['客厅', '书房'], rooms: { 客厅: ['lamp'], 书房: ['sensor'] } };
    data = { sessionEpoch: 3, auth: { uuid: 'account-a' }, authDataChanged: new Subject<void>(), room: { list: [], dict: {} }, device: {
      list: ['lamp', 'sensor'], dict: { lamp: { config: { customName: '台灯' } }, sensor: { config: {} } },
    } };
    rooms = { load: vi.fn(async () => {
      data.room = { list: [...snapshot.order], dict: structuredClone(snapshot.rooms) };
      return structuredClone(snapshot);
    }), saveData: vi.fn(async (draft: OrderData) => {
      data.room = structuredClone(draft);
      return { revision: 8, order: [...draft.list], rooms: structuredClone(draft.dict) };
    }) };
    nav = { navigateBack: vi.fn(async () => true) };
    router = { getCurrentNavigation: vi.fn(() => ({ extras: { state: { backHref: '/home/device' } } })),
      navigate: vi.fn(async () => true) };
    alerts = { create: vi.fn() };
    TestBed.overrideComponent(RoomEditPage, {
      remove: { imports: [BDeviceImgComponent] }, add: { imports: [DeviceImageStub] },
    });
    await TestBed.configureTestingModule({ imports: [RoomManagerPage, RoomEditPage], providers: [
      provideRouter([]), provideIonicAngular({ animated: false }),
      { provide: ActivatedRoute, useValue: { snapshot: { params: { room: '客厅' } } } },
      { provide: Router, useValue: router }, { provide: NavController, useValue: nav },
      { provide: RoomService, useValue: rooms }, { provide: DataService, useValue: data },
      { provide: AlertController, useValue: alerts },
    ] }).compileComponents();
  });

  afterEach(() => { fixture?.destroy(); fixture = undefined; TestBed.resetTestingModule(); });

  async function render<T extends RoomManagerPage | RoomEditPage>(type: Type<T>) {
    const result = TestBed.createComponent(type);
    fixture = result;
    result.detectChanges();
    await result.componentInstance.ionViewDidEnter();
    await result.whenStable();
    result.changeDetectorRef.markForCheck(); result.detectChanges();
    return { fixture: result, page: result.componentInstance, root: result.nativeElement as HTMLElement };
  }

  function refresh(): void { fixture!.changeDetectorRef.markForCheck(); fixture!.detectChanges(); }
  function action(root: HTMLElement, text: string) {
    const button = [...root.querySelectorAll<HTMLElement>('button, ion-button')]
      .find(item => item.textContent?.trim() === text);
    if (!button) throw new Error(`Missing room action: ${text}`);
    return button as HTMLElement & { disabled: boolean };
  }

  it('renders room counts and the original edit and sorting entry without writes', async () => {
    const f = await render(RoomManagerPage);
    expect(f.root.textContent).toContain('客厅'); expect(f.root.textContent).toContain('1 台设备');
    const list = f.fixture.debugElement.query(By.directive(MenuListComponent));
    expect(list.componentInstance.editMode).toBe(false);
    action(f.root, '编辑').click(); refresh();
    expect(f.page.editMode).toBe(true); expect(list.componentInstance.editMode).toBe(true);
    expect(f.root.querySelectorAll('.handle')).toHaveLength(2);
    expect(rooms.saveData).not.toHaveBeenCalled(); expect(router.navigate).not.toHaveBeenCalled();
  });

  it('keeps the original room selection navigation', async () => {
    const f = await render(RoomManagerPage);
    const item = f.fixture.debugElement.queryAll(By.directive(MenuItemComponent))[0];
    item.componentInstance.enter.emit();
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith(['room-manager', '客厅']);
    expect(rooms.saveData).not.toHaveBeenCalled();
  });

  it('passes a reordered room list with the existing CAS revision and session', async () => {
    const f = await render(RoomManagerPage);
    const list = f.fixture.debugElement.query(By.directive(MenuListComponent));
    list.componentInstance.sortChange.emit(['书房', '客厅']);
    await f.fixture.whenStable(); refresh();
    expect(rooms.saveData).toHaveBeenCalledExactlyOnceWith({ list: ['书房', '客厅'], dict: snapshot.rooms }, 7, 3);
    expect(snapshot.order).toEqual(['客厅', '书房']);
  });

  it('shows a create entry for an empty room list without creating automatically', async () => {
    snapshot = { revision: 0, order: [], rooms: {} };
    const f = await render(RoomManagerPage);
    expect(f.root.textContent).toContain('还没有区域');
    expect(action(f.root, '新建区域').disabled).toBe(false);
    expect(f.root.querySelector('app-menu-list')).toBeNull(); expect(rooms.saveData).not.toHaveBeenCalled();
  });

  it('keeps a failed room load recoverable by its visible reload entry', async () => {
    rooms.load.mockRejectedValueOnce(new Error('offline'));
    const f = await render(RoomManagerPage);
    expect(f.root.querySelector('[role="alert"]')?.textContent).toContain('区域同步失败');
    expect(f.page.loaded).toBe(false); expect(rooms.saveData).not.toHaveBeenCalled();
    action(f.root, '重新加载').click(); await f.fixture.whenStable(); refresh();
    expect(f.page.loaded).toBe(true); expect(f.root.querySelector('[role="alert"]')).toBeNull();
    expect(rooms.load).toHaveBeenCalledTimes(2);
  });

  it('disables manager edit, create, row and sorting affordances while saving', async () => {
    const f = await render(RoomManagerPage);
    f.page.editMode = true; f.page.saving = true; refresh();
    expect(action(f.root, '完成').disabled).toBe(true);
    expect((f.root.querySelector('ion-buttons[slot="end"] ion-button:last-child') as HTMLElement & { disabled: boolean }).disabled).toBe(true);
    expect(f.fixture.debugElement.query(By.directive(MenuListComponent)).componentInstance.editMode).toBe(false);
    expect(f.fixture.debugElement.queryAll(By.directive(MenuItemComponent)).every(item => item.componentInstance.disabled)).toBe(true);
    f.page.switchMode(); f.page.editRoom('客厅'); await f.page.addRoom();
    expect(f.page.editMode).toBe(true); expect(router.navigate).not.toHaveBeenCalled();
    expect(alerts.create).not.toHaveBeenCalled(); expect(rooms.saveData).not.toHaveBeenCalled();
  });

  it('renders selected devices and changes only the local room draft', async () => {
    const f = await render(RoomEditPage);
    const rows = [...f.root.querySelectorAll<HTMLButtonElement>('.device-row')];
    expect(rows.map(row => row.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(rows[0].textContent).toContain('台灯'); expect(rows[1].textContent).toContain('设备');
    rows[1].click(); refresh();
    expect(f.page.currentRoomData).toEqual(['lamp', 'sensor']); expect(f.root.textContent).toContain('2 台已选择');
    expect(data.room.dict['客厅']).toEqual(['lamp']); expect(data.device.list).toEqual(['lamp', 'sensor']);
    expect(rooms.saveData).not.toHaveBeenCalled();
  });

  it('cancels the local selection draft without persisting or reordering devices', async () => {
    const f = await render(RoomEditPage);
    f.root.querySelectorAll<HTMLButtonElement>('.device-row')[1].click(); refresh();
    action(f.root, '取消').click();
    expect(nav.navigateBack).toHaveBeenCalledExactlyOnceWith('/room-manager');
    expect(rooms.saveData).not.toHaveBeenCalled(); expect(data.room.dict).toEqual(snapshot.rooms);
    expect(data.device.list).toEqual(['lamp', 'sensor']);
  });

  it('saves the edited local selection once through the original CAS path', async () => {
    const f = await render(RoomEditPage);
    f.root.querySelectorAll<HTMLButtonElement>('.device-row')[1].click(); refresh();
    action(f.root, '保存').click(); await f.fixture.whenStable(); refresh();
    expect(rooms.saveData).toHaveBeenCalledExactlyOnceWith({ list: ['客厅', '书房'],
      dict: { 客厅: ['lamp', 'sensor'], 书房: ['sensor'] } }, 7, 3);
    expect(nav.navigateBack).toHaveBeenCalledExactlyOnceWith('/room-manager');
    expect(data.device.list).toEqual(['lamp', 'sensor']); expect(f.page.saving).toBe(false);
  });

  it('keeps the edited selection and error visible after failure, then retries normally', async () => {
    const f = await render(RoomEditPage);
    f.root.querySelectorAll<HTMLButtonElement>('.device-row')[1].click(); refresh();
    rooms.saveData.mockRejectedValueOnce(new Error('offline'));
    action(f.root, '保存').click(); await f.fixture.whenStable(); refresh();
    expect(f.root.querySelector('[role="alert"]')?.textContent).toContain('区域同步失败');
    expect(f.page.currentRoomData).toEqual(['lamp', 'sensor']); expect(nav.navigateBack).not.toHaveBeenCalled();
    expect([...f.root.querySelectorAll('button')].some(button => button.textContent?.includes('重新加载'))).toBe(false);
    expect(action(f.root, '保存').disabled).toBe(false);
    action(f.root, '保存').click(); await f.fixture.whenStable(); refresh();
    expect(rooms.saveData).toHaveBeenCalledTimes(2); expect(nav.navigateBack).toHaveBeenCalledTimes(1);
    expect(f.root.querySelector('[role="alert"]')).toBeNull();
  });

  it('keeps save, cancel, rename and device selection disabled during an in-flight save', async () => {
    const f = await render(RoomEditPage);
    let resolveSave!: (value: RegionSnapshot) => void;
    rooms.saveData.mockReturnValueOnce(new Promise<RegionSnapshot>(resolve => { resolveSave = resolve; }));
    const pending = f.page.save(); refresh();
    expect(action(f.root, '保存中…').disabled).toBe(true); expect(action(f.root, '取消').disabled).toBe(true);
    expect(f.root.querySelector<HTMLButtonElement>('.name-row')!.disabled).toBe(true);
    expect([...f.root.querySelectorAll<HTMLButtonElement>('.device-row')].every(row => row.disabled)).toBe(true);
    f.page.toggleDevice('sensor'); f.page.cancel(); await f.page.save();
    expect(f.page.currentRoomData).toEqual(['lamp']); expect(rooms.saveData).toHaveBeenCalledTimes(1);
    expect(nav.navigateBack).not.toHaveBeenCalled();
    resolveSave({ ...snapshot, revision: 8 }); await pending; refresh();
    expect(nav.navigateBack).toHaveBeenCalledTimes(1);
  });

  it('shows the original no-device state without creating bindings', async () => {
    data.device = { list: [], dict: {} };
    const f = await render(RoomEditPage);
    expect(f.root.textContent).toContain('暂无可添加的设备'); expect(f.root.querySelector('.device-row')).toBeNull();
    expect(rooms.saveData).not.toHaveBeenCalled();
  });

  it('does not allow saving a deleted room and exposes the recoverable error', async () => {
    snapshot = { revision: 8, order: ['书房'], rooms: { 书房: ['sensor'] } };
    const f = await render(RoomEditPage);
    expect(f.page.loaded).toBe(false); expect(f.root.querySelector('[role="alert"]')?.textContent).toContain('该区域已被删除');
    expect(action(f.root, '保存').disabled).toBe(true); await f.page.save();
    expect(rooms.saveData).not.toHaveBeenCalled(); expect(nav.navigateBack).not.toHaveBeenCalled();
  });
});
