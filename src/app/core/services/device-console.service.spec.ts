import { of } from 'rxjs';
import { DeviceConsole, DeviceConsoleService } from './device-console.service';

const id = 'device_stored_schema1_console';
const baseUrl = 'https://gateway.example';

function storedConsole(): DeviceConsole {
  return {
    logicalDeviceId: id, name: 'R4 WiFi', deviceType: 'WiFi', revision: 0,
    layout: { schemaVersion: 1, revision: 1, manifestFingerprint: 'ab'.repeat(32), columns: 8,
      widgets: [
        { widgetId: 'endpoint-1', type: 'switch', endpointKey: 'power', grid: { x: 0, y: 0, width: 8, height: 1 } },
        { widgetId: 'endpoint-2', type: 'value', endpointKey: 'buttonPresses', grid: { x: 0, y: 1, width: 8, height: 1 } },
        { widgetId: 'endpoint-3', type: 'button', endpointKey: 'button', grid: { x: 0, y: 2, width: 8, height: 1 } },
        { widgetId: 'endpoint-4', type: 'value', endpointKey: 'uptimeSeconds', grid: { x: 0, y: 3, width: 8, height: 1 } },
      ] },
    uiConfig: {}, defaultMode: 'normal', availableModes: ['normal'],
    capabilities: { canRead: true, canCommand: true, commandEndpointKeys: null,
      canEditConsole: true, canManageSharing: true },
  };
}

describe('DeviceConsoleService stored PageLayout compatibility', () => {
  it('reads the existing full-row schema-1 controls unchanged through Console', async () => {
    const stored = storedConsole(), get = vi.fn(() => of({ data: stored }));
    const service = new DeviceConsoleService({ get } as any, baseUrl);
    await expect(service.get(id)).resolves.toEqual(stored);
    expect(get).toHaveBeenCalledWith(`${baseUrl}/api/v2/devices/${id}/console`);
  });

  it('does not treat explicit new variants or malformed legacy grids as old layouts', async () => {
    for (const change of [{ variant: 'tile' }, { options: {} }, { grid: { x: 1, y: 0, width: 8, height: 1 } }]) {
      const stored = storedConsole();
      stored.layout!.widgets[0] = { ...stored.layout!.widgets[0], ...change } as any;
      const service = new DeviceConsoleService({ get: () => of({ data: stored }) } as any, baseUrl);
      await expect(service.get(id)).rejects.toThrow(/size is not allowed|exceeds the grid/);
    }
  });
});
