# AI First Repo System

Multi-agent architecture powered by @mariozechner/pi-coding-agent

## Arquitectura de Multiples Agentes

- **Director**: Delegación de tareas (solo lectura)
- **Researcher**: Investigación, lectura + writeReport
- **Planner**: Planificación técnica
- **Developer**: Implementación con tools de codificación
- **Validator**: Quality gate y validación

## Quick Start

```bash
npm install
npm run build
npm start
# o npm run dev para watch mode
```

## Requisitos del Sistema

- Node.js 18+ (ESM support)
- TypeScript ^5.9+
- Backend LLM compatible con @mariozechner/pi-ai

## Estructura de Proyectos

```
src/
├── index.ts                 # Entry point
├── main-agent.ts            # Orquestración de sesiones
├── sub-agents/              # Gestión de persistencia JSON
├── tools/                   # Herramientas por rol (read/write-report)
└── prompts/                # Prompts markdown por rol

dist/                       # TS compiled output
sessions/                   # Persistencia de sesiones JSON


```

## Seguridad del Workspace

- Validación de paths dentro de `/workspace/*`
- Bloqueo de comandos bash peligrosos (BLOCKED_BASH_PATTERNS)
- Persistencia de sesiones en directorio `sessions/`
- Directorio `.lock` protegido (inaccesible por diseño)

## Scripts Disponibles

```bash
npm run build          # Compilar TypeScript + prompts
npm run start          # Ejecutar app compilada
npm run dev            # Build + watch mode
npm run lint           # Run ESLint
npm run format         # Formatar con Prettier
```

## Dependencias Clave

- @mariozechner/pi-agent-core@0.56.3
- @mariozechner/pi-coding-agent@0.56.3
- @mariozechner/pi-tui@0.56.3

## Contribuyentes

- Mario Zechner (@mariozechner)
