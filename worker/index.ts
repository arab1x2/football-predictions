// Cloudflare Worker entry: serves the API, and the built site from ./dist.
import type { Env } from './env';
import { handleFixtures } from './fixtures';
import { handleFd } from './fd';
import { handleOdds } from './odds';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) {
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
      if (pathname === '/api/fixtures') return handleFixtures(request, env, ctx);
      if (pathname === '/api/fd') return handleFd(request, env, ctx);
      if (pathname === '/api/odds') return handleOdds(request, env, ctx);
      return new Response(JSON.stringify({ error: { code: 'bad_request', message: 'Unknown API route.' } }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
