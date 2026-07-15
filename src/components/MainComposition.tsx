import React, { useMemo } from 'react';
import { AbsoluteFill, Sequence, Video, Audio, useVideoConfig, useCurrentFrame, interpolate, delayRender, continueRender } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { wipe } from '@remotion/transitions/wipe';
import { slide } from '@remotion/transitions/slide';
import { zoomInOut } from '@remotion/transitions/zoom-in-out';

// Interfaces based on main file
type TimelineItem = { id: string; mediaId: string; tipo: 'foto' | 'video' | 'audio'; nombre: string; etiqueta: string; url: string; durationInSeconds?: number; volume?: number; fadeIn?: number; fadeOut?: number; scale?: number; delay?: number; startFrom?: number; loop?: boolean; playbackRate?: number; transitionDuration?: number; transitionType?: 'fade' | 'none' | 'wipe' | 'slide' | 'zoom'; efecto?: string; brightness?: number; contrast?: number; saturation?: number; };
type SubtitleItem = { id: string; texto: string; inicioSec: number; finSec: number; };

interface MainCompositionProps {
  timeline: TimelineItem[];
  canvasRatio: '9/16' | '16/9' | '1/1' | '4/5';
  subtitles?: SubtitleItem[];
  settings?: {
    fadeOutFinal?: number;
  };
}


