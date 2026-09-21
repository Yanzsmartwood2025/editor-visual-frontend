import React from 'react';
import { Composition } from 'remotion';
import { MainComposition } from '../components/MainComposition';
import { getCanvasDimensionsFromRatio } from '../lib/mediaMetadata';
import { getCompositionDurationInFrames } from '../lib/timelineMetrics';

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
  canvasRatio: '9/16',
  canvasWidth: 1080,
  canvasHeight: 1920,
  exportQuality: '1080p',
  subtitles: [
    { id: 's1', texto: 'Existe un lugar al pie del monte Fuji...', inicioSec: 0, finSec: 5 },
    { id: 's2', texto: 'Donde el silencio parece tener vida propia.', inicioSec: 5, finSec: 10 }
  ],
  titles: [],
  threeScenes: [],
  logos: []
};

const isValidDimension = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 2;

const resolveCanvas = (props: Record<string, unknown>) => {
  if (isValidDimension(props.canvasWidth) && isValidDimension(props.canvasHeight)) {
    return {
      width: Math.round(props.canvasWidth),
      height: Math.round(props.canvasHeight),
    };
  }

  return getCanvasDimensionsFromRatio(
    typeof props.canvasRatio === 'string' ? props.canvasRatio : '9/16',
    typeof props.exportQuality === 'string' ? props.exportQuality : '1080p'
  );
};

export const RemotionRoot: React.FC = () => {
  const fps = 30;
  const durationInFrames = getCompositionDurationInFrames(
    defaultProps.timeline,
    fps,
    defaultProps.subtitles,
    defaultProps.logos,
    defaultProps.titles,
    defaultProps.threeScenes
  );

  return (
    <>
      <Composition
        id="MainComposition"
        component={MainComposition as React.FC<any>}
        durationInFrames={durationInFrames}
        fps={fps}
        width={defaultProps.canvasWidth}
        height={defaultProps.canvasHeight}
        defaultProps={defaultProps}
        calculateMetadata={({ props }) => {
          const typedProps = props as Record<string, unknown>;
          const { width, height } = resolveCanvas(typedProps);
          const timeline = Array.isArray(typedProps.timeline) ? typedProps.timeline : [];
          const subtitles = Array.isArray(typedProps.subtitles) ? typedProps.subtitles : [];
          const logos = Array.isArray(typedProps.logos) ? typedProps.logos : [];
          const titles = Array.isArray(typedProps.titles) ? typedProps.titles : [];
          const threeScenes = Array.isArray(typedProps.threeScenes) ? typedProps.threeScenes : [];

          return {
            durationInFrames: getCompositionDurationInFrames(
              timeline as any[],
              fps,
              subtitles as any[],
              logos as any[],
              titles as any[],
              threeScenes as any[]
            ),
            width,
            height,
          };
        }}
      />
    </>
  );
};
