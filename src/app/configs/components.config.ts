import { Layouter2 } from "../core/device/layouter2/layouter2";
import { Customizer } from "../core/device/customizer/customizer.component";
import { OwnPlugDashboard } from "../devices/own/own-plug/own-plug-dashboard/own-plug-dashboard";
import { OwnAirdetectorDashboard } from "../devices/own/own-airdetector/own-airdetector-dashboard/own-airdetector-dashboard";
import { OwnLightDashboard } from "../devices/own/own-light/own-light-dashboard/own-light-dashboard";
import { OwnLight1Dashboard } from "../devices/own/own-light1/own-light1-dashboard/own-light1-dashboard";
// import { Layouter3 } from "../core/device/layouter3/layouter";

export const deviceComponentDict = {
    'Layouter2': Layouter2,
    // 'Layouter3': Layouter3,
    'Customizer': Customizer,

    
    'OwnPlugDashboard': OwnPlugDashboard,
    'OwnLightDashboard': OwnLightDashboard,
    'OwnLight1Dashboard': OwnLight1Dashboard,
    // 待开发
    'OwnAirdetectorDashboard': OwnAirdetectorDashboard
};