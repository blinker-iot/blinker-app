import { Customizer } from "../device/customizer/customizer.component";
import { Layouter2 } from "../device/layouter2/layouter2";
import { OwnAirdetectorDashboard } from "../device/template/own/own-airdetector/own-airdetector-dashboard/own-airdetector-dashboard";
import { OwnLightDashboard } from "../device/template/own/own-light/own-light-dashboard/own-light-dashboard";
import { OwnLight1Dashboard } from "../device/template/own/own-light1/own-light1-dashboard/own-light1-dashboard";
import { OwnPlugDashboard } from "../device/template/own/own-plug/own-plug-dashboard/own-plug-dashboard";

export const deviceComponentDict = {
    'Layouter2': Layouter2,
    'Customizer': Customizer,

    'OwnPlugDashboard': OwnPlugDashboard,
    'OwnLightDashboard': OwnLightDashboard,
    'OwnLight1Dashboard': OwnLight1Dashboard,
    // 待开发
    'OwnAirdetectorDashboard': OwnAirdetectorDashboard
};