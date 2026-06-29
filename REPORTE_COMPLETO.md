# Reporte Completo del Proyecto NaylaCore (editor-visual-frontend)

Este documento es un análisis estructurado y detallado del repositorio actual, sus configuraciones, stack tecnológico y funcionalidades, preparado para su revisión.

---

## 1. Estructura completa de archivos y carpetas

A continuación se muestra el árbol de archivos relevante (excluyendo carpetas autogeneradas como `node_modules` y `.next`):

- **Raíz del proyecto:**
  - `package.json` / `package-lock.json`: Definición de dependencias npm, scripts del proyecto y metadatos.
  - `vercel.json`: Configuración de despliegue para Vercel. Define el comando de compilación (`next build`).
  - `Dockerfile`: Definición de la imagen Docker para construir la app Next.js o el servidor en entornos contenerizados (Alpine Linux + FFmpeg).
  - `tsconfig.json`: Configuración del compilador TypeScript.
  - `.env.example`: Plantilla de variables de entorno requeridas para el funcionamiento (Supabase, claves IA, Oracle Server).
  - `README.md`: Documentación base de la plantilla original (Remotion).
  - `ANALISIS.md`: Documentación manual de la arquitectura interna del proyecto.
  - `.gitignore`, `.npmrc`, `.prettierrc`, `eslint.config.mjs`: Archivos de configuración de herramientas de desarrollo (Git, npm, Prettier, ESLint).
  - **Archivos Patch (`*.patch`) y `patch_fades.js`**: Archivos que contienen parches manuales a aplicar en el código fuente para resolver bugs (ej. `fix_timeline.patch`, `fix_supabase.patch`).

- **`/src` - Código fuente de Next.js:**
  - `src/components/`: Componentes reutilizables.
    - `MainComposition.tsx`: Componente de Remotion encargado de componer el video real, renderizando los clips, audios, subtítulos y transiciones (fades).
    - `SortableTimelineItem.tsx`: Componente UI para arrastrar y soltar clips en la línea de tiempo usando `@dnd-kit`.
  - `src/pages/`: Rutas de la aplicación (Pages Router).
    - `_app.tsx`: Punto de entrada de React, inicializa estilos globales, fuentes y registra el Service Worker de la PWA.
    - `_document.tsx`: Estructura HTML base donde se inyectan las configuraciones de manifiesto (PWA).
    - `index.tsx`: **NaylaCore**. Archivo principal que contiene la interfaz del editor de video, el estado global de la línea de tiempo, autenticación y comunicación con las APIs.
    - `api/`: Backend API routes (funciones Serverless).
      - `extract-meta-video.ts`: Proxies y regex para extraer enlaces crudos `.mp4` desde URLs de Meta AI u otras redes sociales.
      - `supervisor.ts`: El "cerebro". Recibe comandos, valida al administrador verificando `api_keys_pool` en Supabase, e invoca al `oracle-service` para delegar el trabajo.
      - `clean-video.ts`: Motor de difuminado (delogo). Procesa el borrado de marcas de agua. Usa motor local (FFmpeg) o APIs en la nube (Replicate, Fal.ai).
      - `ia-fotos.ts` & `ia-audio.ts`: Endpoints que actualmente retornan mocks simulados (`picsum.photos` y un MP3 estático) y tienen un `TODO` para conectarse a verdaderas IAs generativas.
      - `render.ts`: Endpoint local para concatenar videos en el servidor usando FFmpeg y subirlos a Supabase.

- **`/oracle-service` - Microservicio Backend:**
  - `server.js`: Servidor Express de Node.js. Maneja cargas de trabajo pesadas, descargas de YouTube (`yt-dlp`), recorte de clips (via `ffmpeg`), extracción asíncrona de HTML proxyando a Meta, y subida a Supabase.
  - `Dockerfile`: Contenedor Alpine configurado con `python3`, `ffmpeg` y `yt-dlp` para ejecutar el `server.js`.
  - `package.json`: Dependencias específicas de este microservicio (`express`, `cors`, `@supabase/supabase-js`).

- **`/public` - Archivos estáticos y PWA:**
  - `manifest.json`: Manifiesto de la Progressive Web App, define el modo "standalone", colores e íconos.
  - `sw.js`: Service Worker encargado del cache offline base y estrategias de red.
  - `favicon.ico`, `vercel.svg`: Íconos e imágenes de prueba.

---

## 2. Stack tecnológico y dependencias

Basado en el `package.json` de la raíz:

- **Core & Framework:**
  - `next` (16.2.3): Framework de React SSR/SSG.
  - `react` & `react-dom` (19.2.3): Librerías de UI (versión candidata/reciente).
  - `typescript` (5.9.3): Lenguaje base del proyecto.
- **Video y Renderizado:**
  - `remotion` (^4.0.483): Motor para renderizar video programáticamente con React.
  - `@remotion/player`, `@remotion/media-utils`: Complementos de Remotion para reproducción pre-renderizada en UI y lectura de metadatos de medios.
