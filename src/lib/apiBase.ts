// Makes relative "/api/..." calls and "/ws/..." sockets work inside the Android APK.
// In the APK the page origin is https://localhost, so requests must go to the real backend.
// Set the backend with the VITE_API_BASE_URL build variable (workflow input "server_url").

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
  // Same origin as the backend (normal web / server.url mode): nothing to rewrite.
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
        // fall through to the original URL
      }
      return new target(url, protocols);
    },
  });
}

installApiBase();
