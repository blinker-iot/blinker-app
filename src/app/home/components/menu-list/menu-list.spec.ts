import { ComponentFixture, TestBed } from '@angular/core/testing';

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

    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('详细菜单');
    expect(rows[0].textContent).toContain('菜单说明');
    expect(rows[0].textContent).toContain('即将上线');
    expect(rows[0].classList).toContain('menu-row--muted');
    expect(rows[1].classList).toContain('menu-row--danger');
    expect(rows[1].querySelector('.menu-arrow')).toBeNull();
  });

  it('emits the selected menu item', () => {
    const selected = vi.fn();
    fixture.componentInstance.itemSelected.subscribe(selected);

    fixture.nativeElement.querySelector('button').click();

    expect(selected).toHaveBeenCalledWith(items[0]);
  });
});
