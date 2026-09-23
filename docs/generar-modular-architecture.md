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