- **Base de Datos & Auth:**
  - `@supabase/supabase-js` (^2.43.4): Cliente oficial de Supabase para Auth, Database (PostgreSQL) y Storage.
- **Inteligencia Artificial:**
  - `@google/generative-ai` (^0.24.1): SDK oficial para integrar Google Gemini (cerebro de supervisor y JS generator).
- **Gestión UI (Drag & Drop):**
  - `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`: Librerías modernas y accesibles para arrastrar y reordenar elementos (usado en la línea de tiempo).
  - `react-dnd`, `react-dnd-html5-backend`: (Aparentemente librerías alternativas instaladas, `dnd-kit` es la principal documentada en memoria para el timeline).
- **Backend/Archivos:**
  - `formidable` (^3.5.1): Parseo de `multipart/form-data` para subidas de archivos en Next.js (ej. en `clean-video.ts`).
- **Utilidades:**
  - `zod` (4.3.6): Validación de esquemas de datos (TypeScript-first).

---

## 3. Funcionalidad principal (`/src`)

NaylaCore (Editor Visual Frontend) es una aplicación web de edición de video, diseñada para orquestar creación de contenido automatizada mediante IA:

1. **Gestión de Medios (Bodega):** El usuario puede subir videos, fotos o audio. Los archivos locales se guardan en Supabase Storage, mientras que los enlaces externos se referencian.
2. **Línea de Tiempo (Timeline):** Permite ensamblar los clips (ordenables con drag-and-drop vía `@dnd-kit`), ajustar duración y aplicar fades.
3. **Reproducción Nivel Nativo vs Remotion:** La previsualización de UI en `index.tsx` emplea la etiqueta nativa `<video>` de HTML5 para evadir fallos de Remotion en móvil, mientras que la verdadera composición (texto, capas, overlays) se declara dentro de `MainComposition.tsx` usando componentes de `Remotion`.
4. **Scraping y Delogo (Herramientas IA):** `clean-video.ts` remueve marcas de agua y `extract-meta-video.ts` rastrea URLs directas MP4 para evadir el CORS (aunque Vercel usa proxy a oracle).
5. **Supervisor IA:** Se conecta a Gemini vía `/api/supervisor.ts` para interpretar intenciones humanas (prompts) y devolver código JavaScript (que usa la API `NaylaEngine`) para manipular el timeline automáticamente.

---

## 4. Oracle Service (`oracle-service/`)

Es un microservicio robusto alojado en una imagen Docker Alpine, independiente del frontend en Vercel, típicamente alojado en Coolify.

**¿Qué hace exactamente?**
1. **Recorte y Descarga de Video:** Escucha en `/api/process-clip`. Recibe una `videoUrl`, `startTime` y `endTime`. Enciende un proceso hijo con `yt-dlp` y `ffmpeg` para descargar únicamente la porción específica del video con alta precisión (`--force-keyframes-at-cuts`).
2. **Subida Asíncrona:** Una vez recortado (`/tmp`), lo sube a Supabase Storage y registra los metadatos en la tabla `memoria_nayla`. El endpoint devuelve un HTTP 202 Inmediato para evitar el límite de Timeout de Vercel.
3. **Extracción Proxy de Meta AI (`/api/extract-meta`):** Para evitar baneos de IP al hacer scraping desde servidores compartidos de Vercel, el endpoint de Vercel proxy-pasa la petición al Oracle. Este, con una IP distinta, hace el Fetch al HTML de la URL, aplica regex buscando enlaces `.mp4` de `fbcdn.net`, y devuelve la URL cruda lista para ser usada.

---

## 5. Problemas abiertos y bugs conocidos

### Archivos Patch Encontrados en la raíz:
Los siguientes archivos `.patch` indican modificaciones necesarias que corrigen diversos comportamientos en el código, los cuales fueron identificados previamente:

- `fix_supabase.patch`: Repara la inicialización de autenticación. En Mockups silenciosos previos, faltaba añadir la propiedad de escucha `onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })` para no quebrar Next.js con nulls.
- `update_video_state.patch`: Repara la discrepancia del estado `videoTerminado` vs `mediaActivaUrl`. Reemplaza las variables para asegurar que la UI referencie la nueva propiedad semántica `mediaActivaUrl`.
- `fix_timeline.patch`: Arregla problemas de estilo CSS y de Layout de flexbox en la línea de tiempo. Por ejemplo, agrega `style={{ display: 'flex' }}` a `filmstrip-container`.
- `fix_preview.patch`: Corrige dependencias de renderizado condicional. Asegura que el `timeline` solo pase el array `lineaDeTiempo` cuando haya items (`> 0`), e implementa un `preview` fallback (con metadata duration 30) si hay video o media activa.
- `fix_index.patch`: Varias correcciones CSS (eliminar highlight colors) y corrige que los botones de herramientas (`tool-btn`) y el play/pause cambien la directiva a `!important` y añadan `WebkitTextFillColor: 'white'` para forzar estilo blanco (minimalismo puro).

