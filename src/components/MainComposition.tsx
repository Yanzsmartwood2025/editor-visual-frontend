import { NaylaDecorations } from './NaylaDecorations';
import type { NaylaDecoration } from '../lib/naylaDecorations';
import { useNaylaFont } from './NaylaFont';
import { getAutomatedGain } from '../lib/audioAutomation';
import React, { useMemo } from 'react';
import { AbsoluteFill, Sequence, CanvasImage, useVideoConfig, useCurrentFrame, interpolate, Img, Loop } from 'remotion';
import { Audio, Video } from '@remotion/media';
import { createTikTokStyleCaptions, type Caption } from '@remotion/captions';
import { useGsapTimeline } from '@remotion/gsap';
import { CameraMotionBlur } from '@remotion/motion-blur';
import { noise2D } from '@remotion/noise';
import { Circle, Star } from '@remotion/shapes';
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
import { NaylaVectorAnimationRenderer, type NaylaVectorAnimation } from './NaylaVectorAnimation';
import { NaylaSkiaGraphicRenderer, type NaylaSkiaGraphic } from './NaylaSkiaGraphic';
import type { NaylaSubtitleStyle } from '../lib/naylaSubtitleStyles';
import { getNaylaAudioBusGain, getNaylaMusicDuckGain, resolveNaylaAudioMix, type NaylaAudioBus, type NaylaAudioMixSettings, type NaylaVoiceInterval } from '../lib/naylaAudioMix';
import type { NaylaAudioMasterSettings } from '../lib/naylaAudioMaster';
import { getNaylaFilterCssFilter } from '../lib/naylaFilterPresets';

// Interfaces based on main file
type ProfessionalEffect = {
  type: 'chromatic-aberration' | 'color-correction' | 'glow' | 'pixelate' | 'zoom-blur' | 'vignette' | 'light-leak';
  intensity?: number;
  color?: string;
  angle?: number;
  seed?: number;
};
type GsapClipPreset = 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'zoom-in' | 'zoom-out' | 'bounce' | 'elastic' | 'spin' | 'swing';
type GsapClipMotion = { enter?: GsapClipPreset; exit?: GsapClipPreset; enterDuration?: number; exitDuration?: number; intensity?: number; };
type ProceduralMotion = { preset: 'particles' | 'orbit' | 'pulse-grid' | 'starfield'; intensity?: number; speed?: number; seed?: number; color?: string; accentColor?: string; };
type TimelineItem = { id: string; mediaId: string; tipo: 'foto' | 'video' | 'audio'; nombre: string; etiqueta: string; url: string; durationInSeconds?: number; originalDurationInSeconds?: number; volume?: number; audioBus?: NaylaAudioBus; pitch?: number; volumeKeyframes?: { time: number; gain: number }[]; fadeIn?: number; fadeOut?: number; scale?: number; delay?: number; startFrom?: number; trimBefore?: number; trimAfter?: number; loop?: boolean; playbackRate?: number; transitionDuration?: number; transitionType?: 'fade' | 'none' | 'wipe' | 'slide' | 'zoom' | 'film-burn' | 'blur-slide' | 'cross-zoom' | 'dreamy-zoom' | 'linear-blur' | 'push-cut'; visualTemplate?: 'fragment-reveal' | 'carousel-card' | 'depth-stack' | 'split-panels' | 'poster-pop'; efecto?: string; brightness?: number; contrast?: number; saturation?: number; overlay?: string; overlayIntensity?: number; professionalEffects?: ProfessionalEffect[]; motionBlur?: { shutterAngle?: number; samples?: number }; gsapMotion?: GsapClipMotion; proceduralMotion?: ProceduralMotion; };
type SubtitleItem = { id: string; texto: string; inicioSec: number; finSec: number; style?: NaylaSubtitleStyle; position?: 'top' | 'center' | 'bottom'; fontSize?: number; fontFamily?: string; fontUrl?: string; color?: string; accentColor?: string; backgroundColor?: string; };
type LogoItem = { id: string; url: string; x: number; y: number; scale: number; opacity: number; inicioSec?: number; finSec?: number; fadeIn?: number; fadeOut?: number; };

