import {
  CallOptions,
  type Connection,
  type Methods,
  type RemoteProxy,
  WindowMessenger,
  connect,
} from 'penpal';

import './styles.css';
import {
  DEVICE_TEMPLATE_VERSION,
  DEVICE_UI_CHANNEL,
  DEVICE_UI_PROTOCOL_VERSION,
  type ChildReadyPayload,
  type CommandResult,
  type DeviceHostContext,
  type DeviceSnapshot,
  type DeviceUpdate,
  type DeviceViewport,
  type HistoryRequest,
  type HistoryResult,
  type JsonObject,
} from './protocol';

interface HostMethods extends Methods {
  getHostContext: () => DeviceHostContext;
  childReady: (payload: ChildReadyPayload) => { ok: boolean };
  childError: (payload: { message: string }) => { ok: boolean };
  sendDeviceCommand: (command: JsonObject) => CommandResult;
  getHistory: (request: HistoryRequest) => HistoryResult;
}

interface TemplateMethods extends Methods {
  setHostContext: (context: DeviceHostContext) => { ok: boolean };
  updateDevice: (update: DeviceUpdate) => { ok: boolean };
  updateViewport: (viewport: DeviceViewport) => { ok: boolean };
  ping: () => 'pong';
}

interface MetricDefinition {
  key: string;
  label: string;
  unit: string;
  icon: string;
}

const METHOD_TIMEOUT = new CallOptions({ timeout: 5000 });
const metricDefinitions: MetricDefinition[] = [
  { key: 'temperature', label: '温度', unit: '°C', icon: '温' },
  { key: 'humidity', label: '湿度', unit: '%', icon: '湿' },
  { key: 'pm25', label: 'PM2.5', unit: 'μg/m³', icon: '净' },
  { key: 'co2', label: 'CO₂', unit: 'ppm', icon: '气' },
  { key: 'power', label: '功率', unit: 'W', icon: '电' },
  { key: 'voltage', label: '电压', unit: 'V', icon: '压' },
  { key: 'current', label: '电流', unit: 'A', icon: '流' },
  { key: 'energy', label: '电量', unit: 'kWh', icon: '量' },
  { key: 'soilMoisture', label: '土壤湿度', unit: '%', icon: '土' },
  { key: 'light', label: '光照', unit: 'lx', icon: '光' },
];

let context = createDemoContext();
let latestRevision = 0;
let hostRemote: RemoteProxy<HostMethods> | null = null;
let connection: Connection<HostMethods> | null = null;
let toastTimer: number | undefined;

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Device template root element was not found.');

app.innerHTML = `
  <main class="device-shell">
    <div class="ambient ambient-one" aria-hidden="true"></div>
    <div class="ambient ambient-two" aria-hidden="true"></div>

    <section class="hero-card">
      <div class="hero-heading">
        <div class="device-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" role="img">
            <path d="M8.5 4.5h7a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-7a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3Z" />
            <path d="M9 8.5h6M9 12h6M9 15.5h3" />
          </svg>
        </div>
        <div>
          <p class="eyebrow" id="device-type">智能设备</p>
          <h1 id="device-name">设备界面模板</h1>
        </div>
      </div>
      <div class="status-pill" id="status-pill">
        <span class="status-dot"></span>
        <span id="status-text">连接中</span>
      </div>
      <p class="hero-caption" id="hero-caption">设备数据将通过安全的 Penpal 通道实时同步。</p>
    </section>

    <section class="control-card" id="switch-card">
      <div>
        <p class="section-kicker">快捷控制</p>
        <h2>设备电源</h2>
        <p class="control-description" id="switch-description">点击按钮发送控制指令</p>
      </div>
      <button class="power-button" id="power-button" type="button" aria-label="切换设备电源" aria-pressed="false">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2v9M6.3 5.7a8 8 0 1 0 11.4 0" />
        </svg>
      </button>
    </section>

    <section class="brightness-card" id="brightness-card" hidden>
      <div class="brightness-heading">
        <div>
          <p class="section-kicker">亮度调节</p>
          <h2>灯光亮度</h2>
        </div>
        <output id="brightness-value">0%</output>
      </div>
      <input id="brightness-slider" type="range" min="0" max="100" step="1" value="0" aria-label="灯光亮度" />
    </section>

    <section aria-labelledby="metrics-title">
      <div class="section-heading">
        <div>
          <p class="section-kicker">实时数据</p>
          <h2 id="metrics-title">设备概览</h2>
        </div>
        <span class="live-label"><span></span> LIVE</span>
      </div>
      <div class="metrics-grid" id="metrics-grid"></div>
      <div class="empty-metrics" id="empty-metrics" hidden>
        等待设备上报可展示的数据
      </div>
    </section>

    <details class="data-card">
      <summary>
        <span>
          <span class="section-kicker">开发信息</span>
          <strong>原始设备数据</strong>
        </span>
        <span class="summary-action">查看 JSON</span>
      </summary>
      <pre id="raw-data">{}</pre>
    </details>

    <footer>
      <span id="bridge-state">正在连接宿主</span>
      <span>Device Template · Penpal</span>
    </footer>
  </main>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
`;

