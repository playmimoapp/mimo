export const X_API = 'https://api.x.com';

export function getXConfig() {
  const clientId = process.env.X_CLIENT_ID?.trim() ?? '';
  const clientSecret = process.env.X_CLIENT_SECRET?.trim() ?? '';
  return {
    clientId,
    clientSecret,
    oauthReady: Boolean(clientId && clientSecret),
  };
}

export function xRedirect(request: Request, key: string, value: string) {
  const origin =
    process.env.MIMO_PUBLIC_URL?.trim() || new URL(request.url).origin;
  const target = new URL('/', origin);
  target.searchParams.set('studio', '1');
  target.searchParams.set(key, value);
  return Response.redirect(target, 302);
}
