# Observabilidad y Diagnóstico de Nayla

## Objetivo

El panel privado **DIAGNÓSTICO** combina cuatro señales sin acoplarlas al editor:

- **Sentry** recibe los errores del navegador.
- **Playwright** ejecuta el smoke test estructural de GENERAR.
- **Checkly** vigila producción desde fuera.
- **Supabase (naylacore)** guarda el estado actual y el historial corto del tablero.

Una falla en observabilidad no debe bloquear Editor, Bóveda, GENERAR, GPU ni Redes.

## Acceso privado

El icono **DIAGNÓSTICO** solo se renderiza para:

`jusntrader38@gmail.com`

La API vuelve a validar el token Firebase y el correo antes de entregar estado o abrir el stream. Las tablas de diagnóstico tienen RLS activado y deliberadamente no tienen políticas de navegador: solo el service role del backend puede leerlas o escribirlas.

## Flujo en vivo

```
Errores navegador ──────────────┐
Playwright / GitHub Actions ────┼──► API privada ─► Supabase ─► SSE privado ─► DIAGNÓSTICO
Checkly failure/recovery ───────┘
```

Los proveedores empujan los cambios hacia el backend. El navegador no consulta directamente las tablas privadas. El endpoint `/api/diagnostics/stream` mantiene un stream SSE autenticado y publica un snapshot cuando detecta cambios, aproximadamente cada 2,5 segundos. La conexión se recicla de forma controlada y el cliente reconecta automáticamente.

Se eligió SSE autenticado en lugar de exponer un canal Realtime público porque el editor usa sesión Firebase y las tablas de observabilidad contienen información operacional privada. Así mantenemos el service role y los secretos fuera del navegador.

## Tablas

### `diagnostic_events`

Historial de eventos con fuente, servicio, severidad, estado, mensaje, enlace externo y fecha.

### `diagnostic_status`

Último estado conocido por servicio:

- `editor`
- `sentry`
- `playwright`
- `checkly`

### `diagnostic_integrations`

Solo guarda hashes de secretos de callback. Nunca guarda la API key de Checkly.

## Sentry

`NEXT_PUBLIC_SENTRY_DSN` carga el Browser SDK de Sentry.

Además, `DiagnosticsClientReporter` escucha:

- `window.error`
- `unhandledrejection`

Cuando ocurre uno, el mismo error que Sentry puede capturar se refleja en `diagnostic_events` mediante una API autenticada con Firebase. Así el panel cambia en vivo sin necesitar un token administrativo de Sentry.

El botón **Enviar prueba** manda una excepción controlada a Sentry y al espejo del tablero.

> Pendiente opcional: conectar un Service Hook oficial de Sentry para reflejar también eventos procesados en backend/servidor. Crear ese hook requiere un token Sentry con `project:write`; el DSN por sí solo no concede ese permiso.

## Playwright

El repositorio usa `playwright` para comprobar:

`GENERAR -> API -> Imagen/Video/Audio/Música/3D -> GPU -> Imagen/Video/Audio/Música/3D -> cerrar`

Después de cada push a `main`, el workflow publica el resultado del job en el tablero. El estado puede ser correcto o fallido; el job de sincronización usa `always()` para que también se registre un fallo.

## Checkly

El workflow usa exclusivamente los GitHub Actions secrets:

- `CHECKLY_API_KEY`
- `CHECKLY_ACCOUNT_ID`

En cada push a `main`:

1. crea o reutiliza `Editor Nayla - Producción`;
2. registra de forma temporal un callback secreto nuevo en producción;
3. crea o actualiza el canal webhook `Nayla Diagnostics Realtime`;
4. suscribe el monitor a ese webhook;
5. Checkly empuja `FAILURE`, `DEGRADED` y `RECOVERY` al tablero.

La API key de Checkly se usa solamente durante el registro seguro y nunca se guarda en Supabase.

## Seguridad

- El panel solo aparece para el correo administrador.
- El stream requiere un token Firebase válido del administrador.
- Los errores de usuarios se aceptan solo con una sesión Firebase válida.
- Checkly firma su canal con un bearer aleatorio rotado en cada sincronización.
- En Supabase se almacena únicamente el SHA-256 del bearer.
- Los secretos Checkly siguen en GitHub Actions.
- `SUPABASE_SERVICE_ROLE_KEY` sigue únicamente en el servidor.

## Breakers

Cada pieza está separada:

- `src/lib/diagnosticStore.ts`: persistencia privada.
- `src/components/diagnostics/DiagnosticsClientReporter.tsx`: espejo de errores del navegador.
- `src/components/diagnostics/DiagnosticsWorkspace.tsx`: interfaz.
- `src/pages/api/diagnostics/*`: frontera autenticada.
- `scripts/sync-checkly-monitor.mjs`: configuración externa.
- `.github/workflows/monitoring-smoke.yml`: ejecución automática.

Si Checkly no responde, el editor continúa. Si Sentry no carga, el editor continúa. Si el stream se corta, se reconecta sin recargar la aplicación.
