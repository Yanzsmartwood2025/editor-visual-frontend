import React, { useMemo } from 'react';
import { AbsoluteFill, Sequence, CanvasImage, useVideoConfig, useCurrentFrame, interpolate, Img, Loop } from 'remotion';
import { Audio, Video } from '@remotion/media';
import { createTikTokStyleCaptions, type Caption } from '@remotion/captions';
import { CameraMotionBlur } from '@remotion/motion-blur';
import {
  TransitionSeries,
  linearTiming,
  blurSlide,
  crossZoom,
  dreamyZoom,
  filmBurn,
  linearBlur,
  pushCut,
} from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { wipe } from '@remotion/transitions/wipe';
import { slide } from '@remotion/transitions/slide';
import { zoomInOut } from '@remotion/transitions/zoom-in-out';
import { chromaticAberration } from '@remotion/effects/chromatic-aberration';
import { colorCorrection } from '@remotion/effects/color-correction';
import { glow } from '@remotion/effects/glow';
import { pixelate } from '@remotion/effects/pixelate';
import { zoomBlur } from '@remotion/effects/zoom-blur';
import { vignette } from '@remotion/effects/vignette';
import { lightLeak } from '@remotion/effects/light-leak';
import { buildVisualTimelineMetrics, getCompositionDurationInFrames, getItemDelayInFrames, getItemDurationInFrames } from '../lib/timelineMetrics';
import { NaylaGsapTitle, type NaylaMotionTitle } from './NaylaGsapTitle';
import { NaylaThreeSceneRenderer, type NaylaThreeScene } from './NaylaThreeScene';

// Interfaces based on main file
type ProfessionalEffect = {
  type: 'chromatic-aberration' | 'color-correction' | 'glow' | 'pixelate' | 'zoom-blur' | 'vignette' | 'light-leak';
  intensity?: number;
  color?: string;
  angle?: number;
  seed?: number;
};
type TimelineItem = { id: string; mediaId: string; tipo: 'foto' | 'video' | 'audio'; nombre: string; etiqueta: string; url: string; durationInSeconds?: number; originalDurationInSeconds?: number; volume?: number; fadeIn?: number; fadeOut?: number; scale?: number; delay?: number; startFrom?: number; trimBefore?: number; trimAfter?: number; loop?: boolean; playbackRate?: number; transitionDuration?: number; transitionType?: 'fade' | 'none' | 'wipe' | 'slide' | 'zoom' | 'film-burn' | 'blur-slide' | 'cross-zoom' | 'dreamy-zoom' | 'linear-blur' | 'push-cut'; efecto?: string; brightness?: number; contrast?: number; saturation?: number; overlay?: string; overlayIntensity?: number; professionalEffects?: ProfessionalEffect[]; motionBlur?: { shutterAngle?: number; samples?: number }; };
type SubtitleItem = { id: string; texto: string; inicioSec: number; finSec: number; style?: 'clean' | 'cinematic' | 'tiktok' | 'karaoke'; position?: 'top' | 'center' | 'bottom'; fontSize?: number; };
type LogoItem = { id: string; url: string; x: number; y: number; scale: number; opacity: number; inicioSec?: number; finSec?: number; fadeIn?: number; fadeOut?: number; };

interface MainCompositionProps {
  timeline: TimelineItem[];
  canvasRatio: string;
  logos?: LogoItem[];
  subtitles?: SubtitleItem[];
  titles?: NaylaMotionTitle[];
  threeScenes?: NaylaThreeScene[];
  settings?: {
    fadeOutFinal?: number;
  };
}


const PreloadedImage: React.FC<{ src: string; style?: React.CSSProperties }> = ({ src, style }) => {
  return (
    <Img
      src={src}
      style={style}
      onError={(e) => {
        console.error(`Failed to load image: ${src}`, e);
      }}
    />
  );
};

