type Config = { url?: string; anonKey?: string; serviceKey?: string };
type Target = { bucket: 'private-media'; path: string; mediaKind: 'image' | 'video' };
function target(value: unknown): Target | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  return v.bucket === 'private-media' && typeof v.path === 'string' && v.path.length > 0
    && v.path.length <= 1024 && !v.path.split('/').some(p => p === '..' || p === '.')
    && (v.mediaKind === 'image' || v.mediaKind === 'video') ? v as Target : null;
}
/** Caller-bound SQL authorization; service privilege is used ONLY for one exact object. */
export function createAssistMediaHandler(config: Config, fetcher: typeof fetch = fetch) {
  return async (request: Request): Promise<Response> => {
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
      status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'unauthenticated' }, 401);
    if (!config.url || !config.anonKey || !config.serviceKey) return json({ error: 'not_configured' }, 503);
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 10000);
    try {
      // Bounded input; no arbitrary storage path, bucket or recipient accepted.
      const reader = request.body?.getReader();
      if (!reader) return json({ error: 'bad_request' }, 400);
      let bytes = 0, body = '';
      const decoder = new TextDecoder();
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.length;
          if (bytes > 1024) return json({ error: 'bad_request' }, 400);
          body += decoder.decode(chunk.value, { stream: true });
        }
        body += decoder.decode();
      } finally { await reader.cancel(); }
      let input;
      try { input = JSON.parse(body); } catch { return json({ error: 'bad_request' }, 400); }
      if (!input || Object.keys(input).length !== 1 || typeof input.assistId !== 'string'
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.assistId)) {
        return json({ error: 'bad_request' }, 400);
      }
      const callerHeaders = { apikey: config.anonKey, Authorization: authorization, 'Content-Type': 'application/json' };
      const user = await fetcher(config.url + '/auth/v1/user', { headers: callerHeaders, signal: abort.signal, redirect: 'error' });
      if (!user.ok || typeof (await user.json()).id !== 'string') return json({ error: 'unauthenticated' }, 401);
      const authorize = () => fetcher(config.url + '/rest/v1/rpc/arena_private_assist_media_target', {
        method: 'POST', headers: callerHeaders, body: JSON.stringify({ p_id: input.assistId }),
        signal: abort.signal, redirect: 'error',
      });
      const allowed = await authorize();
      if (!allowed.ok) {
        const error = await allowed.json();
        return json({ error: error.code === 'P0001' ? 'rate_limited' : 'forbidden' }, error.code === 'P0001' ? 429 : 403);
      }
      const media = target(await allowed.json());
      if (!media) return json({ error: 'forbidden' }, 403);
      const signed = await fetcher(config.url + '/storage/v1/object/sign/private-media/' + media.path.split('/').map(encodeURIComponent).join('/'), {
        method: 'POST', headers: { apikey: config.serviceKey, Authorization: 'Bearer ' + config.serviceKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: 60 }), signal: abort.signal, redirect: 'error',
      });
      if (!signed.ok) return json({ error: 'signing_failed' }, 502);
      const result = await signed.json();
      if (typeof result.signedURL !== 'string' || !result.signedURL.startsWith('/object/sign/private-media/')) return json({ error: 'signing_failed' }, 502);
      // Do not deliver a freshly signed capability if access changed while signing.
      const recheck = await authorize();
      if (!recheck.ok || JSON.stringify(target(await recheck.json())) !== JSON.stringify(media)) return json({ error: 'forbidden' }, 403);
      // SUPABASE_URL can be container-internal. New clients resolve the relative
      // capability themselves; retain the original field for older hosted clients.
      const relativeUrl = '/storage/v1' + result.signedURL;
      return json({ url: config.url + relativeUrl, relativeUrl, expiresIn: 60 });
    } catch { return json({ error: 'request_unavailable' }, 502); }
    finally { clearTimeout(timer); }
  };
}
