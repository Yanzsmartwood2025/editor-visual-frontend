# Arquitectura modular de GENERAR

## Principio Breaker
GENERAR se construye como un edificio con departamentos independientes. Cada módulo debe poder cargarse, ejecutarse, fallar y desmontarse sin mantener activos ni derribar los demás módulos o el editor.

## Entrada
La antigua entrada principal 3D se reemplaza por GENERAR. El 3D pasa a ser una categoría interna y no se elimina.

## Árbol
- GENERAR
  - API
    - Imagen
    - Video
    - Audio
    - Música
    - 3D
  - GPU
    - Imagen
    - Video
    - Audio
    - Música
    - 3D

## Reglas obligatorias
1. Cada categoría vive en su propia carpeta y componente.
2. API y GPU son ramas independientes.
3. Los módulos pesados se cargan con lazy loading únicamente al entrar en ellos.
4. Al cambiar de módulo, el módulo anterior se desmonta. No se oculta simplemente con CSS.
5. Cada módulo se ejecuta dentro de un error boundary (ModuleBreaker). Un fallo local no debe tumbar GENERAR ni el editor.
6. Un módulo no debe iniciar listeners, timers, conexiones, polling, GPU jobs o solicitudes mientras no esté activo.
7. Todo efecto creado por un módulo debe tener cleanup al desmontarse.
8. Servicios compartidos permitidos: autenticación, Bóveda, navegación y contratos comunes. La lógica específica del proveedor permanece dentro de su módulo/adaptador.
9. Las conexiones reales API/GPU se habilitan una por una y se prueban antes de activar la siguiente.
10. index.tsx sólo monta el workspace. La implementación de GENERAR no debe volver a concentrarse allí.

## Fase 1
Esta fase crea únicamente la estructura, navegación, aislamiento y placeholders. No declara como operativa ninguna API/GPU que todavía no haya sido conectada y probada.

## Siguiente fase
Activar módulos individualmente, empezando por uno solo, con flujo completo entrada -> proceso -> resultado -> Bóveda, antes de continuar con el siguiente.


## Fase 2 — API Imagen

Primera activación funcional:

- Toda la navegación de GENERAR adopta el mismo lenguaje visual de cristal y glow del editor.
- API -> Imagen deja de ser placeholder.
- Flujo: prompt -> preparar trabajo -> confirmación explícita -> ejecutar Nayla Cloud -> polling aislado -> resultado en Bóveda -> USAR EN EDITOR -> timeline.
- El proveedor real permanece oculto detrás de Nayla Cloud.
- Si el módulo se desmonta, se aborta el seguimiento en el navegador.
- La generación no arranca hasta que el usuario pulsa CONFIRMAR Y GENERAR.
- Las demás ramas continúan aisladas y se activarán una por una.

La siguiente activación funcional debe hacerse en un PR separado, sin convertir GenerarWorkspace en un componente monolítico.


## Fase 2 — API Video

Segunda activación funcional:

- API -> Video usa el mismo shell de cristal y los mismos breakers que Imagen.
- Flujo: prompt -> preparar -> confirmación -> generación -> Bóveda -> USAR EN EDITOR -> timeline.
- El seguimiento se cancela al desmontar el módulo.
- El selector de proveedor permanece en el backend de Nayla Cloud.
- Los botones principales y tarjetas respetan las variables globales de cristal, blur y glow del editor.

## Fase 3 — API Audio

Tercera activación funcional:

- API -> Audio activa primero **Texto -> voz**, separado de Música.
- Idiomas iniciales: español e inglés.
- Nayla Cloud elige entre las rutas TTS realmente configuradas (Deepgram, Cartesia o ElevenLabs) sin exponer claves ni marcas al usuario final.
- Flujo: texto -> idioma -> preparar -> confirmación -> generar -> Bóveda -> USAR EN EDITOR -> pista de audio.
- El audio generado se puede escuchar dentro del módulo antes de enviarlo al editor.
- El resultado se guarda como audio privado en la Bóveda y utiliza la misma ruta unificada de inserción al timeline.
- Al salir, el polling/solicitud del módulo se cancela y el resto de GENERAR permanece desmontado.
- Transcripción, cambio de voz y otras operaciones de audio se mantienen como capacidades futuras dentro de este mismo breaker, sin mezclarlas con Música.

La siguiente activación funcional será API -> Música en un PR separado.


## Fase 4 — API Música

Cuarta activación funcional:

