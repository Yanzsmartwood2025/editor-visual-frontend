import { describe, expect, it } from 'vitest';
import {
  isNaylaDirectInstruction,
  parseNaylaDirectInstruction,
  stripNaylaDirectMarker,
} from './naylaDirectInstructions';

describe('naylaDirectInstructions', () => {
  it('detecta y parsea un bloque directo simple', () => {
    const result = parseNaylaDirectInstruction(`@direct
ratio: 9:16
render: yes
assets:
- F1 | 7.5s | push-in | dreamy-zoom | 0.5s
- F2 | 7.5s | pan | fade | 0.4s
audio:
- A1 | 60s | volume=0.8 | fadeIn=1 | fadeOut=2
subtitles:
- 0-7.5 | Primera línea | cinematic | center | 54
titles:
- 0-3 | APERTURA | minimal | center | 68 | fade-up
`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.plan.canvasRatio).toBe('9/16');
    expect(result.plan.action.action).toBe('BUILD_TIMELINE');
    expect(result.plan.action.render).toBe(true);
    expect(result.plan.action.assets).toHaveLength(3);
    expect(result.plan.action.assets[0]).toMatchObject({
      label: 'F1',
      source: 'label',
      durationInSeconds: 7.5,
      efecto: 'push-in',
      transitionType: 'dreamy-zoom',
      transitionDuration: 0.5,
    });
    expect(result.plan.action.assets[2]).toMatchObject({
      label: 'A1',
      type: 'audio',
      volume: 0.8,
      fadeIn: 1,
      fadeOut: 2,
    });
    expect(result.plan.action.subtitles?.[0]).toMatchObject({
      text: 'Primera línea',
      start: 0,
      end: 7.5,
      style: 'cinematic',
      position: 'center',
      fontSize: 54,
    });
  });

  it('acepta plantillas visuales y controles avanzados en DSL directo', () => {
    const result = parseNaylaDirectInstruction(`@direct
ratio: 9:16
render: yes
assets:
- F1 | 7s | template=fragment-reveal | professional=glow:0.2,vignette:0.3 | motionBlur=180/4 | gsapEnter=zoom-in | gsapExit=fade | procedural=particles | proceduralIntensity=0.2 | proceduralSpeed=0.6
- F2 | 7s | preset=carousel-card
`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.plan.action.assets[0]).toMatchObject({
      label: 'F1',
      visualTemplate: 'fragment-reveal',
      efecto: 'push-in',
      transitionType: 'push-cut',
      motionBlur: { shutterAngle: 180, samples: 4 },
      gsapMotion: { enter: 'zoom-in', exit: 'fade' },
      proceduralMotion: { preset: 'particles', intensity: 0.2, speed: 0.6 },
    });
    expect(result.plan.action.assets[0].professionalEffects).toHaveLength(2);
    expect(result.plan.action.assets[1]).toMatchObject({
      label: 'F2',
      visualTemplate: 'carousel-card',
      transitionType: 'slide',
    });
  });

  it('convierte \\n en saltos reales dentro de subtítulos directos', () => {
    const result = parseNaylaDirectInstruction(`@direct
assets:
- F1 | 5s | preset=poster-pop
subtitles:
- 0-5 | Línea uno\\nLínea dos | cinematic | center | 48
`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.action.subtitles?.[0]?.text).toBe('Línea uno\nLínea dos');
  });

  it('acepta subtítulos 3D y colores en DSL directo', () => {
    const result = parseNaylaDirectInstruction(`@direct
assets:
- F1 | 5s | preset=depth-stack
subtitles:
- 0-5 | Texto 3D | extrude-3d | center | 64 | #ffffff | #7dd3fc | rgba(0,0,0,0.6)
`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.action.subtitles?.[0]).toMatchObject({
      style: 'extrude-3d',
      position: 'center',
      fontSize: 64,
      color: '#ffffff',
      accentColor: '#7dd3fc',
      backgroundColor: 'rgba(0,0,0,0.6)',
    });
  });

  it('acepta recortes de video en la plantilla DSL', () => {
    const result = parseNaylaDirectInstruction(`@direct
assets:
- V1 | 8s | trimBefore=0.5s | trimAfter=1s | startFrom=2s
`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.action.assets[0]).toMatchObject({
      label: 'V1',
      trimBefore: 0.5,
      trimAfter: 1,
      startFrom: 2,
    });
  });

  it('rechaza efectos inventados en lugar de dejarlos pasar silenciosamente', () => {
    const result = parseNaylaDirectInstruction(`@direct
assets:
- F1 | 5s | effect=super-ultra-inventado
`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toContain('efecto no reconocido');
  });

  it('tolera el molde humano con tipo redundante y transición abreviada', () => {
    const result = parseNaylaDirectInstruction(`@direct
accion: BUILD_TIMELINE
ratio: 9:16
quality: 720p
assets:
- F1 | foto | 7.5s | visualTemplate=fragment-reveal | transition=fade:0.5
subtitles:
- 0-7.5 | Prueba | starlight | bottom | 46 | #ffffff | #c4b5fd | rgba(0,0,0,0.35)
audioMix:
  musicGain: 1
  voiceGain: 1
  sfxGain: 0.8
  masterGain: 1
audioMaster:
  normalize: true
  limiter: true
  targetLufs: -14
render: true
`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.exportQuality).toBe('720p');
    expect(result.plan.action.assets[0]).toMatchObject({
      label: 'F1',
      type: 'foto',
      durationInSeconds: 7.5,
      visualTemplate: 'fragment-reveal',
      transitionType: 'fade',
      transitionDuration: 0.5,
    });
    expect(result.plan.action.audioMix).toMatchObject({
      masterGain: 1,
      busGains: { music: 1, voice: 1, sfx: 0.8 },
    });
    expect(result.plan.action.audioMaster).toMatchObject({
      normalize: true,
      limiter: true,
      targetLufs: -14,
    });
  });

  it('acepta JSON BUILD_TIMELINE después de @direct', () => {
    const result = parseNaylaDirectInstruction(`@direct
{"action":"build-timeline","assets":[{"type":"foto","source":"label","label":"F1","durationInSeconds":5}],"render":true}`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.source).toBe('json');
    expect(result.plan.action.action).toBe('BUILD_TIMELINE');
  });

  it('rechaza texto que no declara modo directo', () => {
    expect(isNaylaDirectInstruction('haz un video')).toBe(false);
    const result = parseNaylaDirectInstruction('haz un video');
    expect(result.ok).toBe(false);
  });

  it('puede retirar el marcador para enviarlo como chat normal', () => {
    expect(stripNaylaDirectMarker('@direct\nHaz un video con F1')).toBe('Haz un video con F1');
  });
});
