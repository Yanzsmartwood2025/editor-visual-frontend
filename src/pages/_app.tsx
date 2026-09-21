import type { AppProps } from "next/app";
import { useEffect } from "react";
import "../../styles/global.css";

function MyApp({ Component, pageProps }: AppProps) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let reloadingForUpdate = false;
    const hadController = Boolean(navigator.serviceWorker.controller);

    const handleControllerChange = () => {
      if (!hadController || reloadingForUpdate) return;
      reloadingForUpdate = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    const registerLatestWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          updateViaCache: 'none',
        });
        await registration.update();
      } catch (err) {
        console.log('Service Worker registration failed: ', err);
      }
    };

    if (document.readyState === 'complete') {
      void registerLatestWorker();
    } else {
      window.addEventListener('load', registerLatestWorker, { once: true });
    }

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      window.removeEventListener('load', registerLatestWorker);
    };
  }, []);

  return <Component {...pageProps} />;
}

export default MyApp;
