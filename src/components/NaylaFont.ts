import { useEffect, useState } from 'react';
import { cancelRender, continueRender, delayRender } from 'remotion';
import { loadFont } from '@remotion/fonts';
import { loadFont as roboto } from '@remotion/google-fonts/Roboto';
import { loadFont as montserrat } from '@remotion/google-fonts/Montserrat';
import { loadFont as playfair } from '@remotion/google-fonts/PlayfairDisplay';
export function useNaylaFont(family = 'Arial', url?: string) {
  const [, refresh] = useState(0);
  // A URL-derived family prevents two custom fonts from sharing a browser cache key.
  const customFamily = `Nayla-${Array.from(url || '').reduce((n, c) => ((n * 31) + c.charCodeAt(0)) >>> 0, 0)}`;
  useEffect(() => {
    const handle = delayRender('Cargando tipografía');
    let active = true;
    let promise: Promise<unknown>;
    if (family === 'custom' && url) promise = loadFont({ family: customFamily, url });
    else if (family === 'Roboto') promise = roboto('normal', { weights: ['400'], subsets: ['latin'] }).waitUntilDone();
    else if (family === 'Montserrat') promise = montserrat('normal', { weights: ['400'], subsets: ['latin'] }).waitUntilDone();
    else if (family === 'Playfair Display') promise = playfair('normal', { weights: ['400'], subsets: ['latin'] }).waitUntilDone();
    else promise = Promise.resolve();
    promise.then(() => { if (active) refresh(value => value + 1); continueRender(handle); }).catch(error => { if (active) cancelRender(error); });
    return () => { active = false; continueRender(handle); };
  }, [family, url, customFamily]);
  return family === 'custom' ? customFamily : family;
}
