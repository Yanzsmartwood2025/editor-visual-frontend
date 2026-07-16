import Head from 'next/head';
import { Player } from '@remotion/player';
import { MainComposition } from '../components/MainComposition';

// Definición de tipos y props por defecto (iguales a Root.tsx para test)
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
  ],
  logos: []
};

export default function RemotionPreview() {
  const fps = 30;
  const visualClips = defaultProps.timeline.filter(c => c.tipo === 'video' || c.tipo === 'foto');
  const totalDurationSeconds = visualClips.reduce((acc, curr, index) => {
      let duration = curr.durationInSeconds !== undefined ? curr.durationInSeconds : 5;

      if (index > 0 && (curr as any).transitionType && (curr as any).transitionType !== 'none' && (curr as any).transitionDuration) {
         duration -= (curr as any).transitionDuration;
      }
      return acc + duration;
  }, 0);

  const durationInFrames = Math.max(1, Math.round(totalDurationSeconds * fps));

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      <Head>
        <title>Remotion Dev Preview</title>
      </Head>
      <div className="w-full max-w-md bg-black rounded-lg overflow-hidden shadow-2xl flex flex-col">
        <div className="p-4 bg-gray-800 text-white font-semibold text-center border-b border-gray-700">
          Remotion Player Preview (Dev Only)
        </div>

        {/* Player Container */}
        <div className="relative w-full" style={{ aspectRatio: '9/16' }}>
            <Player
            component={MainComposition}
            inputProps={defaultProps}
            durationInFrames={durationInFrames}
            fps={fps}
            compositionWidth={1080}
            compositionHeight={1920}
            style={{
                width: '100%',
                height: '100%',
            }}
            controls
            />
        </div>

        <div className="p-4 bg-gray-800 text-gray-400 text-sm border-t border-gray-700">
          Esta vista es solo para previsualizar el diseño de Remotion usando componentes estáticos antes del renderizado en el servidor.
        </div>
      </div>
    </div>
  );
}
