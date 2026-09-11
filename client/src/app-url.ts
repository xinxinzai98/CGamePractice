/** Resolve same-origin routes against the Vite deployment base. Node tests use root. */
export function appUrl(path: string, base = import.meta.env?.BASE_URL ?? '/') {
  return `/${base.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\//, '/') + path.replace(/^\/+/, '');
}

export function roomShareUrl(code: string, origin: string, base?: string) {
  const url = new URL(appUrl('', base), origin);
  url.searchParams.set('room', code);
  return url.href;
}
