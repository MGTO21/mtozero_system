'use client';

import { useEffect } from 'react';

/** Registers the service worker once the page is idle, and reloads on activation. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          reg.addEventListener('updatefound', () => {
            reg.installing?.addEventListener('statechange', function onState() {
              if (this.state === 'installed' && navigator.serviceWorker.controller) {
                reg.waiting?.postMessage('SKIP_WAITING');
              }
            });
          });
        })
        .catch(() => {
          // A failed registration degrades to a normal web app; nothing to surface.
        });
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  return null;
}
