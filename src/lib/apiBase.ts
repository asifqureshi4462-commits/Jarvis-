// Makes relative "/api/..." calls and "/ws/..." sockets work inside the Android APK.
const RAW = ((import.meta.env.VITE_API_BASE_URL as string | undefined) || '').trim();
export const API_BASE = RAW.replace(/\/+$/, '');

function installApiBase(): void {
  if (!API_BASE || typeof window === 'undefined') return;

  let base: URL;
  try {
    base = new URL(API_BASE);
  } catch {
    return;
  }
  if (base.origin === window.location.origin) return;

  const originalFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && input.startsWith('/') && !input.startsWith('//')) {
      return originalFetch(API_BASE + input, init);
    }
    return originalFetch(input as RequestInfo, init);
  }) as typeof window.fetch;

  const OriginalWebSocket = window.WebSocket;
  window.WebSocket = new Proxy(OriginalWebSocket, {
    construct(target, args: [string | URL, (string | string[])?]) {
      const [url, protocols] = args;
      try {
        const parsed = new URL(String(url));
        if (parsed.host === window.location.host) {
          parsed.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
          parsed.host = base.host;
          return new target(parsed.toString(), protocols);
        }
      } catch {
        // fall through
      }
      return new target(url, protocols);
    },
  });
}

installApiBase();