interface MainCompositionProps {
  timeline: TimelineItem[];
  canvasRatio: string;
  logos?: LogoItem[];
  subtitles?: SubtitleItem[];
  titles?: NaylaMotionTitle[];
  threeScenes?: NaylaThreeScene[];
  vectorAnimations?: NaylaVectorAnimation[];
  skiaGraphics?: NaylaSkiaGraphic[];
  settings?: {
    fadeOutFinal?: number;
    decorations?: NaylaDecoration[];
    audioMix?: NaylaAudioMixSettings;
    audioMaster?: NaylaAudioMasterSettings;
    renderPerformance?: 'fast' | 'full';
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
  const presetFilter = getNaylaFilterCssFilter(clip.efecto);
  if (presetFilter) filters.push(presetFilter);

  if (clip.brightness !== undefined) filters.push(`brightness(${clip.brightness})`);
  if (clip.contrast !== undefined) filters.push(`contrast(${clip.contrast})`);
  if (clip.saturation !== undefined) filters.push(`saturate(${clip.saturation})`);
  if ((clip as any).blur !== undefined && typeof (clip as any).blur === 'number') {
    filters.push(`blur(${(clip as any).blur}px)`);
  }

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
  durationInFrames: number,
  fastRender = false
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
          samples: fastRender ? 6 : 20,
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

const getGsapClipVars = (
  preset: GsapClipPreset,
  intensity: number,
  exiting: boolean
): Record<string, number> => {
  const distance = 120 * intensity;
  const scaleDistance = 0.32 * intensity;

  switch (preset) {
    case 'fade':
      return { opacity: 0 };
    case 'slide-left':
      return { x: -distance, opacity: 0 };
    case 'slide-right':
      return { x: distance, opacity: 0 };
    case 'slide-up':
      return { y: -distance, opacity: 0 };
    case 'slide-down':
      return { y: distance, opacity: 0 };
    case 'zoom-in':
      return { scale: exiting ? 1 + scaleDistance : Math.max(0.35, 1 - scaleDistance), opacity: 0 };
    case 'zoom-out':
      return { scale: exiting ? Math.max(0.35, 1 - scaleDistance) : 1 + scaleDistance, opacity: 0 };
    case 'bounce':
      return { y: exiting ? distance * 0.75 : -distance, opacity: 0 };
    case 'elastic':
      return { scale: Math.max(0.4, 1 - scaleDistance), opacity: 0 };
    case 'spin':
      return { rotation: (exiting ? 55 : -55) * intensity, scale: Math.max(0.45, 1 - scaleDistance * 0.5), opacity: 0 };
    case 'swing':
      return { rotation: (exiting ? 12 : -12) * intensity, x: (exiting ? 35 : -35) * intensity, opacity: 0 };
    default:
      return { opacity: 0 };
  }
};

const GsapClipMotionFrame: React.FC<{
  clip: TimelineItem;
  durationInFrames: number;
  children: React.ReactNode;
}> = ({ clip, durationInFrames, children }) => {
  const { fps } = useVideoConfig();
  const motion = clip.gsapMotion;
  const enter = motion?.enter;
  const exit = motion?.exit;
  const intensity = Math.max(0.25, Math.min(2, Number(motion?.intensity) || 1));
  const clipDurationSeconds = Math.max(1 / fps, durationInFrames / fps);
  const enterDuration = Math.min(
    Math.max(0.1, Number(motion?.enterDuration) || 0.75),
    clipDurationSeconds
  );
  const exitDuration = Math.min(
    Math.max(0.1, Number(motion?.exitDuration) || 0.65),
    clipDurationSeconds
  );

  const scope = useGsapTimeline<HTMLDivElement>(
    ({ timeline, selector }) => {
      const target = selector('[data-nayla-gsap-clip]');

      if (enter) {
        const ease =
          enter === 'bounce'
            ? 'bounce.out'
            : enter === 'elastic'
              ? 'elastic.out(1, 0.35)'
              : 'power3.out';

        timeline.from(
          target,
          {
            ...getGsapClipVars(enter, intensity, false),
            duration: enterDuration,
            ease,
          },
          0
        );
      }

      if (exit) {
        timeline.to(
          target,
          {
            ...getGsapClipVars(exit, intensity, true),
            duration: exitDuration,
            ease: 'power2.in',
          },
          Math.max(0, clipDurationSeconds - exitDuration)
        );
      }
    },
    {
      dependencies: [
        enter,
        exit,
        intensity,
        enterDuration,
        exitDuration,
        clipDurationSeconds,
      ],
    }
  );

  if (!enter && !exit) return <>{children}</>;

  return (
    <div
      ref={scope}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
      }}
    >
      <div
        data-nayla-gsap-clip
        style={{
          position: 'absolute',
          inset: 0,
          transformOrigin: 'center center',
          willChange: 'transform, opacity',
        }}
      >
        {children}
      </div>
    </div>
  );
};


