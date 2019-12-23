import { NgModule } from "@angular/core";
import { CommonModule } from "@angular/common";
import { IonicModule } from "@ionic/angular";
import { DatakeyComponent } from "./datakey/datakey.component";
import { DevtoolComponent } from "./devtool/devtool.component";
import { ProdeviceComponent } from "./prodevice/prodevice.component";
import { AuthenticationComponent } from "./authentication/authentication.component";
import { FormsModule } from "@angular/forms";
import { ProdeviceInfoComponent } from "./prodevice-info/prodevice-info.component";

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
        FormsModule
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