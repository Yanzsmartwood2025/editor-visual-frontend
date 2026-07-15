import React, { useMemo } from 'react';
import { AbsoluteFill, Sequence, Video, Img, Audio, useVideoConfig, useCurrentFrame, interpolate } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { wipe } from '@remotion/transitions/wipe';
import { slide } from '@remotion/transitions/slide';
import { zoomInOut } from '@remotion/transitions/zoom-in-out';

// Interfaces based on main file
type TimelineItem = { id: string; mediaId: string; tipo: 'foto' | 'video' | 'audio'; nombre: string; etiqueta: string; url: string; durationInSeconds?: number; originalDurationInSeconds?: number; volume?: number; fadeIn?: number; fadeOut?: number; scale?: number; delay?: number; startFrom?: number; loop?: boolean; playbackRate?: number; transitionDuration?: number; transitionType?: 'fade' | 'none' | 'wipe' | 'slide' | 'zoom'; efecto?: string; brightness?: number; contrast?: number; saturation?: number; };
type SubtitleItem = { id: string; texto: string; inicioSec: number; finSec: number; };

interface MainCompositionProps {
  timeline: TimelineItem[];
  canvasRatio: '9/16' | '16/9' | '1/1' | '4/5';
  subtitles?: SubtitleItem[];
}


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

const AnimatedVolume: React.FC<{ clip: TimelineItem, durationInFrames: number, render: (volume: number) => React.ReactNode }> = ({ clip, durationInFrames, render }) => {
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

  const targetVolume = clip.volume !== undefined ? clip.volume : 1;

  const currentVolume = interpolate(
    frame,
    inputRange,
    [(clip.fadeIn || 0) > 0 ? 0 : targetVolume, targetVolume, targetVolume, (clip.fadeOut || 0) > 0 ? 0 : targetVolume],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return <>{render(currentVolume)}</>;
};

export const MainComposition: React.FC<MainCompositionProps> = ({ timeline, subtitles = [] }) => {
  const { fps } = useVideoConfig();

  // We filter out videos and photos to build the main visual sequence
  const visualClips = useMemo(() => timeline.filter(t => t.tipo === 'video' || t.tipo === 'foto'), [timeline]);
  const audioClips = useMemo(() => timeline.filter(t => t.tipo === 'audio'), [timeline]);

  const visualSequences = useMemo(() => {
    return visualClips.map(clip => {
      if (clip.tipo === 'video' && clip.durationInSeconds === undefined) {
        throw new Error(`Critical Error: Clip '${clip.nombre || clip.etiqueta}' (URL: ${clip.url}) was passed to Remotion Composition without a valid durationInSeconds.`);
      }

      let effectivePlaybackRate = clip.playbackRate || 1;
      if (clip.durationInSeconds !== undefined && clip.originalDurationInSeconds !== undefined && clip.durationInSeconds !== clip.originalDurationInSeconds) {
        // Automatically stretch/compress by overriding playbackRate ONLY if duration was changed
        effectivePlaybackRate = clip.originalDurationInSeconds / clip.durationInSeconds;
      }

      const targetDurationSec = clip.durationInSeconds !== undefined ? clip.durationInSeconds : (clip.tipo === 'foto' ? 5 : 5);
      // If we calculate playbackRate, the media plays at effectivePlaybackRate.
      // The duration in frames is just the target duration * fps.
      const durationInFrames = Math.round(targetDurationSec * fps);

      return { ...clip, durationInFrames, playbackRate: effectivePlaybackRate };
    });
  }, [visualClips, fps]);

  // Verify Audio Clips as well
  audioClips.forEach(clip => {
     if (clip.durationInSeconds === undefined) {
        throw new Error(`Critical Error: Audio Clip '${clip.nombre || clip.etiqueta}' (URL: ${clip.url}) was passed to Remotion Composition without a valid durationInSeconds.`);
     }
  });

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
                  <AnimatedVolume clip={clip} durationInFrames={clip.durationInFrames} render={(volume) => (
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
                  <Img
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
        let effectivePlaybackRate = clip.playbackRate || 1;
        if (clip.durationInSeconds !== undefined && clip.originalDurationInSeconds !== undefined && clip.durationInSeconds !== clip.originalDurationInSeconds) {
          effectivePlaybackRate = clip.originalDurationInSeconds / clip.durationInSeconds;
        }

        const targetDurationSec = clip.durationInSeconds || 5;
        const audioDurationInFrames = Math.round(targetDurationSec * fps);

        return (
          <Sequence key={clip.id} from={clip.delay ? Math.round(clip.delay * fps) : 0} durationInFrames={audioDurationInFrames}>
            <AnimatedVolume clip={clip} durationInFrames={audioDurationInFrames} render={(volume) => (
               <Audio
                 src={clip.url}
                 volume={volume}
                 startFrom={clip.startFrom ? Math.round(clip.startFrom * fps) : undefined}
                 loop={clip.loop}
                 playbackRate={effectivePlaybackRate}
               />
            )} />
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
