import {
  AfterContentInit,
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ContentChildren,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  QueryList,
  ViewChild,
} from '@angular/core';
import Sortable from 'sortablejs';
import { MenuItemComponent } from './menu-item/menu-item';

export interface MenuListItem {
  id: string;
  title: string;
  icon: string;
  description?: string;
  value?: string;
  badge?: string;
  route?: string;
  muted?: boolean;
  danger?: boolean;
  showChevron?: boolean;
}

@Component({
  selector: 'app-menu-list',
  templateUrl: './menu-list.html',
  styleUrls: ['./menu-list.scss', './menu-list-items.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuListComponent
  implements AfterContentInit, AfterViewInit, OnDestroy
{
  private _items?: readonly MenuListItem[];
  private _editMode = false;
  private _enableSort = true;
  private viewInitialized = false;
  private sortable?: { destroy(): void; toArray(): string[] };

  @Input()
  set items(value: readonly MenuListItem[] | undefined) {
    this._items = value;
    this.updateSortable();
  }

  get items(): readonly MenuListItem[] | undefined {
    return this._items;
  }

  @Input() detailed = false;
  @Input() ariaLabel?: string;

  @Input()
  set editMode(value: boolean) {
    this._editMode = value;
    this.updateItemEditMode();
    this.updateSortable();
  }

  get editMode(): boolean {
    return this._editMode;
  }

  @Input()
  set enableSort(value: boolean) {
    this._enableSort = value;
    this.updateSortable();
  }

  get enableSort(): boolean {
    return this._enableSort;
  }

  @Output() readonly itemSelected = new EventEmitter<MenuListItem>();
  @Output() readonly sortChange = new EventEmitter<string[]>();

  @ViewChild('sortbox') private sortbox?: ElementRef<HTMLElement>;
  @ContentChildren(MenuItemComponent)
  private menuItems?: QueryList<MenuItemComponent>;

  ngAfterContentInit(): void {
    this.updateItemEditMode();
    this.menuItems?.changes.subscribe(() => this.updateItemEditMode());
  }

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    this.updateSortable();
  }

  ngOnDestroy(): void {
    this.destroySortable(false);
  }

  select(item: MenuListItem): void {
    this.itemSelected.emit(item);
  }

  private updateItemEditMode(): void {
    this.menuItems?.forEach((item) => {
      item.editMode = this.editMode;
    });
  }

  private updateSortable(): void {
    if (!this.viewInitialized) return;

    const shouldEnable =
      this.items === undefined && this.editMode && this.enableSort;

    if (shouldEnable && !this.sortable) {
      this.initSortable();
    } else if (!shouldEnable && this.sortable) {
      this.destroySortable(true);
    }
  }

  private initSortable(): void {
    if (!this.sortbox) return;

    this.sortable = new Sortable(this.sortbox.nativeElement, {
      handle: '.handle',
      animation: 150,
      chosenClass: 'schosen',
      dragClass: 'sdrag',
      dataIdAttr: 'sort-id',
      scroll: false,
    });
  }

  private destroySortable(emitChange: boolean): void {
    if (!this.sortable) return;

    const order = this.sortable.toArray();
    this.sortable.destroy();
    this.sortable = undefined;

    if (emitChange) {
      this.sortChange.emit(order);
    }
  }
}
