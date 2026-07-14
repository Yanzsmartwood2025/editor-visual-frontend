import React, { useMemo } from 'react';
import { AbsoluteFill, Sequence, Video, Img, Audio, useVideoConfig, useCurrentFrame, interpolate } from 'remotion';

// Interfaces based on main file
type TimelineItem = { id: string; mediaId: string; tipo: 'foto' | 'video' | 'audio'; nombre: string; etiqueta: string; url: string; durationInSeconds?: number; volume?: number; fadeIn?: number; fadeOut?: number; scale?: number; delay?: number; startFrom?: number; loop?: boolean; };
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

export const MainComposition: React.FC<MainCompositionProps> = ({ timeline, subtitles = [] }) => {
  const { fps } = useVideoConfig();

  // We filter out videos and photos to build the main visual sequence
  const visualClips = useMemo(() => timeline.filter(t => t.tipo === 'video' || t.tipo === 'foto'), [timeline]);
  const audioClips = useMemo(() => timeline.filter(t => t.tipo === 'audio'), [timeline]);

  // Calculate starting frames for visual clips to sequence them back-to-back
  let currentVisualFrame = 0;
  const visualSequences = visualClips.map(clip => {
    if (clip.tipo === 'video' && clip.durationInSeconds === undefined) {
      throw new Error(`Critical Error: Clip '${clip.nombre || clip.etiqueta}' (URL: ${clip.url}) was passed to Remotion Composition without a valid durationInSeconds.`);
    }

    if (clip.delay) {
      currentVisualFrame += Math.round(clip.delay * fps);
    }

    const durationInFrames = Math.round((clip.durationInSeconds !== undefined ? clip.durationInSeconds : (clip.tipo === 'foto' ? 5 : 5)) * fps);
    const sequence = { ...clip, startFrame: currentVisualFrame, durationInFrames };
    currentVisualFrame += durationInFrames;
    return sequence;
  });

  // Verify Audio Clips as well
  audioClips.forEach(clip => {
     if (clip.durationInSeconds === undefined) {
        throw new Error(`Critical Error: Audio Clip '${clip.nombre || clip.etiqueta}' (URL: ${clip.url}) was passed to Remotion Composition without a valid durationInSeconds.`);
     }
  });

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {visualSequences.map((clip) => (
        <Sequence
          key={clip.id}
          from={clip.startFrame}
          durationInFrames={clip.durationInFrames}
        >
          <ClipWithFades clip={clip} durationInFrames={clip.durationInFrames}>
            {clip.tipo === 'video' ? (
              <Video
                src={clip.url}
                volume={clip.volume !== undefined ? clip.volume : 1}
                startFrom={clip.startFrom ? Math.round(clip.startFrom * fps) : undefined}
                loop={clip.loop}
                style={{ width: '100%', height: '100%', objectFit: 'contain', transform: clip.scale !== undefined ? `scale(${clip.scale})` : undefined }}
              />
            ) : (
              <Img
                src={clip.url}
                style={{ width: '100%', height: '100%', objectFit: 'contain', transform: clip.scale !== undefined ? `scale(${clip.scale})` : undefined }}
              />
            )}
          </ClipWithFades>
        </Sequence>
      ))}

      {/* For simplicity, audio clips start at frame 0 and loop/play their duration. We can improve this later to position them. */}
      {audioClips.map((clip) => (
        <Sequence key={clip.id} from={clip.delay ? Math.round(clip.delay * fps) : 0}>
           <Audio
             src={clip.url}
             volume={clip.volume !== undefined ? clip.volume : 1}
             startFrom={clip.startFrom ? Math.round(clip.startFrom * fps) : undefined}
             loop={clip.loop}
           />
        </Sequence>
      ))}

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