const ProceduralClipOverlay: React.FC<{ clip: TimelineItem; fastRender?: boolean }> = ({ clip, fastRender = false }) => {
  const motion = clip.proceduralMotion;
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  if (!motion) return null;

  const preset = motion.preset;
  const intensity = clamp01(motion.intensity, 0.5);
  const speed = Math.max(0.1, Math.min(4, Number(motion.speed) || 1));
  const seed = Number.isFinite(Number(motion.seed)) ? Number(motion.seed) : 17;
  const color = motion.color || '#ffffff';
  const accentColor = motion.accentColor || color;
  const t = (frame / Math.max(1, fps)) * speed;
  const requestedCount = preset === 'pulse-grid'
    ? 24
    : Math.max(10, Math.round(12 + intensity * 28));
  const count = fastRender ? Math.min(14, requestedCount) : requestedCount;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      {Array.from({ length: count }).map((_, index) => {
        let x = 0;
        let y = 0;
        let scale = 1;
        const phase = index / Math.max(1, count);

        if (preset === 'orbit') {
          const angle = phase * Math.PI * 2 + t * (0.7 + intensity);
          const radiusX = width * (0.2 + 0.16 * intensity);
          const radiusY = height * (0.16 + 0.12 * intensity);
          x = width / 2 + Math.cos(angle) * radiusX;
          y = height / 2 + Math.sin(angle) * radiusY;
          scale = 0.7 + (Math.sin(angle * 2) + 1) * 0.22;
        } else if (preset === 'pulse-grid') {
          const columns = 6;
          const row = Math.floor(index / columns);
          const column = index % columns;
          x = ((column + 0.5) / columns) * width;
          y = ((row + 0.5) / 4) * height;
          scale = 0.55 + ((Math.sin(t * 3 + index * 0.7) + 1) / 2) * (0.55 + intensity * 0.55);
        } else {
          const driftX = noise2D(seed + index * 13, t * 0.18, index * 0.31);
          const driftY = noise2D(seed + index * 29, index * 0.27, t * 0.16);
          x = (phase * 0.86 + 0.07) * width + driftX * width * (0.05 + intensity * 0.07);
          y = (((index * 0.61803398875) % 1) * 0.86 + 0.07) * height + driftY * height * (0.05 + intensity * 0.07);
          scale = 0.65 + ((noise2D(seed + 97, index * 0.2, t * 0.22) + 1) / 2) * (0.45 + intensity * 0.55);
        }

        const size = 4 + intensity * 13 + (index % 5) * 1.6;
        const opacity = Math.max(0.14, Math.min(0.82, 0.2 + intensity * 0.5));
        const useStar = preset === 'starfield' || (preset === 'orbit' && index % 3 === 0);

        return (
          <div
            key={index}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              transform: `translate(-50%, -50%) scale(${scale}) rotate(${t * 18 + index * 9}deg)`,
              opacity,
              filter: intensity > 0.65 ? `drop-shadow(0 0 ${6 + intensity * 10}px ${accentColor})` : undefined,
              willChange: 'transform',
            }}
          >
            {useStar ? (
              <Star
                points={5}
                innerRadius={size * 0.45}
                outerRadius={size}
                fill={index % 2 === 0 ? color : accentColor}
              />
            ) : (
              <Circle
                radius={size * 0.55}
                fill={index % 2 === 0 ? color : accentColor}
              />
            )}
          </div>
        );
      })}
    </AbsoluteFill>
  );
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