const ClipWithFades: React.FC<{ clip: TimelineItem, durationInFrames: number, children: React.ReactNode }> = ({ clip, durationInFrames, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeInFrames = Math.max(1, Math.round((clip.fadeIn || 0) * fps));
  const fadeOutFrames = Math.max(1, Math.round((clip.fadeOut || 0) * fps));

  // Ensure inputRange is strictly monotonically increasing
  const inputRange = [
    0,
    fadeInFrames,
    Math.max(fadeInFrames + 1, durationInFrames - fadeOutFrames - 1),
    Math.max(fadeInFrames + 2, durationInFrames - 1)
  ];

  const opacity = interpolate(
    frame,
    inputRange,
    [(clip.fadeIn || 0) > 0 ? 0 : 1, 1, 1, (clip.fadeOut || 0) > 0 ? 0 : 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

// Component to handle volume interpolation based on fadeIn/fadeOut for Audio and Video clips
// Helper to get CSS filter string based on clip properties
const getFilterStyle = (clip: TimelineItem): string | undefined => {
  const filters: string[] = [];

  if (clip.efecto) {
    switch (clip.efecto) {
      case 'grayscale':
        filters.push('grayscale(100%)');
        break;
      case 'sepia':
        filters.push('sepia(100%)');
        break;
      case 'vintage':
        filters.push('sepia(50%) contrast(1.2) brightness(0.9)');
        break;
      case 'cinematic':
        filters.push('contrast(1.3) brightness(0.9) saturate(1.2)');
        break;
      case 'blur':
        filters.push('blur(10px)');
        break;
      case 'glow':
        filters.push('saturate(1.18) contrast(1.08) brightness(1.05) drop-shadow(0 0 18px rgba(255,255,255,0.22))');
        break;
      case 'high-contrast':
        filters.push('contrast(1.55) saturate(1.08)');
        break;
      case 'soft':
        filters.push('contrast(0.92) brightness(1.05) saturate(0.92)');
        break;
      // You can add more predefined effects here if needed
    }
  }

  if (clip.brightness !== undefined) filters.push(`brightness(${clip.brightness})`);
  if (clip.contrast !== undefined) filters.push(`contrast(${clip.contrast})`);
  if (clip.saturation !== undefined) filters.push(`saturate(${clip.saturation})`);
  // If the user manually provided a blur number instead of string effect
  if (/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  (clip as any).blur !== undefined && typeof /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  (clip as any).blur === 'number') filters.push(`blur(${/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  (clip as any).blur}px)`);

  return filters.length > 0 ? filters.join(' ') : undefined;
};

const clamp01 = (value: unknown, fallback = 0.5) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
};

const getProfessionalEffects = (
  clip: TimelineItem,
  frame: number,
  durationInFrames: number
): any[] => {
  const progress = durationInFrames <= 1
    ? 0.5
    : Math.max(0, Math.min(1, frame / Math.max(1, durationInFrames - 1)));

  return (clip.professionalEffects || []).map((effect) => {
    const intensity = clamp01(effect.intensity, 0.5);

    switch (effect.type) {
      case 'chromatic-aberration':
        return chromaticAberration({
          amount: 2 + intensity * 14,
          angle: Number.isFinite(Number(effect.angle)) ? Number(effect.angle) : 0,
        });
      case 'color-correction':
        return colorCorrection({
          exposure: (intensity - 0.5) * 0.5,
          contrast: 1 + intensity * 0.22,
          highlights: -0.08 * intensity,
          shadows: 0.06 * intensity,
          vibrance: 0.12 + intensity * 0.35,
          saturation: 1 + intensity * 0.12,
        });
      case 'glow':
        return glow({
          radius: 8 + intensity * 28,
          intensity: 0.35 + intensity * 1.35,
          threshold: 0.22 + intensity * 0.28,
          color: effect.color || '#ffffff',
        });
      case 'pixelate':
        return pixelate({
          blockSize: Math.max(1, Math.round(3 + intensity * 29)),
        });
      case 'zoom-blur':
        return zoomBlur({
          amount: intensity * 70,
          center: [0.5, 0.5],
          samples: 20,
        });
      case 'vignette':
        return vignette({
          amount: 0.2 + intensity * 0.72,
          radius: 0.72 - intensity * 0.2,
          feather: 0.35,
          color: effect.color || '#000000',
        });
      case 'light-leak':
        return lightLeak({
          seed: Number.isFinite(Number(effect.seed)) ? Number(effect.seed) : 3,
          hueShift: Number.isFinite(Number(effect.angle)) ? Number(effect.angle) : 18,
          progress,
        });
      default:
        return null;
    }
  }).filter(Boolean);
};

const MaybeMotionBlur: React.FC<{
  clip: TimelineItem;
  children: React.ReactNode;
}> = ({ clip, children }) => {
  if (!clip.motionBlur) return <>{children}</>;

  const shutterAngle = Math.max(0, Math.min(360, Number(clip.motionBlur.shutterAngle) || 180));
  const samples = Math.max(2, Math.min(8, Math.round(Number(clip.motionBlur.samples) || 5)));

  return (
    <CameraMotionBlur shutterAngle={shutterAngle} samples={samples}>
      {children}
    </CameraMotionBlur>
  );
};



const getVisualMotionTransform = (
  clip: TimelineItem,
  frame: number,
  durationInFrames: number
): string | undefined => {
  const baseScale = clip.scale !== undefined ? Number(clip.scale) : 1;
  const end = Math.max(1, durationInFrames - 1);
  const progress = interpolate(
    frame,
    [0, end],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  if (clip.efecto === 'ken-burns' || clip.efecto === 'push-in') {
    const scale = interpolate(
      progress,
      [0, 1],
      [baseScale, baseScale * 1.12]
    );
    return `scale(${scale})`;
  }

  if (clip.efecto === 'pull-out') {
    const scale = interpolate(
      progress,
      [0, 1],
      [baseScale * 1.12, baseScale]
    );
    return `scale(${scale})`;
  }

  if (clip.efecto === 'pan') {
    const translateX = interpolate(progress, [0, 1], [-4, 4]);
    return `translateX(${translateX}%) scale(${baseScale * 1.08})`;
  }

  if (clip.efecto === 'rotate') {
    const rotation = interpolate(progress, [0, 1], [-1.5, 1.5]);
    return `rotate(${rotation}deg) scale(${baseScale * 1.04})`;
  }

  if (clip.efecto === 'float') {
    const wave = Math.sin(progress * Math.PI * 2);
    return `translateY(${wave * 1.8}%) scale(${baseScale * 1.035})`;
  }

  if (clip.efecto === 'tilt-3d') {
    const rotateY = interpolate(progress, [0, 1], [-6, 6]);
    const rotateX = interpolate(progress, [0, 0.5, 1], [2, -2, 2]);
    return `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${baseScale * 1.045})`;
  }

  if (clip.efecto === 'parallax-3d') {
    const rotateY = interpolate(progress, [0, 1], [-4, 4]);
    const translateX = interpolate(progress, [0, 1], [-2.5, 2.5]);
    const translateZ = interpolate(progress, [0, 0.5, 1], [0, 36, 0]);
    return `perspective(1400px) translateX(${translateX}%) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${baseScale * 1.06})`;
  }

  return clip.scale !== undefined ? `scale(${baseScale})` : undefined;
};

const AnimatedVisualFrame: React.FC<{
  clip: TimelineItem;
  durationInFrames: number;
  children: React.ReactNode;
}> = ({ clip, durationInFrames, children }) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        transform: getVisualMotionTransform(clip, frame, durationInFrames),
        transformOrigin: 'center center',
        willChange: 'transform',
      }}
    >
      {children}
    </AbsoluteFill>
  );
};


