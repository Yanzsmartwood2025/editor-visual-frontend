# Análisis Completo de NaylaCore (editor-visual-frontend)

## 🗺️ Mapa de Archivos

### Raíz del Proyecto
* `package.json` / `package-lock.json`: Archivos de configuración de dependencias de npm y scripts del frontend.
* `vercel.json`: Configuración de despliegue para Vercel, indica que el comando de compilación es `next build`.
* `tsconfig.json`: Configuración del compilador TypeScript.
* `.env.example`: Plantilla para las variables de entorno necesarias.

### Código Fuente Frontend (`src/`)
* `src/pages/_app.tsx`: Punto de entrada de la aplicación React (Next.js), normalmente gestiona el layout global o el SW.
* `src/pages/_document.tsx`: Estructura del documento HTML base, aquí se inyectan las configuraciones PWA.
* `src/pages/index.tsx`: **El núcleo (NaylaCore)**. Contiene la interfaz de usuario del editor de video, el timeline, la bodega (galería), conexión con Supabase y orquestación de herramientas IA, de delogo y scripting.
* `src/components/MainComposition.tsx`: Componente de Remotion encargado de componer el video real, renderizar los clips visuales con fades, audios y subtítulos, manejando el reproductor.
* `src/components/SortableTimelineItem.tsx`: Componente UI para arrastrar y soltar clips en la línea de tiempo, utilizando `@dnd-kit`.

### Código Fuente Backend (Next.js API - `src/pages/api/`)
* `src/pages/api/extract-meta-video.ts`: Extrae enlaces directos a videos (fbcdn.net) a partir de URLs públicas de Meta AI, haciendo web scraping ligero.
* `src/pages/api/supervisor.ts`: Funciona como un puente/proxy de seguridad. Comprueba permisos de Admin, busca la llave de Gemini en Supabase, y envía órdenes de procesamiento al `oracle-service`.
* `src/pages/api/clean-video.ts`: Recibe un video y unas coordenadas para difuminar marcas de agua (Delogo). Lo procesa localmente usando `ffmpeg` o externamente con los servicios de Replicate/Fal.
* `src/pages/api/ia-fotos.ts`: Endpoint destinado a generación de imágenes por IA. Valida permisos y busca la API Key, pero actualmente devuelve un **mock/simulación** (`https://picsum.photos`).
* `src/pages/api/ia-audio.ts`: Endpoint destinado a Text-to-Speech (TTS). Valida permisos y API Key, pero actualmente devuelve un **mock/simulación** de audio MP3.
* `src/pages/api/render.ts`: Realiza la exportación de una línea de tiempo juntando y concatenando los clips localmente en el servidor usando `ffmpeg` antes de subirlos a Supabase.

### Microservicio Externo (`oracle-service/`)
* `oracle-service/server.js`: Un servidor de Express que maneja descargas masivas y pesadas de video (usando `yt-dlp`) y subidas a Supabase Storage (bypasseando los límites de tiempo de Vercel).
* `oracle-service/package.json`: Dependencias del microservicio.
* `oracle-service/Dockerfile`: Instrucciones para construir el contenedor del microservicio con Node.js, `python3`, `ffmpeg` y `yt-dlp`.

---

## 🔌 APIs Existentes