- API -> Música deja de ser placeholder y permanece separada de Audio/voz.
- Flujo: descripción musical -> preparar -> confirmación -> generar -> Bóveda -> escuchar -> USAR EN EDITOR -> pista de audio.
- Nayla Cloud selecciona una ruta de música configurada (fal.ai o ElevenLabs) sin exponer credenciales.
- El módulo reutiliza el mismo lenguaje de cristal, blur y glow del editor.
- El resultado se guarda como audio privado y entra al timeline por la ruta unificada.
- El trabajo y su polling se cancelan al desmontar el módulo.
- La generación no empieza hasta la confirmación explícita del usuario.

La siguiente activación funcional de la rama API será 3D, reutilizando las capacidades 3D existentes sin duplicar el workspace.


## Fase 5 — API 3D + Estudio compartido

Quinta activación funcional:

- API -> 3D deja de ser placeholder.
- Texto -> 3D usa Nayla Cloud con las rutas 3D configuradas (Tripo, Meshy o fal.ai cuando corresponda).
- Flujo: descripción -> preparar -> confirmar -> generar -> Bóveda 3D -> abrir en Estudio.
- El resultado GLB se incorpora al mismo estado de modelos 3D que ya usa el editor; no se crea una segunda biblioteca paralela.
- El Estudio 3D existente se reutiliza dentro de GENERAR. El visor, subida GLB, selección, borrado, animaciones y acciones avanzadas siguen viviendo en `Model3DWorkspace`.
- En modo embebido el Estudio adopta cristal, blur, glow y bordes del resto de Nayla.
- El creador Texto -> 3D de GENERAR es independiente del visor; al salir se desmonta y cancela el polling.
- Se mantiene temporalmente la ruta antigua `mainNav === '3d'` como compatibilidad interna hasta terminar las pruebas de migración; la interfaz principal ya entra por GENERAR.

Con esto la rama API tiene Imagen, Video, Audio, Música y 3D activados de forma modular. La siguiente etapa es activar la rama GPU módulo por módulo.


## Fase 6 — GPU Música

Primera activación funcional de la rama GPU:

- GPU -> Música usa la receta concreta `ace-step-music` con ACE-Step 1.5.
- Antes de alquilar una máquina, Nayla Compute cotiza las tarjetas compatibles y muestra precio por hora + tope estimado.
- El usuario elige una tarjeta y confirma. La misma selección se vuelve a verificar justo antes de reservar.
- Duraciones iniciales: 15, 30 y 60 segundos, instrumental.
- Flujo: descripción -> cotizar -> elegir GPU -> confirmar -> generar -> R2/Bóveda -> cierre automático de GPU -> escuchar -> USAR EN EDITOR -> pista de audio.
- El navegador deja de hacer polling al salir del módulo; el trabajo servidor conserva su vencimiento y limpieza automática.
- La UI de cotización vive en un componente compartido `GpuQuotePanel` para reutilizarlo en GPU 3D sin duplicar lógica visual.

### Capacidades GPU todavía no activadas

- GPU Imagen: infraestructura genérica existe, pero todavía no hay receta/worker concreto aprobado.
- GPU Video: infraestructura genérica existe, pero todavía no hay receta/worker concreto aprobado.
- GPU Audio/Voz: infraestructura genérica existe, pero todavía no hay receta/worker concreto aprobado.
- GPU 3D: sí existe la receta concreta `triposr-image-to-3d`; es la siguiente activación.


## Fase 7 — GPU 3D

Segunda activación funcional de la rama GPU:

- GPU -> 3D usa la receta concreta `triposr-image-to-3d`.
- La imagen de entrada se elige directamente desde las fotos privadas de la Bóveda; si el usuario ya tenía una foto seleccionada, Nayla la prioriza.
- Flujo: elegir foto -> cotizar -> elegir GPU -> confirmar -> TripoSR -> GLB en R2/Bóveda -> cierre automático -> abrir en Estudio 3D.
- La cotización reutiliza `GpuQuotePanel`; no se duplica la UI de selección de GPU.
- El resultado se incorpora al mismo `Model3DWorkspace` compartido por API 3D y el editor.
- El Estudio conserva subida GLB, selección, borrado, cámara, rotación, animaciones y acciones avanzadas.
- Salir del módulo cancela el polling del navegador sin dejar otros módulos pesados activos.

### Estado de la rama GPU tras esta fase

- Música: ACTIVO — ACE-Step.
- 3D: ACTIVO — TripoSR Imagen -> 3D.
- Imagen: PENDIENTE — falta receta/worker concreto aprobado.
- Video: PENDIENTE — falta receta/worker concreto aprobado.
- Audio/Voz: PENDIENTE — falta receta/worker concreto aprobado.

Los tres módulos pendientes no se marcan como activos solo porque exista infraestructura genérica; se activarán cuando tengan worker y flujo completo verificado.
