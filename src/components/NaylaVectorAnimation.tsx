import React, { useEffect, useState } from 'react';
import { AbsoluteFill, cancelRender, continueRender, delayRender } from 'remotion';
import { Lottie, type LottieAnimationData } from '@remotion/lottie';
import { RemotionRiveCanvas } from '@remotion/rive';

export type NaylaVectorAnimation = {
  id: string;
  kind: 'lottie' | 'rive';
  url: string;
  start: number;
  end: number;
  x?: number;
  y?: number;
  scale?: number;
  opacity?: number;
  fit?: 'contain' | 'cover' | 'fill' | 'fit-height' | 'none' | 'scale-down' | 'fit-width';
  alignment?:
    | 'center'
    | 'bottom-center'
    | 'bottom-left'
    | 'bottom-right'
    | 'center-left'
    | 'center-right'
    | 'top-center'
    | 'top-left'
    | 'top-right';
  artboard?: string;
  animation?: string;
  loop?: boolean;
  playbackRate?: number;
  direction?: 'forward' | 'backward';
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
};

const RemoteLottie: React.FC<{ item: NaylaVectorAnimation }> = ({ item }) => {
  const [handle] = useState(() => delayRender(`Loading Lottie: ${item.id}`));
  const [animationData, setAnimationData] = useState<LottieAnimationData | null>(null);

  useEffect(() => {
    let active = true;

    fetch(item.url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`No se pudo cargar Lottie (${response.status}).`);
        }
        return response.json();
      })
      .then((json) => {
        if (!active) return;
        setAnimationData(json as LottieAnimationData);
        continueRender(handle);
      })
      .catch((error) => {
        if (!active) return;
        cancelRender(error);
      });

    return () => {
      active = false;
    };
  }, [handle, item.id, item.url]);

  if (!animationData) return null;

  return (
    <Lottie
      animationData={animationData}
      direction={item.direction || 'forward'}
      loop={item.loop ?? true}
      playbackRate={clamp(item.playbackRate, 0.1, 4, 1)}
      renderer="svg"
      style={{ width: '100%', height: '100%' }}
    />
  );
};

export const NaylaVectorAnimationRenderer: React.FC<{ item: NaylaVectorAnimation }> = ({ item }) => {
  const x = clamp(item.x, -50, 50, 0);
  const y = clamp(item.y, -50, 50, 0);
  const scale = clamp(item.scale, 0.05, 4, 1);
  const opacity = clamp(item.opacity, 0, 1, 1);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: `${50 + x}%`,
          top: `${50 + y}%`,
          width: '100%',
          height: '100%',
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: 'center center',
          opacity,
        }}
      >
        {item.kind === 'rive' ? (
          <RemotionRiveCanvas
            src={item.url}
            fit={item.fit || 'contain'}
            alignment={item.alignment || 'center'}
            artboard={item.artboard}
            animation={item.animation}
            style={{ width: '100%', height: '100%' }}
          />
        ) : (
          <RemoteLottie item={item} />
        )}
      </div>
    </AbsoluteFill>
  );
};
