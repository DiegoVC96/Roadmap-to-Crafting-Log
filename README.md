# Roadmap to Crafting Log

Una aplicación web progresiva para jugadores de **Final Fantasy XIV** que convierte el crafting log de las ocho profesiones de fabricación en un plan de progreso, recolección y compras accionable.

**Demo en vivo:** [roadmap-to-crafting-log.web.app](https://roadmap-to-crafting-log.web.app)
**Repositorio:** [DiegoVC96/Roadmap-to-Crafting-Log](https://github.com/DiegoVC96/Roadmap-to-Crafting-Log)

> Proyecto de producto diseñado y desarrollado como una experiencia responsive, instalable y con persistencia de progreso por usuario.

## El problema

Completar todos los crafting logs de FFXIV implica miles de recetas, materiales intermedios, fuentes de obtención y decisiones de inventario. La información suele estar fragmentada entre el juego, wikis, Market Board y listas manuales.

Roadmap to Crafting Log reúne ese flujo en una única herramienta: calcula lo necesario, expande dependencias de fabricación, muestra alternativas de obtención y mantiene el progreso del jugador sincronizado de forma segura.

## Funcionalidades principales

- Catálogo real de recetas para Carpenter, Blacksmith, Armorer, Goldsmith, Leatherworker, Weaver, Alchemist y Culinarian.
- Organización por recetas **Level-based**, **Special** y **Master**, con filtros por nivel y estado.
- Cálculo recursivo de materiales: transforma recetas intermedias en materiales base y suma las cantidades reales necesarias.
- Guía de obtención de materiales: recolección, NPC, misiones, enemigos y recetas de crafting relacionadas.
- Seguimiento individual de recetas, inventario, sesiones de farmeo y materiales pendientes.
- Lista inteligente de adquisición y comparación **fabricar vs. comprar**, con soporte para Mundo o Data Center y Market Board.
- Árbol de fabricación interactivo y reorganizable.
- Planificador de inventario para Free Trial: 140 espacios de inventario + 70 de Chocobo Saddlebag.
- Autenticación con Firebase, verificación de correo, recuperación de contraseña y progreso persistente por usuario.
- Control de acceso administrado: las nuevas cuentas requieren aprobación antes de usar el producto.
- Panel de administración con solicitudes actualizadas en tiempo real y avisos opcionales del navegador.
- Agentes internos para recomendar el próximo objetivo de crafting y auditar consistencia del catálogo.
- PWA responsive para escritorio, tablet y móvil.

## Arquitectura y tecnología

| Área | Solución |
| --- | --- |
| Frontend | React 19, TypeScript y Vite |
| Diseño | CSS responsive propio, pensado para escritorio y móviles |
| Datos del juego | XIVAPI y fuentes de obtención especializadas |
| Autenticación | Firebase Authentication |
| Persistencia | Cloud Firestore con reglas por usuario y administrador |
| Hosting | Firebase Hosting |
| Aplicación instalable | Web App Manifest y Service Worker |
| Calidad | ESLint, compilación TypeScript/Vite y GitHub Actions |

## Seguridad y acceso

Cada usuario conserva únicamente su propio progreso. Las reglas de Firestore limitan la lectura y escritura de progreso al usuario autenticado y aprobado. Las decisiones de acceso y el listado de solicitudes se reservan a administradores.

El Agente de datos también está disponible exclusivamente para administradores: ayuda a detectar recetas potencialmente mal clasificadas, íconos faltantes y materiales sin fuente registrada.

## Ejecución local

### Requisitos

- Node.js 24 LTS
- Una cuenta y proyecto de Firebase

### Instalación

```bash
git clone https://github.com/DiegoVC96/Roadmap-to-Crafting-Log.git
cd Roadmap-to-Crafting-Log
npm install
```

Copia `.env.example` como `.env.local` y completa los valores de tu aplicación web de Firebase.

```bash
npm run dev
```

## Comandos de calidad y publicación

```bash
# Lint + compilación de producción
npm run quality

# Publica en Firebase Hosting solo si la verificación anterior finaliza correctamente
npm run deploy:hosting
```

GitHub Actions ejecuta la misma puerta de calidad en cada pull request y en cada push a `main` o `dev`. Además, genera el artefacto de producción `dist` para su inspección antes del despliegue.

## Alcance de producto y colaboración

El proyecto muestra cómo convertir una necesidad compleja de comunidad o videojuego en una aplicación de producto completa: investigación de datos, UX de planificación, cuentas de usuario, administración, automatización de calidad y despliegue.

Si buscas construir un panel, tracker, herramienta interna, PWA o plataforma con datos externos, este repositorio demuestra una base sólida y extensible para ese tipo de producto.

## Aviso de propiedad intelectual

Roadmap to Crafting Log es un proyecto no oficial de la comunidad. FINAL FANTASY XIV, sus nombres, imágenes y contenido relacionado pertenecen a Square Enix. Este proyecto no está afiliado, respaldado ni patrocinado por Square Enix.
