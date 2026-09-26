import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const baseUrl = env.COURTYARD_API_URL?.trim().replace(/\/+$/, '');
  const apiKey = env.COURTYARD_API_KEY?.trim();
  const model = env.COURTYARD_MODEL?.trim() || 'gpt-5.6-sol';
  function endpointFor(value: string): string {
    const trimmed = value.replace(/\/+$/, '');
    return trimmed.endsWith('/responses') ? trimmed : `${trimmed}/responses`;
  }
  return {
    plugins: [react(), ...(mode === 'public' ? [{
      name: 'public-courtyard-background',
      async closeBundle() { await copyFile(resolve('public/courtyard.svg'), resolve('dist-public/courtyard.svg')); },
    }] : []), {
      name: 'courtyard-api',
      configureServer(server) {
        server.middlewares.use('/api/health', (_request, response) => {
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ready: !!(baseUrl && apiKey), model }));
        });
        server.middlewares.use('/api/chat', async (request, response) => {
          response.setHeader('Content-Type', 'application/json');
          if (request.method !== 'POST') { response.statusCode = 405; response.end('{"error":"method_not_allowed"}'); return; }
          try {
            if (request.headers.origin && new URL(request.headers.origin).host !== request.headers.host) {
              response.statusCode = 403; response.end('{"error":"invalid_origin"}'); return;
            }
            const chunks: Buffer[] = [];
            let size = 0;
            for await (const chunk of request) {
              size += chunk.length;
              if (size > 128_000) throw new Error('request_too_large');
              chunks.push(chunk);
            }
            const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { messages?: unknown; settings?: { apiUrl?: unknown; apiKey?: unknown; model?: unknown } | null };
            if (!Array.isArray(payload.messages) || payload.messages.length !== 2) throw new Error('invalid_messages');
            const rawSettings = payload.settings;
            if (rawSettings && (typeof rawSettings.apiUrl !== 'string' || typeof rawSettings.apiKey !== 'string' || typeof rawSettings.model !== 'string')) throw new Error('invalid_settings');
            const custom = rawSettings as { apiUrl: string; apiKey: string; model: string } | null | undefined;
            const chosenUrl = custom?.apiUrl?.trim() || baseUrl;
            const chosenKey = custom ? custom.apiKey?.trim() : apiKey;
            const chosenModel = custom?.model?.trim() || model;
            if (!chosenUrl) { response.statusCode = 503; response.end('{"error":"api_not_configured"}'); return; }
            const parsedUrl = new URL(chosenUrl);
            if (parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash ||
              (parsedUrl.protocol !== 'https:' && !(parsedUrl.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsedUrl.hostname)))) throw new Error('invalid_settings');
            const upstream = await fetch(endpointFor(chosenUrl), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(chosenKey ? { Authorization: `Bearer ${chosenKey}` } : {}) },
              body: JSON.stringify({ model: chosenModel, input: payload.messages, reasoning: { effort: 'low' }, text: { format: { type: 'json_object' } }, max_output_tokens: 1100 }),
              signal: AbortSignal.timeout(120_000),
            });
            response.statusCode = upstream.status;
            response.end(await upstream.text());
          } catch (error) {
            response.statusCode = error instanceof SyntaxError || (error instanceof Error && ['request_too_large', 'invalid_messages', 'invalid_settings'].includes(error.message)) ? 400 : 502;
            response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'upstream_failed' }));
          }
        });
      },
    }],
    server: {
      host: '127.0.0.1',
      fs: { strict: true },
    },
    build: { outDir: mode === 'public' ? 'dist-public' : 'dist', copyPublicDir: mode !== 'public' },
  };
});
