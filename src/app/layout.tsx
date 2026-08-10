import type { Metadata, Viewport } from 'next';
import { Cairo, IBM_Plex_Sans_Arabic } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { ServiceWorkerRegistrar } from '@/components/pwa/ServiceWorkerRegistrar';

/** Headings: heavy Arabic display face. Chosen for weight range 700–900. */
const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['700', '800', '900'],
  variable: '--font-display',
  display: 'swap',
});

/** Body + all numeric readouts: lighter face with proper tabular figures. */
const plex = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Mtozero Shop — إدارة المخزون والمبيعات',
  description: 'نظام إدارة مخزون ومبيعات متجر Mtozero Shop — الأبيض، شمال كردفان.',
  manifest: '/manifest.json',
  applicationName: 'Mtozero Shop',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Mtozero',
  },
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192' }],
  },
  formatDetection: { telephone: false },
  other: {
    // Next's appleWebApp option still emits the deprecated apple-prefixed tag.
    // Chrome wants the standard name, so we add it alongside rather than lose iOS.
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0A0909' },
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
  ],
};

/**
 * Applies the stored theme before first paint so a dark-mode user never sees a
 * white flash on app launch.
 */
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('mtozero-theme');if(t!=='light'){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: the bootstrap script below mutates <html> before
    // React hydrates, which is exactly the mismatch we want to allow.
    <html lang="ar" dir="rtl" suppressHydrationWarning className={`${cairo.variable} ${plex.variable} dark`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="font-sans">
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </ThemeProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
