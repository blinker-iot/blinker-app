import { HttpClient } from '@angular/common/http';
import { firstValueFrom, fromEvent, takeUntil, timeout } from 'rxjs';
import { API } from '../../../configs/api.config';
import { AutomationApi } from './client';
import { AutomationIntent, automationAssert, automationDetail, automationId, automationIntent, automationPage } from './contract';

export class HttpAutomationApi implements AutomationApi {
  constructor(private readonly http: HttpClient) {}
  private async request(method: string, url: string, body: unknown, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted();
    const response = await firstValueFrom(this.http.request<{ status: number; data: unknown }>(method, url,
      { body, observe: 'response' }).pipe(timeout(15000), takeUntil(fromEvent(signal, 'abort'))));
    signal.throwIfAborted();
    automationAssert(response.status === 200 && response.body?.status === 200
      && /(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get('Cache-Control') ?? ''));
    return response.body.data;
  }
  async list(retired: boolean, after: string | undefined, signal: AbortSignal) {
    if (after !== undefined) automationId(after);
    const query = new URLSearchParams({ retired: String(retired), ...(after ? { after } : {}) });
    return automationPage(await this.request('GET', `${API.AUTOMATION.LIST}?${query}`, undefined, signal));
  }
  async get(id: string, signal: AbortSignal) {
    automationId(id); return automationDetail(await this.request('GET', API.AUTOMATION.RULE(id), undefined, signal), id);
  }
  async write(input: AutomationIntent, signal: AbortSignal) {
    const intent = automationIntent(input), url = API.AUTOMATION.RULE(intent.ruleId);
    return automationDetail(await this.request(intent.operation === 'put' ? 'PUT' : 'POST',
      intent.operation === 'put' ? url : `${url}/retire`, intent.body, signal), intent.ruleId);
  }
}
