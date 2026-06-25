import React, { useMemo } from 'react';
import { AbsoluteFill, Sequence, OffthreadVideo, Img, Audio, useVideoConfig } from 'remotion';

// Interfaces based on main file
type TimelineItem = { id: string; mediaId: string; tipo: 'foto' | 'video' | 'audio'; nombre: string; etiqueta: string; url: string; durationInSeconds?: number };

interface MainCompositionProps {
  timeline: TimelineItem[];
  canvasRatio: '9/16' | '16/9' | '1/1' | '4/5';
}

export const MainComposition: React.FC<MainCompositionProps> = ({ timeline, canvasRatio }) => {
  const { fps } = useVideoConfig();

  // We filter out videos and photos to build the main visual sequence
  const visualClips = useMemo(() => timeline.filter(t => t.tipo === 'video' || t.tipo === 'foto'), [timeline]);
  const audioClips = useMemo(() => timeline.filter(t => t.tipo === 'audio'), [timeline]);

  // Calculate starting frames for visual clips to sequence them back-to-back
  let currentVisualFrame = 0;
  const visualSequences = visualClips.map(clip => {
    // Default fallback to 5 seconds if not loaded/known yet. In real-world Remotion, you fetch metadata first.
    const durationInFrames = Math.round((clip.durationInSeconds || 5) * fps);
    const sequence = { ...clip, startFrame: currentVisualFrame, durationInFrames };
    currentVisualFrame += durationInFrames;
    return sequence;
  });

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {visualSequences.map((clip) => (
        <Sequence
          key={clip.id}
          from={clip.startFrame}
          durationInFrames={clip.durationInFrames}
        >
          {clip.tipo === 'video' ? (
            <OffthreadVideo
              src={clip.url}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            <Img
              src={clip.url}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          )}
        </Sequence>
      ))}

      {/* For simplicity, audio clips start at frame 0 and loop/play their duration. We can improve this later to position them. */}
      {audioClips.map((clip) => (
        <Sequence key={clip.id} from={0}>
           <Audio src={clip.url} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