| Endpoint | Qué Recibe (Body/Query) | Qué Hace | Qué Devuelve |
| :--- | :--- | :--- | :--- |
| **`/api/extract-meta-video`** | `url`: String (URL de Meta AI). | Consulta la URL, busca regex en el HTML para capturar la URL directa en formato `.mp4` del CDN `fbcdn.net`. | JSON con la URL directa del video (`{ videoUrl: '...' }`). |
| **`/api/supervisor`** | `videoUrl`, `startTime`, `endTime`, `clipName`, (auth en headers). | Verifica que el usuario sea el admin. Extrae la `GEMINI_API_KEY` desde Supabase y delega todo enviando un POST al Oracle Service (en `/api/process-clip`). | 202 Accepted con mensaje indicando que Oracle inició el job (`{ message: '...', oracleResponse: {...} }`). |
| **`/api/clean-video`** | Form Data: `video` (Archivo), `coordenadas` (JSON), `motor` ('local' o 'nube'). | Sube el video y aplica un filtro 'delogo' para eliminar marcas de agua. Si es 'local' usa FFmpeg; si es 'nube', llama a Replicate o Fal.ai. Sube el resultado temporalmente a Supabase. | URL del video limpio y el status/id del prediction. |
| **`/api/ia-fotos`** | `fotoBaseUrl`, `prompt`, `email`. | Chequea ser admin, recupera Gemini API key desde base de datos y supuestamente invoca un endpoint de generación de fotos. | **Actualmente:** Mock de JSON con URL estática (`https://picsum.photos`). |
| **`/api/ia-audio`** | `texto`, `email`. | Chequea ser admin, recupera Gemini API key desde base de datos y supuestamente invoca un endpoint de Text-To-Speech. | **Actualmente:** Mock de JSON con URL de audio MP3 estática. |
| **`/api/render`** | `pistaVideo` (Array de clips visuales). | Descarga los clips al server temporal, concatena los videos mediante FFmpeg y sube el video ensamblado maestro a Supabase. | URL pública del archivo final concatenado. |
| **`Oracle: /api/process-clip`** | `videoUrl`, `startTime`, `endTime`, `clipName`. `Bearer token` del Oracle Secret. | Usa `yt-dlp` para recortar y descargar exactamente esa fracción de video en segundo plano. Luego sube el archivo de salida a Supabase y lo inserta en `memoria_nayla`. | Retorna 202 Inmediatamente para evitar timeouts. |

---

## 🛠️ Estado de cada Feature

1. **Supervisor IA (`/api/supervisor`)**: **Parcialmente Implementada**.
   - El puente de seguridad y delegación al `oracle-service` **SÍ** está conectado (recupera llave de Gemini en Supabase e invoca Oracle).
   - En el frontend, la feature hace llamadas reales pidiendo prompt. Sin embargo, "IA busca en YouTube" no está completamente codificado para ser autónomo, es el usuario o un script que proporciona la URL en el frontend de antemano o a la IA le falta un componente directo que busque en YT en el backend.
2. **Oracle Service (`/api/process-clip`)**: **Completamente Implementada** (para recortes).
   - *¿Puede buscar en YouTube?* **NO explícitamente.** Su código usa `yt-dlp` y le pasa la URL que le llega por el request (`videoUrl`). Si le envías una URL genérica de YT, `yt-dlp` puede descargarla, pero el servicio en sí "no busca", solo descarga y recorta de las URLs específicas que recibe.
3. **Búsqueda de videos (Meta AI/Extract Meta)**: **Completamente Implementada**.
   - El script sabe cómo raspar enlaces MP4 y evadir el CORS para inyectarlos en la galería.
4. **Generación de Fotos (`/api/ia-fotos`)**: **Solo UI sin Backend Real**.
   - El backend existe, valida seguridad, busca keys en BD, pero retorna explícitamente un placeholder (`https://picsum.photos`). No hay llamada real a un endpoint generativo.
5. **Generación de Audio (`/api/ia-audio`)**: **Solo UI sin Backend Real**.
   - Al igual que fotos, verifica seguridad y llaves, pero devuelve un MP3 estático (SoundHelix). No llama a servicios de TTS.
6. **Delogo (`/api/clean-video`)**: **Completamente Implementada**.
   - Sí funciona de verdad. Tiene fallback de motores: Si es local corre `ffmpeg -vf delogo`, si es nube, invoca APIs de Replicate (Fast Video Inpaint) y/o Fal.ai.

---

## 🔐 Integración de Cerebro IA y API Keys

- El cerebro IA principal usado es **Gemini**.
- **No se usan variables de entorno estáticas obligatorias (aunque hay fallbacks).** Las llaves están en Supabase, en la tabla `api_keys_pool`.
- **Estructura de cómo lo consulta el backend (Ej. en supervisor):**
  ```javascript
  const { data: keys } = await supabase
      .from('api_keys_pool')
      .select('*')
      .eq('service_provider', 'gemini')
      .eq('resource_type', 'ia')
      .single();
  ```
- **Tabla identificada**: `api_keys_pool`. Campos inferidos por su uso: `service_provider` (texto), `resource_type` (texto), `api_key` (texto).

---

## 📝 Variables de Entorno Necesarias