const AnimatedPhoto: React.FC<{ clip: TimelineItem, durationInFrames: number }> = ({ clip, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const effects = getProfessionalEffects(clip, frame, durationInFrames);

  if (effects.length === 0) {
    return (
      <PreloadedImage
        src={clip.url}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          transform: undefined,
          filter: getFilterStyle(clip),
        }}
      />
    );
  }

  return (
    <AbsoluteFill style={{ filter: getFilterStyle(clip) }}>
      <CanvasImage
        src={clip.url}
        width={width}
        height={height}
        fit="contain"
        effects={effects}
      />
    </AbsoluteFill>
  );
};

const ProfessionalVideo: React.FC<{
  clip: TimelineItem;
  durationInFrames: number;
  volume: number;
}> = ({ clip, durationInFrames, volume }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Video
      src={clip.url}
      volume={volume}
      trimBefore={clip.trimBefore !== undefined ? Math.round(clip.trimBefore * fps) : (clip.startFrom ? Math.round(clip.startFrom * fps) : undefined)}
      trimAfter={clip.trimAfter !== undefined ? Math.round(clip.trimAfter * fps) : undefined}
      loop={clip.loop}
      playbackRate={clip.playbackRate || 1}
      effects={getProfessionalEffects(clip, frame, durationInFrames)}
      style={{ width: '100%', height: '100%', objectFit: 'contain', filter: getFilterStyle(clip) }}
    />
  );
};