const AnimatedPhoto: React.FC<{ clip: TimelineItem, durationInFrames: number; fastRender?: boolean }> = ({ clip, durationInFrames, fastRender = false }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const effects = getProfessionalEffects(clip, frame, durationInFrames, fastRender);

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

const VisualTemplatePhoto: React.FC<{
  clip: TimelineItem;
  durationInFrames: number;
  revealUrl?: string;
  fastRender?: boolean;
}> = ({ clip, durationInFrames, revealUrl, fastRender = false }) => {
  const frame = useCurrentFrame();
  const end = Math.max(1, durationInFrames - 1);
  const enter = interpolate(frame, [0, Math.max(1, Math.round(durationInFrames * 0.22))], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const exit = interpolate(frame, [Math.round(durationInFrames * 0.58), end], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const nextUrl = revealUrl || clip.url;
  const commonImageStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    filter: getFilterStyle(clip),
  };

  if (!clip.visualTemplate) {
    return <AnimatedPhoto clip={clip} durationInFrames={durationInFrames} fastRender={fastRender} />;
  }

  if (clip.visualTemplate === 'fragment-reveal') {
    const slices = fastRender ? 4 : 7;
    return (
      <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: '#000' }}>
        <PreloadedImage
          src={nextUrl}
          style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'brightness(0.78) saturate(0.92)' }}
        />
        <AbsoluteFill style={{ opacity: Math.max(0, 1 - exit * 1.15) }}>
          <AnimatedPhoto clip={clip} durationInFrames={durationInFrames} fastRender={fastRender} />
        </AbsoluteFill>
        {Array.from({ length: slices }, (_, index) => {
          const left = (index / slices) * 100;
          const right = 100 - ((index + 1) / slices) * 100;
          const direction = index % 2 === 0 ? -1 : 1;
          const x = direction * (18 + index * 2.5) * exit;
          const y = (index - (slices - 1) / 2) * 2.4 * exit;
          const rotation = direction * (2.5 + index * 0.35) * exit;
          return (
            <AbsoluteFill
              key={index}
              style={{
                clipPath: `inset(0 ${right}% 0 ${left}%)`,
                transform: `translate(${x}%, ${y}%) rotate(${rotation}deg) scale(${1 + 0.015 * exit})`,
                transformOrigin: 'center center',
                filter: fastRender ? undefined : 'drop-shadow(0 0 18px rgba(0,0,0,0.35))',
              }}
            >
              <PreloadedImage src={clip.url} style={commonImageStyle} />
            </AbsoluteFill>
          );
        })}
      </AbsoluteFill>
    );
  }

  if (clip.visualTemplate === 'split-panels') {
    const spread = 42 * exit;
    return (
      <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: '#000' }}>
        <PreloadedImage
          src={nextUrl}
          style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'brightness(0.82)' }}
        />
        <AbsoluteFill
          style={{
            clipPath: 'inset(0 50% 0 0)',
            transform: `translateX(${-spread}%)`,
            filter: fastRender ? undefined : 'drop-shadow(16px 0 22px rgba(0,0,0,.4))',
          }}
        >
          <PreloadedImage src={clip.url} style={commonImageStyle} />
        </AbsoluteFill>
        <AbsoluteFill
          style={{
            clipPath: 'inset(0 0 0 50%)',
            transform: `translateX(${spread}%)`,
            filter: fastRender ? undefined : 'drop-shadow(-16px 0 22px rgba(0,0,0,.4))',
          }}
        >
          <PreloadedImage src={clip.url} style={commonImageStyle} />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  if (clip.visualTemplate === 'carousel-card') {
    const x = interpolate(frame, [0, Math.round(end * 0.55), end], [22, 0, -34], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const rotation = interpolate(frame, [0, end], [-4.5, 3.5], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const scale = 0.88 + enter * 0.1;
    return (
      <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: '#000' }}>
        <PreloadedImage
          src={nextUrl}
          style={{ width: '100%', height: '100%', objectFit: 'cover', filter: fastRender ? 'brightness(0.32) saturate(0.72)' : 'blur(20px) brightness(0.42) saturate(0.8)', transform: 'scale(1.08)' }}
        />
        <div style={{
          position: 'absolute',
          left: '8%',
          top: '8%',
          width: '84%',
          height: '84%',
          overflow: 'hidden',
          borderRadius: 28,
          border: '1px solid rgba(255,255,255,.22)',
          background: '#050505',
          boxShadow: '0 28px 70px rgba(0,0,0,.55)',
          transform: `translateX(${x}%) rotate(${rotation}deg) scale(${scale})`,
          transformOrigin: 'center center',
        }}>
          <PreloadedImage src={clip.url} style={commonImageStyle} />
        </div>
      </AbsoluteFill>
    );
  }

  if (clip.visualTemplate === 'depth-stack') {
    const drift = interpolate(frame, [0, end], [-3, 4], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return (
      <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: '#000' }}>
        <PreloadedImage
          src={nextUrl}
          style={{ width: '100%', height: '100%', objectFit: 'cover', filter: fastRender ? 'brightness(.22) saturate(.78)' : 'blur(22px) brightness(.28)', transform: 'scale(1.1)' }}
        />
        {(fastRender ? [1] : [2, 1]).map((layer) => (
          <div key={layer} style={{
            position: 'absolute',
            left: `${7 + layer * 2}%`,
            top: `${6 + layer * 1.5}%`,
            width: '82%',
            height: '86%',
            borderRadius: 24,
            overflow: 'hidden',
            opacity: layer === 2 ? 0.28 : 0.48,
            transform: `translate(${drift * layer}px, ${layer * 12}px) rotate(${layer === 2 ? -3 : 2}deg) scale(${0.93 + layer * 0.015})`,
            boxShadow: '0 22px 55px rgba(0,0,0,.5)',
          }}>
            <PreloadedImage src={clip.url} style={commonImageStyle} />
          </div>
        ))}
        <div style={{
          position: 'absolute',
          left: '9%',
          top: '7%',
          width: '82%',
          height: '86%',
          borderRadius: 24,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,.18)',
          boxShadow: '0 30px 80px rgba(0,0,0,.58)',
          transform: `translateX(${drift}px) scale(${0.96 + enter * 0.04})`,
        }}>
          <PreloadedImage src={clip.url} style={commonImageStyle} />
        </div>
      </AbsoluteFill>
    );
  }

  if (clip.visualTemplate === 'poster-pop') {
    const cardScale = 0.82 + enter * 0.18 + exit * 0.03;
    const cardY = (1 - enter) * 7 - exit * 3;
    return (
      <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: '#000' }}>
        <PreloadedImage
          src={clip.url}
          style={{ width: '100%', height: '100%', objectFit: 'cover', filter: fastRender ? 'brightness(.24) saturate(.72)' : 'blur(26px) brightness(.3) saturate(.8)', transform: 'scale(1.12)' }}
        />
        <div style={{
          position: 'absolute',
          left: '7%',
          top: '5%',
          width: '86%',
          height: '90%',
          overflow: 'hidden',
          borderRadius: 18,
          background: '#050505',
          border: '1px solid rgba(255,255,255,.2)',
          boxShadow: '0 34px 90px rgba(0,0,0,.62)',
          transform: `translateY(${cardY}%) scale(${cardScale})`,
        }}>
          <PreloadedImage src={clip.url} style={commonImageStyle} />
        </div>
      </AbsoluteFill>
    );
  }

  return <AnimatedPhoto clip={clip} durationInFrames={durationInFrames} fastRender={fastRender} />;
};


