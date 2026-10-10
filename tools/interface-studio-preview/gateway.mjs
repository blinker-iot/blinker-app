// Local QA only: production Gateway handler with a synthetic device identity.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
const require = createRequire(import.meta.url);
export async function startFixtureGateway(root) {
  const liveModel = process.env.STUDIO_QA_LIVE_MODEL === '1';
  const modelEnv = liveModel ? parseEnv(readFileSync(resolve(root, '../aily-blinker-services/.env'), 'utf8')) : null;
  if (liveModel && ['INTERFACE_AI_URL', 'INTERFACE_AI_MODEL', 'INTERFACE_AI_KEY'].some(key => !modelEnv[key]?.trim())) {
    throw new Error('Configure the model in aily-blinker-services/.env before live model QA');
  }
  const { createInterfaceGenerationHandler } = require(resolve(root, '../aily-blinker-services/services/gateway/src/interface-generation.js'));
  const server = createServer(async (req, res) => {
    if (req.url === '/studio-api/config' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ liveModel, model: liveModel ? modelEnv.INTERFACE_AI_MODEL : 'fixture' }));
      return;
    }
    const scenario = req.headers['x-studio-scenario'];
    let request;
    const handler = createInterfaceGenerationHandler({
      env: liveModel ? modelEnv : scenario === 'unavailable' ? {} : { INTERFACE_AI_URL: 'http://127.0.0.1/fixture-model', INTERFACE_AI_MODEL: 'fixture', INTERFACE_AI_KEY: 'fixture-only' },
      resolveIdentity: async () => ({ identity: { user: { ailyUserId: 'qa-fixture' }, tenant: { id: 'qa-fixture' } } }),
      parseBody: async () => { let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 32768) throw new Error('large request'); } request = JSON.parse(text); return request; },
      sendJson: (response, status, body) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(body)); },
      fetch: liveModel ? fetch : async (_url, init) => {
        const ordered = [...request.widgets].sort((a, b) => {
          const rank = widget => request.style === 'technical' ? (widget.type === 'value' ? 0 : 1) : (['switch', 'button'].includes(widget.type) ? 0 : 1);
          return rank(a) - rank(b);
        });
        if (request.prompt.includes('温度置顶')) ordered.sort((a, b) => Number(b.title.includes('温度')) - Number(a.title.includes('温度')));
        const widgets = ordered.map((widget, i) => ({ id: widget.id, title: widget.title,
          width: request.density === 'focus' || ['slider', 'input'].includes(widget.type) || request.density === 'balanced' && widget.type !== 'value' ? 8 : 4, emphasized: i === 0 }));
        const stream = new ReadableStream({ async start(controller) {
          const send = content => controller.enqueue(Buffer.from(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`));
          try {
            await delay(400, undefined, { signal: init.signal });
            send('{"summary":"模拟模型流式结果：按所选风格排列，保留全部设备能力。","widgets":[');
            for (const [i, widget] of widgets.entries()) {
              await delay(900, undefined, { signal: init.signal });
              send((i ? ',' : '') + JSON.stringify(widget));
              if (scenario === 'interrupted' && i === 1) { controller.close(); return; }
            }
            await delay(900, undefined, { signal: init.signal });
            send(']}'); controller.enqueue(Buffer.from('data: [DONE]\n\n')); controller.close();
          } catch (error) { try { controller.error(error); } catch { /* Already cancelled. */ } }
        } });
        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
      },
    });
    try { await handler.handle(req, res, '/api/v1/interface/generate'); }
    catch { if (!res.writableEnded) res.end(); }
    finally { await handler.close(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}
