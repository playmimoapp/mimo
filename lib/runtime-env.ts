import { env } from 'cloudflare:workers';

/** Read a server-only value from Cloudflare bindings, with a Node fallback. */
export function getRuntimeVariable(name: string) {
  const runtimeValue = (env as unknown as Record<string, unknown>)[name];
  if (typeof runtimeValue === 'string' && runtimeValue.trim()) {
    return runtimeValue.trim();
  }

  const processValue = process.env[name];
  return typeof processValue === 'string' ? processValue.trim() : '';
}