const elements = {
  deviceType: requiredElement('device-type'),
  deviceName: requiredElement('device-name'),
  statusPill: requiredElement('status-pill'),
  statusText: requiredElement('status-text'),
  heroCaption: requiredElement('hero-caption'),
  switchCard: requiredElement('switch-card'),
  switchDescription: requiredElement('switch-description'),
  powerButton: requiredElement<HTMLButtonElement>('power-button'),
  brightnessCard: requiredElement('brightness-card'),
  brightnessSlider: requiredElement<HTMLInputElement>('brightness-slider'),
  brightnessValue: requiredElement<HTMLOutputElement>('brightness-value'),
  metricsGrid: requiredElement('metrics-grid'),
  emptyMetrics: requiredElement('empty-metrics'),
  rawData: requiredElement('raw-data'),
  bridgeState: requiredElement('bridge-state'),
  toast: requiredElement('toast'),
};

elements.powerButton.addEventListener('click', () => void togglePower());
elements.brightnessSlider.addEventListener(
  'change',
  () => void updateBrightness()
);
elements.metricsGrid.addEventListener(
  'click',
  (event) => void loadMetricHistory(event)
);

applyHostContext(context);
void connectHost();

window.addEventListener('pagehide', destroyConnection, { once: true });

async function connectHost(): Promise<void> {
  if (window.parent === window) {
    elements.bridgeState.textContent = '独立预览模式';
    showToast('当前为模板独立预览，嵌入设备页后将连接真实设备。');
    return;
  }

  const messenger = new WindowMessenger({
    remoteWindow: window.parent,
    allowedOrigins: resolveParentOrigins(),
  });
  const nextConnection = connect<HostMethods>({
    messenger,
    channel: DEVICE_UI_CHANNEL,
    timeout: 10000,
    methods: createTemplateMethods(),
  });
  connection = nextConnection;

  let remote: RemoteProxy<HostMethods>;
  try {
    remote = await nextConnection.promise;
    if (connection !== nextConnection) return;
  } catch (error) {
    if (connection !== nextConnection) return;
    const message = errorMessage(error);
    elements.bridgeState.textContent = '宿主连接失败';
    showToast(`无法连接设备宿主：${message}`);
    return;
  }

  hostRemote = remote;
  // Reporting readiness is best-effort. A delayed RPC acknowledgement must
  // not turn a successfully connected and rendered template into an error.
  void remote
    .childReady(
      {
        protocolVersion: DEVICE_UI_PROTOCOL_VERSION,
        templateVersion: DEVICE_TEMPLATE_VERSION,
      },
      METHOD_TIMEOUT
    )
    .catch(() => undefined);

  try {
    const hostContext = await remote.getHostContext(METHOD_TIMEOUT);
    if (connection !== nextConnection) return;
    applyHostContext(hostContext);
    elements.bridgeState.textContent = '已连接设备宿主';
  } catch (error) {
    if (connection !== nextConnection) return;
    const message = errorMessage(error);
    elements.bridgeState.textContent = '已连接设备宿主';
    showToast(`设备数据同步稍有延迟：${message}`);
  }
}

function createTemplateMethods(): TemplateMethods {
  return {
    setHostContext(nextContext: DeviceHostContext) {
      applyHostContext(nextContext);
      return { ok: true };
    },
    updateDevice(update: DeviceUpdate) {
      if (update.revision >= latestRevision) {
        latestRevision = update.revision;
        context = { ...context, device: update.device };
        render();
      }
      return { ok: true };
    },
    updateViewport(viewport: DeviceViewport) {
      context = { ...context, viewport };
      applyViewport(viewport);
      return { ok: true };
    },
    ping: () => 'pong',
  };
}

