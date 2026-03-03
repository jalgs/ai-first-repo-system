# AI-First Repo Protocol — Arquitectura de Implementación

## Distinción fundamental: dos repos

Este documento describe la implementación de una **herramienta** (`arr` — ai-first-repo-protocol). Esa
herramienta opera **sobre repos ajenos** (repos target). Son dos cosas completamente distintas.

## ```

arr/                          ← NUESTRO REPO (la herramienta que construimos)
src/
package.json
...

some-target-repo/             ← REPO TARGET (donde se aplica el protocolo)
.context/                   ← Capa 0, creada por arr bootstrap
src/
index.md                  ← Capa 1, creada por arr bootstrap
AGENTS.md                   ← proxy a .context/index.md
...
```

Todo lo que sigue describe la arquitectura de `arr` y cómo opera sobre repos target.

## ---

## El stack tecnológico

`arr` se construye usando el SDK de pi, no como extensión del CLI pi. Esta distinción es crítica.

```
arr (nuestra CLI TypeScript)
└── usa como librería:
├── @mariozechner/pi-coding-agent   SDK principal
├── @mariozechner/pi-agent-core     Loop de agente, tools
└── @mariozechner/pi-ai             API unificada LLM
```

**Por qué SDK y no extensión CLI**


Las extensiones de pi operan *dentro* del ciclo de vida de un único agente. Nuestro orquestador coordina
*entre* múltiples agentes con roles distintos, ciclos de vida distintos y tool sets distintos. Eso requiere
control programático completo que solo el SDK proporciona.

Las extensiones sí tienen su rol: implementan comportamientos que operan *dentro* de cada agente
(inyección de contexto, protección del contrato). Son complementarias al SDK, no alternativas.

## ---

## El lifecycle real de pi (Extensions API)

## ```

session inicia
└─► session_start

usuario envía prompt
├─► input            (puede interceptar, transformar o manejar)
├─► before_agent_start  (puede inyectar mensaje, modificar system prompt)
└─► agent_start
│
└─► loop de turns (se repite mientras el LLM llama tools)
├─► turn_start
├─► context       ← puede reescribir el array de mensajes completo
│
│   LLM responde, puede llamar tools:
├─► tool_call     ← puede bloquear
├─► tool_execution_start / update / end
├─► tool_result   ← puede modificar
└─► turn_end
│
└─► agent_end

eventos de sesión:
session_before_compact / session_compact
session_before_switch  / session_switch
session_before_fork    / session_fork
```

El evento `context` es el motor de la inyección dinámica de Capa 1. Dispara antes de cada llamada al LLM y
permite reescribir completamente los mensajes. El evento `tool_call` es el mecanismo de protección del
contrato.


## ---

## Modos de ejecución

`arr` tiene tres modos de ejecución con propósitos y arquitecturas distintos.

```bash
arr bootstrap    # Construir el contrato desde cero en un repo target
arr audit        # Auditoría integral del contrato existente
arr work <tarea> # Flujo operativo de trabajo (la máquina de estados)
```

Cada modo crea sus propios `AgentSession` con configuración específica. Ningún modo comparte sesiones
con otro.

## ---

## Modo operativo: la máquina de estados

El corazón de `arr`. Coordina múltiples `AgentSession` en el repo target.

### El orquestador

```typescript
import {
createAgentSession,
SessionManager,
readOnlyTools,
codingTools,
} from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";

class Orchestrator {
private targetDir: string;
private stateFile: string;

constructor(targetDir: string) {
this.targetDir = targetDir;
this.stateFile = `${targetDir}/.arr/session-state.json`;
}


async run(intent: string) {
await this.initSessionState(intent);

// Cargar siempre: Capa 0 + nodo raíz Capa 1
const baseContext = await this.loadBaseContext();

// Fase inicial: análisis
await this.runPhase("analysis", baseContext);
}

private async runPhase(phase: Phase, context: BaseContext) {
const session = await this.createAgentForPhase(phase, context);

// Suscribirse a eventos para detectar señal de transición
session.subscribe(async (event) => {
if (event.type === "agent_end") {
const signal = await this.readSignalFromState();
if (signal) {
await this.transition(signal, context);
}
}
});

const prompt = this.buildPhasePrompt(phase, context);
await session.prompt(prompt);
}

private async transition(signal: Signal, context: BaseContext) {
switch (signal.tipo) {
case "completado":
if (signal.origen === "validation") {
await this.runAuditPhase(context);
} else {
await this.runPhase(signal.destino, context);
}
break;

case "escalado_humano":
case "violación_convención":
// El humano responde via CLI


const decision = await this.promptHuman(signal);
await this.recordDecision(signal, decision);
await this.runPhase(signal.destino, context);
break;

case "rechazo":
await this.runPhase(signal.destino_recomendado, context);
break;
}
}
}
```

### Creación de AgentSession por fase

Cada fase tiene su propio `AgentSession` con system prompt, tools y extensiones específicos.

```typescript
private async createAgentForPhase(phase: Phase, context: BaseContext) {
const model = getModel("anthropic", "claude-opus-4-5");

// System prompt cargado desde nuestros agentes predefinidos
const systemPrompt = await this.loadAgentPrompt(phase);

// Tools según la fase
const tools = this.getToolsForPhase(phase);

// Extensions que operan dentro de este agente
const extensions = this.getExtensionsForPhase(phase);

const { session } = await createAgentSession({
cwd: this.targetDir,           // ← CRÍTICO: opera en el repo target
model,
systemPrompt,
tools,
extensions,
sessionManager: SessionManager.create(this.targetDir),
});

return session;
}


