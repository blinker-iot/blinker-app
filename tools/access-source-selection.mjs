// Narrow, pure projections for the reviewed access-source candidate, not a
// general patch engine. Preserve the supplied baseline; never write a worktree.
const API_REFERENCE_IMPORT = "import { isLogicalDeviceReferenceId } from '../core/protocol/device-v2/logical-device-reference';\n";
const API_IMPORT_ANCHOR = "import { environment } from '../../environments/environment';\n";
const API_CONSTANTS = `    ACCESS_REGISTRATION_INTENTS: API_V2_URL + '/access-registrations/intents',
    ACCESS_REGISTRATION_INTENT: (intentId: string) => API_V2_URL + '/access-registrations/intents/' + encodeURIComponent(intentId),
    ACCESS_REGISTRATION_COMMIT: (intentId: string) => API_V2_URL + '/access-registrations/intents/' + encodeURIComponent(intentId) + '/commit',
    ACCESS_REGISTRATION_CANCEL: (intentId: string) => API_V2_URL + '/access-registrations/intents/' + encodeURIComponent(intentId) + '/cancel',
    ACCESS_REGISTRATION_PRESENCE: (logicalDeviceId: string) => API_V2_URL + '/access-registrations/presence/' + encodeURIComponent(logicalDeviceId),
`;
const API_CALL = '    || isAccessRegistrationUrl(url)\n';
const API_HELPER = String.raw`function isAccessRegistrationUrl(url: string): boolean {
  const presence = API_V2_URL + '/access-registrations/presence/';
  if (url.startsWith(presence)) return isLogicalDeviceReferenceId(url.slice(presence.length));
  const collection = API.DEVICE_V2.ACCESS_REGISTRATION_INTENTS;
  if (url === collection) return true;
  if (!url.startsWith(collection + '/')) return false;
  const rest = url.slice(collection.length + 1);
  return /^(?!A{22}(?:\/|$))[A-Za-z0-9_-]{21}[AQgw](?:\/(?:commit|cancel))?$/.test(rest);
}

`;
const API_ANCHORS = [
  "      API_V2_URL + '/ble-enrollment/intents/' + encodeURIComponent(intentId) + '/cancel',\n",
  "    || url.startsWith(API.DEVICE_V2.BLE_ENROLLMENT_INTENTS + '/')\n",
  'function isManagedMapUrl(url: string): boolean {\n',
];
// These are the only separately reviewed API dirty hunks, not selection inputs.
// They are allowed outside access, but always retain the supplied base version.
const LOCATION_HUNKS = [
  `    LOCATION_LATEST: (logicalDeviceId: string) => deviceKeyV2Url(logicalDeviceId) + '/location/latest',
    LOCATION_LEASE: (logicalDeviceId: string) => deviceKeyV2Url(logicalDeviceId) + '/location/lease',
    LOCATION_NETWORK: (logicalDeviceId: string) => deviceKeyV2Url(logicalDeviceId) + '/location/network',
`,
  '  const originalUrl = url;\n',
  String.raw`      || (parts[1] === 'location' && (parts[2] === 'latest' || parts[2] === 'lease'
        || (parts[2] === 'network' && originalUrl === url && /^[A-Za-z0-9_-]{1,128}$/.test(parts[0]))))
`,
];
// Independent ARF-2 hunk: retained from the baseline, not selected as access.
const INSTALL_STATUS_HUNK = "    INSTALL_STATUS: API_V2_URL + '/devices:install-status',\n";
const REGISTRATION_KEYS = [
  'TITLE', 'DESCRIPTION', 'RECORDS', 'READ', 'CONTINUE', 'CANCEL', 'CLEAR',
  'SELECT_TARGET', 'LOCAL_PENDING', 'PREPARED', 'CLOSED', 'READY_TITLE',
  'READY_DESCRIPTION', 'PRESENCE_PENDING', 'REJECTED', 'LIMIT', 'EXISTS',
  'ADMIN_REQUIRED', 'CONTEXT_CHANGED', 'UNSUPPORTED', 'UNCONFIRMED',
  'REFRESH_FAILED', 'LOAD_RECORDS', 'CANCEL_OPERATION', 'NOT_FOUND', 'WORKING',
].map(key => 'BLE_REGISTRATION_' + key).concat('BLE_CLOUD_IDENTITY_CONFLICT');

