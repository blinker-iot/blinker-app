import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';

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
  styleUrls: ['./menu-list.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuListComponent {
  @Input({ required: true }) items: readonly MenuListItem[] = [];
  @Input() detailed = false;
  @Input() ariaLabel?: string;

  @Output() readonly itemSelected = new EventEmitter<MenuListItem>();

  select(item: MenuListItem): void {
    this.itemSelected.emit(item);
  }
}