| Variable | Descripción |
| :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase para inicializar el cliente en frontend/backend. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Llave anónima pública de Supabase. |
| `SUPABASE_URL` | Igual a la pública, pero usada a veces en contextos de backend. |
| `SUPABASE_SERVICE_ROLE_KEY` | Llave privada (admin) de Supabase para evadir RLS y consultar tablas protegidas (ej. `api_keys_pool`) en API Routes de Next.js. |
| `ORACLE_SERVER_URL` | URL donde el microservicio de Docker de Node.js (oracle-service) está corriendo (IP o dominio Coolify). |
| `ORACLE_SECRET` | Token secreto utilizado como contraseña tipo Bearer token entre Vercel (`supervisor.ts`) y el microservicio Oracle. |
| `GEMINI_API_KEY` | Variable de emergencia (fallback) por si Supabase no responde o el query a `api_keys_pool` falla. |
| `REPLICATE_API_TOKEN` | Token para llamar a Replicate (usado en el Delogo remoto de la nube). |
| `FAL_KEY` | Token de respaldo para llamar a Fal.ai si Replicate falla en el Delogo. |
| `PORT` | *(Solo oracle-service)*. El puerto en el cual arranca Express (por defecto 3001). |

---

## 📦 Dependencias Externas (Servicios y Binarios)

1. **Supabase (BaaS)**: Maneja Auth (OTP por email), Base de Datos (almacena timeline, galería, api_keys_pool) y Storage (guarda clips limpios, renders, etc.).
2. **Oracle Server (Coolify/Docker)**: Servidor Alpine con `ffmpeg` (edición, delogo) y `yt-dlp` (descargas crudas).
3. **Replicate / Fal.ai**: Servicios de inferencia para borrar marcas de agua mediante IA (Fast Video Inpaint).
4. **Google Gemini**: Utilizado lógicamente para generar las instrucciones JS (prompts a la IA en UI que luego arman código para Remotion/NaylaEngine).
5. **Remotion (`@remotion/player`)**: Motor clave de react para visualizar la línea de tiempo a partir de código, no de elementos `<video>` estándar, previniendo cuelgues.

---

## 🚦 Lo que falta para completar el Flujo Principal

**Flujo Deseado:** Usuario pide video → IA busca en YT → Oracle recorta → Clips aparecen en bodega → IA arma timeline → Usuario edita/exporta.

### Gaps / Funcionalidades Faltantes:
1. **La búsqueda real y proactiva de la IA en YouTube NO existe**:
   - El código en frontend envía el prompt a `/api/supervisor`, pero el supervisor asume que ya se le pasa la variable `videoUrl`, `startTime` y `endTime`.
   - **Qué falta**: Un módulo de IA en `supervisor.ts` (llamando a Gemini o un Google Custom Search/YouTube Data API) que traduzca el prompt *"Busca un video de perritos y recorta del 00:10 al 00:20"* en variables concretas (`videoUrl`, `start`, `end`). Actualmente recibe esos parámetros ya "masticados".
2. **Autosincronización Bodega-Oracle**:
   - `Oracle Service` inserta el clip en la tabla `memoria_nayla`. Pero el frontend `index.tsx` carga la galería desde `galeria_multimedia`.
   - **Qué falta**: Un disparador (Webhook / Supabase trigger / Polling explícito) que detecte la inserción en `memoria_nayla`, mueva/referencie la URL y la inserte como nuevo item (MediaItem) en el state `galeriaMultimedia` para que "aparezca automáticamente en la bodega".
3. **Generación real de imágenes y audios TTS**:
   - Si la IA en el futuro necesita agregar una voz en off sobre los perritos, las APIs de `ia-audio` y `ia-fotos` tienen que dejar de ser mocks (`picsum`/`soundhelix`) y llamar de verdad a OpenAI (TTS) o ElevenLabs, y Dall-E/Midjourney/Gemini.
4. **Validación robusta del "Render Maestro" (`/api/render`)**:
   - La API concatena videos localmente, pero en un entorno sin estado como Vercel y sin dependencias instaladas de FFmpeg (`ffmpeg -y -f concat`), este endpoint fallará rotundamente a menos que Vercel incluya una build pack de FFmpeg, de lo contrario esto debería delegarse también al Oracle Service.

**Conclusión del Flujo:** El pipeline y la UI están construidos y conectados, pero la inteligencia de orquestación (que la IA de verdad decida qué buscar y pase los parámetros al oracle) está incompleta, y hay desajustes en tablas (memoria_nayla vs galeria_multimedia) y mocks de las IAs secundarias.
