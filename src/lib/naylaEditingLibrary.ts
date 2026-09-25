// Executable examples, checked against the same schema as real model actions.
// Reference architecture: https://github.com/remotion-dev/template-prompt-to-video
// Audio API: https://www.remotion.dev/docs/media/audio
export const NAYLA_EDITING_LIBRARY = [
  {
    id: 'photo-depth',
    recommendation: 'Profundidad suave: la foto parece moverse con la cámara. Es perspectiva simulada, no reconstrucción 3D.',
    example: { action: 'BUILD_TIMELINE', assets: [{ type: 'foto', source: 'label', label: 'F1', durationInSeconds: 5, efecto: 'parallax-3d', transitionType: 'fade', transitionDuration: 0.5 }], render: false },
  },
  {
    id: 'photo-tilt',
    recommendation: 'Foto inclinada: un giro suave como una tarjeta en el espacio.',
    example: { action: 'BUILD_TIMELINE', assets: [{ type: 'foto', source: 'label', label: 'F1', durationInSeconds: 5, efecto: 'tilt-3d' }], render: false },
  },
  {
    id: 'fragment-reveal',
    recommendation: 'Revelado fragmentado: la foto se divide en paneles y al abrirse deja ver la siguiente imagen detrás.',
    example: { action: 'BUILD_TIMELINE', assets: [
      { type: 'foto', source: 'label', label: 'F1', durationInSeconds: 6, visualTemplate: 'fragment-reveal' },
      { type: 'foto', source: 'label', label: 'F2', durationInSeconds: 6, visualTemplate: 'poster-pop' },
    ], render: false },
  },
  {
    id: 'carousel-card',
    recommendation: 'Carrusel: cada foto aparece como tarjeta con profundidad y se desplaza para descubrir la siguiente.',
    example: { action: 'BUILD_TIMELINE', assets: [
      { type: 'foto', source: 'label', label: 'F1', durationInSeconds: 6, visualTemplate: 'carousel-card' },
      { type: 'foto', source: 'label', label: 'F2', durationInSeconds: 6, visualTemplate: 'carousel-card' },
    ], render: false },
  },
  {
    id: 'depth-stack',
    recommendation: 'Capas de profundidad: varias copias desplazadas crean sensación de volumen y separación del fondo.',
    example: { action: 'BUILD_TIMELINE', assets: [
      { type: 'foto', source: 'label', label: 'F1', durationInSeconds: 6, visualTemplate: 'depth-stack' },
    ], render: false },
  },
  {
    id: 'split-panels',
    recommendation: 'Paneles divididos: la imagen se separa en dos mitades y revela la escena siguiente.',
    example: { action: 'BUILD_TIMELINE', assets: [
      { type: 'foto', source: 'label', label: 'F1', durationInSeconds: 6, visualTemplate: 'split-panels' },
      { type: 'foto', source: 'label', label: 'F2', durationInSeconds: 6 },
    ], render: false },
  },
  {
    id: 'poster-pop',
    recommendation: 'Póster dinámico: la foto principal flota sobre un fondo ampliado y desenfocado con entrada de profundidad.',
    example: { action: 'BUILD_TIMELINE', assets: [
      { type: 'foto', source: 'label', label: 'F1', durationInSeconds: 6, visualTemplate: 'poster-pop' },
    ], render: false },
  },
  {
    id: 'cinematic-montage',
    recommendation: 'Cine: acercamiento en la foto, color en el video y transición con desenfoque.',
    example: { action: 'BUILD_TIMELINE', assets: [
      { type: 'foto', source: 'label', label: 'F1', durationInSeconds: 5, efecto: 'push-in', professionalEffects: [{ type: 'color-correction', intensity: 0.3 }] },
      { type: 'video', source: 'label', label: 'V1', durationInSeconds: 5, efecto: 'cinematic', transitionType: 'blur-slide', transitionDuration: 0.5 },
    ], render: false },
  },
  {
    id: 'music-under-voice',
    recommendation: 'La música baja suavemente al entrar la voz y recupera su nivel cuando termina.',
    timing: 'Ejemplo: A2 entra en el segundo 8 y dura 8 segundos. A1 baja del 7 al 8, queda al 20% hasta el 16 y vuelve al nivel normal en el 17. Adapta los tiempos a los medios reales.',
    example: { action: 'BUILD_TIMELINE', assets: [
      { type: 'audio', source: 'label', label: 'A1', durationInSeconds: 20, volume: 0.7, volumeKeyframes: [{ time: 0, gain: 1 }, { time: 7, gain: 1 }, { time: 8, gain: 0.2 }, { time: 16, gain: 0.2 }, { time: 17, gain: 1 }] },
      { type: 'audio', source: 'label', label: 'A2', delay: 8, durationInSeconds: 8, volume: 1 },
    ], render: false },
  },
  {
    id: 'crossfade-music',
    recommendation: 'Una canción se desvanece mientras entra la siguiente, sin corte brusco.',
    example: { action: 'BUILD_TIMELINE', assets: [
      { type: 'audio', source: 'label', label: 'A1', durationInSeconds: 12, fadeOut: 2 },
      { type: 'audio', source: 'label', label: 'A2', delay: 10, durationInSeconds: 12, fadeIn: 2 },
    ], render: false },
  },
  {
    id: 'auto-ducking-voice',
    recommendation: 'Locución sobre música: clasifica la voz y la música por bus y deja que el renderer baje la música automáticamente mientras la voz esté activa.',
    example: { action: 'BUILD_TIMELINE', audioMix: { preset: 'voice-focus', autoDucking: true, duckMusicGain: 0.18, duckAttack: 0.25, duckRelease: 0.7 }, assets: [
      { type: 'audio', source: 'label', label: 'A1', durationInSeconds: 12, audioBus: 'voice', volume: 1 },
      { type: 'audio', source: 'label', label: 'A2', durationInSeconds: 20, audioBus: 'music', volume: 0.8, fadeIn: 1, fadeOut: 2 },
    ], render: false },
  },
  {
    id: 'voice-polish-master',
    recommendation: 'Locución más limpia: mezcla con voz protagonista y aplica un master de voz pulida con control de picos.',
    example: { action: 'BUILD_TIMELINE', audioMix: { preset: 'voice-focus', autoDucking: true }, audioMaster: { preset: 'voice-polish', limiter: true }, assets: [
      { type: 'audio', source: 'label', label: 'A1', durationInSeconds: 12, audioBus: 'voice', volume: 1 },
      { type: 'audio', source: 'label', label: 'A2', durationInSeconds: 20, audioBus: 'music', volume: 0.75 },
    ], render: false },
  },
  {
    id: 'telephone-master',
    recommendation: 'Para llamada, recuerdo o radio interna usa el preset telephone en el MASTER final.',
    example: { action: 'BUILD_TIMELINE', audioMaster: { preset: 'telephone' }, assets: [
      { type: 'audio', source: 'label', label: 'A1', durationInSeconds: 8, audioBus: 'voice' },
    ], render: false },
  },
  {
    id: 'real-3d',
    recommendation: 'Objeto 3D real: requiere un modelo GLB disponible como M1. Permite girarlo e iluminarlo.',
    example: { action: 'BUILD_TIMELINE', assets: [], threeScenes: [{ label: 'M1', start: 0, end: 5, autoRotate: true, lighting: 'studio' }], render: false },
  },
];

