import Script from 'next/script';

const getSentryLoaderUrl = () => {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return null;

  try {
    const publicKey = new URL(dsn).username;
    return publicKey ? `https://js.sentry-cdn.com/${publicKey}.min.js` : null;
  } catch {
    return null;
  }
};

export function SentryBrowserLoader() {
  const src = getSentryLoaderUrl();
  if (!src) return null;

  return (
    <Script
      id="nayla-sentry-browser-sdk"
      src={src}
      strategy="afterInteractive"
      crossOrigin="anonymous"
    />
  );
}
