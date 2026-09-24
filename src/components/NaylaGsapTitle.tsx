import { useNaylaFont } from './NaylaFont';
import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { useGsapTimeline } from '@remotion/gsap';

export type NaylaMotionTitle = {
  id: string;
  text: string;
  start: number;
  end: number;
  style?: 'clean' | 'cinematic' | 'neon' | 'minimal';
  animation?: 'fade-up' | 'slide-left' | 'slide-right' | 'pop' | 'zoom-in' | 'word-rise' | 'lower-third';
  position?: 'top' | 'center' | 'bottom';
  fontSize?: number;
  fontFamily?: string;
  fontUrl?: string;
  color?: string;
  accentColor?: string;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const NaylaGsapTitle: React.FC<{
  title: NaylaMotionTitle;
  durationInFrames: number;
}> = ({ title, durationInFrames }) => {
  const { fps } = useVideoConfig();
  const fontFamily = useNaylaFont(title.fontFamily, title.fontUrl);
  const animation = title.animation || 'fade-up';
  const durationSeconds = Math.max(0.1, durationInFrames / fps);
  const intro = Math.min(0.65, Math.max(0.22, durationSeconds * 0.22));
  const outro = Math.min(0.35, Math.max(0.16, durationSeconds * 0.12));
  const outroAt = Math.max(intro, durationSeconds - outro);

  const scope = useGsapTimeline<HTMLDivElement>(
    ({ timeline, selector }) => {
      const root = selector('[data-nayla-title-root]');
      const words = selector('[data-nayla-title-word]');

      timeline.set(root, { opacity: 1 });

      if (animation === 'slide-left' || animation === 'lower-third') {
        timeline.fromTo(
          root,
          { opacity: 0, x: -110 },
          { opacity: 1, x: 0, duration: intro, ease: 'power3.out' },
          0
        );
      } else if (animation === 'slide-right') {
        timeline.fromTo(
          root,
          { opacity: 0, x: 110 },
          { opacity: 1, x: 0, duration: intro, ease: 'power3.out' },
          0
        );
      } else if (animation === 'pop') {
        timeline.fromTo(
          root,
          { opacity: 0, scale: 0.58 },
          { opacity: 1, scale: 1, duration: intro, ease: 'back.out(1.7)' },
          0
        );
      } else if (animation === 'zoom-in') {
        timeline.fromTo(
          root,
          { opacity: 0, scale: 1.28, filter: 'blur(10px)' },
          { opacity: 1, scale: 1, filter: 'blur(0px)', duration: intro, ease: 'power3.out' },
          0
        );
      } else if (animation === 'word-rise') {
        timeline.set(root, { opacity: 1 });
        timeline.fromTo(
          words,
          { opacity: 0, y: 48, rotateX: -22 },
          {
            opacity: 1,
            y: 0,
            rotateX: 0,
            duration: Math.min(0.5, intro),
            ease: 'power3.out',
            stagger: 0.055,
          },
          0
        );
      } else {
        timeline.fromTo(
          root,
          { opacity: 0, y: 44 },
          { opacity: 1, y: 0, duration: intro, ease: 'power3.out' },
          0
        );
      }

      if (durationSeconds > intro + outro + 0.08) {
        timeline.to(
          root,
          { opacity: 0, y: animation === 'lower-third' ? 0 : -12, duration: outro, ease: 'power2.in' },
          outroAt
        );
      }
    },
    {
      dependencies: [animation, title.text, durationInFrames, fps],
    }
  );

  const position = title.position || (animation === 'lower-third' ? 'bottom' : 'center');
  const style = title.style || 'clean';
  const fontSize = clamp(Number(title.fontSize) || 72, 24, 180);
  const color = title.color || '#ffffff';
  const accentColor = title.accentColor || '#ffffff';

  const justifyContent =
    position === 'top' ? 'flex-start' :
    position === 'bottom' ? 'flex-end' :
    'center';

  const isLowerThird = animation === 'lower-third';
  const shell: React.CSSProperties =
    style === 'cinematic'
      ? {
          background: 'rgba(0,0,0,0.52)',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 12,
          padding: '12px 22px',
          textShadow: '0 3px 14px rgba(0,0,0,0.9)',
        }
      : style === 'neon'
        ? {
            textShadow: `0 0 10px ${accentColor}, 0 0 28px ${accentColor}, 0 4px 16px rgba(0,0,0,0.9)`,
          }
        : style === 'minimal'
          ? {
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: 650,
            }
          : {
              textShadow: '0 3px 14px rgba(0,0,0,0.9)',
            };

  const words = title.text.trim().split(/\s+/).filter(Boolean);

  return (
    <AbsoluteFill
      style={{
        justifyContent,
        alignItems: isLowerThird ? 'flex-start' : 'center',
        padding: position === 'top'
          ? '9% 7%'
          : position === 'bottom'
            ? '9% 7%'
            : '7%',
        pointerEvents: 'none',
        perspective: 1200,
      }}
    >
      <div
        ref={scope}
        style={{
          maxWidth: isLowerThird ? '76%' : '88%',
          transformOrigin: isLowerThird ? 'left center' : 'center center',
        }}
      >
        <div
          data-nayla-title-root
          style={{
            ...shell,
            display: 'inline-flex',
            flexWrap: 'wrap',
            justifyContent: isLowerThird ? 'flex-start' : 'center',
            gap: '0 0.24em',
            color,
            fontSize,
            fontFamily,
            fontWeight: style === 'minimal' ? 650 : 850,
            lineHeight: 1.05,
            textAlign: isLowerThird ? 'left' : 'center',
            willChange: 'transform, opacity, filter',
          }}
        >
          {words.map((word, index) => (
            <span key={index} data-nayla-title-word style={{ display: 'inline-block' }}>
              {word}
            </span>
          ))}
          {isLowerThird && (
            <span
              aria-hidden
              style={{
                display: 'block',
                width: '100%',
                height: 4,
                marginTop: 10,
                borderRadius: 99,
                background: accentColor,
                opacity: 0.9,
              }}
            />
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