export function selectAccessApi(base, current) {
  const baseline = source(base, 'ACCESS_SOURCE_API_SHAPE'), dirty = source(current, 'ACCESS_SOURCE_API_SHAPE');
  const code = 'ACCESS_SOURCE_API_SHAPE';
  if (/ACCESS_REGISTRATION_|isAccessRegistrationUrl|isLogicalDeviceReferenceId/.test(baseline.lf)) fail(code);
  let remainder = dirty.lf;
  for (const part of [API_REFERENCE_IMPORT, API_CONSTANTS, API_CALL, API_HELPER]) remainder = replaceOne(remainder, part, '', code);
  if (withoutUnrelatedApi(remainder) !== withoutUnrelatedApi(baseline.lf)) fail(code);
  // Validate all anchors in both inputs. Inserting relative to a moved or
  // duplicated owner would silently widen the selected authentication policy.
  for (const anchor of [API_IMPORT_ANCHOR, ...API_ANCHORS]) {
    requireOne(baseline.lf, anchor, code); requireOne(remainder, anchor, code);
  }
  let selected = replaceOne(baseline.lf, API_IMPORT_ANCHOR, API_IMPORT_ANCHOR + API_REFERENCE_IMPORT, code);
  selected = replaceOne(selected, API_ANCHORS[0], API_ANCHORS[0] + API_CONSTANTS, code);
  selected = replaceOne(selected, API_ANCHORS[1], API_ANCHORS[1] + API_CALL, code);
  selected = replaceOne(selected, API_ANCHORS[2], API_HELPER + API_ANCHORS[2], code);
  // Content extraction is accepted only at those exact original anchors.
  if (withoutUnrelatedApi(selected) !== withoutUnrelatedApi(dirty.lf)) fail(code);
  return baseline.eol === '\n' ? selected : selected.replace(/\n/g, baseline.eol);
}

function withoutUnrelatedApi(text) {
  const present = LOCATION_HUNKS.map(part => text.includes(part));
  if (present.some(Boolean) && !present.every(Boolean)) fail('ACCESS_SOURCE_API_SHAPE');
  for (const part of present.every(Boolean) ? LOCATION_HUNKS : []) {
    text = replaceOne(text, part, '', 'ACCESS_SOURCE_API_SHAPE');
  }
  if (text.includes(INSTALL_STATUS_HUNK)) text = replaceOne(text, INSTALL_STATUS_HUNK, '', 'ACCESS_SOURCE_API_SHAPE');
  return text;
}

export function selectAccessLocale(base, current) {
  const code = 'ACCESS_SOURCE_LOCALE_SHAPE';
  const baseline = locale(base, code), dirty = locale(current, code);
  const guide = dirty.value.DEVICE_GUIDE;
  if (!object(guide) || !dirty.guide) fail(code);
  const actual = Object.keys(guide).filter(registrationKey);
  if (actual.length !== REGISTRATION_KEYS.length || actual.some(key => !REGISTRATION_KEYS.includes(key))) fail(code);
  if (REGISTRATION_KEYS.some(key => typeof guide[key] !== 'string' || !/\S/.test(guide[key]))) fail(code);
  if (baseline.guide && Object.keys(baseline.value.DEVICE_GUIDE).some(registrationKey)) fail(code);
  const lines = REGISTRATION_KEYS.map(key => JSON.stringify(key) + ': ' + JSON.stringify(guide[key]));
  if (baseline.guide) return appendLocaleEntries(base, baseline.guide, lines, '    ', baseline.eol);
  const value = '{' + baseline.eol + '    ' + lines.join(',' + baseline.eol + '    ')
    + baseline.eol + '  }';
  return appendLocaleEntries(base, baseline.root, ['"DEVICE_GUIDE": ' + value], '  ', baseline.eol);
}