const LogoWithFades: React.FC<{ logo: LogoItem, durationInFrames: number, fps: number }> = ({ logo, durationInFrames, fps }) => {
  const frame = useCurrentFrame();

  const fadeInFrames = logo.fadeIn ? Math.round(logo.fadeIn * fps) : 0;
  const fadeOutFrames = logo.fadeOut ? Math.round(logo.fadeOut * fps) : 0;

  let opacity = logo.opacity;

  if (fadeInFrames > 0 && frame <= fadeInFrames) {
      opacity = interpolate(frame, [0, fadeInFrames], [0, logo.opacity], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  } else if (fadeOutFrames > 0 && frame >= durationInFrames - fadeOutFrames) {
      opacity = interpolate(frame, [durationInFrames - fadeOutFrames, durationInFrames], [logo.opacity, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  }

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <Img
        src={logo.url}
        style={{
          position: 'absolute',
          left: `${logo.x}%`,
          top: `${logo.y}%`,
          transform: `translate(-50%, -50%) scale(${logo.scale})`,
          opacity: opacity,
          objectFit: 'contain'
        }}
      />
    </AbsoluteFill>
  );
};

const GlobalFadeOverlay: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, durationInFrames - 1],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  return <AbsoluteFill style={{ backgroundColor: 'black', opacity }} />;
};

