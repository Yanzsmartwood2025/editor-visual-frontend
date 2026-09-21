export type NaylaCapabilityStatus = 'ready' | 'installed';
export type NaylaCapabilityEngine = 'render' | 'cloud' | 'compute' | 'browser';

export type NaylaCapability = {
  id: string;
  category: string;
  label: string;
  description: string;
  status: NaylaCapabilityStatus;
  engine: NaylaCapabilityEngine;
  aliases: string[];
  usefulFor: string[];
};

export const NAYLA_CAPABILITY_BIBLE_VERSION = '2026-09-20';

export const NAYLA_CAPABILITY_BIBLE: NaylaCapability[] = [
  {
    id: 'edit-cut-timing',
    category: 'Edición',
    label: 'Cortes, duración y montaje',
    description: 'Ordena fotos, videos y audios, recorta tramos, cambia duración, retraso, velocidad y repetición.',
    status: 'ready',
    engine: 'render',
    aliases: ['cortar', 'recortar', 'montar', 'montaje', 'ordenar', 'duracion', 'velocidad', 'repetir', 'loop', 'editar'],
    usefulFor: ['videos con muchas fotos', 'recortar videos', 'sincronizar escenas'],
  },
  {
    id: 'audio-mix',
    category: 'Audio',
    label: 'Mezcla y fades de audio',
    description: 'Ajusta volumen, entrada, salida, mezcla y sincronía de pistas existentes.',
    status: 'ready',
    engine: 'render',
    aliases: ['audio', 'musica', 'volumen', 'fade audio', 'entrada de audio', 'salida de audio', 'mezclar sonido'],
    usefulFor: ['música de fondo', 'entradas suaves', 'cierres de audio'],
  },
  {
    id: 'transition-basic',
    category: 'Transiciones',
    label: 'Transiciones limpias',
    description: 'Fundidos, barridos, deslizamientos y zoom entre escenas.',
    status: 'ready',
    engine: 'render',
    aliases: ['transicion', 'cruce', 'cruzar', 'pase', 'pasar de una a otra', 'fundido', 'fade', 'wipe', 'slide', 'zoom'],
    usefulFor: ['cambiar de foto', 'unir escenas', 'dar ritmo'],
  },
  {
    id: 'look-cinematic',
    category: 'Color y estilo',
    label: 'Look cinematográfico',
    description: 'Contraste, brillo, saturación y estilos cinematográfico, suave, vintage, monocromo o alto contraste.',
    status: 'ready',
    engine: 'render',
    aliases: ['cinematografico', 'pelicula', 'cine', 'dramatico', 'vintage', 'suave', 'contraste', 'color', 'blanco y negro', 'sepia'],
    usefulFor: ['dar identidad visual', 'crear ambiente', 'igualar escenas'],
  },
  {
    id: 'motion-depth',
    category: 'Movimiento',
    label: 'Profundidad y movimiento tipo 3D',
    description: 'Parallax, inclinación en perspectiva, acercamientos, alejamientos, paneo, flotación y Ken Burns.',
    status: 'ready',
    engine: 'render',
    aliases: ['3d', 'parezca 3d', 'profundidad', 'parallax', 'perspectiva', 'camara', 'acercamiento', 'alejamiento', 'movimiento', 'flotar', 'ken burns'],
    usefulFor: ['dar vida a fotos', 'sensación de cámara', 'profundidad sin modelo 3D real'],
  },
  {
    id: 'overlay-atmosphere',
    category: 'Efectos',
    label: 'Atmósfera y overlays',
    description: 'Viñeta, grano de película, fuga de luz y barras cinematográficas.',
    status: 'ready',
    engine: 'render',
    aliases: ['grano', 'film grain', 'luz', 'fuga de luz', 'light leak', 'vignette', 'viñeta', 'barras negras', 'letterbox'],
    usefulFor: ['estética de película', 'reforzar luz', 'acabado cinematográfico'],
  },
  {
    id: 'effects-professional',
    category: 'Efectos',
    label: 'Efectos visuales profesionales',
    description: 'Motor avanzado conectado para corrección de color, aberración cromática, glow, pixelado, zoom blur, viñeta, fugas de luz y cadenas de hasta seis efectos por clip.',
    status: 'ready',
    engine: 'render',
    aliases: ['efectos profesionales', 'aberracion', 'distorsion', 'pixelado', 'contorno', 'blur avanzado', 'efecto de luz', 'lut'],
    usefulFor: ['acabados avanzados', 'efectos combinados', 'tratamiento profesional'],
  },
  {
    id: 'transition-professional',
    category: 'Transiciones',
    label: 'Transiciones avanzadas',
    description: 'Transiciones avanzadas conectadas como film burn, blur slide, cross zoom, dreamy zoom, linear blur y push cut, además de las transiciones básicas.',
    status: 'ready',
    engine: 'render',
    aliases: ['film burn', 'quemado de pelicula', 'transicion avanzada', 'disolver', 'blur transition', 'transicion 3d'],
    usefulFor: ['cambios de escena fuertes', 'videos musicales', 'publicidad'],
  },
  {
    id: 'captions-professional',
    category: 'Texto y subtítulos',
    label: 'Subtítulos profesionales',
    description: 'Subtítulos sincronizados conectados con estilos limpio, cinematográfico, TikTok y karaoke, posición configurable y palabra activa.',
    status: 'ready',
    engine: 'render',
    aliases: ['subtitulos', 'caption', 'srt', 'palabra por palabra', 'karaoke', 'texto sincronizado', 'texto en pantalla'],
    usefulFor: ['Reels', 'TikTok', 'poesía', 'diálogo', 'karaoke'],
  },
  {
    id: 'motion-gsap',
    category: 'Animación',
    label: 'Animación avanzada',
    description: 'GSAP conectado para títulos, lower thirds y clips completos, con entradas y salidas por fade, deslizamiento, zoom, rebote, elasticidad, giro y swing sincronizados exactamente por frame.',
    status: 'ready',
    engine: 'render',
    aliases: ['animacion avanzada', 'rebote', 'elastico', 'elasticidad', 'giro', 'swing', 'trayectoria', 'curva', 'entrada de texto', 'salida de texto', 'entrada de foto', 'entrada de video', 'coreografia', 'titulo animado', 'lower third', 'palabras que suben'],
    usefulFor: ['animar fotos y videos completos', 'motion graphics', 'títulos', 'publicidad', 'presentaciones', 'lower thirds'],
  },
  {
    id: 'three-real',
    category: '3D',
    label: 'Escenas 3D reales',
    description: 'Motor 3D real instalado para cámaras, luces, geometría, materiales, modelos y escenas con profundidad real.',
    status: 'installed',
    engine: 'render',
    aliases: ['3d real', 'modelo 3d', 'camara 3d', 'luces 3d', 'materiales 3d', 'escena 3d', 'objeto 3d', 'glb'],
    usefulFor: ['presentar modelos', 'cámaras 3D', 'productos', 'escenas tridimensionales'],
  },
  {
    id: 'motion-blur',
    category: 'Movimiento',
    label: 'Desenfoque de movimiento',
    description: 'Desenfoque de cámara conectado con control de shutter angle y muestras para movimientos rápidos.',
    status: 'ready',
    engine: 'render',
    aliases: ['motion blur', 'desenfoque de movimiento', 'estela', 'movimiento rapido'],
    usefulFor: ['acción', 'transiciones rápidas', 'movimiento de cámara'],
  },
  {
    id: 'procedural-motion',
    category: 'Motion graphics',
    label: 'Ruido, formas y gráficos procedurales',
    description: 'Base instalada para ruido animado, formas, flechas, estrellas, polígonos y gráficos generativos.',
    status: 'installed',
    engine: 'render',
    aliases: ['formas', 'flecha', 'estrella', 'particulas', 'ruido', 'noise', 'grafico', 'procedural'],
    usefulFor: ['motion graphics', 'infografías', 'decoración', 'fondos animados'],
  },
  {
    id: 'lottie-rive',
    category: 'Animación',
    label: 'Animaciones vectoriales',
    description: 'Motores instalados para animaciones Lottie y Rive dentro de composiciones.',
    status: 'installed',
    engine: 'render',
    aliases: ['lottie', 'rive', 'animacion vectorial', 'icono animado', 'logo animado'],
    usefulFor: ['logos', 'interfaces', 'iconos', 'motion graphics'],
  },
  {
    id: 'skia-graphics',
    category: 'Gráficos',
    label: 'Gráficos avanzados',
    description: 'Motor gráfico instalado para dibujos, máscaras y composiciones visuales avanzadas.',
    status: 'installed',
    engine: 'render',
    aliases: ['mascara', 'dibujar', 'grafico avanzado', 'skia', 'canvas'],
    usefulFor: ['máscaras', 'gráficos personalizados', 'composición avanzada'],
  },
  {
    id: 'background-removal',
    category: 'Video inteligente',
    label: 'Separación de fondo',
    description: 'Base instalada para separar una persona u objeto del fondo en video compatible.',
    status: 'installed',
    engine: 'browser',
    aliases: ['quitar fondo', 'eliminar fondo', 'fondo transparente', 'recortar persona', 'separar sujeto'],
    usefulFor: ['composición por capas', 'cambiar fondos', 'superponer personas'],
  },
  {
    id: 'speech-captions',
    category: 'Audio inteligente',
    label: 'Transcripción y subtítulos automáticos',
    description: 'Base instalada para transcribir voz y convertirla en captions sincronizados.',
    status: 'installed',
    engine: 'browser',
    aliases: ['transcribir', 'sacar subtitulos', 'escuchar audio', 'voz a texto', 'whisper'],
    usefulFor: ['subtítulos automáticos', 'diálogo', 'entrevistas', 'videos sociales'],
  },
  {
    id: 'modern-media',
    category: 'Media',
    label: 'Motor multimedia moderno',
    description: 'Motor multimedia moderno conectado al render para video y audio, con soporte de efectos canvas en video.',
    status: 'ready',
    engine: 'render',
    aliases: ['codec', 'formato', 'compatibilidad', 'video profesional', 'audio profesional', 'media'],
    usefulFor: ['archivos variados', 'análisis de medios', 'flujos profesionales'],
  },
  {
    id: 'generate-image-video-audio-3d',
    category: 'Generación',
    label: 'Creación de contenido nuevo',
    description: 'Nayla puede planificar creación de imágenes, video, audio, voz y 3D usando sus motores Cloud o Compute cuando corresponda.',
    status: 'ready',
    engine: 'cloud',
    aliases: ['generar', 'crear imagen', 'crear video', 'crear musica', 'crear audio', 'crear 3d', 'hacer desde cero'],
    usefulFor: ['contenido nuevo', 'rellenar escenas', 'crear recursos faltantes'],
  },
];

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const findNaylaCapabilityMatches = (
  message: string,
  limit = 7
): NaylaCapability[] => {
  const normalized = normalize(message);
  if (!normalized) return [];

  return NAYLA_CAPABILITY_BIBLE
    .map((capability) => {
      let score = 0;
      for (const alias of capability.aliases) {
        const normalizedAlias = normalize(alias);
        if (!normalizedAlias) continue;
        if (normalized.includes(normalizedAlias)) {
          score += normalizedAlias.includes(' ') ? 5 : 3;
        } else {
          const tokens = normalizedAlias.split(' ').filter((token) => token.length >= 4);
          score += tokens.filter((token) => normalized.includes(token)).length;
        }
      }
      if (capability.status === 'ready') score += score > 0 ? 1 : 0;
      return { capability, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.capability);
};

export const getNaylaCapabilityBibleForPrompt = () =>
  NAYLA_CAPABILITY_BIBLE.map((item) => ({
    id: item.id,
    category: item.category,
    label: item.label,
    description: item.description,
    status: item.status,
    engine: item.engine,
    aliases: item.aliases,
    usefulFor: item.usefulFor,
  }));
