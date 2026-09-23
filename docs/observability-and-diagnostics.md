# Observabilidad y Diagnóstico de Nayla

## Objetivo

Separar tres funciones diferentes para que una falla no derribe ni oculte las demás:

- **Sentry**: captura errores reales del navegador.
- **Playwright**: prueba automáticamente comportamientos críticos del editor.
- **Checkly**: vigila desde fuera que producción siga respondiendo.

El panel **Diagnóstico** es solo la vista privada del administrador. No guarda ni muestra secretos.

## Acceso privado

El icono **Diagnóstico** solo se renderiza para:

`jusntrader38@gmail.com`

La API `/api/diagnostics/health` vuelve a validar el correo usando el token Firebase. Ocultar el icono no es la única barrera.

## Sentry

La primera fase usa el Browser SDK Loader oficial de Sentry a partir de `NEXT_PUBLIC_SENTRY_DSN`.

Cobertura de esta fase:
- excepciones no controladas en el navegador;
- errores globales capturados por el SDK;
- prueba controlada desde Diagnóstico.

No se considera todavía instrumentación completa del servidor. La integración `@sentry/nextjs` y source maps se activarán en una fase separada para no mezclar observabilidad con cambios grandes del runtime.

## Playwright

El repositorio ya tenía `playwright`. Se añade `scripts/e2e-smoke.mjs` sin nuevas dependencias.

El smoke test levanta el editor en modo desarrollo y verifica:

`GENERAR -> API -> Imagen/Video/Audio/Música/3D -> volver -> GPU -> Imagen/Video/Audio/Música/3D -> cerrar`

También falla si el navegador genera una excepción no controlada.

## Checkly

Los secretos se leen únicamente desde GitHub Actions:

- `CHECKLY_API_KEY`
- `CHECKLY_ACCOUNT_ID`

Después de una actualización de `main`, el workflow crea una sola vez el monitor:

`Editor Nayla - Producción`

Ese monitor comprueba cada 10 minutos la disponibilidad pública del dominio estable de producción. La sincronización es idempotente por nombre: si ya existe, no crea duplicados.

La navegación autenticada completa en Checkly se añadirá cuando exista una credencial de prueba dedicada y segura. No se reutiliza la cuenta administrativa ni se incrustan contraseñas en scripts.

## Breakers

Observabilidad no se mezcla con GENERAR, Editor, Bóveda ni GPU. Cada pieza vive en su propio archivo o workflow. Si Checkly falla, Playwright y el editor continúan. Si Sentry no carga, el editor continúa. Si el panel Diagnóstico falla, las herramientas de edición continúan.
