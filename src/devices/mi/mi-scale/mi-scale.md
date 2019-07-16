import { Device } from './../../../classes/device';

export class MiScale extends Device {
  image = 'mi-scale.png';
  deviceType = 'MiScale';
  mqttBroker = 'local';
  productKey = 'MiScale';
  customName = '小米体重秤';
  showSwitch = false;
  deviceName;
  state;
  weight;
}