private getToolsForPhase(phase: Phase) {
switch (phase) {
case "analysis":
return readOnlyTools;        // Solo lectura, no toca código
case "planning":
return readOnlyTools;        // Solo planifica, no ejecuta
case "development":
return codingTools;          // Read + write + edit + bash
case "validation":
return readOnlyTools;        // Lee y ejecuta tests via bash
case "audit":
return [...readOnlyTools, this.contractWriteTool()]; // Solo escribe en .context/
}
}
```

### La extensión de contexto dinámico (Capa 1)

Esta extensión se carga en cada AgentSession. Opera en el evento `context` para inyectar nodos de Capa 1
relevantes para la fase activa.

```typescript
// src/extensions/dynamic-context.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function dynamicContextExtension(
targetDir: string,
getSessionState: () => SessionState
) {
return function(api: ExtensionAPI) {
api.on("context", async (event) => {
const state = getSessionState();
const activeAgent = state.estadoActual.agente;
const refs = state.contextDocumentalCurado
.filter(ref => ref.para.includes(activeAgent));

if (refs.length === 0) return;

// Construir inyección quirúrgica: solo las dimensiones relevantes
const injection = await buildContextInjection(refs, targetDir);


// Reescribir mensajes inyectando el contexto documental
return {
messages: injectAsSystemContext(event.messages, injection)
};
});
};
}
```

### La extensión de protección del contrato

```typescript
// src/extensions/contract-guard.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function contractGuardExtension(
targetDir: string,
getSessionState: () => SessionState,
promptHuman: (proposal: ContractProposal) => Promise<boolean>
) {
return function(api: ExtensionAPI) {
api.on("tool_call", async (event) => {
const isWriteToContext = isContractWrite(event, targetDir);
if (!isWriteToContext) return;

const state = getSessionState();

// Solo el agente auditor puede escribir al contrato
if (state.estadoActual.agente !== "audit") {
return { block: true };
}

// El auditor necesita confirmación humana explícita
const proposal = parseContractProposal(event);
const approved = await promptHuman(proposal);

if (!approved) return { block: true };

// Registrar la aprobación en el estado de sesión
await recordContractChange(proposal, state);


## });

## };

## }

function isContractWrite(event: ToolCallEvent, targetDir: string): boolean {
const writingTools = ["write", "edit"];
if (!writingTools.includes(event.toolName)) return false;

const targetPath = event.args?.path || event.args?.file_path || "";
const contextPath = `${targetDir}/.context`;

return targetPath.startsWith(contextPath);
}
```

---

## Estado de sesión

El estado de sesión vive en el repo target, no en el nuestro. Es un fichero JSON que el orquestador lee y
escribe entre fases.

## ```

[repo target]/.arr/
sessions/
{session-id}/
state.json      ← estado semántico del protocolo (gitignored)
session-state.json  ← apunta a la sesión activa (gitignored)
```

El estado de sesión tiene esta estructura:

```typescript
interface SessionState {
// Inmutable
intent: string;
sessionId: string;
startedAt: number;

// Contexto base cargado al inicio
baseContext: {


capa0: string;           // Contenido de .context/index.md
rootNode: string;        // Contenido de src/index.md (nodo raíz Capa 1)
};

// Construido por el agente de análisis
contextDocumentalCurado: Array<{
nodo: string;
dimension: string;
razon: string;
para: AgentRole[];
}>;

// Registro de iteraciones (append-only)
iteraciones: Array<{
n: number;
fase: AgentRole;
output: string;
señal: Signal;
timestamp: number;
}>;

// Decisiones (append-only)
decisiones: Array<{
tipo: "autonoma" | "escalada";
descripcion: string;
resolucion?: string;
timestamp: number;
}>;

// Violaciones autorizadas (append-only)
violacionesAutorizadas: Array<{
convencion: string;
razon: string;
alcance: string;
autorizadaPor: "human";
timestamp: number;
}>;

// Plan vigente (reemplazable con referencia al anterior)
planVigente: {
contenido: string;


producidoEnIteracion: number;
reemplazaA?: number;
};

// Señales para el auditor (append-only)
señalesContrato: Array<{
tipo: string;
descripcion: string;
timestamp: number;
}>;

// Estado actual
estadoActual: {
agente: AgentRole;
fase: string;
pendiente?: string;
};
}
```

---

## Modo bootstrap

Bootstrap es un modo de ejecución separado, no parte del flujo operativo. Tiene su propio orquestador
especializado.

```typescript
class BootstrapOrchestrator {
constructor(private targetDir: string) {}

async run() {
// Fase 1: Análisis exhaustivo por pasadas
const analysisResult = await this.runAnalysisPhase();

// Fase 2: Extracción de conocimiento tácito
const tacitKnowledge = await this.runInterrogationPhase(analysisResult);

// Construir el contrato inicial
await this.buildInitialContract(analysisResult, tacitKnowledge);
}


private async runAnalysisPhase(): Promise<AnalysisResult> {
// AgentSession de solo lectura con bash
// Ejecuta las 6 pasadas progresivas:
// 1. Estructura (árbol de directorios)
// 2. Superficie (AST: imports, exports, firmas)
// 3. Dependencias (grafo de dependencias)
// 4. Historia (git log, blame, frecuencia)
// 5. Profundidad selectiva (zonas críticas)
// 6. Síntesis (documento de análisis interno + mapa de incógnitas)

const { session } = await createAgentSession({
cwd: this.targetDir,
tools: readOnlyTools,
systemPrompt: BOOTSTRAP_ANALYSIS_PROMPT,
sessionManager: SessionManager.inMemory(),
});

await session.prompt(ANALYSIS_INSTRUCTIONS);

const incognitaMap = await this.extractIncognitaMap(session);
return incognitaMap;
}

private async runInterrogationPhase(analysis: AnalysisResult) {
// Fase A: Marcos de activación (volcado proactivo del humano)
const proactiveKnowledge = await this.runActivationFrames();

// Fase B: Interrogatorio dirigido por incógnitas
const interrogationKnowledge = await this.runDirectedInterrogation(
analysis,
proactiveKnowledge
);

// Pregunta de cierre — siempre, sin excepción
const closingKnowledge = await this.askClosingQuestion();

return merge(proactiveKnowledge, interrogationKnowledge, closingKnowledge);
}
}
```


### Los marcos de activación

Preguntas diseñadas para activar conocimiento tácito antes del interrogatorio dirigido:

```typescript
const ACTIVATION_FRAMES = [
"¿Qué le dirías a alguien en su primer día trabajando en este repo que no está en el código?",
"¿Hay algo que hayas tenido que explicar más de una vez a personas distintas?",
"¿Qué es lo que más miedo te da que alguien rompa sin darse cuenta?",
"¿Hay restricciones que vienen de fuera del equipo técnico: negocio, legal, cliente?",
"¿Hay algo que esté así por razones históricas que ya no existen pero que no se ha cambiado?",
"¿Hay planes futuros que condicionan cómo está estructurado esto ahora?",
"¿Qué se intentó antes de llegar a la solución actual, y por qué no funcionó?",
];

const CLOSING_QUESTION =
"Hemos analizado el repo y hemos hablado durante este tiempo. " +
"¿Hay algo importante que no hayamos tocado y que alguien debería saber para trabajar bien aquí?";
```

---

## Modo auditoría integral

Análisis diferencial desde el último checkpoint. Solo examina el delta.

```typescript
class AuditOrchestrator {
constructor(private targetDir: string) {}

async run() {
const lastCheckpoint = await this.loadLastCheckpoint();
const delta = await this.computeDelta(lastCheckpoint);

if (delta.isEmpty()) {
console.log("No hay cambios significativos desde la última auditoría.");
return;
}

// Análisis diferencial: solo el delta, no el repo completo


const divergences = await this.analyzeWithDelta(delta);

// Interrogatorio focalizado en divergencias
const updates = await this.focusedInterrogation(divergences);

// Proponer actualizaciones quirúrgicas al contrato
await this.proposeContractUpdates(updates);
}

private async computeDelta(lastCheckpoint: Checkpoint): Promise<Delta> {
// git log --since=lastCheckpoint
// Detecta tres tipos de divergencia:
// 1. Contrato desactualizado: repo cambió, contrato no
// 2. Contrato obsoleto: documenta algo que ya no existe
// 3. Gaps nuevos: conocimiento tácito nuevo no capturado
const { session } = await createAgentSession({
cwd: this.targetDir,
tools: readOnlyTools,
systemPrompt: AUDIT_ANALYSIS_PROMPT,
sessionManager: SessionManager.inMemory(),
});

// Bash: git log --since, git diff, etc.
await session.prompt(`Analiza los cambios desde ${lastCheckpoint.date}`);
return await this.extractDelta(session);
}
}
```

### Cuándo se activa la auditoría integral

No en tiempo fijo. Orientada a eventos:

```typescript
function shouldTriggerAudit(targetDir: string): AuditReason | null {
const state = loadProtocolState(targetDir);

// Demasiadas señales de cambio de contrato sin resolver
if (state.pendingContractSignals.length > THRESHOLD_SIGNALS) {
return "accumulated_signals";
}


// Cambio arquitectónico mayor detectado en git
if (hasArchitecturalChange(targetDir, state.lastAuditCommit)) {
return "architectural_change";
}

// Mínimo garantizado
if (daysSinceLastAudit(state) > MAX_DAYS_WITHOUT_AUDIT) {
return "periodic_guarantee";
}

return null;
}
```

---

## Cómo .context/ se integra con pi CLI

Los repos target que usen `arr` también deben ser utilizables directamente con pi CLI por cualquier
desarrollador. El mecanismo es AGENTS.md.

## ```

[repo target]/
AGENTS.md              ← cargado automáticamente por pi CLI
.context/
index.md             ← la Constitución completa
operativa.md
convenciones.md
dependencias.md
skills/
index.md
skill-XXX.md
```

AGENTS.md en el repo target contiene una referencia explícita:

```markdown
<!-- AGENTS.md -->
Este repositorio usa AI-First Repo Protocol.
La Constitución del repositorio está en .context/index.md


[contenido resumido de .context/index.md aquí,
o instrucción para leerlo si el agente no lo cargó automáticamente]
```

Cuando un desarrollador usa pi CLI directamente (sin `arr`), pi carga AGENTS.md automáticamente y el
agente tiene acceso a la Constitución. Las dimensiones detalladas de Capa 1 no se cargan automáticamente
en ese caso, pero el agente sabe que existen y puede leerlas bajo demanda.

---

## Estructura del repo de nuestra herramienta

```
arr/                              ← NUESTRO REPO
├── src/
│ ├── cli.ts                    ← Entry point: arr bootstrap | arr audit | arr work
│ ├── orchestrator/
│ │ ├── work-orchestrator.ts  ← Máquina de estados operativa
│ │ ├── bootstrap-orchestrator.ts
│ │ └── audit-orchestrator.ts
│ ├── agents/
│ │ ├── analysis.md           ← System prompt del Agente de Análisis
│ │ ├── planning.md
│ │ ├── development.md
│ │ ├── validation.md
│ │ ├── audit.md
│ │ ├── bootstrap.md
│ │ └── audit-integral.md
│ ├── extensions/
│ │ ├── dynamic-context.ts    ← Inyección de Capa 1 via evento `context`
│ │ └── contract-guard.ts     ← Protección del contrato via evento `tool_call`
│ ├── state/
│ │ ├── session-state.ts      ← Gestión del estado de sesión
│ │ └── protocol-state.ts     ← Estado del protocolo en el repo target
│ └── contract/
│ ├── reader.ts             ← Lee .context/ del repo target
│ ├── writer.ts             ← Escribe .context/ con aprobación humana
│ └── auditor.ts            ← Detecta drift entre contrato y código
├── package.json
└── README.md


## ```

## ---

## Lo que vive en el repo target (puesto por arr)

## ```

[repo target]/
├── AGENTS.md                     ← proxy/resumen de .context/index.md
├── .context/                     ← Capa 0 (creado por arr bootstrap)
│ ├── index.md                  ← La Constitución
│ ├── operativa.md
│ ├── convenciones.md
│ ├── dependencias.md
│ └── skills/
│ ├── index.md
│ └── skill-XXX.md
├── src/
│ ├── index.md                  ← Nodo raíz Capa 1 (creado por arr bootstrap)
│ └── [módulos]/
│ └── index.md              ← Nodos de árbol Capa 1 donde corresponda
└── .arr/                         ← Estado operativo de arr (gitignored)
├── protocol-state.json       ← Último audit, checkpoints, estado global
└── sessions/                 ← Estados de sesiones (gitignored)
└── {session-id}/
└── state.json
```

## ---

## Lo que no hace arr (por decisión deliberada)

- **No tiene MCP**: no es necesario. Bash da acceso a todo.
- **No genera documentación automáticamente**: genera el contrato con guía humana.
- **No reemplaza al arquitecto**: captura su conocimiento, no lo sustituye.
- **No trabaja en repos sin bootstrap**: sin contrato, sin garantías.

## ---

## Pendiente de definir en detalle


- System prompts completos de cada agente (el contenido de `src/agents/*.md`)
- Formato exacto de las señales escritas por cada agente para que el orquestador las detecte
- Mecanismo de interacción humana en la CLI (cómo se presentan las preguntas del interrogatorio y las
propuestas del auditor)
- Compaction customizada para el bootstrap: preservar gaps descubiertos durante la compaction


