import '@angular/compiler';
import { HttpHeaders, HttpResponse } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { API } from '../../../configs/api.config';
import { HttpAutomationApi } from './http';
const source = { deviceId: 's', key: 'power', fingerprint: 'ab'.repeat(32), valueType: 'boolean' as const };
const write = { expectedRevision: 0, enabled: false, source, target: { ...source, deviceId: 't', value: false } };
const detail = { rule: { ...write, expectedRevision: undefined, ruleId: 'r', definitionRevision: 1,
  condition: 'rising-boolean', policyVersion: 1, status: 'disabled', targetOutcomeUnknown: false, retiredAtMs: null, updatedAtMs: 1 }, recentExecutions: [] };
delete detail.rule.expectedRevision;
const response = (data: unknown, headers = new HttpHeaders({ 'Cache-Control': 'private, no-store' })) => new HttpResponse({ status: 200, headers, body: { status: 200, data } });
describe('automation HTTP account channel', () => {
  it('uses ordinary JSON routes/body without device credentials and validates no-store/envelope', async () => {
    const http = { request: vi.fn((_method: string, _url: string, _options: unknown) => of(response(detail))) }, api = new HttpAutomationApi(http as any), signal = new AbortController().signal;
    await api.write({ ruleId: 'r', operation: 'put', body: write }, signal);
    expect(http.request).toHaveBeenCalledWith('PUT', API.AUTOMATION.RULE('r'), { body: write, observe: 'response' });
    await api.write({ ruleId: 'r', operation: 'retire', body: { expectedRevision: 1 } }, signal);
    expect(http.request.mock.calls[1][0]).toBe('POST'); expect(http.request.mock.calls[1][1]).toBe(API.AUTOMATION.RULE('r') + '/retire');
    http.request.mockReturnValueOnce(of(response({ rules: [detail.rule], nextAfter: null })));
    expect((await api.list(false, undefined, signal)).rules).toHaveLength(1);
    http.request.mockReturnValueOnce(of(response(detail, new HttpHeaders()))); await expect(api.get('r', signal)).rejects.toThrow();
    await expect(api.get('wrong', signal)).rejects.toThrow();
  });
  it('cancel unsubscribes HTTP and never retries implicitly', async () => {
    const unsubscribed = vi.fn(), http = { request: vi.fn(() => new Observable(() => unsubscribed)) }, api = new HttpAutomationApi(http as any);
    const controller = new AbortController(); const running = api.get('r', controller.signal); const failed = expect(running).rejects.toThrow();
    controller.abort(); await failed; expect(unsubscribed).toHaveBeenCalledTimes(1); expect(http.request).toHaveBeenCalledTimes(1);
    await expect(api.get('r', controller.signal)).rejects.toThrow(); expect(http.request).toHaveBeenCalledTimes(1);
  });
  it('sends closed V2 six-field JSON on the same account route and receives mixed-policy rules without new headers', async () => {
    const typed = { ...write, source: { ...source, valueType: 'float32' as const }, policyVersion: 2 as const,
      condition: { kind: 'numeric-threshold' as const, direction: 'above' as const, threshold: 30, hysteresis: 2 } };
    const value = { ...detail, rule: { ...detail.rule, source: typed.source, policyVersion: 2, condition: typed.condition } };
    const http = { request: vi.fn((_method: string, _url: string, _options: unknown) => of(response(value))) }, api = new HttpAutomationApi(http as any);
    const signal = new AbortController().signal;
    expect((await api.write({ ruleId: 'r', operation: 'put', body: typed }, signal)).rule.policyVersion).toBe(2);
    expect(http.request).toHaveBeenCalledWith('PUT', API.AUTOMATION.RULE('r'), { body: typed, observe: 'response' });
    expect(Object.keys((http.request.mock.calls[0][2] as any).body)).toEqual(['expectedRevision', 'enabled', 'source', 'target', 'policyVersion', 'condition']);
    http.request.mockReturnValueOnce(of(response({ rules: [{ ...detail.rule, ruleId: 'legacy' }, value.rule], nextAfter: null })));
    expect((await api.list(false, undefined, signal)).rules.map(rule => rule.policyVersion)).toEqual([1, 2]);
    const retired = { ...value, rule: { ...value.rule, definitionRevision: 2, enabled: false, status: 'retired', retiredAtMs: 1 } };
    http.request.mockReturnValueOnce(of(response(retired)));
    expect((await api.write({ ruleId: 'r', operation: 'retire', body: { expectedRevision: 1 } }, signal)).rule.status).toBe('retired');
  });
  it('rejects unknown input before sending and unknown response after one account request, without fallback', async () => {
    const http = { request: vi.fn((_method: string, _url: string, _options: unknown) => of(response({ ...detail, rule: { ...detail.rule, policyVersion: 3 } }))) };
    const api = new HttpAutomationApi(http as any), signal = new AbortController().signal;
    await expect(api.write({ ruleId: 'r', operation: 'put', body: { ...write, policyVersion: 3 } } as any, signal)).rejects.toThrow();
    expect(http.request).not.toHaveBeenCalled(); await expect(api.get('r', signal)).rejects.toThrow();
    expect(http.request).toHaveBeenCalledTimes(1);
  });
  it('sends and receives optional normalized names on the existing account route, without changing legacy bodies', async () => {
    const named = { ...detail, rule: { ...detail.rule, name: '开灯' } };
    const http = { request: vi.fn((_method: string, _url: string, _options: unknown) => of(response(named))) };
    const api = new HttpAutomationApi(http as any), signal = new AbortController().signal;
    expect((await api.write({ ruleId: 'r', operation: 'put', body: { ...write, name: '  开灯  ' } }, signal)).rule.name).toBe('开灯');
    expect(http.request).toHaveBeenCalledWith('PUT', API.AUTOMATION.RULE('r'), { body: { ...write, name: '开灯' }, observe: 'response' });
    http.request.mockReturnValueOnce(of(response(detail)));
    await api.write({ ruleId: 'r', operation: 'put', body: write }, signal);
    expect(Object.hasOwn((http.request.mock.calls[1][2] as any).body, 'name')).toBe(false);
    await expect(api.write({ ruleId: 'r', operation: 'put', body: { ...write, name: '' } }, signal)).rejects.toThrow();
    expect(http.request).toHaveBeenCalledTimes(2);
  });
});
