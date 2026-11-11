import { SelfHostedServerPage } from './self-hosted-server.page';

describe('SelfHostedServerPage local configuration contract', () => {
  let page: SelfHostedServerPage;
  let service: {
    getConfig: ReturnType<typeof vi.fn>;
    normalizeAddress: ReturnType<typeof vi.fn>;
    saveConfig: ReturnType<typeof vi.fn>;
    clearConfig: ReturnType<typeof vi.fn>;
  };
  let alertController: { create: ReturnType<typeof vi.fn> };
  let present: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = {
      getConfig: vi.fn().mockReturnValue(null),
      normalizeAddress: vi.fn().mockReturnValue('https://server.example.com'),
      saveConfig: vi.fn().mockImplementation((address, key) => ({ address, key })),
      clearConfig: vi.fn(),
    };
    present = vi.fn().mockResolvedValue(undefined);
    alertController = {
      create: vi.fn().mockResolvedValue({ present }),
    };
    page = new SelfHostedServerPage(service as never, alertController as never);
  });

  it('starts empty and masked without connecting or saving anything', () => {
    expect(page.serverAddress).toBe('');
    expect(page.serverKey).toBe('');
    expect(page.showKey).toBe(false);
    expect(page.hasSavedConfig).toBe(false);
    expect(page.saved).toBe(false);
    expect(page.addressError).toBe('');
    expect(page.keyError).toBe('');
    expect(service.saveConfig).not.toHaveBeenCalled();
  });

  it('restores exact persisted values but does not treat them as a new save', () => {
    service.getConfig.mockReturnValue({
      address: 'wss://server.example.com/socket',
      key: ' secret with spaces ',
    });
    page = new SelfHostedServerPage(service as never, alertController as never);

    expect(page.serverAddress).toBe('wss://server.example.com/socket');
    expect(page.serverKey).toBe(' secret with spaces ');
    expect(page.hasSavedConfig).toBe(true);
    expect(page.showKey).toBe(false);
    expect(page.saved).toBe(false);
    expect(service.saveConfig).not.toHaveBeenCalled();
  });

  it('reports both missing fields locally and does not save', () => {
    service.normalizeAddress.mockReturnValue(null);
    page.save();

    expect(page.addressError).toBe('请输入包含协议的有效服务器地址');
    expect(page.keyError).toBe('请输入服务器密钥');
    expect(page.saved).toBe(false);
    expect(service.saveConfig).not.toHaveBeenCalled();
  });

  it('saves only the existing normalized address and exact key', () => {
    page.serverAddress = ' https://server.example.com/ ';
    page.serverKey = ' secret with spaces ';
    page.save();

    expect(service.normalizeAddress).toHaveBeenCalledWith(' https://server.example.com/ ');
    expect(service.saveConfig).toHaveBeenCalledWith(
      'https://server.example.com',
      ' secret with spaces ',
    );
    expect(page.serverAddress).toBe('https://server.example.com');
    expect(page.serverKey).toBe(' secret with spaces ');
    expect(page.saved).toBe(true);
    expect(page.hasSavedConfig).toBe(true);
  });

  it('editing clears only the related validation and the old success message', () => {
    page.saved = true;
    page.addressError = 'address-error';
    page.keyError = 'key-error';
    page.clearValidation('address');

    expect(page.addressError).toBe('');
    expect(page.keyError).toBe('key-error');
    expect(page.saved).toBe(false);
    expect(service.saveConfig).not.toHaveBeenCalled();
    page.clearValidation('key');
    expect(page.keyError).toBe('');
  });

  it('visibility toggles locally and remasks on leave without changing the draft', () => {
    page.serverAddress = 'http://server.example.com';
    page.serverKey = 'draft-secret';
    page.toggleKeyVisibility();
    expect(page.showKey).toBe(true);
    page.ionViewWillLeave();

    expect(page.showKey).toBe(false);
    expect(page.serverAddress).toBe('http://server.example.com');
    expect(page.serverKey).toBe('draft-secret');
    expect(service.saveConfig).not.toHaveBeenCalled();
    expect(service.clearConfig).not.toHaveBeenCalled();
  });

  it('waits for explicit destructive confirmation before clearing local configuration', async () => {
    page.serverAddress = 'https://server.example.com';
    page.serverKey = 'saved-secret';
    page.hasSavedConfig = true;
    page.saved = true;
    page.showKey = true;
    await page.confirmClear();

    expect(present).toHaveBeenCalledTimes(1);
    expect(service.clearConfig).not.toHaveBeenCalled();
    expect(page.serverKey).toBe('saved-secret');
    const options = alertController.create.mock.calls[0][0];
    expect(options.buttons[0]).toEqual({ text: '取消', role: 'cancel' });
    expect(options.buttons[1]).toMatchObject({ text: '清除', role: 'destructive' });
    options.buttons[1].handler();

    expect(service.clearConfig).toHaveBeenCalledTimes(1);
    expect(page.serverAddress).toBe('');
    expect(page.serverKey).toBe('');
    expect(page.hasSavedConfig).toBe(false);
    expect(page.saved).toBe(false);
    expect(page.showKey).toBe(false);
  });

  it('retains the exact draft and saved-config state when storage save fails, then permits retry', () => {
    page.serverAddress = ' https://server.example.com/ ';
    page.serverKey = ' secret with spaces ';
    page.hasSavedConfig = true;
    page.saved = true;
    service.saveConfig.mockImplementationOnce(() => {
      throw new Error('private storage detail');
    });

    expect(() => page.save()).not.toThrow();
    expect(page.operationError).toBe('配置未能保存在本机，请稍后重试。');
    expect(page.serverAddress).toBe(' https://server.example.com/ ');
    expect(page.serverKey).toBe(' secret with spaces ');
    expect(page.hasSavedConfig).toBe(true);
    expect(page.saved).toBe(false);

    page.save();
    expect(page.operationError).toBe('');
    expect(page.saved).toBe(true);
    expect(page.serverAddress).toBe('https://server.example.com');
  });

  it('retains values and saved-config state when confirmed clear fails, then permits retry', async () => {
    page.serverAddress = 'https://server.example.com';
    page.serverKey = ' saved-secret ';
    page.hasSavedConfig = true;
    page.saved = true;
    page.showKey = true;
    service.clearConfig.mockImplementationOnce(() => {
      throw new Error('private storage detail');
    });
    await page.confirmClear();
    const clear = alertController.create.mock.calls[0][0].buttons[1].handler;

    expect(() => clear()).not.toThrow();
    expect(page.operationError).toBe('配置暂未清除，请稍后重试。');
    expect(page.serverAddress).toBe('https://server.example.com');
    expect(page.serverKey).toBe(' saved-secret ');
    expect(page.hasSavedConfig).toBe(true);
    expect(page.showKey).toBe(true);
    expect(page.saved).toBe(false);

    clear();
    expect(page.operationError).toBe('');
    expect(page.serverAddress).toBe('');
    expect(page.serverKey).toBe('');
    expect(page.hasSavedConfig).toBe(false);
    expect(page.showKey).toBe(false);
    expect(page.saved).toBe(false);
  });
});