const AnimatedVolume: React.FC<{ clip: TimelineItem, durationInFrames: number, render: (volume: number) => React.ReactNode, absoluteStartFrame?: number, totalCompositionFrames?: number, globalFadeOutFrames?: number }> = ({ clip, durationInFrames, render, absoluteStartFrame, totalCompositionFrames, globalFadeOutFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const hasFade = (clip.fadeIn || 0) > 0 || (clip.fadeOut || 0) > 0;
  const targetVolume = clip.volume !== undefined ? Number(clip.volume) : 1;

  let currentVolume = targetVolume;

  if (hasFade) {
    let effectiveFrame = frame;
    let effectiveDuration = durationInFrames;

    if (clip.loop && clip.originalDurationInSeconds) {
      const loopDurationFrames = Math.max(1, Math.round(clip.originalDurationInSeconds * fps));
      effectiveFrame = frame % loopDurationFrames;
      effectiveDuration = loopDurationFrames;
    }

    const fadeInFrames = Math.max(1, Math.round((clip.fadeIn || 0) * fps));
    const fadeOutFrames = Math.max(1, Math.round((clip.fadeOut || 0) * fps));

    const inputRange = [
      0,
      fadeInFrames,
      Math.max(fadeInFrames + 1, effectiveDuration - fadeOutFrames - 1),
      Math.max(fadeInFrames + 2, effectiveDuration - 1)
    ];

    currentVolume = interpolate(
      effectiveFrame,
      inputRange,
      [(clip.fadeIn || 0) > 0 ? 0 : targetVolume, targetVolume, targetVolume, (clip.fadeOut || 0) > 0 ? 0 : targetVolume],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );
  }

  if (globalFadeOutFrames && globalFadeOutFrames > 0 && absoluteStartFrame !== undefined && totalCompositionFrames !== undefined) {
      const globalFadeStartFrame = totalCompositionFrames - globalFadeOutFrames;
      const absoluteCurrentFrame = absoluteStartFrame + frame;

      if (absoluteCurrentFrame >= globalFadeStartFrame) {
         const fadeOutProgress = interpolate(
             absoluteCurrentFrame,
             [globalFadeStartFrame, totalCompositionFrames],
             [1, 0],
             { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
         );
         currentVolume = currentVolume * fadeOutProgress;
      }
  }

  return <>{render(currentVolume)}</>;
};

const DynamicSubtitle: React.FC<{ subtitle: SubtitleItem }> = ({ subtitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const style = subtitle.style || 'clean';
  const position = subtitle.position || 'bottom';
  const fontSize = subtitle.fontSize || (style === 'cinematic' ? 46 : 42);

  const durationMs = Math.max(1, (subtitle.finSec - subtitle.inicioSec) * 1000);
  const words = subtitle.texto.trim().split(/\s+/).filter(Boolean);
  const captions: Caption[] = words.map((word, index) => {
    const startMs = (durationMs * index) / Math.max(1, words.length);
    const endMs = (durationMs * (index + 1)) / Math.max(1, words.length);
    return {
      text: (index === 0 ? '' : ' ') + word,
      startMs,
      endMs,
      timestampMs: (startMs + endMs) / 2,
      confidence: null,
    };
  });

  const combineMs =
    style === 'karaoke'
      ? Math.min(1800, durationMs)
      : style === 'tiktok'
        ? Math.min(1200, durationMs)
        : durationMs + 1;

  const pages = createTikTokStyleCaptions({
    captions,
    combineTokensWithinMilliseconds: combineMs,
    breakOnSilenceAfterMilliseconds: 900,
  }).pages;

  const currentMs = (frame / fps) * 1000;
  const page = pages.find((item) => currentMs >= item.startMs && currentMs < item.startMs + item.durationMs) || pages[0];
  if (!page) return null;

  const activeIndex = page.tokens.findIndex((token) => currentMs >= token.fromMs && currentMs < token.toMs);

  const justifyContent =
    position === 'top' ? 'flex-start' : position === 'center' ? 'center' : 'flex-end';
  const verticalPadding =
    position === 'top' ? '10%' : position === 'bottom' ? '10%' : 0;

  const shellStyle: React.CSSProperties =
    style === 'cinematic'
      ? {
          backgroundColor: 'rgba(0,0,0,0.55)',
          color: '#fff',
          borderRadius: 10,
          padding: '10px 18px',
          textShadow: '0 2px 8px rgba(0,0,0,0.85)',
          letterSpacing: '0.02em',
        }
      : style === 'clean'
        ? {
            color: '#fff',
            textShadow: '0 2px 8px rgba(0,0,0,0.9), 0 0 2px #000',
          }
        : {
            color: '#fff',
            textShadow: '0 2px 7px rgba(0,0,0,0.9)',
            fontWeight: 900,
          };

  return (
    <AbsoluteFill
      style={{
        justifyContent,
        alignItems: 'center',
        paddingTop: verticalPadding,
        paddingBottom: verticalPadding,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          ...shellStyle,
          maxWidth: '86%',
          textAlign: 'center',
          fontSize,
          fontFamily: 'Arial, Helvetica, sans-serif',
          lineHeight: 1.16,
        }}
      >
        {page.tokens.map((token, index) => {
          const active = index === activeIndex && (style === 'tiktok' || style === 'karaoke');
          return (
            <span
              key={token.fromMs + '-' + index}
              style={{
                display: 'inline-block',
                whiteSpace: 'pre',
                padding: active ? '2px 5px' : '2px 1px',
                margin: active ? '0 1px' : 0,
                borderRadius: active ? 6 : 0,
                background: active
                  ? (style === 'karaoke' ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.18)')
                  : 'transparent',
                color: active && style === 'karaoke' ? '#080808' : '#fff',
                transform: active ? 'scale(1.07)' : 'scale(1)',
              }}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const MainComposition: React.FC<MainCompositionProps> = ({ timeline, subtitles = [], titles = [], threeScenes = [], logos = [], settings = {} }) => {
  const { fps } = useVideoConfig();

  // We filter out videos and photos to build the main visual sequence
  const visualClips = useMemo(() => timeline.filter(t => t.tipo === 'video' || t.tipo === 'foto'), [timeline]);
  const audioClips = useMemo(() => timeline.filter(t => t.tipo === 'audio'), [timeline]);

  visualClips.forEach((clip) => {
    if (clip.tipo === 'video' && clip.durationInSeconds === undefined) {
      throw new Error(`Critical Error: Clip '${clip.nombre || clip.etiqueta}' (URL: ${clip.url}) was passed to Remotion Composition without a valid durationInSeconds.`);
    }
  });

  const visualSequences = useMemo(
    () => buildVisualTimelineMetrics(visualClips, fps),
    [visualClips, fps]
  );

  const totalCompositionFrames = getCompositionDurationInFrames(
    timeline,
    fps,
    subtitles,
    logos,
    titles,
    threeScenes
  );

  // Verify Audio Clips as well
  audioClips.forEach(clip => {
     if (clip.durationInSeconds === undefined) {
        throw new Error(`Critical Error: Audio Clip '${clip.nombre || clip.etiqueta}' (URL: ${clip.url}) was passed to Remotion Composition without a valid durationInSeconds.`);
     }
  });

  const globalFadeOutFrames = settings?.fadeOutFinal ? Math.round(settings.fadeOutFinal * fps) : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <TransitionSeries>
        {visualSequences.map((clip, index) => {
          const elements = [];

          if (clip.delayInFrames > 0) {
            elements.push(
              <TransitionSeries.Sequence key={`spacer-${clip.id}`} durationInFrames={clip.delayInFrames}>
                 <AbsoluteFill style={{ backgroundColor: 'transparent' }} />
              </TransitionSeries.Sequence>
            );
          }

          elements.push(
            <TransitionSeries.Sequence key={clip.id} durationInFrames={clip.durationInFrames}>
              <ClipWithFades clip={clip} durationInFrames={clip.durationInFrames}>
                <MaybeMotionBlur clip={clip}>
                  {clip.tipo === 'video' ? (
                    <AnimatedVisualFrame clip={clip} durationInFrames={clip.durationInFrames}>
                      <AnimatedVolume clip={clip} durationInFrames={clip.durationInFrames} absoluteStartFrame={clip.absoluteStartFrame} totalCompositionFrames={totalCompositionFrames} globalFadeOutFrames={globalFadeOutFrames} render={(volume) => (
                        <ProfessionalVideo
                          clip={clip}
                          durationInFrames={clip.durationInFrames}
                          volume={volume}
                        />
                      )} />
                    </AnimatedVisualFrame>
                  ) : (
                    <AnimatedVisualFrame clip={clip} durationInFrames={clip.durationInFrames}>
                      <AnimatedPhoto clip={clip} durationInFrames={clip.durationInFrames} />
                    </AnimatedVisualFrame>
                  )}
                </MaybeMotionBlur>
                {clip.overlay === 'vignette' && (
                    <AbsoluteFill style={{
                        pointerEvents: 'none',
                        background: `radial-gradient(circle, transparent 50%, rgba(0,0,0,${clip.overlayIntensity !== undefined ? clip.overlayIntensity : 0.5}) 100%)`
                    }} />
                )}
                {clip.overlay === 'film-grain' && (
                    <AbsoluteFill style={{
                        pointerEvents: 'none',
                        opacity: clip.overlayIntensity !== undefined ? clip.overlayIntensity : 0.5,
                        mixBlendMode: 'overlay',
                        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                    }} />
                )}
                {clip.overlay === 'light-leak' && (
                    <AbsoluteFill style={{
                        pointerEvents: 'none',
                        opacity: clip.overlayIntensity !== undefined ? clip.overlayIntensity : 0.5,
                        mixBlendMode: 'screen',
                    }}>
                        <Loop durationInFrames={150}>
                            <Video
                                src="https://assets.mixkit.co/videos/48011/48011-720.mp4"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                        </Loop>
                    </AbsoluteFill>
                )}
                {clip.overlay === 'letterbox' && (
                    <AbsoluteFill style={{ pointerEvents: 'none' }}>
                      <div style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: 0,
                        height: `${Math.round(8 + 8 * (clip.overlayIntensity ?? 0.5))}%`,
                        background: '#000',
                      }} />
                      <div style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: `${Math.round(8 + 8 * (clip.overlayIntensity ?? 0.5))}%`,
                        background: '#000',
                      }} />
                    </AbsoluteFill>
                )}
              </ClipWithFades>
            </TransitionSeries.Sequence>
          );

          if (index < visualSequences.length - 1 && clip.transitionAfterFrames > 0) {
             const nextClip = visualSequences[index + 1];

             /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
             let presentation: any = fade();
             if (nextClip.transitionType === 'wipe') presentation = wipe();
             else if (nextClip.transitionType === 'slide') presentation = slide();
             else if (nextClip.transitionType === 'zoom') presentation = zoomInOut({});
             else if (nextClip.transitionType === 'film-burn') presentation = filmBurn({ seed: 2.31 });
             else if (nextClip.transitionType === 'blur-slide') presentation = blurSlide({ blur: 0.35 });
             else if (nextClip.transitionType === 'cross-zoom') presentation = crossZoom({ strength: 0.4 });
             else if (nextClip.transitionType === 'dreamy-zoom') presentation = dreamyZoom({ rotation: 5, scale: 1.18 });
             else if (nextClip.transitionType === 'linear-blur') presentation = linearBlur({ intensity: 0.08 });
             else if (nextClip.transitionType === 'push-cut') presentation = pushCut({ flashOpacity: 0.16, flashFrames: 2 });

             elements.push(
               <TransitionSeries.Transition
                 key={`transition-${clip.id}-${nextClip.id}`}
                 presentation={presentation}
                 timing={linearTiming({ durationInFrames: clip.transitionAfterFrames })}
               />
             );
          }

          return elements;
        })}
      </TransitionSeries>

      {/* For simplicity, audio clips start at frame 0 and loop/play their duration. We can improve this later to position them. */}
      {audioClips.map((clip) => {
        const audioDurationInFrames = getItemDurationInFrames(clip, fps);
        const startFrame = getItemDelayInFrames(clip, fps);
        return (
          <Sequence key={clip.id} from={startFrame} durationInFrames={audioDurationInFrames}>
            <AnimatedVolume clip={clip} durationInFrames={audioDurationInFrames} absoluteStartFrame={startFrame} totalCompositionFrames={totalCompositionFrames} globalFadeOutFrames={globalFadeOutFrames} render={(volume) => (
               <Audio
                 src={clip.url}
                 volume={volume}
                 trimBefore={clip.trimBefore !== undefined ? Math.round(clip.trimBefore * fps) : (clip.startFrom ? Math.round(clip.startFrom * fps) : undefined)}
                      trimAfter={clip.trimAfter !== undefined ? Math.round(clip.trimAfter * fps) : undefined}
                 loop={clip.loop}
                 playbackRate={clip.playbackRate || 1}
               />
            )} />
          </Sequence>
        );
      })}

      {/* Global Fade-Out Overlay (visuals only, placed under subtitles) */}
      {globalFadeOutFrames > 0 && totalCompositionFrames > 0 && (
          <Sequence from={totalCompositionFrames - globalFadeOutFrames} durationInFrames={globalFadeOutFrames}>
             <AbsoluteFill>
                 <GlobalFadeOverlay durationInFrames={globalFadeOutFrames} />
             </AbsoluteFill>
          </Sequence>
      )}

      {/* Real Three.js / GLB scenes */}
      {threeScenes.map((scene) => {
        const fromFrame = Math.round(Math.max(0, scene.start) * fps);
        const duration = Math.round(Math.max(0, scene.end - scene.start) * fps);
        if (duration <= 0) return null;

        return (
          <Sequence key={scene.id} from={fromFrame} durationInFrames={duration}>
            <NaylaThreeSceneRenderer scene={scene} />
          </Sequence>
        );
      })}

      {/* GSAP Motion Titles */}
      {titles.map((title) => {
        const fromFrame = Math.round(Math.max(0, title.start) * fps);
        const duration = Math.round(Math.max(0, title.end - title.start) * fps);
        if (duration <= 0) return null;

        return (
          <Sequence key={title.id} from={fromFrame} durationInFrames={duration}>
            <NaylaGsapTitle title={title} durationInFrames={duration} />
          </Sequence>
        );
      })}

      {/* Subtitles Overlay */}
      {subtitles.map(sub => {
         const fromFrame = Math.round(sub.inicioSec * fps);
         const duration = Math.round((sub.finSec - sub.inicioSec) * fps);
         if (duration <= 0) return null;

         return (
            <Sequence key={sub.id} from={fromFrame} durationInFrames={duration}>
              <DynamicSubtitle subtitle={sub} />
            </Sequence>
         );
      })}

      {/* Global Logos Overlay */}
      {logos.map(logo => {
         let fromFrame = 0;
         let durationInFrames = totalCompositionFrames;

         if (logo.inicioSec !== undefined) {
             fromFrame = Math.round(logo.inicioSec * fps);
             durationInFrames -= fromFrame; // Adjust duration so it doesn't exceed total if no finSec
         }

         if (logo.finSec !== undefined) {
             const endFrame = Math.round(logo.finSec * fps);
             const durationFrames = endFrame - fromFrame;
             if (durationFrames > 0) {
                 durationInFrames = durationFrames;
             }
         }

         return (
            <Sequence key={logo.id} from={fromFrame} durationInFrames={durationInFrames}>
               <LogoWithFades logo={logo} durationInFrames={durationInFrames} fps={fps} />
            </Sequence>
         );
      })}
    </AbsoluteFill>
  );
};
