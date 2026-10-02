'use client';

import { useEffect } from 'react';

export const UPDATE_READY_EVENT = 'mtozero:update-ready';

/**
 * Registers the service worker once the page is idle.
 *
 * A new build used to reload the page the moment its worker took over — which
 * on a deploy in the middle of the day threw away a cart half-built at the
 * counter. Now the page only announces that an update is ready; the shell shows
 * it, and the reload happens when the seller taps it or the app is next sent to
 * the background.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    let ready = false;
    const onControllerChange = () => {
      if (ready) return;
      ready = true;
      window.dispatchEvent(new Event(UPDATE_READY_EVENT));
    };
    const onHidden = () => {
      if (ready && document.visibilityState === 'hidden') window.location.reload();
    };

    const register = () => {
      // The build id in the URL is what makes each deploy install a fresh worker
      // that precaches that deploy's pages — see public/sw.js.
      navigator.serviceWorker
        .register(`/sw.js?v=${process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev'}`, { scope: '/' })
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
    document.addEventListener('visibilitychange', onHidden);
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, []);

  return null;
}