export const NAYLA_EDITING_GUIDANCE = `
ASESORÍA PARA PERSONAS SIN CONOCIMIENTOS TÉCNICOS:
- Si el usuario expresa un deseo general como "quiero efectos" o "quiero un efecto 3D" sin elegir tratamiento, ofrece 2 o 3 opciones breves y diferentes, recomienda una y pregunta cuál prefiere. No renderices todavía.
- Distingue explorar opciones de una orden concreta como "aplica profundidad a F1 y entrégame el video". Cuando ya eligió, prepara el cuadro completo con los medios indicados para que lo acepte.
- Explica el resultado visible o audible. No obligues a conocer nombres de librerías, código o controles.
- La biblioteca contiene ejemplos válidos, no archivos disponibles: sustituye etiquetas, tiempos y parámetros con el contexto real. No copies F1/A2/M1 si no existen. Combina recetas cuando corresponda.
- Una receta de audio no reemplaza el resto del montaje: conserva escenas, efectos, textos y pistas existentes salvo que el usuario pida cambiarlos.
- volumeKeyframes es una curva de ganancia multiplicativa (0 silencio, 1 nivel base volume); time son segundos desde la entrada del clip. Se interpola linealmente. No son segundos del archivo original y no se reinicia al repetir el audio.
- Para locución separada de música, prefiere audioBus voice/music + audioMix con autoDucking para una mezcla reutilizable. Usa volumeKeyframes cuando el usuario quiera una curva manual específica. Para pulido final usa audioMaster; recuerda que afecta a toda la mezcla. pitch sí puede aplicarse por pista. Distingue sonido propio de V1 y pistas A1/A2.
- No afirmes detectar voz, golpes musicales o silencios si no tienes ese análisis. Si no se conocen los tiempos necesarios, pregunta una sola cosa concreta o propone un intervalo explícito antes de ejecutar.
- Mantén las restricciones del usuario. Si no hay herramienta capaz de cumplir una petición, explica qué parte sí puedes realizar sin inventar una función.
`;
