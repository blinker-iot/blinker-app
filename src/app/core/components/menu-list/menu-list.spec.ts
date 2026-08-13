import { Component } from '@angular/core';
import { By } from '@angular/platform-browser';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MenuItemComponent } from './menu-item/menu-item';
import { MenuListComponent, MenuListItem } from './menu-list';

describe('MenuListComponent', () => {
  let fixture: ComponentFixture<MenuListComponent>;

  const items: MenuListItem[] = [
    {
      id: 'details',
      title: '详细菜单',
      description: '菜单说明',
      icon: 'fa-toolbox',
      badge: '即将上线',
      muted: true,
    },
    {
      id: 'logout',
      title: '退出登录',
      icon: 'fa-arrow-right-from-bracket',
      danger: true,
      showChevron: false,
    },
    {
      id: 'readonly',
      title: '只读菜单',
      icon: 'fa-lock',
      disabled: true,
      showChevron: false,
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MenuListComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MenuListComponent);
    fixture.componentRef.setInput('items', items);
    fixture.componentRef.setInput('detailed', true);
    fixture.detectChanges();
  });

  it('renders menu metadata and optional row states', () => {
    const element = fixture.nativeElement as HTMLElement;
    const rows = element.querySelectorAll<HTMLButtonElement>('.menu-row');

    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('详细菜单');
    expect(rows[0].textContent).toContain('菜单说明');
    expect(rows[0].textContent).toContain('即将上线');
    expect(rows[0].classList).toContain('menu-row--muted');
    expect(rows[1].classList).toContain('menu-row--danger');
    expect(rows[1].querySelector('.menu-arrow')).toBeNull();
    expect(rows[2].disabled).toBe(true);
  });

  it('emits the selected menu item', () => {
    const selected = vi.fn();
    fixture.componentInstance.itemSelected.subscribe(selected);

    fixture.nativeElement.querySelector('button').click();

    expect(selected).toHaveBeenCalledWith(items[0]);
  });
});

@Component({
  selector: 'app-menu-list-test-host',
  template: `
    <app-menu-list
      [editMode]="editMode"
      (sortChange)="sortedOrder = $event"
    >
      <app-menu-item id="first"></app-menu-item>
      <app-menu-item id="second"></app-menu-item>
    </app-menu-list>
  `,
  imports: [MenuListComponent, MenuItemComponent],
})
class MenuListTestHostComponent {
  editMode = true;
  sortedOrder: string[] = ['unchanged'];
}

describe('MenuListComponent projected items', () => {
  it('enables item editing and emits the sorted ids when editing ends', async () => {
    await TestBed.configureTestingModule({
      imports: [MenuListTestHostComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(MenuListTestHostComponent);
    fixture.detectChanges();

    const itemElements = fixture.nativeElement.querySelectorAll('app-menu-item');
    const menuList = fixture.debugElement.query(
      By.directive(MenuListComponent)
    ).componentInstance as MenuListComponent;
    const sorted = vi.fn();
    menuList.sortChange.subscribe(sorted);

    expect(itemElements[0].querySelector('.handle')).not.toBeNull();
    expect(itemElements[1].querySelector('.handle')).not.toBeNull();
    expect(itemElements[0].getAttribute('sort-id')).toBe('first');
    expect(itemElements[1].getAttribute('sort-id')).toBe('second');

    menuList.editMode = false;
    fixture.detectChanges();

    expect(sorted).toHaveBeenCalledWith(['first', 'second']);
    expect(fixture.componentInstance.sortedOrder).toEqual(['first', 'second']);
  });
});
