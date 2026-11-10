'use client';

/**
 * Last resort when the root layout itself crashes: it replaces the whole
 * document, so it brings its own <html>, title and plain inline styles.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <title>MTOZERO</title>
        <meta name="robots" content="noindex" />
      </head>
      <body style={{ margin: 0, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 16, textAlign: 'center', background: '#FAF9F6', color: '#1A1714', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>الصفحة ما فتحت كويس</h1>
        <p style={{ margin: 0, color: '#5A534C' }}>حصلت مشكلة وقت التحميل. جرّب تاني.</p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" onClick={reset} style={{ height: 48, padding: '0 24px', border: 0, borderRadius: 8, background: '#1A1714', color: '#FAF9F6', fontWeight: 800, fontSize: 16 }}>
            جرّب تاني
          </button>
          <a href="/" style={{ height: 48, padding: '0 24px', display: 'inline-flex', alignItems: 'center', borderRadius: 8, border: '1px solid #C9C1B6', color: '#1A1714', fontWeight: 800, textDecoration: 'none' }}>
            الرئيسية
          </a>
        </div>
      </body>
    </html>
  );
}