function registrationKey(key) { return key.startsWith('BLE_REGISTRATION_') || key === 'BLE_CLOUD_IDENTITY_CONFLICT'; }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function fail(code) { throw Error(code); }
function source(value, code) {
  if (typeof value !== 'string' || value.includes('\0')) fail(code);
  const lf = value.replace(/\r\n/g, '\n');
  if (lf.includes('\r') || (value.includes('\r\n') && /(^|[^\r])\n/.test(value))) fail(code);
  return { lf, eol: value.includes('\r\n') ? '\r\n' : '\n' };
}
function requireOne(text, part, code) {
  const start = text.indexOf(part);
  if (start === -1 || text.indexOf(part, start + part.length) !== -1) fail(code);
  return start;
}
function replaceOne(text, part, replacement, code) {
  const start = requireOne(text, part, code);
  return text.slice(0, start) + replacement + text.slice(start + part.length);
}

// Only locate the root locale and its DEVICE_GUIDE object. JSON.parse validates
// syntax; these ranges preserve every unrelated baseline byte and reject
// duplicate root/guide properties instead of JSON.parse's last-key-wins rule.
function locale(text, code) {
  const { eol } = source(text, code);
  let value;
  try { value = JSON.parse(text.startsWith('\uFEFF') ? text.slice(1) : text); } catch { fail(code); }
  if (!object(value)) fail(code);
  const root = localeObject(text, whitespace(text, text.startsWith('\uFEFF') ? 1 : 0), code);
  const guideProperty = root.properties.find(property => property.key === 'DEVICE_GUIDE');
  if (guideProperty && !object(value.DEVICE_GUIDE)) fail(code);
  const guide = guideProperty ? localeObject(text, guideProperty.start, code) : undefined;
  return { value, root, guide, eol };
}
function localeObject(text, start, code) {
  if (text[start] !== '{') fail(code);
  const properties = [], keys = new Set();
  let offset = whitespace(text, start + 1);
  while (text[offset] !== '}') {
    const keyEnd = stringEnd(text, offset, code);
    const key = JSON.parse(text.slice(offset, keyEnd));
    if (keys.has(key)) fail(code);
    keys.add(key);
    offset = whitespace(text, keyEnd);
    if (text[offset] !== ':') fail(code);
    const valueStart = whitespace(text, offset + 1), valueEnd = valueEndAt(text, valueStart, code);
    properties.push({ key, start: valueStart, end: valueEnd });
    offset = whitespace(text, valueEnd);
    if (text[offset] === '}') break;
    if (text[offset] !== ',') fail(code);
    offset = whitespace(text, offset + 1);
  }
  return { start, end: offset + 1, properties };
}
function stringEnd(text, start, code) {
  if (text[start] !== '"') fail(code);
  for (let offset = start + 1; offset < text.length; offset++) {
    if (text[offset] === '\\') offset++;
    else if (text[offset] === '"') return offset + 1;
  }
  fail(code);
}
function valueEndAt(text, start, code) {
  if (text[start] === '"') return stringEnd(text, start, code);
  if (text[start] === '{' || text[start] === '[') {
    const stack = [text[start]];
    for (let offset = start + 1; offset < text.length; offset++) {
      const char = text[offset];
      if (char === '"') { offset = stringEnd(text, offset, code) - 1; continue; }
      if (char === '{' || char === '[') stack.push(char);
      else if (char === '}' || char === ']') {
        if (stack.pop() !== (char === '}' ? '{' : '[')) fail(code);
        if (!stack.length) return offset + 1;
      }
    }
    fail(code);
  }
  let end = start;
  while (end < text.length && !/[\s,}\]]/.test(text[end])) end++;
  if (end === start) fail(code);
  return end;
}
function whitespace(text, start) {
  while (/[\t\r\n ]/.test(text[start] ?? '') && start < text.length) start++;
  return start;
}
function appendLocaleEntries(text, span, entries, indent, eol) {
  const close = span.end - 1;
  const trailing = text.slice(span.start + 1, close).match(/[\t\r\n ]*$/)[0];
  const insert = close - trailing.length;
  return text.slice(0, insert) + (span.properties.length ? ',' : '') + eol + indent
    + entries.join(',' + eol + indent) + text.slice(insert);
}
