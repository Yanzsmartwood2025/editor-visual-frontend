import React from 'react';
import { Composition, getInputProps } from 'remotion';
import { MainComposition } from './components/MainComposition';

// Props por defecto para la previsualización / dev
const defaultProps = {
  timeline: [
    {
      id: '1',
      mediaId: 'm1',
      tipo: 'video' as const,
      nombre: 'Clip 1',
      etiqueta: 'V1',
      url: 'https://videos.pexels.com/video-files/19752304/19752304-uhd_1440_2732_24fps.mp4',
      durationInSeconds: 5,
    },
    {
      id: '2',
      mediaId: 'm2',
      tipo: 'video' as const,
      nombre: 'Clip 2',
      etiqueta: 'V2',
      url: 'https://videos.pexels.com/video-files/5679006/5679006-uhd_1440_2732_25fps.mp4',
      durationInSeconds: 5,
    }
  ],
  canvasRatio: '9/16' as const,
  subtitles: [
    { id: 's1', texto: 'Existe un lugar al pie del monte Fuji...', inicioSec: 0, finSec: 5 },
    { id: 's2', texto: 'Donde el silencio parece tener vida propia.', inicioSec: 5, finSec: 10 }
  ]
};

export const RemotionRoot: React.FC = () => {
  // Try to use input props first, then fallback to default (for dev preview)
  const inputProps = getInputProps();
  const propsToUse = Object.keys(inputProps).length > 0 ? (inputProps as any) : defaultProps;

  // Calculate total duration in frames based on visual clips duration
  const fps = 30;

  let totalDurationSeconds = 0;
  if (propsToUse.timeline && Array.isArray(propsToUse.timeline)) {
    const visualClips = propsToUse.timeline.filter((c: any) => c.tipo === 'video' || c.tipo === 'foto');
    totalDurationSeconds = visualClips.reduce((acc: number, curr: any, index: number) => {
      let duration = curr.durationInSeconds !== undefined ? curr.durationInSeconds : 5;


      // If there's a transition from the *previous* clip to this one, they overlap.
      // We subtract the transitionDuration because that time is shared between both clips.
      if (index > 0 && curr.transitionType && curr.transitionType !== 'none' && curr.transitionDuration) {
         duration -= curr.transitionDuration;
      }

      return acc + duration;
    }, 0);
  }

  const durationInFrames = Math.max(1, Math.round(totalDurationSeconds * fps));

  return (
    <>
      <Composition
        id="MainVideo"
        component={MainComposition as React.FC<any>}
        durationInFrames={durationInFrames}
        fps={fps}
        width={1080}
        height={1920}
        defaultProps={propsToUse}
      />
    </>
  );
};
