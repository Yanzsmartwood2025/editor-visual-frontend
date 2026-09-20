import type { CapabilityDefinition, MediaCapability } from './types';

const capability = (
  id: MediaCapability,
  label: string,
  group: CapabilityDefinition['group'],
  description: string,
  iconKey: string,
  billable = true,
  requiresConsent = false
): CapabilityDefinition => ({
  id,
  label,
  group,
  description,
  iconKey,
  billable,
  ...(requiresConsent ? { requiresConsent: true } : {}),
});

export const MEDIA_CAPABILITY_CATALOG: CapabilityDefinition[] = [
  capability('stock_image', 'Fotos stock', 'search', 'Buscar fotografías reutilizables en proveedores stock.', 'image-search', false),
  capability('stock_video', 'Videos stock', 'search', 'Buscar clips de video reutilizables en proveedores stock.', 'video-search', false),
  capability('stock_audio', 'Audio stock', 'search', 'Buscar audio con licencia abierta o reutilizable.', 'audio-search', false),

  capability('image_generation', 'Generar imagen', 'image', 'Crear una imagen nueva a partir de texto u otras entradas.', 'image-sparkles'),
  capability('image_editing', 'Editar imagen', 'image', 'Modificar una imagen existente con IA.', 'image-edit'),
  capability('image_to_image', 'Imagen a imagen', 'image', 'Transformar una imagen usando otra imagen o un prompt como guía.', 'image-transform'),

  capability('video_generation', 'Generar video', 'video', 'Crear un video nuevo con IA.', 'video-sparkles'),
  capability('image_to_video', 'Imagen a video', 'video', 'Animar una imagen o usarla como fotograma de referencia.', 'image-to-video'),

  capability('audio_generation', 'Generar audio', 'audio', 'Crear audio generativo no limitado a voz o música.', 'waveform'),
  capability('music_generation', 'Generar música', 'audio', 'Crear música desde una descripción.', 'music'),
  capability('sound_effects', 'Efectos de sonido', 'audio', 'Generar efectos de sonido desde texto.', 'sound-wave'),

  capability('tts', 'Texto a voz', 'voice', 'Convertir texto en voz sintetizada.', 'mic'),
  capability('speech_to_text', 'Transcribir audio', 'voice', 'Convertir voz o audio hablado en texto.', 'transcript'),
  capability('voice_clone', 'Clonar voz', 'voice', 'Crear una voz a partir de muestras autorizadas.', 'voice-clone', true, true),
  capability('voice_design', 'Diseñar voz', 'voice', 'Crear una voz sintética nueva desde una descripción.', 'voice-design'),
  capability('voice_change', 'Cambiar voz', 'voice', 'Transformar una grabación para que use otra voz.', 'voice-swap', true, true),
  capability('voice_isolation', 'Aislar voz', 'voice', 'Separar voz de ruido o fondo.', 'voice-isolate'),
  capability('dubbing', 'Doblaje', 'voice', 'Traducir y revocear audio o video preservando sincronía y hablantes.', 'languages'),
  capability('text_to_dialogue', 'Texto a diálogo', 'voice', 'Generar conversaciones con varias voces desde texto.', 'dialogue'),
  capability('forced_alignment', 'Alinear voz y texto', 'voice', 'Alinear palabras o texto con marcas de tiempo del audio.', 'timeline-text'),
  capability('pronunciation_dictionary', 'Diccionario de pronunciación', 'voice', 'Definir pronunciaciones especiales para nombres o términos.', 'dictionary'),
  capability('voice_agent', 'Agente de voz', 'agents', 'Ejecutar conversaciones de voz en tiempo real.', 'headset'),

  capability('gpu_processing', 'Proceso GPU', 'gpu', 'Ejecutar cargas pesadas de IA en infraestructura GPU.', 'gpu'),
  capability('custom_model_inference', 'Modelo personalizado', 'gpu', 'Ejecutar modelos propios o modelos de terceros.', 'model'),

  capability('3d_generation', 'Generar 3D', '3d', 'Crear un modelo 3D desde texto o imagen.', 'cube'),
  capability('3d_multiview', 'Multivista 3D', '3d', 'Crear o usar varias vistas para reconstrucción 3D.', 'cube-multiview'),
  capability('3d_texturing', 'Texturizar 3D', '3d', 'Aplicar o regenerar texturas de un modelo 3D.', 'texture'),
  capability('3d_conversion', 'Convertir 3D', '3d', 'Convertir formatos de modelos 3D.', 'convert'),
  capability('3d_segmentation', 'Segmentar malla', '3d', 'Separar partes semánticas de una malla.', 'mesh-segment'),
  capability('3d_mesh_completion', 'Completar malla', '3d', 'Reparar o completar geometría de una malla.', 'mesh-complete'),
  capability('3d_decimation', 'Optimizar malla', '3d', 'Reducir polígonos o retopologizar para web.', 'mesh-optimize'),
  capability('3d_rig_check', 'Comprobar rig', '3d', 'Comprobar si un modelo puede ser riggeado.', 'skeleton-check'),
  capability('3d_rigging', 'Rigging', '3d', 'Añadir un esqueleto animable al modelo.', 'skeleton'),
  capability('3d_animation', 'Animar 3D', '3d', 'Aplicar o generar animación sobre un modelo 3D.', 'motion'),
  capability('3d_retargeting', 'Retarget 3D', '3d', 'Transferir una animación a otro rig.', 'retarget'),
];

export const getCapabilityDefinition = (id: MediaCapability) =>
  MEDIA_CAPABILITY_CATALOG.find((item) => item.id === id);

export const getCapabilityGroups = () =>
  MEDIA_CAPABILITY_CATALOG.reduce<Record<string, CapabilityDefinition[]>>((groups, item) => {
    groups[item.group] ||= [];
    groups[item.group].push(item);
    return groups;
  }, {});
