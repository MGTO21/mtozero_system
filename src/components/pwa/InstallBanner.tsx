'use client';

import { useEffect, useState } from 'react';
import { Button, IconButton } from '@/components/ui/Button';
import { IconInstall, IconX } from '@/components/ui/Icons';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'mtozero-install-dismissed';

/**
 * Offers installation once, on the device's own terms. Hidden entirely when the
 * app is already running standalone (see `.only-browser` in globals.css).
 */
export function InstallBanner() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(DISMISS_KEY) === '1') return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // iOS Safari never fires beforeinstallprompt — show the manual instruction.
    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
    if (isIos) setIosHint(true);

    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, '1');
    setPrompt(null);
    setIosHint(false);
  };

  if (!prompt && !iosHint) return null;

  return (
    <div className="only-browser mb-4 flex items-center gap-3 rounded-card border border-brand-500/30 bg-brand-500/8 px-3.5 py-3">
      <IconInstall className="h-6 w-6 shrink-0 text-brand-500" />
      <p className="min-w-0 flex-1 text-[0.85rem] font-semibold leading-snug">
        {prompt ? (
          <>ثبّت النظام على جهازك ليفتح كتطبيق ويعمل حتى بدون إنترنت.</>
        ) : (
          <>
            لتثبيت النظام على الآيفون: اضغط زر المشاركة ثم <span className="font-bold">«إضافة إلى الشاشة الرئيسية»</span>.
          </>
        )}
      </p>
      {prompt ? (
        <Button
          size="sm"
          onClick={async () => {
            await prompt.prompt();
            const choice = await prompt.userChoice;
            if (choice.outcome === 'accepted') dismiss();
            else setPrompt(null);
          }}
        >
          تثبيت
        </Button>
      ) : null}
      <IconButton label="إخفاء" onClick={dismiss}>
        <IconX className="h-4 w-4" />
      </IconButton>
    </div>
  );
}
