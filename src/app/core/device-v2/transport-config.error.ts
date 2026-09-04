export class DeviceV2TransportConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeviceV2TransportConfigError';
  }
}
