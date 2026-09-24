import React from 'react';
import { Sequence, useCurrentFrame, useVideoConfig, interpolate, HtmlInCanvas } from 'remotion';
import { Audio } from '@remotion/media';
import { AnimatedEmoji } from '@remotion/animated-emoji';
import { Gif } from '@remotion/gif';
import * as sounds from '@remotion/sfx';
import { Underline, Highlight, Circle, Box, StrikeThrough, CrossedOff } from '@remotion/rough-notation';
import { fitText, measureText } from '@remotion/layout-utils';
import { createRoundedTextBox } from '@remotion/rounded-text-box';
import { evolvePath, parsePath } from '@remotion/paths';
import { extrudeAndTransformElement, rotateY, threeDIntoSvgPath } from '@remotion/svg-3d-engine';
import { interpolateStyles } from '@remotion/animation-utils';
import { starburst } from '@remotion/effects/starburst';
import type { NaylaDecoration } from '../lib/naylaDecorations';
import { useNaylaFont } from './NaylaFont';

const Decoration: React.FC<{ item: NaylaDecoration }> = ({ item }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const family = useNaylaFont('fontFamily' in item ? item.fontFamily : 'Arial', 'fontUrl' in item ? item.fontUrl : undefined);
  const progress = interpolate(frame, [0, Math.max(1, fps * 0.6)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (item.kind === 'sfx') return <Audio src={sounds[item.sound]} volume={item.volume} />;
  let child: React.ReactNode;
  switch (item.kind) {
    case 'emoji': child = <AnimatedEmoji emoji={item.emoji} playbackRate={item.playbackRate} style={{ width: '100%', height: '100%' }} />; break;
    case 'gif': child = <Gif src={item.url || ''} playbackRate={item.playbackRate} width={item.width} height={item.height} fit="contain" />; break;
    case 'annotation': {
      const Mark = { underline: Underline, highlight: Highlight, circle: Circle, box: Box, 'strike-through': StrikeThrough, 'crossed-off': CrossedOff }[item.mark];
      const fontSize = Math.min(item.fontSize, fitText({ text: item.text, withinWidth: Math.max(1, item.width - 24), fontFamily: family, validateFontIsLoaded: false }).fontSize);
      child = <div style={{ color: item.color, fontFamily: family, fontSize, textAlign: 'center' }}><Mark progress={progress} color={item.accentColor} seed={17}>{item.text}</Mark></div>; break;
    }
    case 'text-box': {
      const lines = item.text.split('\n');
      const fontSize = Math.min(item.fontSize, ...lines.map(text => fitText({ text: text || ' ', withinWidth: Math.max(1, item.width - 32), fontFamily: family, validateFontIsLoaded: false }).fontSize));
      const measurements = lines.map(text => measureText({ text: text || ' ', fontFamily: family, fontSize, validateFontIsLoaded: false }));
      const box = createRoundedTextBox({ textMeasurements: measurements, textAlign: 'center', horizontalPadding: 16, borderRadius: 12 });
      const b = box.boundingBox;
      child = <svg width={item.width} height={item.height} viewBox={`${b.x1} ${b.y1} ${b.width} ${b.height}`}><path d={box.d} fill={item.backgroundColor} />{lines.map((text, i) => <text key={i} x={(b.x1 + b.x2) / 2} y={measurements.slice(0, i).reduce((sum, m) => sum + m.height, 0) + measurements[i].height * 0.8} textAnchor="middle" fontFamily={family} fontSize={fontSize} fill={item.color}>{text}</text>)}</svg>; break;
    }
    case 'svg-path': child = <svg width="100%" height="100%" viewBox="0 0 300 300"><path d={item.path} fill="none" stroke={item.color} strokeWidth={item.strokeWidth} {...evolvePath(progress, item.path)} /></svg>; break;
    case 'svg-3d': {
      const faces = extrudeAndTransformElement({ points: parsePath(item.path), depth: item.depth, pressInDepth: 0, sideColor: item.color, crispEdges: false, transformations: rotateY(frame / fps * item.rotationSpeed * Math.PI / 180) });
      child = <svg width="100%" height="100%" viewBox="-200 -100 600 500">{[...faces].sort((a, b) => a.centerPoint[2] - b.centerPoint[2]).map((face, i) => <path key={i} d={threeDIntoSvgPath(face.points)} fill={face.color} stroke={item.color} />)}</svg>; break;
    }
    case 'starburst': child = <HtmlInCanvas width={item.width} height={item.height} effects={[starburst({ rays: item.rays, colors: item.colors })]}><div style={{ width: item.width, height: item.height, background: '#000' }} /></HtmlInCanvas>; break;
  }
  return <div style={{ position: 'absolute', left: `${item.x}%`, top: `${item.y}%`, width: item.width, height: item.height, transform: 'translate(-50%, -50%)', display: 'flex', alignItems: 'center', justifyContent: 'center', ...interpolateStyles(progress, [0, 1], [{ opacity: 0 }, { opacity: item.opacity }]) }}>{child}</div>;
};
export const NaylaDecorations: React.FC<{ items: NaylaDecoration[] }> = ({ items }) => {
  const { fps } = useVideoConfig();
  return <>{items.map((item, index) => <Sequence key={index} from={Math.round(item.start * fps)} durationInFrames={Math.max(1, Math.round((item.end - item.start) * fps))}><Decoration item={item} /></Sequence>)}</>;
};
