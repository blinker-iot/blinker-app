import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Menu } from './menu';
import { DirectivesModule } from 'src/app/core/directives/directives.module';
import { TranslateModule } from '@ngx-translate/core';
import { ComponentsModule } from 'src/app/core/components/components.module';
import { LangSelectorModule } from 'src/app/core/components/lang-selector/lang-selector.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DirectivesModule,
    ComponentsModule,
    LangSelectorModule,
    TranslateModule.forChild()
  ],
  declarations: [Menu],
  exports: [
    Menu
  ]
})
export class MenuModule { }