const ProfessionalVideo: React.FC<{
  clip: TimelineItem;
  durationInFrames: number;
  volume: number;
  fastRender?: boolean;
}> = ({ clip, durationInFrames, volume, fastRender = false }) => {
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
      toneFrequency={clip.pitch}
      effects={getProfessionalEffects(clip, frame, durationInFrames, fastRender)}
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

const AnimatedVolume: React.FC<{
  clip: TimelineItem;
  durationInFrames: number;
  render: (volume: number) => React.ReactNode;
  absoluteStartFrame?: number;
  totalCompositionFrames?: number;
  globalFadeOutFrames?: number;
  audioMix?: NaylaAudioMixSettings;
  voiceIntervals?: NaylaVoiceInterval[];
}> = ({
  clip,
  durationInFrames,
  render,
  absoluteStartFrame,
  totalCompositionFrames,
  globalFadeOutFrames,
  audioMix,
  voiceIntervals = [],
}) => {
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
      Math.max(fadeInFrames + 2, effectiveDuration - 1),
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
      currentVolume *= fadeOutProgress;
    }
  }

  currentVolume *= getAutomatedGain(clip.volumeKeyframes, frame / fps);

  const resolvedMix = resolveNaylaAudioMix(audioMix);
  currentVolume *= resolvedMix.masterGain;
  currentVolume *= getNaylaAudioBusGain(clip.audioBus, resolvedMix);

  if (clip.audioBus === 'music' && absoluteStartFrame !== undefined) {
    const absoluteSeconds = (absoluteStartFrame + frame) / fps;
    currentVolume *= getNaylaMusicDuckGain(absoluteSeconds, voiceIntervals, resolvedMix);
  }

  return <>{render(Math.max(0, currentVolume))}</>;
};