### Comentarios TODO/FIXME en el Código:
- `src/pages/api/ia-audio.ts` - Línea 40: `// TODO: Implementar llamada real a servicio de TTS (Texto a voz) usando la API Key.`
- Al revisar los archivos, las implementaciones para IA-Fotos (`ia-fotos.ts`) y la IA-Audio solo devuelven mocks.

---

## 6. Configuración de despliegue

1. **Vercel (`vercel.json`):** Configurado simplemente con `{"buildCommand": "next build"}`. Es el hosting principal del Next.js Frontend y Serverless Functions.
2. **Docker (`Dockerfile`):** Construye tres etapas (deps, builder, runner). La clave es que en la etapa `runner`, Alpine instala globalmente FFMPEG (`apk add --no-cache ffmpeg`), lo que permite que el API Route de Delogo/Render local en contenedores tenga el binario a la mano.
3. **3 Entornos Activos (Mencionados):**
   - **Frontend (Vercel):** Hospeda React UI y los API Routes proxy ligeros.
   - **Supabase:** Base de datos Postgres, sistema de Auth y Storage de medios.
   - **Oracle Server (Coolify):** Máquina virtual pesada corriendo el microservicio de `oracle-service` para no agotar RAM, CPU, y Timeouts de Serverless.

---

## 7. Autenticación y backend

El sistema de autenticación usa **Supabase Auth con OTP** (One Time Password):
- Cuando el usuario ingresa su email, Supabase envía un OTP.
- **Fixes recientes:** El app requería arreglar condiciones de carrera donde la UI dependía exclusivamente de `onAuthStateChange`. Ahora la subida a Storage llama dinámicamente a `await supabase.auth.getSession()` justo antes de subir para asegurar que el token JWT esté presente; si está logueado localmente sube el file a Supabase Storage en un bucket público (en lugar de Blobs locales perecederos).
- **Control de Roles:** Ciertas APIs (Supervisor, IA) comprueban que el email de la sesión coincida estrictamente con `ajn.liq.128@proton.me` (Admin) para permitir acceso a herramientas costosas delegadas al Oracle; de lo contrario operan con limitaciones gratuitas o mocks.

---

## 8. Configuración PWA

En la carpeta `/public` y layouts están configurados:
- **`manifest.json`**: Define la app con `display: "standalone"`, permitiendo que se instale nativamente en dispositivos móviles u ordenadores ocultando la barra del navegador, incluye configuración de background color e iconos.
- **`sw.js` (Service Worker)**: Implementa lógicas de caché offline para la aplicación.
- **`_document.tsx` y `_app.tsx`**: Inyectan los metadatos y hacen el registro (`navigator.serviceWorker.register('/sw.js')`) al montar la aplicación para dotar a la web de propiedades de app nativa.

---

## 9. Resumen de ANALISIS.md

El `ANALISIS.md` existente documenta que:
- **Supervisor IA está parcialmente implementado**: Conecta con Oracle pero no tiene capacidades de búsqueda "autónoma" en YouTube todavía; requiere URLs concretas.
- **El flujo deseado** "Pido video → IA busca → Oracle recorta → Bodega recibe → Línea ensambla" está cortado.
- Existen fallbacks como el Delogo que salta de modo local a Replicate, y luego a Fal.ai si algo falla.
- Explica fuertemente la segregación entre las IAs y por qué existe el Oráculo (el proxy de Meta y las descargas de `yt-dlp`).

---

## 10. Qué falta o está incompleto (Atención Urgente)

Basado en este análisis exhaustivo, estas partes están rotas o incompletas:

1. **Parches no aplicados (URGENTE):** Existen múltiples archivos `.patch` (`fix_timeline.patch`, `update_video_state.patch`, etc.) en la raíz del proyecto. Estos arreglan bugs visuales críticos (CSS, scrollbars, flexbox) y fallos lógicos graves (`videoTerminado` vs `mediaActivaUrl`). Si no se aplican, la UI principal (`index.tsx`) estará rota o con comportamientos erráticos.
2. **Sincronización Bodega-Oracle (Falta Lógica):** El Oráculo recorta videos y los inserta en la tabla `memoria_nayla`. Sin embargo, la UI (bodega) los lee desde `galeria_multimedia`. Falta un mecanismo que sincronice esto o un polling real que las mueva para que aparezcan en el frontend.
3. **Mocks de IA (Audio y Foto):** `/api/ia-fotos` devuelve URLs estáticas de *picsum.photos* y `/api/ia-audio` devuelve un MP3 de prueba estático. Ambas APIs necesitan integrarse a APIs reales (OpenAI TTS, ElevenLabs, Gemini).
4. **Búsqueda Autónoma de YT:** La IA no sabe todavía *cómo* buscar en YouTube. Necesita una implementación en el Backend que llame a la API de Búsqueda de YouTube antes de enviarle las URL al Oracle.
5. **Render de servidor local (`/api/render`)**: Intenta correr FFmpeg localmente para ensamblar videos. Si esto se ejecuta en Vercel (sin custom buildpacks), fallará por no encontrar el binario de FFmpeg. Debería delegarse al Oracle Service.

---
*Reporte autogenerado por Jules AI. Documento creado según solicitud.*