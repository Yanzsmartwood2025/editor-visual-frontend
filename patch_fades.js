const fs = require('fs');

let content = fs.readFileSync('src/components/MainComposition.tsx', 'utf-8');

// Need to import interpolate and useCurrentFrame
content = content.replace(
  "import { AbsoluteFill, Sequence, OffthreadVideo, Img, Audio, useVideoConfig } from 'remotion';",
  "import { AbsoluteFill, Sequence, OffthreadVideo, Img, Audio, useVideoConfig, useCurrentFrame, interpolate } from 'remotion';"
);

// We need to create a helper component to handle fades per clip
const fadeHelper = `
const ClipWithFades: React.FC<{ clip: TimelineItem, durationInFrames: number, children: React.ReactNode }> = ({ clip, durationInFrames, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeInFrames = Math.round((clip.fadeIn || 0) * fps);
  const fadeOutFrames = Math.round((clip.fadeOut || 0) * fps);

  const opacity = interpolate(
    frame,
    [0, fadeInFrames, durationInFrames - fadeOutFrames - 1, durationInFrames - 1],
    [fadeInFrames > 0 ? 0 : 1, 1, 1, fadeOutFrames > 0 ? 0 : 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

export const MainComposition: React.FC<MainCompositionProps>`;

content = content.replace("export const MainComposition: React.FC<MainCompositionProps>", fadeHelper);

// Now wrap the content of visual sequences with ClipWithFades
content = content.replace(
  `{clip.tipo === 'video' ? (
            <OffthreadVideo
              src={clip.url}
              volume={clip.volume !== undefined ? clip.volume : 1}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            <Img
              src={clip.url}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          )}`,
  `<ClipWithFades clip={clip} durationInFrames={clip.durationInFrames}>
            {clip.tipo === 'video' ? (
              <OffthreadVideo
                src={clip.url}
                volume={clip.volume !== undefined ? clip.volume : 1}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <Img
                src={clip.url}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            )}
          </ClipWithFades>`
);


fs.writeFileSync('src/components/MainComposition.tsx', content);
