import { getNaylaActionValidationIssues, parseNaylaAction, type NaylaAction } from './naylaActions';
import { isNaylaVisualTemplateName } from './naylaVisualTemplates';

export type NaylaDirectPlan = {
  action: Extract<NaylaAction, { action: 'BUILD_TIMELINE' }>;
  canvasRatio?: string;
  exportQuality?: string;
  source: 'dsl' | 'json';
};

export type NaylaDirectParseResult =
  | { ok: true; plan: NaylaDirectPlan }
  | { ok: false; errors: string[] };

const EFFECTS = new Set([
  'none', 'grayscale', 'sepia', 'vintage', 'cinematic', 'blur', 'glow', 'high-contrast',
  'soft', 'ken-burns', 'pan', 'rotate', 'push-in', 'pull-out', 'float', 'tilt-3d', 'parallax-3d',
]);

const TRANSITIONS = new Set([
  'fade', 'wipe', 'slide', 'zoom', 'film-burn', 'blur-slide', 'cross-zoom',
  'dreamy-zoom', 'linear-blur', 'push-cut',
]);

const OVERLAYS = new Set(['none', 'vignette', 'film-grain', 'light-leak', 'letterbox']);
const SUBTITLE_STYLES = new Set(['clean', 'cinematic', 'tiktok', 'karaoke']);
const TITLE_STYLES = new Set(['clean', 'cinematic', 'neon', 'minimal']);
const POSITIONS = new Set(['top', 'center', 'bottom']);
const TITLE_ANIMATIONS = new Set(['fade-up', 'slide-left', 'slide-right', 'pop', 'zoom-in', 'word-rise', 'lower-third']);
const PROFESSIONAL_EFFECTS = new Set(['chromatic-aberration', 'color-correction', 'glow', 'pixelate', 'zoom-blur', 'vignette', 'light-leak']);
const GSAP_MOTIONS = new Set(['fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'zoom-in', 'zoom-out', 'bounce', 'elastic', 'spin', 'swing']);
const PROCEDURAL_PRESETS = new Set(['particles', 'orbit', 'pulse-grid', 'starfield']);

const normalize = (value: string) => value.trim().toLowerCase();

const parseBool = (value: string, fallback: boolean) => {
  const normalized = normalize(value);
  if (['yes', 'si', 'sí', 'true', '1', 'on'].includes(normalized)) return true;
  if (['no', 'false', '0', 'off'].includes(normalized)) return false;
  return fallback;
};

const parseSeconds = (value: string) => {
  const number = Number(value.trim().replace(/s(?:ec(?:onds?|undos?)?)?$/i, '').replace(',', '.'));
  return Number.isFinite(number) && number >= 0 ? number : null;
};

const parseNumber = (value: string) => {
  const number = Number(value.trim().replace(',', '.'));
  return Number.isFinite(number) ? number : null;
};

const parseRange = (value: string) => {
  const match = value.trim().match(/^\s*(\d+(?:[.,]\d+)?)\s*(?:s)?\s*[-–—]\s*(\d+(?:[.,]\d+)?)\s*(?:s)?\s*$/i);
  if (!match) return null;
  const start = Number(match[1].replace(',', '.'));
  const end = Number(match[2].replace(',', '.'));
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
};

const stripListPrefix = (line: string) => line.replace(/^\s*[-*•]\s*/, '').trim();

const parseKeyValue = (token: string) => {
  const index = token.indexOf('=');
  if (index < 0) return null;
  return {
    key: normalize(token.slice(0, index)).replace(/[\s_-]+/g, ''),
    value: token.slice(index + 1).trim(),
  };
};

const parseProfessionalEffects = (value: string, label: string, errors: string[]) => {
  const effects: Array<Record<string, unknown>> = [];
  for (const rawEffect of value.split(',').map((item) => item.trim()).filter(Boolean)) {
    const [rawType, rawIntensity] = rawEffect.split(':').map((item) => item.trim());
    const type = normalize(rawType);
    if (!PROFESSIONAL_EFFECTS.has(type)) {
      errors.push(`${label}: efecto profesional no reconocido "${rawType}".`);
      continue;
    }
    const intensity = rawIntensity ? parseNumber(rawIntensity) : null;
    if (rawIntensity && (intensity === null || intensity < 0 || intensity > 1)) {
      errors.push(`${label}: intensidad inválida para "${rawType}". Usa 0 a 1.`);
      continue;
    }
    effects.push({ type, ...(intensity !== null ? { intensity } : {}) });
  }
  return effects;
};

const mediaTypeFromLabel = (label: string) => {
  const prefix = label.charAt(0).toUpperCase();
  if (prefix === 'F') return 'foto' as const;
  if (prefix === 'V') return 'video' as const;
  if (prefix === 'A') return 'audio' as const;
  return null;
};

const parseAssetLine = (line: string, errors: string[]) => {
  const parts = stripListPrefix(line).split('|').map((item) => item.trim()).filter(Boolean);
  if (!parts.length) return null;

  const label = parts[0].replace(/\s+/g, '').toUpperCase();
  if (!/^[FVA]\d+$/.test(label)) {
    errors.push(`Medio inválido: "${parts[0]}". Usa etiquetas como F1, V1 o A1.`);
    return null;
  }

  const type = mediaTypeFromLabel(label);
  if (!type) return null;

  const asset: Record<string, unknown> = {
    type,
    source: 'label',
    label,
  };

  let transitionSeen = false;

  for (let index = 1; index < parts.length; index += 1) {
    const token = parts[index];
    const pair = parseKeyValue(token);

    if (pair) {
      const numeric = parseNumber(pair.value);
      const seconds = parseSeconds(pair.value);
      switch (pair.key) {
        case 'duration':
        case 'duracion':
        case 'durationinseconds':
          if (seconds === null || seconds <= 0) errors.push(`${label}: duración inválida.`);
          else asset.durationInSeconds = seconds;
          break;
        case 'effect':
        case 'efecto':
          asset.efecto = normalize(pair.value);
          break;
        case 'transition':
        case 'transicion':
        case 'transitiontype':
          asset.transitionType = normalize(pair.value);
          transitionSeen = true;
          break;
        case 'transitionduration':
        case 'duraciontransicion':
          if (seconds === null) errors.push(`${label}: duración de transición inválida.`);
          else asset.transitionDuration = seconds;
          break;
        case 'volume':
        case 'volumen':
          if (numeric === null) errors.push(`${label}: volumen inválido.`);
          else asset.volume = numeric;
          break;
        case 'fadein':
          if (seconds === null) errors.push(`${label}: fadeIn inválido.`);
          else asset.fadeIn = seconds;
          break;
        case 'fadeout':
          if (seconds === null) errors.push(`${label}: fadeOut inválido.`);
          else asset.fadeOut = seconds;
          break;
        case 'delay':
        case 'retraso':
          if (seconds === null) errors.push(`${label}: retraso inválido.`);
          else asset.delay = seconds;
          break;
        case 'scale':
        case 'escala':
          if (numeric === null) errors.push(`${label}: escala inválida.`);
          else asset.scale = numeric;
          break;
        case 'playbackrate':
        case 'velocidad':
          if (numeric === null) errors.push(`${label}: velocidad inválida.`);
          else asset.playbackRate = numeric;
          break;
        case 'loop':
          asset.loop = parseBool(pair.value, true);
          break;
        case 'brightness':
        case 'brillo':
          if (numeric === null) errors.push(`${label}: brillo inválido.`);
          else asset.brightness = numeric;
          break;
        case 'contrast':
        case 'contraste':
          if (numeric === null) errors.push(`${label}: contraste inválido.`);
          else asset.contrast = numeric;
          break;
        case 'saturation':
        case 'saturacion':
          if (numeric === null) errors.push(`${label}: saturación inválida.`);
          else asset.saturation = numeric;
          break;
        case 'overlay':
        case 'capa':
          asset.overlay = normalize(pair.value);
          break;
        case 'overlayintensity':
        case 'intensidadcapa':
          if (numeric === null || numeric < 0 || numeric > 1) errors.push(`${label}: intensidad de capa inválida.`);
          else asset.overlayIntensity = numeric;
          break;
        case 'template':
        case 'preset':
        case 'visualtemplate': {
          const template = normalize(pair.value);
          if (!isNaylaVisualTemplateName(template)) errors.push(`${label}: plantilla visual no reconocida "${pair.value}".`);
          else asset.visualTemplate = template;
          break;
        }
        case 'professional':
        case 'professionaleffects':
        case 'efectosprofesionales': {
          const professionalEffects = parseProfessionalEffects(pair.value, label, errors);
          if (professionalEffects.length) asset.professionalEffects = professionalEffects;
          break;
        }
        case 'motionblur':
        case 'desenfoquemovimiento': {
          const parts = pair.value.split(/[/:,]/).map((item) => item.trim()).filter(Boolean);
          const shutterAngle = parseNumber(parts[0] || '');
          const samples = parseNumber(parts[1] || '');
          if (shutterAngle === null || shutterAngle < 0 || shutterAngle > 360 || samples === null || samples < 2 || samples > 8 || !Number.isInteger(samples)) {
            errors.push(`${label}: motionBlur inválido. Usa shutter/samples, por ejemplo 180/4.`);
          } else {
            asset.motionBlur = { shutterAngle, samples };
          }
          break;
        }
        case 'gsapenter':
        case 'entrada': {
          const motion = normalize(pair.value);
          if (!GSAP_MOTIONS.has(motion)) errors.push(`${label}: entrada GSAP no reconocida "${pair.value}".`);
          else asset.gsapMotion = { ...(asset.gsapMotion as object || {}), enter: motion };
          break;
        }
        case 'gsapexit':
        case 'salida': {
          const motion = normalize(pair.value);
          if (!GSAP_MOTIONS.has(motion)) errors.push(`${label}: salida GSAP no reconocida "${pair.value}".`);
          else asset.gsapMotion = { ...(asset.gsapMotion as object || {}), exit: motion };
          break;
        }
        case 'gsapenterduration':
        case 'duracionentrada':
          if (seconds === null || seconds < 0.1 || seconds > 10) errors.push(`${label}: duración de entrada GSAP inválida.`);
          else asset.gsapMotion = { ...(asset.gsapMotion as object || {}), enterDuration: seconds };
          break;
        case 'gsapexitduration':
        case 'duracionsalida':
          if (seconds === null || seconds < 0.1 || seconds > 10) errors.push(`${label}: duración de salida GSAP inválida.`);
          else asset.gsapMotion = { ...(asset.gsapMotion as object || {}), exitDuration: seconds };
          break;
        case 'gsapintensity':
        case 'intensidadgsap':
          if (numeric === null || numeric < 0.25 || numeric > 2) errors.push(`${label}: intensidad GSAP inválida.`);
          else asset.gsapMotion = { ...(asset.gsapMotion as object || {}), intensity: numeric };
          break;
        case 'procedural': {
          const preset = normalize(pair.value);
          if (!PROCEDURAL_PRESETS.has(preset)) errors.push(`${label}: movimiento procedural no reconocido "${pair.value}".`);
          else asset.proceduralMotion = { ...(asset.proceduralMotion as object || {}), preset };
          break;
        }
        case 'proceduralintensity':
        case 'intensidadprocedural':
          if (numeric === null || numeric < 0 || numeric > 1) errors.push(`${label}: intensidad procedural inválida.`);
          else asset.proceduralMotion = { ...(asset.proceduralMotion as object || {}), intensity: numeric };
          break;
        case 'proceduralspeed':
        case 'velocidadprocedural':
          if (numeric === null || numeric < 0.1 || numeric > 4) errors.push(`${label}: velocidad procedural inválida.`);
          else asset.proceduralMotion = { ...(asset.proceduralMotion as object || {}), speed: numeric };
          break;
        case 'proceduralseed':
        case 'semilla':
          if (numeric === null || !Number.isInteger(numeric)) errors.push(`${label}: semilla procedural inválida.`);
          else asset.proceduralMotion = { ...(asset.proceduralMotion as object || {}), seed: numeric };
          break;
        case 'proceduralcolor':
          asset.proceduralMotion = { ...(asset.proceduralMotion as object || {}), color: pair.value.trim() };
          break;
        case 'proceduralaccentcolor':
          asset.proceduralMotion = { ...(asset.proceduralMotion as object || {}), accentColor: pair.value.trim() };
          break;
        default:
          errors.push(`${label}: control directo no reconocido "${pair.key}".`);
      }
      continue;
    }

    const normalized = normalize(token);
    const seconds = parseSeconds(token);

    if (index === 1 && seconds !== null && seconds > 0) {
      asset.durationInSeconds = seconds;
      continue;
    }
    if (EFFECTS.has(normalized)) {
      asset.efecto = normalized;
      continue;
    }
    if (TRANSITIONS.has(normalized)) {
      asset.transitionType = normalized;
      transitionSeen = true;
      continue;
    }
    if (OVERLAYS.has(normalized)) {
      asset.overlay = normalized;
      continue;
    }
    if (normalized === 'loop') {
      asset.loop = true;
      continue;
    }
    if (transitionSeen && seconds !== null) {
      asset.transitionDuration = seconds;
      continue;
    }

    errors.push(`${label}: no reconozco "${token}".`);
  }

  return asset;
};

const parseSubtitleLine = (line: string, errors: string[]) => {
  const parts = stripListPrefix(line).split('|').map((item) => item.trim());
  const range = parseRange(parts[0] || '');
  const text = (parts[1] || '').replace(/\\n/g, '\n');
  if (!range || !text) {
    errors.push(`Subtítulo inválido: "${stripListPrefix(line)}". Usa "0-5 | Texto".`);
    return null;
  }

  const style = normalize(parts[2] || 'clean');
  const position = normalize(parts[3] || 'bottom');
  const fontSize = parts[4] ? parseNumber(parts[4]) : null;

  return {
    text,
    start: range.start,
    end: range.end,
    style: SUBTITLE_STYLES.has(style) ? style : 'clean',
    position: POSITIONS.has(position) ? position : 'bottom',
    ...(fontSize !== null ? { fontSize } : {}),
  };
};

const parseTitleLine = (line: string, errors: string[]) => {
  const parts = stripListPrefix(line).split('|').map((item) => item.trim());
  const range = parseRange(parts[0] || '');
  const text = (parts[1] || '').replace(/\\n/g, '\n');
  if (!range || !text) {
    errors.push(`Título inválido: "${stripListPrefix(line)}". Usa "0-3 | Texto".`);
    return null;
  }

  const style = normalize(parts[2] || 'clean');
  const position = normalize(parts[3] || 'center');
  const fontSize = parts[4] ? parseNumber(parts[4]) : null;
  const animation = normalize(parts[5] || 'fade-up');

  return {
    text,
    start: range.start,
    end: range.end,
    style: TITLE_STYLES.has(style) ? style : 'clean',
    position: POSITIONS.has(position) ? position : 'center',
    ...(fontSize !== null ? { fontSize } : {}),
    animation: TITLE_ANIMATIONS.has(animation) ? animation : 'fade-up',
  };
};

export const isNaylaDirectInstruction = (value: string) =>
  /^\s*@direct\b/i.test(value);

export const stripNaylaDirectMarker = (value: string) =>
  value.replace(/^\s*@direct\b\s*/i, '').trim();

export const parseNaylaDirectInstruction = (raw: string): NaylaDirectParseResult => {
  if (!isNaylaDirectInstruction(raw)) {
    return { ok: false, errors: ['La instrucción directa debe comenzar con @direct.'] };
  }

  const body = stripNaylaDirectMarker(raw);
  if (!body) return { ok: false, errors: ['El bloque @direct está vacío.'] };

  if (body.trim().startsWith('{')) {
    const action = parseNaylaAction(body);
    if (!action) {
      return { ok: false, errors: getNaylaActionValidationIssues(body) };
    }
    if (action.action !== 'BUILD_TIMELINE') {
      return { ok: false, errors: ['@direct acepta por ahora únicamente BUILD_TIMELINE.'] };
    }
    return { ok: true, plan: { action, source: 'json' } };
  }

  const errors: string[] = [];
  const action: Record<string, unknown> = {
    action: 'BUILD_TIMELINE',
    assets: [],
    subtitles: [],
    titles: [],
    threeScenes: [],
    vectorAnimations: [],
    skiaGraphics: [],
    render: true,
  };
  let canvasRatio: string | undefined;
  let exportQuality: string | undefined;
  let section: 'assets' | 'audio' | 'subtitles' | 'titles' | null = null;

  const lines = body.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;

    const sectionMatch = line.match(/^(assets?|medios?|fotos?|videos?|audio|subtitles?|subtitulos?|subtítulos?|titles?|titulos?|títulos?)\s*:\s*$/i);
    if (sectionMatch) {
      const name = normalize(sectionMatch[1]);
      section = name.startsWith('sub') ? 'subtitles'
        : name.startsWith('tit') ? 'titles'
          : name === 'audio' ? 'audio'
            : 'assets';
      continue;
    }

    const rootPair = line.match(/^([a-záéíóúñ_ -]+)\s*:\s*(.+)$/i);
    if (rootPair && !line.startsWith('-')) {
      const key = normalize(rootPair[1]).replace(/[\s_-]+/g, '');
      const value = rootPair[2].trim();
      if (key === 'ratio' || key === 'formato') {
        canvasRatio = value.replace(':', '/');
      } else if (key === 'quality' || key === 'calidad') {
        exportQuality = value;
      } else if (key === 'render') {
        action.render = parseBool(value, true);
      } else {
        errors.push(`Opción directa no reconocida: "${rootPair[1]}".`);
      }
      continue;
    }

    if (section === 'assets' || section === 'audio') {
      const asset = parseAssetLine(line, errors);
      if (asset) (action.assets as unknown[]).push(asset);
      continue;
    }
    if (section === 'subtitles') {
      const subtitle = parseSubtitleLine(line, errors);
      if (subtitle) (action.subtitles as unknown[]).push(subtitle);
      continue;
    }
    if (section === 'titles') {
      const title = parseTitleLine(line, errors);
      if (title) (action.titles as unknown[]).push(title);
      continue;
    }

    errors.push(`No sé dónde aplicar esta línea: "${line}". Añádela bajo assets:, audio:, subtitles: o titles:.`);
  }

  if (errors.length) return { ok: false, errors };

  const serialized = JSON.stringify(action);
  const parsed = parseNaylaAction(serialized);
  if (!parsed || parsed.action !== 'BUILD_TIMELINE') {
    return { ok: false, errors: getNaylaActionValidationIssues(serialized) };
  }

  return {
    ok: true,
    plan: {
      action: parsed,
      canvasRatio,
      exportQuality,
      source: 'dsl',
    },
  };
};
