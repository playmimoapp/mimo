/** Read a server-only value supplied by the deployment environment. */
export function getRuntimeVariable(name: string) {
  const processValue = process.env[name];
  return typeof processValue === 'string' ? processValue.trim() : '';
}