function applyHostContext(nextContext: DeviceHostContext): void {
  if (nextContext.protocolVersion !== DEVICE_UI_PROTOCOL_VERSION) {
    throw new Error(`不支持的设备界面协议版本：${nextContext.protocolVersion}`);
  }
  context = nextContext;
  applyViewport(nextContext.viewport);
  render();
}

function render(): void {
  const { device } = context;
  const online = isOnline(device);
  const switchOn =
    device.data['switch'] === 'on' || device.data['switch'] === true;
  const showSwitch = device.showSwitch || Object.hasOwn(device.data, 'switch');

  document.title = `${device.name} · Blinker`;
  elements.deviceName.textContent = device.name || device.deviceName;
  elements.deviceType.textContent = device.type || 'Blinker 设备';
  elements.statusText.textContent = online ? '在线' : '离线';
  elements.statusPill.classList.toggle('is-online', online);
  elements.heroCaption.textContent = device.isPreview
    ? '当前为预览设备，界面数据由 Blinker 示例环境提供。'
    : `${device.mode.toUpperCase()} 模式 · 数据通过 Penpal 安全同步`;

  elements.switchCard.hidden = !showSwitch;
  elements.powerButton.classList.toggle('is-on', switchOn);
  elements.powerButton.setAttribute('aria-pressed', String(switchOn));
  elements.switchDescription.textContent = switchOn
    ? '设备当前已开启'
    : '设备当前已关闭';

  renderBrightness(device);
  renderMetrics(device);
  elements.rawData.textContent = JSON.stringify(device.data, null, 2);
}

function renderBrightness(device: DeviceSnapshot): void {
  const key = Object.hasOwn(device.data, 'bright')
    ? 'bright'
    : Object.hasOwn(device.data, 'brightness')
    ? 'brightness'
    : '';
  const value = key ? Number(device.data[key]) : Number.NaN;
  const visible = !!key && Number.isFinite(value);
  elements.brightnessCard.hidden = !visible;
  if (!visible) return;
  const normalized = Math.min(100, Math.max(0, Math.round(value)));
  elements.brightnessSlider.dataset['commandKey'] = key;
  elements.brightnessSlider.value = String(normalized);
  elements.brightnessValue.value = `${normalized}%`;
}

function renderMetrics(device: DeviceSnapshot): void {
  const metrics = collectMetrics(device.data);
  elements.metricsGrid.innerHTML = metrics
    .map(
      (metric) => `
        <button class="metric-card" type="button" data-history-key="${escapeHtml(
          metric.key
        )}">
          <span class="metric-icon">${escapeHtml(metric.icon)}</span>
          <span class="metric-copy">
            <span class="metric-label">${escapeHtml(metric.label)}</span>
            <strong>${escapeHtml(
              formatValue(device.data[metric.key])
            )}<small>${escapeHtml(metric.unit)}</small></strong>
          </span>
        </button>
      `
    )
    .join('');
  elements.emptyMetrics.hidden = metrics.length > 0;
}

function collectMetrics(data: JsonObject): MetricDefinition[] {
  const known = metricDefinitions.filter((metric) =>
    isMetricValue(data[metric.key])
  );
  if (known.length >= 4) return known.slice(0, 4);

  const used = new Set(known.map((metric) => metric.key));
  const ignored = new Set([
    'switch',
    'state',
    'enable',
    'connected',
    'bright',
    'brightness',
  ]);
  const generic = Object.entries(data)
    .filter(
      ([key, value]) =>
        !used.has(key) && !ignored.has(key) && isMetricValue(value)
    )
    .map(([key]) => ({
      key,
      label: humanizeKey(key),
      unit: '',
      icon: key.slice(0, 1).toUpperCase(),
    }));
  return [...known, ...generic].slice(0, 4);
}

async function togglePower(): Promise<void> {
  const current = context.device.data['switch'];
  const next = current === 'on' || current === true ? 'off' : 'on';
  const result = await sendCommand({ switch: next });
  if (!result.accepted) return;
  context.device.data['switch'] = next;
  render();
  showToast(next === 'on' ? '开启指令已发送' : '关闭指令已发送');
}

async function updateBrightness(): Promise<void> {
  const key = elements.brightnessSlider.dataset['commandKey'];
  if (!key) return;
  const value = Number(elements.brightnessSlider.value);
  elements.brightnessValue.value = `${value}%`;
  const result = await sendCommand({ [key]: value });
  if (result.accepted) showToast(`亮度已调整为 ${value}%`);
}

