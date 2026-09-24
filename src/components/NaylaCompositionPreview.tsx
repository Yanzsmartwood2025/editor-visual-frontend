import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Player } from '@remotion/player';
import { preloadImage } from '@remotion/preload';
import { getCompositionDurationInFrames } from '../lib/timelineMetrics';
import { getCanvasDimensionsFromRatio } from '../lib/mediaMetadata';
// Load the composition only after CanvasKit initializes, and only when opened.
const Preview: React.FC<{ inputProps: any; close: () => void }> = ({ inputProps, close }) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const [composition, setComposition] = useState<React.ComponentType<any> | null>(null);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    let active = true;
    (async () => {
      const { LoadSkia } = await import('@shopify/react-native-skia/lib/module/web');
      await LoadSkia({ locateFile: () => '/canvaskit.wasm' });
      const module = require('./MainComposition');
      if (active) setComposition(() => module.MainComposition);
    })().catch(error => { if (active) setLoadError(error.message || 'No se pudo cargar el motor de vista previa.'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    dialog.current?.showModal();
    const release = (inputProps.timeline || []).filter((item: any) => item.tipo === 'foto' && item.url).slice(0, 3).map((item: any) => preloadImage(item.url));
    return () => release.forEach((dispose: () => void) => dispose());
  }, [inputProps]);
  const { width, height } = getCanvasDimensionsFromRatio(inputProps.canvasRatio, '1080p');
  const duration = getCompositionDurationInFrames(inputProps.timeline || [], 30, inputProps.subtitles, inputProps.logos, inputProps.titles, inputProps.threeScenes, inputProps.vectorAnimations, inputProps.skiaGraphics, inputProps.settings?.decorations);
  return createPortal(<dialog ref={dialog} onCancel={close} onClose={close} aria-label="Vista previa de la composición" style={{ background: '#111', color: '#fff', border: '1px solid #555', borderRadius: 12, width: 'min(960px, 94vw)', maxHeight: '94dvh' }}>
    <button type="button" onClick={close}>Cerrar vista previa</button>
    <p>Vista previa · {(duration / 30).toFixed(2)} s</p>
    {loadError ? <p role="alert">{loadError}</p> : !composition ? <p role="status">Cargando vista previa…</p> : <Player component={composition} inputProps={inputProps} durationInFrames={duration} fps={30} compositionWidth={width} compositionHeight={height} controls style={{ width: '100%', maxHeight: '75dvh', aspectRatio: `${width}/${height}` }} errorFallback={({ error }) => <p>No se pudo mostrar esta composición: {error.message}</p>} />}
  </dialog>, document.body);
};
export default function NaylaCompositionPreview({ inputProps, onOpen }: { inputProps: any; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" onClick={() => { onOpen?.(); setOpen(true); }} style={{ padding: 8, color: '#fff', background: '#333', borderRadius: 8 }}>Vista previa del montaje</button>{open && <Preview inputProps={inputProps} close={() => setOpen(false)} />}</>;
}
