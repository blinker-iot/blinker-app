import { NgModule } from "@angular/core";
import { CommonModule } from "@angular/common";
import { IonicModule } from "@ionic/angular";
import { DatakeyComponent } from "./datakey/datakey.component";
import { DevtoolComponent } from "./devtool/devtool.component";
import { ProdeviceComponent } from "./prodevice/prodevice.component";
import { AuthenticationComponent } from "./authentication/authentication.component";
import { FormsModule } from "@angular/forms";
import { ProdeviceInfoComponent } from "./prodevice-info/prodevice-info.component";
import { ComponentsModule } from "src/app/core/components/components.module";
import { RouterModule } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";

@NgModule({
    declarations: [
        DatakeyComponent,
        DevtoolComponent,
        ProdeviceComponent,
        AuthenticationComponent,
        ProdeviceInfoComponent
    ],
    imports: [
        CommonModule,
        IonicModule,
        FormsModule,
        ComponentsModule,
        RouterModule,
        TranslateModule.forChild()
    ],
    exports: [
        DatakeyComponent,
        DevtoolComponent,
        ProdeviceComponent,
        AuthenticationComponent,
        ProdeviceInfoComponent
    ]
})
export class devCenterComponentsModule { }