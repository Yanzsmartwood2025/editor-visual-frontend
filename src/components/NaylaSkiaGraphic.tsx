import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { SkiaCanvas } from '@remotion/skia';
import { BlurMask, Circle, Group } from '@shopify/react-native-skia';

export type NaylaSkiaGraphic = {
  id: string;
  preset: 'glow-orb' | 'rings' | 'energy-pulse' | 'spotlights';
  start: number;
  end: number;
  x?: number;
  y?: number;
  scale?: number;
  opacity?: number;
  color?: string;
  accentColor?: string;
  intensity?: number;
  speed?: number;
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
};

export const NaylaSkiaGraphicRenderer: React.FC<{ item: NaylaSkiaGraphic }> = ({ item }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const x = clamp(item.x, -50, 50, 0);
  const y = clamp(item.y, -50, 50, 0);
  const scale = clamp(item.scale, 0.05, 4, 1);
  const opacity = clamp(item.opacity, 0, 1, 1);
  const intensity = clamp(item.intensity, 0, 1, 0.6);
  const speed = clamp(item.speed, 0.1, 4, 1);
  const color = item.color || '#ffffff';
  const accentColor = item.accentColor || '#7dd3fc';

  const localSeconds = frame / Math.max(1, fps);
  const phase = localSeconds * speed * Math.PI * 2;
  const cx = width * (0.5 + x / 100);
  const cy = height * (0.5 + y / 100);
  const shortest = Math.min(width, height);
  const baseRadius = shortest * (0.11 + intensity * 0.11) * scale;
  const pulse = interpolate(Math.sin(phase), [-1, 1], [0.88, 1.12]);

  const renderPreset = () => {
    if (item.preset === 'rings') {
      return (
        <Group opacity={opacity} style="stroke">
          {[0, 1, 2, 3].map((index) => (
            <Circle
              key={index}
              cx={cx}
              cy={cy}
              r={baseRadius * (0.7 + index * 0.42) * (1 + Math.sin(phase + index * 0.8) * 0.04)}
              color={index % 2 === 0 ? color : accentColor}
              strokeWidth={Math.max(2, shortest * (0.0025 + intensity * 0.004))}
            >
              <BlurMask blur={Math.max(1, 2 + intensity * 8)} style="normal" />
            </Circle>
          ))}
        </Group>
      );
    }

    if (item.preset === 'energy-pulse') {
      return (
        <Group opacity={opacity}>
          <Circle cx={cx} cy={cy} r={baseRadius * pulse} color={accentColor}>
            <BlurMask blur={Math.max(2, 14 + intensity * 28)} style="normal" />
          </Circle>
          <Circle cx={cx} cy={cy} r={baseRadius * 0.58 * pulse} color={color} />
          <Group style="stroke">
            <Circle
              cx={cx}
              cy={cy}
              r={baseRadius * (1.35 + ((Math.sin(phase * 0.7) + 1) / 2) * 0.35)}
              color={color}
              strokeWidth={Math.max(2, shortest * 0.004)}
            >
              <BlurMask blur={Math.max(1, 4 + intensity * 10)} style="normal" />
            </Circle>
          </Group>
        </Group>
      );
    }

    if (item.preset === 'spotlights') {
      const orbit = baseRadius * (1.2 + intensity * 1.8);
      return (
        <Group opacity={opacity}>
          {[0, 1, 2, 3, 4].map((index) => {
            const angle = phase * (0.24 + index * 0.025) + (index / 5) * Math.PI * 2;
            const px = cx + Math.cos(angle) * orbit;
            const py = cy + Math.sin(angle * 1.18) * orbit * 0.72;
            return (
              <Circle
                key={index}
                cx={px}
                cy={py}
                r={baseRadius * (0.34 + (index % 3) * 0.08)}
                color={index % 2 === 0 ? color : accentColor}
              >
                <BlurMask blur={Math.max(4, 18 + intensity * 34)} style="normal" />
              </Circle>
            );
          })}
        </Group>
      );
    }

    return (
      <Group opacity={opacity}>
        <Circle cx={cx} cy={cy} r={baseRadius * 1.18 * pulse} color={accentColor}>
          <BlurMask blur={Math.max(6, 24 + intensity * 40)} style="normal" />
        </Circle>
        <Circle cx={cx} cy={cy} r={baseRadius * 0.72 * pulse} color={color}>
          <BlurMask blur={Math.max(1, 3 + intensity * 8)} style="normal" />
        </Circle>
      </Group>
    );
  };

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <SkiaCanvas width={width} height={height}>
        {renderPreset()}
      </SkiaCanvas>
    </AbsoluteFill>
  );
};