async function sendCommand(command: JsonObject): Promise<CommandResult> {
  if (!hostRemote) {
    showToast('独立预览模式不会发送设备指令');
    return { accepted: false, reason: 'not-connected' };
  }
  try {
    const result = await hostRemote.sendDeviceCommand(command, METHOD_TIMEOUT);
    if (!result.accepted) showToast(commandFailureText(result.reason));
    return result;
  } catch (error) {
    showToast(`指令发送失败：${errorMessage(error)}`);
    return { accepted: false, reason: 'rpc-error' };
  }
}

async function loadMetricHistory(event: Event): Promise<void> {
  const target = (event.target as HTMLElement).closest<HTMLElement>(
    '[data-history-key]'
  );
  const key = target?.dataset['historyKey'];
  if (!key || !hostRemote || !context.capabilities.history) return;
  try {
    const result: HistoryResult = await hostRemote.getHistory(
      { key, quickCode: '1h' },
      METHOD_TIMEOUT
    );
    showToast(
      result.ok
        ? `${humanizeKey(key)}最近一小时有 ${result.points.length} 条记录`
        : `历史数据读取失败：${result.error}`
    );
  } catch (error) {
    showToast(`历史数据读取失败：${errorMessage(error)}`);
  }
}

function applyViewport(viewport: DeviceViewport): void {
  document.documentElement.style.setProperty(
    '--host-width',
    `${viewport.width}px`
  );
  document.documentElement.style.setProperty(
    '--host-height',
    `${viewport.height}px`
  );
  document.documentElement.style.setProperty(
    '--host-header-height',
    `${viewport.headerHeight}px`
  );
}

function resolveParentOrigins(): (string | RegExp)[] {
  const params = new URLSearchParams(window.location.search);
  if (params.get('blinkerBundled') === '1') return ['*'];
  if (params.get('blinkerOpaqueParent') === '1') return ['*'];
  const configuredOrigin = normalizeOrigin(params.get('blinkerParentOrigin'));
  if (configuredOrigin) return [configuredOrigin];

  const referrerOrigin = normalizeOrigin(document.referrer);
  if (referrerOrigin) return [referrerOrigin];

  const localOrigin = serializeOrigin(window.location);
  return localOrigin ? [localOrigin] : ['*'];
}

function normalizeOrigin(value: string | null): string {
  if (!value) return '';
  try {
    return serializeOrigin(new URL(value));
  } catch {
    return '';
  }
}

function serializeOrigin(
  url: Pick<URL, 'origin' | 'protocol' | 'host'>
): string {
  if (url.origin && url.origin !== 'null') return url.origin;
  return url.protocol && url.host ? `${url.protocol}//${url.host}` : '';
}

function createDemoContext(): DeviceHostContext {
  return {
    protocolVersion: DEVICE_UI_PROTOCOL_VERSION,
    capabilities: { commands: false, history: false },
    viewport: {
      headerHeight: 0,
      width: window.innerWidth,
      height: window.innerHeight,
      pixelRatio: window.devicePixelRatio || 1,
    },
    device: {
      id: 'device-template-preview',
      deviceName: 'device-template-preview',
      name: '客厅环境管家',
      type: '环境监测器',
      mode: 'mqtt',
      isPreview: true,
      showSwitch: true,
      data: {
        enable: true,
        state: 'online',
        switch: 'on',
        temperature: 23.8,
        humidity: 56,
        pm25: 18,
        co2: 620,
        brightness: 72,
      },
    },
  };
}

function isOnline(device: DeviceSnapshot): boolean {
  const state = String(device.data['state'] ?? '').toLowerCase();
  return (
    device.data['enable'] === true || ['online', 'connected'].includes(state)
  );
}

function isMetricValue(value: unknown): boolean {
  return typeof value === 'number' || typeof value === 'string';
}

function formatValue(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  return String(value ?? '--');
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (value) => value.toUpperCase());
}

function commandFailureText(reason?: string): string {
  if (reason === 'preview') return '预览设备不会发送真实控制指令';
  if (reason === 'invalid-command') return '设备指令格式无效';
  if (reason === 'command-too-large') return '设备指令内容过大';
  return reason || '设备暂时无法接收指令';
}

function showToast(message: string): void {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove('is-visible');
  }, 2600);
}

function destroyConnection(): void {
  connection?.destroy();
  connection = null;
  hostRemote = null;
  window.clearTimeout(toastTimer);
}

function requiredElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Required element #${id} was not found.`);
  return element as T;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '未知错误');
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[
        character
      ] || character)
  );
}
