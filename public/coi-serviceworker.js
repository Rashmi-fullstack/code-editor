/*! coi-serviceworker - MIT License */
let coepCredentialless = false;
if (typeof window === 'undefined') {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener('message', (ev) => {
    if (!ev.data) return;
    if (ev.data.type === 'deregister') {
      self.registration
        .unregister()
        .then(() => self.clients.matchAll())
        .then((clients) => {
          clients.forEach((client) => client.navigate(client.url));
        });
    }
  });

  self.addEventListener('fetch', function (event) {
    const r = event.request;
    if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') {
      return;
    }

    // Do not intercept external OAuth, Supabase Auth, or CloudFront media assets
    const url = new URL(r.url);
    if (
      url.hostname.includes('google') ||
      url.hostname.includes('supabase') ||
      url.hostname.includes('cloudfront.net') ||
      r.destination === 'video' ||
      r.destination === 'image' ||
      r.destination === 'audio' ||
      url.pathname.startsWith('/api/auth')
    ) {
      return;
    }

    const coep = coepCredentialless ? 'credentialless' : 'require-corp';

    event.respondWith(
      fetch(r)
        .then((response) => {
          if (response.status === 0) {
            return response;
          }

          const newHeaders = new Headers(response.headers);
          newHeaders.set('Cross-Origin-Embedder-Policy', coep);
          newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
          newHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');

          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        })
        .catch((e) => console.error(e))
    );
  });
} else {
  (() => {
    if (!window.location.pathname.startsWith('/editor')) return;

    if (window.crossOriginIsolated) {
      window.sessionStorage.removeItem('coiReloadedBySelf');
      // If server already provides COOP/COEP, deregister worker to prevent request overhead
      if (navigator.serviceWorker) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((reg) => {
            if (reg.scope.includes('/editor')) {
              void reg.unregister();
            }
          });
        });
      }
      return;
    }

    if (!window.isSecureContext) {
      return;
    }

    const reloadedBySelf = window.sessionStorage.getItem('coiReloadedBySelf');

    // If server provides headers on hard reload, reload once to pick them up
    if (!reloadedBySelf) {
      window.sessionStorage.setItem('coiReloadedBySelf', 'true');
      window.location.reload();
      return;
    }

    // Fallback: If hard reload still didn't isolate (e.g. proxy environment), register service worker
    if (!navigator.serviceWorker) {
      return;
    }

    const coiScope = window.location.pathname.startsWith('/preview') ? '/preview' : '/editor';
    navigator.serviceWorker
      .register('/coi-serviceworker.js', { scope: coiScope })
      .then(
        (registration) => {
          registration.addEventListener('updatefound', () => {
            window.location.reload();
          });

          if (registration.active && !navigator.serviceWorker.controller) {
            window.location.reload();
          }
        },
        (err) => {
          console.warn('[COI] Registration:', err);
        }
      );
  })();
}