const DynamicSubtitle: React.FC<{ subtitle: SubtitleItem }> = ({ subtitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fontFamily = useNaylaFont(subtitle.fontFamily, subtitle.fontUrl);
  const style = subtitle.style || 'clean';
  const position = subtitle.position || 'bottom';
  const fontSize = subtitle.fontSize || (style === 'cinematic' ? 46 : 42);
  const color = subtitle.color || '#ffffff';
  const accentColor = subtitle.accentColor || (
    style === 'starlight' ? '#c4b5fd'
      : style === 'neon' || style === 'glow' ? '#7dd3fc'
        : style === 'retro' ? '#fbbf24'
          : '#ffffff'
  );
  const backgroundColor = subtitle.backgroundColor || (
    style === 'boxed' ? 'rgba(0,0,0,0.82)'
      : style === 'minimal-dark' ? 'rgba(3,3,3,0.72)'
        : 'rgba(0,0,0,0.55)'
  );

  const durationFrames = Math.max(1, Math.round((subtitle.finSec - subtitle.inicioSec) * fps));
  const durationMs = Math.max(1, (subtitle.finSec - subtitle.inicioSec) * 1000);
  const progress = interpolate(frame, [0, Math.max(1, durationFrames - 1)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const enter = interpolate(frame, [0, Math.max(1, Math.round(fps * 0.42))], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const justifyContent =
    position === 'top' ? 'flex-start' : position === 'center' ? 'center' : 'flex-end';
  const verticalPadding =
    position === 'top' ? '10%' : position === 'bottom' ? '10%' : 0;

  const shellStyle: React.CSSProperties = (() => {
    switch (style) {
      case 'cinematic':
        return {
          backgroundColor,
          color,
          borderRadius: 10,
          padding: '10px 18px',
          textShadow: '0 2px 8px rgba(0,0,0,0.85)',
          letterSpacing: '0.02em',
        };
      case 'neon':
        return {
          color,
          fontWeight: 850,
          textShadow: `0 0 4px ${color}, 0 0 10px ${accentColor}, 0 0 22px ${accentColor}, 0 0 40px ${accentColor}`,
          letterSpacing: '0.035em',
        };
      case 'glow':
        return {
          color,
          fontWeight: 800,
          textShadow: `0 2px 4px rgba(0,0,0,.95), 0 0 10px ${accentColor}, 0 0 24px ${accentColor}`,
        };
      case 'outline':
        return {
          color,
          fontWeight: 900,
          WebkitTextStroke: `2px ${accentColor === '#ffffff' ? '#050505' : accentColor}`,
          paintOrder: 'stroke fill',
          textShadow: '0 3px 10px rgba(0,0,0,.75)',
        };
      case 'shadow-3d':
        return {
          color,
          fontWeight: 900,
          textShadow: `1px 1px 0 ${accentColor}, 2px 2px 0 ${accentColor}, 3px 3px 0 ${accentColor}, 5px 6px 12px rgba(0,0,0,.72)`,
          transform: 'perspective(700px) rotateX(3deg)',
        };
      case 'extrude-3d':
        return {
          color,
          fontWeight: 950,
          letterSpacing: '0.025em',
          textShadow: `1px 1px 0 ${accentColor}, 2px 2px 0 ${accentColor}, 3px 3px 0 ${accentColor}, 4px 4px 0 ${accentColor}, 5px 5px 0 ${accentColor}, 6px 6px 0 ${accentColor}, 9px 12px 18px rgba(0,0,0,.75)`,
          transform: `perspective(850px) rotateX(${4 - enter * 4}deg) rotateY(${-5 + enter * 5}deg)`,
          transformOrigin: 'center',
        };
      case 'glass':
        return {
          color,
          fontWeight: 750,
          padding: '12px 20px',
          borderRadius: 16,
          background: backgroundColor === 'rgba(0,0,0,0.55)' ? 'rgba(20,20,20,.42)' : backgroundColor,
          border: '1px solid rgba(255,255,255,.22)',
          boxShadow: '0 12px 36px rgba(0,0,0,.32)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          textShadow: '0 2px 7px rgba(0,0,0,.75)',
        };
      case 'boxed':
        return {
          color,
          backgroundColor,
          border: `1px solid ${accentColor}`,
          borderRadius: 12,
          padding: '10px 18px',
          fontWeight: 850,
          boxShadow: '0 8px 28px rgba(0,0,0,.4)',
        };
      case 'marker':
        return {
          color,
          padding: '4px 10px',
          borderRadius: 4,
          fontWeight: 900,
          background: `linear-gradient(transparent 38%, ${accentColor} 38%, ${accentColor} 88%, transparent 88%)`,
          textShadow: '0 2px 5px rgba(0,0,0,.8)',
        };
      case 'underline':
        return {
          color,
          fontWeight: 850,
          borderBottom: `5px solid ${accentColor}`,
          paddingBottom: 5,
          textShadow: '0 2px 7px rgba(0,0,0,.85)',
        };
      case 'minimal-dark':
        return {
          color,
          backgroundColor,
          borderRadius: 8,
          padding: '8px 14px',
          fontWeight: 650,
          letterSpacing: '0.015em',
        };
      case 'gradient':
        return {
          color: 'transparent',
          fontWeight: 900,
          backgroundImage: `linear-gradient(90deg, ${color}, ${accentColor})`,
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          filter: 'drop-shadow(0 3px 8px rgba(0,0,0,.75))',
        };
      case 'retro':
        return {
          color: subtitle.color || '#fef3c7',
          fontWeight: 950,
          letterSpacing: '0.055em',
          textTransform: 'uppercase',
          textShadow: `3px 3px 0 ${accentColor}, 6px 6px 0 rgba(140,40,40,.75), 8px 10px 15px rgba(0,0,0,.65)`,
        };
      case 'glitch': {
        const glitchX = frame % 8 < 2 ? 3 : frame % 11 < 2 ? -3 : 0;
        return {
          color,
          fontWeight: 900,
          transform: `translateX(${glitchX}px)`,
          textShadow: `-3px 0 #22d3ee, 3px 0 #fb7185, 0 3px 8px rgba(0,0,0,.8)`,
          letterSpacing: '0.025em',
        };
      }
      case 'starlight':
        return {
          color: 'transparent',
          fontWeight: 760,
          letterSpacing: '0.035em',
          backgroundImage: `linear-gradient(90deg, ${color}, ${accentColor}, #f9a8d4, ${color})`,
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          filter: `drop-shadow(0 0 7px ${accentColor}) drop-shadow(0 3px 8px rgba(0,0,0,.7))`,
        };
      case 'tiktok':
      case 'karaoke':
      case 'word-rise':
      case 'pop':
      case 'typewriter':
        return {
          color,
          fontWeight: 900,
          textShadow: '0 2px 7px rgba(0,0,0,0.9)',
        };
      case 'clean':
      default:
        return {
          color,
          textShadow: '0 2px 8px rgba(0,0,0,0.9), 0 0 2px #000',
        };
    }
  })();

  const commonStyle: React.CSSProperties = {
    ...shellStyle,
    maxWidth: '86%',
    textAlign: 'center',
    fontSize,
    fontFamily,
    lineHeight: 1.16,
    whiteSpace: 'pre-wrap',
    opacity: enter,
  };

  const renderTrackedWords = () => {
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
    const combineMs = style === 'karaoke' ? Math.min(1800, durationMs) : Math.min(1200, durationMs);
    const pages = createTikTokStyleCaptions({
      captions,
      combineTokensWithinMilliseconds: combineMs,
      breakOnSilenceAfterMilliseconds: 900,
    }).pages;
    const currentMs = (frame / fps) * 1000;
    const page = pages.find((item) => currentMs >= item.startMs && currentMs < item.startMs + item.durationMs) || pages[0];
    if (!page) return null;
    const activeIndex = page.tokens.findIndex((token) => currentMs >= token.fromMs && currentMs < token.toMs);

    return page.tokens.map((token, index) => {
      const active = index === activeIndex;
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
              ? (style === 'karaoke' ? accentColor : `${accentColor}33`)
              : 'transparent',
            color: active && style === 'karaoke' ? backgroundColor : color,
            transform: active ? 'scale(1.07)' : 'scale(1)',
          }}
        >
          {token.text}
        </span>
      );
    });
  };

  const renderAnimatedText = () => {
    if (style === 'typewriter') {
      const chars = Math.max(1, subtitle.texto.length);
      const shown = Math.min(chars, Math.floor(progress * (chars + 1)));
      return subtitle.texto.slice(0, shown);
    }

    if (style === 'word-rise' || style === 'pop') {
      let wordIndex = 0;
      return subtitle.texto.split(/(\s+)/).map((piece, index) => {
        if (/^\s+$/.test(piece)) return <React.Fragment key={index}>{piece}</React.Fragment>;
        const currentWord = wordIndex++;
        const delayFrames = currentWord * Math.max(1, Math.round(fps * 0.055));
        const local = interpolate(frame, [delayFrames, delayFrames + Math.max(1, Math.round(fps * 0.32))], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const y = style === 'word-rise' ? (1 - local) * 28 : 0;
        const scale = style === 'pop'
          ? 0.72 + local * 0.34 + Math.sin(local * Math.PI) * 0.08
          : 1;
        return (
          <span
            key={index}
            style={{
              display: 'inline-block',
              opacity: local,
              transform: `translateY(${y}px) scale(${scale})`,
            }}
          >
            {piece}
          </span>
        );
      });
    }

    return subtitle.texto;
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
      <div style={commonStyle}>
        {style === 'tiktok' || style === 'karaoke'
          ? renderTrackedWords()
          : renderAnimatedText()}
      </div>
    </AbsoluteFill>
  );
};

export const MainComposition: React.FC<MainCompositionProps> = ({ timeline, subtitles = [], titles = [], threeScenes = [], vectorAnimations = [], skiaGraphics = [], logos = [], settings = {} }) => {
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

  const voiceIntervals = useMemo<NaylaVoiceInterval[]>(() => {
    const intervals: NaylaVoiceInterval[] = [];

    for (const clip of audioClips) {
      if (clip.audioBus !== 'voice' || !clip.durationInSeconds) continue;
      const start = Math.max(0, Number(clip.delay) || 0);
      intervals.push({ start, end: start + Math.max(0, Number(clip.durationInSeconds) || 0) });
    }

    for (const clip of visualSequences) {
      if (clip.tipo !== 'video' || clip.audioBus !== 'voice') continue;
      intervals.push({
        start: clip.absoluteStartFrame / fps,
        end: (clip.absoluteStartFrame + clip.durationInFrames) / fps,
      });
    }

    return intervals.sort((a, b) => a.start - b.start);
  }, [audioClips, visualSequences, fps]);

  const totalCompositionFrames = getCompositionDurationInFrames(
    timeline,
    fps,
    subtitles,
    logos,
    titles,
    threeScenes,
    vectorAnimations,
    skiaGraphics,
    settings.decorations || []
  );

  // Verify Audio Clips as well
  audioClips.forEach(clip => {
     if (clip.durationInSeconds === undefined) {
        throw new Error(`Critical Error: Audio Clip '${clip.nombre || clip.etiqueta}' (URL: ${clip.url}) was passed to Remotion Composition without a valid durationInSeconds.`);
     }
  });

  const globalFadeOutFrames = settings?.fadeOutFinal ? Math.round(settings.fadeOutFinal * fps) : 0;
  const fastRender = settings?.renderPerformance === 'fast';

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
                    <GsapClipMotionFrame clip={clip} durationInFrames={clip.durationInFrames}>
                      <AnimatedVisualFrame clip={clip} durationInFrames={clip.durationInFrames}>
                        <AnimatedVolume clip={clip} durationInFrames={clip.durationInFrames} absoluteStartFrame={clip.absoluteStartFrame} totalCompositionFrames={totalCompositionFrames} globalFadeOutFrames={globalFadeOutFrames} audioMix={settings.audioMix} voiceIntervals={voiceIntervals} render={(volume) => (
                          <ProfessionalVideo
                            clip={clip}
                            durationInFrames={clip.durationInFrames}
                            volume={volume}
                            fastRender={fastRender}
                          />
                        )} />
                      </AnimatedVisualFrame>
                    </GsapClipMotionFrame>
                  ) : (
                    <GsapClipMotionFrame clip={clip} durationInFrames={clip.durationInFrames}>
                      <AnimatedVisualFrame clip={clip} durationInFrames={clip.durationInFrames}>
                        <VisualTemplatePhoto
                          clip={clip}
                          durationInFrames={clip.durationInFrames}
                          revealUrl={visualSequences[index + 1]?.url}
                          fastRender={fastRender}
                        />
                      </AnimatedVisualFrame>
                    </GsapClipMotionFrame>
                  )}
                </MaybeMotionBlur>
                <ProceduralClipOverlay clip={clip} fastRender={fastRender} />
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
                        backgroundImage: fastRender
                          ? 'radial-gradient(circle, rgba(255,255,255,.18) 0.7px, transparent 0.9px)'
                          : `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                        backgroundSize: fastRender ? '3px 3px' : undefined,
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
            <AnimatedVolume clip={clip} durationInFrames={audioDurationInFrames} absoluteStartFrame={startFrame} totalCompositionFrames={totalCompositionFrames} globalFadeOutFrames={globalFadeOutFrames} audioMix={settings.audioMix} voiceIntervals={voiceIntervals} render={(volume) => (
               <Audio
                 src={clip.url}
                 volume={volume}
                 trimBefore={clip.trimBefore !== undefined ? Math.round(clip.trimBefore * fps) : (clip.startFrom ? Math.round(clip.startFrom * fps) : undefined)}
                      trimAfter={clip.trimAfter !== undefined ? Math.round(clip.trimAfter * fps) : undefined}
                 loop={clip.loop}
                 playbackRate={clip.playbackRate || 1}
                 toneFrequency={clip.pitch}
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

      {/* Advanced Skia graphics */}
      {skiaGraphics.map((item) => {
        const fromFrame = Math.round(Math.max(0, item.start) * fps);
        const duration = Math.round(Math.max(0, item.end - item.start) * fps);
        if (duration <= 0) return null;

        return (
          <Sequence key={item.id} from={fromFrame} durationInFrames={duration}>
            <NaylaSkiaGraphicRenderer item={item} />
          </Sequence>
        );
      })}

      {/* Lottie / Rive vector animations */}
      {vectorAnimations.map((item) => {
        const fromFrame = Math.round(Math.max(0, item.start) * fps);
        const duration = Math.round(Math.max(0, item.end - item.start) * fps);
        if (duration <= 0) return null;

        return (
          <Sequence key={item.id} from={fromFrame} durationInFrames={duration}>
            <NaylaVectorAnimationRenderer item={item} />
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
      <NaylaDecorations items={settings.decorations || []} />
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
