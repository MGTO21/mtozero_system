import type { Metadata, Viewport } from 'next';
import { Cairo, IBM_Plex_Sans_Arabic } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';
import { fetchLogo } from '@/lib/store/server';
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

const BASE_METADATA: Metadata = {
  title: 'Mtozero Shop — إدارة المخزون والمبيعات',
  description: 'نظام إدارة مخزون ومبيعات متجر Mtozero Shop — الأبيض، شمال كردفان.',
  manifest: '/manifest.json',
  applicationName: 'Mtozero Shop',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
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

/**
 * The tab icon, home-screen icon and search-result icon all come from the logo
 * the owner uploaded for invoices (its public copy), so the shop has one mark
 * everywhere. Until a logo is uploaded, the built-in icons stay.
 */
export async function generateMetadata(): Promise<Metadata> {
  const logo = await fetchLogo();
  if (!logo) return BASE_METADATA;
  const v = `?v=${logo.hash}`;
  return {
    ...BASE_METADATA,
    icons: {
      icon: [
        { url: `/brand/icon/48${v}`, sizes: '48x48', type: 'image/png' },
        { url: `/brand/icon/192${v}`, sizes: '192x192', type: 'image/png' },
      ],
      shortcut: [{ url: `/brand/icon/48${v}` }],
      apple: [{ url: `/brand/icon/180${v}`, sizes: '180x180' }],
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  // Updated live by ThemeProvider when the user switches theme.
  themeColor: '#F3EFE6',
};

/**
 * Applies a stored dark choice before first paint so an evening user never sees a
 * paper flash on launch. Daylight is the default; see ThemeProvider for the key.
 */
const THEME_BOOTSTRAP = `(function(){try{if(localStorage.getItem('mtozero-theme-v2')==='dark'){var r=document.documentElement;r.classList.add('dark');r.style.colorScheme='dark';var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content','#0F0D0B');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: the bootstrap script below mutates <html> before
    // React hydrates, which is exactly the mismatch we want to allow.
    <html lang="ar" dir="rtl" suppressHydrationWarning className={`${cairo.variable} ${plex.variable}`}>
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
