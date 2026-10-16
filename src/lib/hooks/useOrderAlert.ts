'use client';

import { useEffect, useRef } from 'react';

/**
 * Makes a new website order impossible to miss on a staff device: a short
 * two-note chime, a buzz on phones, the count in the tab title, and a system
 * notification when the app is in the background and the user allowed them.
 *
 * Only an increase rings — never the count present when the app opens, so
 * reopening the app with three orders waiting does not chime three times.
 */
export function useOrderAlert(count: number, ready: boolean, pathname: string) {
  const previous = useRef<number | null>(null);

  useEffect(() => {
    if (!ready) return;
    const before = previous.current;
    previous.current = count;
    if (before === null || count <= before) return;

    chime();
    try {
      navigator.vibrate?.([120, 80, 120]);
    } catch {
      // Not supported.
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
      try {
        new Notification('طلب جديد من الموقع', {
          body: count - before === 1 ? 'في طلب جديد منتظر التأكيد' : `${count - before} طلبات جديدة منتظرة التأكيد`,
          icon: '/brand/icon/192',
          tag: 'new-order',
        });
      } catch {
        // Some mobile browsers only allow notifications from a service worker.
      }
    }
  }, [count, ready]);

  // "(2) …" in the tab title while orders are waiting. Re-applied after each
  // navigation, once Next has set the new page's title.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const base = document.title.replace(/^\(\d+\)\s*/, '');
      document.title = count > 0 ? `(${count}) ${base}` : base;
    }, 60);
    return () => window.clearTimeout(t);
  }, [count, pathname]);
}

let audio: AudioContext | null = null;

/** Two soft notes, generated — no sound file to download or cache. */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio = audio ?? new Ctx();
    const now = audio.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.connect(gain).connect(audio!.destination);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  } catch {
    // Audio blocked until the user interacts with the page — the badge still shows.
  }
}

/** Asks for permission to show order notifications; returns the result. */
export async function enableOrderNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}
