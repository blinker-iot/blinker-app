import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BottomBtnComponent } from './bottom-btn/bottom-btn.component';
import { ItemComponent } from './item/item.component';
import { ItemListComponent } from './item-list/item-list.component';



@NgModule({
  declarations: [
    BottomBtnComponent,
    ItemComponent,
    ItemListComponent
  ],
  imports: [
    CommonModule
  ],
  exports: [
    BottomBtnComponent,
    ItemComponent,
    ItemListComponent
  ]
})
export class NewuiModule { }
