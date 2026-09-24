# Estado de las dependencias Remotion

Inventario de 38 dependencias instaladas en 4.0.526. Las referencias estáticas no demuestran cobertura de todas sus API ni render visual correcto. El catálogo solo anuncia controles implementados.

| Paquete | Conexión o límite |
| --- | --- |
| `@remotion/animated-emoji` | Capa emoji: nombres del catálogo, posición, tamaño, velocidad y tiempo. |
| `@remotion/animation-utils` | Interpolación de entrada de las capas; auxiliar del compositor. |
| `@remotion/bundler` | Construye el motor de producción. |
| `@remotion/captions` | Subtítulos y estilos del contrato de edición. |
| `@remotion/effects` | Efectos visuales existentes y nuevo starburst. |
| `@remotion/fonts` | Carga de fuente personalizada por URL. |
| `@remotion/gif` | Capa GIF por URL o etiqueta F de la biblioteca. |
| `@remotion/google-fonts` | Roboto, Montserrat y Playfair Display; no todas las Google Fonts. |
| `@remotion/gsap` | Animación de clips y títulos según presets y controles. |
| `@remotion/layout-utils` | Medición y ajuste de texto en capas. |
| `@remotion/light-leaks` | Paquete antiguo sin conectar: se usa effects/light-leak. |
| `@remotion/lottie` | Capas de animación Lottie. |
| `@remotion/media` | Audio y video del compositor. |
| `@remotion/media-parser` | Paquete obsoleto sin conectar; Mediabunny es la alternativa instalada. |
| `@remotion/media-utils` | Metadatos de los archivos en el editor. |
| `@remotion/motion-blur` | Desenfoque de movimiento según el contrato. |
| `@remotion/noise` | Movimiento procedural. |
| `@remotion/paths` | Validación y dibujo progresivo de trazados SVG. |
| `@remotion/player` | Vista previa del montaje con controles y duración. |
| `@remotion/preload` | Precarga de las primeras tres imágenes de la vista previa. |
| `@remotion/renderer` | Script local de comprobación; no es el renderizador de producción. |
| `@remotion/rive` | Capas de animación Rive. |
| `@remotion/rough-notation` | Subrayado, resaltado, círculo, caja y tachados. |
| `@remotion/rounded-text-box` | Cajas redondeadas ajustadas al texto. |
| `@remotion/sfx` | Capa de sonido: nombres disponibles, volumen e intervalo. |
| `@remotion/shapes` | Formas utilizadas por los efectos del compositor. |
| `@remotion/skia` | Configuración del compilador para los gráficos Skia existentes. |
| `@remotion/starburst` | Paquete antiguo sin conectar: la nueva capa usa effects/starburst. |
| `@remotion/svg-3d-engine` | Extrusión y giro de trazados SVG, no escenas 3D arbitrarias. |
| `@remotion/three` | Escenas GLB con los controles existentes. |
| `@remotion/transitions` | Transiciones del montaje. |
| `@remotion/vercel` | Exportación de producción mediante Sandbox. |
| `@remotion/video-matting` | Herramienta existente para recortar el fondo; depende del navegador y recurso. |
| `@remotion/web-renderer` | Sin conectar: exportador alternativo en navegador; requiere integración y pruebas de compatibilidad de todas las capas. |
| `@remotion/webcodecs` | Paquete obsoleto sin conectar; Mediabunny es la alternativa instalada. |
| `@remotion/whisper-web` | Sin conectar: necesita crossOriginIsolated, COOP/COEP y almacenamiento del modelo. No activar globalmente sin comprobar OAuth y medios externos. |
| `@remotion/whisper-webgpu` | Transcripción local existente, condicionada a WebGPU y descarga del modelo. |
| `remotion` | Composición, secuencias y animación determinista por fotogramas. |

## Flujo y catálogo

Los 17 capítulos incluyen explicaciones, límites, opciones y ejemplos validados contra el esquema real. El enrutador consulta los capítulos relevantes; la IA recomienda, prepara JSON validado y lo muestra separado del chat. Aceptar despacha el plan guardado. Las nuevas capas viajan en `decorations` y se resuelven a `settings.decorations` para Remotion. Tiempos globales en segundos; posición en porcentaje y tamaño en píxeles. Su duración participa en el cálculo de la composición, incluso sin fotos o videos. GIF de biblioteca se valida contra propietario/proyecto y renueva URL al renderizar.

Emojis: respetar la atribución CC BY 4.0 del recurso Google Animated Emoji. Fuentes y recursos externos necesitan URLs accesibles desde el navegador y desde el renderizador.

## Verificación

200 pruebas automatizadas y compilación completa `npm run build` (Remotion + Next.js) pasan. Next transpila Skia y resuelve sus módulos web; el build copia CanvasKit a public para la vista previa. El archivo WASM generado no se versiona.

### Pendiente

No hay confirmación visual ni prueba autenticada de conversación → aceptación → video final. El navegador local no pudo descargarse por ERR_PROXY_TUNNEL. La compilación y las pruebas de contrato no sustituyen esas verificaciones. Los seis paquetes sin referencia están explicados arriba; no se presentan como activos. No se cambió el modelo ni se publicó a producción.

## Revisión de integración — 24 septiembre 2026

Se integró main `3c10d44` en la rama de la propuesta, conservando el reloj y la navegación recientes del reproductor y los módulos de generación. Se resolvieron los conflictos del reproductor sin sustituirlos por la implementación anterior. La vista previa carga CanvasKit al abrirse, muestra fallos de carga dentro del diálogo y pausa el reproductor original.

Verificación nueva: 208 pruebas en 41 archivos pasan; `npm run build` completo pasa, incluido TypeScript. Una prueba adicional del endpoint de aceptación confirma que capas, fuente y contexto de render guardados se devuelven juntos. El historial ya consulta el estado real de los planes en el servidor. `git diff --check` pasa. La descarga de Chromium se volvió a intentar y falla con `ERR_PROXY_TUNNEL`; la prueba visual y el recorrido autenticado con el proveedor LLM no están verificados. No se ha fusionado la propuesta en main ni publicado a producción.