const PreloadedImage: React.FC<{ src: string; style?: React.CSSProperties }> = ({ src, style }) => {
  const [handle] = React.useState(() => delayRender());

  return (
    <img
      src={src}
      style={style}
      onLoad={() => continueRender(handle)}
      onError={(e) => {
        console.error(`Failed to load image: ${src}`, e);
        continueRender(handle); // still continue to prevent hanging indefinitely
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
      // You can add more predefined effects here if needed
    }
  }

  if (clip.brightness !== undefined) filters.push(`brightness(${clip.brightness})`);
  if (clip.contrast !== undefined) filters.push(`contrast(${clip.contrast})`);
  if (clip.saturation !== undefined) filters.push(`saturate(${clip.saturation})`);
  // If the user manually provided a blur number instead of string effect
  if ((clip as any).blur !== undefined && typeof (clip as any).blur === 'number') filters.push(`blur(${(clip as any).blur}px)`);

  return filters.length > 0 ? filters.join(' ') : undefined;
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

  const fadeInFrames = Math.max(1, Math.round((clip.fadeIn || 0) * fps));
  const fadeOutFrames = Math.max(1, Math.round((clip.fadeOut || 0) * fps));

  const inputRange = [
    0,
    fadeInFrames,
    Math.max(fadeInFrames + 1, durationInFrames - fadeOutFrames - 1),
    Math.max(fadeInFrames + 2, durationInFrames - 1)
  ];

  const targetVolume = clip.volume !== undefined ? Number(clip.volume) : 1;

  let currentVolume = interpolate(
    frame,
    inputRange,
    [(clip.fadeIn || 0) > 0 ? 0 : targetVolume, targetVolume, targetVolume, (clip.fadeOut || 0) > 0 ? 0 : targetVolume],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

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

export const MainComposition: React.FC<MainCompositionProps> = ({ timeline, subtitles = [], settings = {} }) => {
  const { fps } = useVideoConfig();

  // We filter out videos and photos to build the main visual sequence
  const visualClips = useMemo(() => timeline.filter(t => t.tipo === 'video' || t.tipo === 'foto'), [timeline]);
  const audioClips = useMemo(() => timeline.filter(t => t.tipo === 'audio'), [timeline]);

  const visualSequences = useMemo(() => {
    let currentAbsoluteFrame = 0;
    return visualClips.map((clip, index) => {
      if (clip.tipo === 'video' && clip.durationInSeconds === undefined) {
        throw new Error(`Critical Error: Clip '${clip.nombre || clip.etiqueta}' (URL: ${clip.url}) was passed to Remotion Composition without a valid durationInSeconds.`);
      }
      const baseDurationSec = clip.durationInSeconds !== undefined ? clip.durationInSeconds : (clip.tipo === 'foto' ? 5 : 5);
      const durationInFrames = Math.round((baseDurationSec / (clip.playbackRate || 1)) * fps);

      const absoluteStartFrame = currentAbsoluteFrame;
      currentAbsoluteFrame += durationInFrames;

      // If there is a transition from this clip to the next, we subtract the transition duration
      // from the absolute progression so the next clip starts earlier.
      if (index < visualClips.length - 1) {
         const nextClip = visualClips[index + 1];
         if (nextClip.transitionType && nextClip.transitionType !== 'none' && nextClip.transitionDuration) {
             currentAbsoluteFrame -= Math.round(nextClip.transitionDuration * fps);
         }
      }

      return { ...clip, durationInFrames, absoluteStartFrame };
    });
  }, [visualClips, fps]);

  const totalCompositionFrames = visualSequences.length > 0
    ? visualSequences[visualSequences.length - 1].absoluteStartFrame + visualSequences[visualSequences.length - 1].durationInFrames
    : 0;

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

          if (clip.delay && clip.delay > 0) {
            const delayFrames = Math.round(clip.delay * fps);
            elements.push(
              <TransitionSeries.Sequence key={`spacer-${clip.id}`} durationInFrames={delayFrames}>
                 <AbsoluteFill style={{ backgroundColor: 'transparent' }} />
              </TransitionSeries.Sequence>
            );
          }

          elements.push(
            <TransitionSeries.Sequence key={clip.id} durationInFrames={clip.durationInFrames}>
              <ClipWithFades clip={clip} durationInFrames={clip.durationInFrames}>
                {clip.tipo === 'video' ? (
                  <AnimatedVolume clip={clip} durationInFrames={clip.durationInFrames} absoluteStartFrame={clip.absoluteStartFrame} totalCompositionFrames={totalCompositionFrames} globalFadeOutFrames={globalFadeOutFrames} render={(volume) => (
                    <Video
                      src={clip.url}
                      volume={volume}
                      startFrom={clip.startFrom ? Math.round(clip.startFrom * fps) : undefined}
                      loop={clip.loop}
                      playbackRate={clip.playbackRate || 1}
                      style={{ width: '100%', height: '100%', objectFit: 'contain', transform: clip.scale !== undefined ? `scale(${clip.scale})` : undefined, filter: getFilterStyle(clip) }}
                    />
                  )} />
                ) : (
                  <PreloadedImage
                    src={clip.url}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', transform: clip.scale !== undefined ? `scale(${clip.scale})` : undefined, filter: getFilterStyle(clip) }}
                  />
                )}
              </ClipWithFades>
            </TransitionSeries.Sequence>
          );

          if (index < visualSequences.length - 1) {
             const nextClip = visualSequences[index + 1];
             if (nextClip.transitionType && nextClip.transitionType !== 'none' && nextClip.transitionDuration) {
                const transDurationFrames = Math.round(nextClip.transitionDuration * fps);

                let presentation: any = fade();
                if (nextClip.transitionType === 'wipe') presentation = wipe();
                else if (nextClip.transitionType === 'slide') presentation = slide();
                else if (nextClip.transitionType === 'zoom') presentation = zoomInOut({});

                elements.push(
                  <TransitionSeries.Transition
                    key={`transition-${clip.id}-${nextClip.id}`}
                    presentation={presentation}
                    timing={linearTiming({ durationInFrames: transDurationFrames })}
                  />
                );
             }
          }

          return elements;
        })}
      </TransitionSeries>

      {/* For simplicity, audio clips start at frame 0 and loop/play their duration. We can improve this later to position them. */}
      {audioClips.map((clip) => {
        const audioDurationInFrames = Math.round((clip.durationInSeconds || 5) / (clip.playbackRate || 1) * fps);
        const startFrame = clip.delay ? Math.round(clip.delay * fps) : 0;
        return (
          <Sequence key={clip.id} from={startFrame} durationInFrames={audioDurationInFrames}>
            <AnimatedVolume clip={clip} durationInFrames={audioDurationInFrames} absoluteStartFrame={startFrame} totalCompositionFrames={totalCompositionFrames} globalFadeOutFrames={globalFadeOutFrames} render={(volume) => (
               <Audio
                 src={clip.url}
                 volume={volume}
                 startFrom={clip.startFrom ? Math.round(clip.startFrom * fps) : undefined}
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

      {/* Subtitles Overlay */}
      {subtitles.map(sub => {
         const fromFrame = Math.round(sub.inicioSec * fps);
         const duration = Math.round((sub.finSec - sub.inicioSec) * fps);
         if (duration <= 0) return null;

         return (
            <Sequence key={sub.id} from={fromFrame} durationInFrames={duration}>
              <AbsoluteFill style={{
                justifyContent: 'flex-end',
                alignItems: 'center',
                paddingBottom: '10%',
              }}>
                <div style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  color: 'white',
                  padding: '10px 20px',
                  borderRadius: '10px',
                  fontSize: '40px',
                  fontFamily: 'sans-serif',
                  textAlign: 'center',
                  maxWidth: '80%',
                  textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
                }}>
                  {sub.texto}
                </div>
              </AbsoluteFill>
            </Sequence>
         )
      })}
    </AbsoluteFill>
  );
};
