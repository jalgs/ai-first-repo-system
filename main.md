# AI-First Repo Protocol

## Qué es esto

Un protocolo de trabajo para repositorios de software. 
No es un estándar de documentación. Es un contrato.

**El código dice qué hace el sistema. 
La documentación tradicional explica cómo funciona. 
Este protocolo declara cómo se trabaja aquí.**

Son tres cosas distintas. Solo la tercera es un contrato.

---

## El problema que resuelve

Cuando alguien llega a un repo — humano o agente — y se le pide desarrollar o refactorizar algo, sin más
explicación, tiene dos opciones:

- **Preguntar.** Depende de que alguien con conocimiento esté disponible.
- **Inferir del código.** Lento, incompleto, y lo que se infiere es *qué hace*, no *cómo se trabaja aquí*.

Lo que nunca está en el código es la intención, la restricción, la convención. Ese conocimiento vive en la
cabeza de quien construyó el sistema, se transmite en conversaciones, y se pierde cuando esa persona se
va.

**Este protocolo externaliza ese conocimiento tácito y lo convierte en parte del repo.**

---

## La perspectiva

Este sistema no está orientado exclusivamente a IA ni exclusivamente a desarrolladores humanos. Está
orientado a **cualquiera que necesite trabajar en un repo con precisión y coherencia**, independientemente
de quién o qué sea.

Un LLM con este contrato trabaja como alguien que lleva meses en el proyecto. 
Un desarrollador nuevo con este contrato no necesita preguntar ni inferir. 
Un equipo con este contrato mantiene coherencia aunque cambien las personas.


## ---

## El principio fundamental

> **El sistema de documentación es el contrato entre quien trabaja y el repo. 
> Si ese contrato es preciso, cualquiera que llegue entiende no solo qué hay, sino cómo se trabaja aquí. 
> Si es vago, cada uno improvisa según su criterio, y el repo pierde coherencia con cada mano que lo toca.**

---

## Quién lo escribe y quién lo usa

No lo escribe el equipo de documentación. 
No se genera automáticamente del código.

**Lo escribe quien toma las decisiones arquitectónicas**, porque lo que captura son exactamente esas
decisiones: la intención detrás de la estructura, las restricciones que no se ven en el código, los contratos
entre módulos, las convenciones que deben mantenerse.

Cualquier desarrollador o agente es consumidor de este contrato, pero también guardián de mantenerlo vivo
cuando lo toca.

## ---

## Arquitectura del sistema

El protocolo tiene dos componentes que se diseñan como un todo cohesionado y no pueden entenderse por
separado:

- **El sistema de documentación**: el contrato persistente que vive en el repo
- **El sistema de agentes**: la capa meta que opera sobre ese contrato

## ---

## I. El sistema de documentación

### Estructura de capas

**Capa 0 — Repositorio**


Vive en `/.context/`. Es el punto de entrada al contrato. Responde a las preguntas existenciales: qué es este
repo, cómo está estructurado, cuáles son las leyes que rigen su modificación, cómo se opera. Se lee siempre,
en su totalidad, al inicio de cualquier sesión de trabajo.

**Capa 1 — Árbol de nodos**
Un `index.md` en cada carpeta donde exista conocimiento que no puede deducirse del código. No todas las
carpetas tienen nodo. Solo las que lo necesitan.

---

### Dos tipos de nodo

**Nodos raíz** (Capa 0 y nodo raíz de Capa 1)
Se leen siempre, una única vez, al inicio de cualquier sesión. Son precondición del sistema, nunca se navegan
condicionalmente.

El nodo raíz de Capa 1 es especial: no describe el repo como artefacto (eso es Capa 0), sino como sistema
vivo. Describe cómo están organizadas sus grandes partes, dónde están los acoplamientos críticos y qué
áreas tienen mayor impacto transversal. Es el mapa de acoplamientos del sistema.

**Nodos de árbol** (resto de Capa 1)
Se navegan activamente según la unidad de trabajo. Se leen solo cuando son relevantes para la tarea en
curso.

---

### El principio de existencia

Un nodo documental solo existe si existe un gap real. La pregunta que determina su existencia:

> **¿Hay algo aquí que alguien no podría deducir por sí mismo, y que si no lo sabe, trabajará peor?**

Si la respuesta es no, el nodo no existe.

> *El valor de un token de contexto se justifica solo si proporciona una palanca de decisión que no está
disponible de forma más barata a través del código o herramientas de búsqueda.*

## ---

### El principio de incompletitud aceptada


Este sistema no aspira a ser completo ni determinista. Aspira a ser útil con información parcial y a mejorar
incrementalmente. Un nodo incompleto que captura un gap real es mejor que un nodo completo que no
captura nada. El silencio es información: significa que no hay gap, no que se olvidó documentar.

---

### Leyes y convenciones

Son dos conceptos distintos que el sistema trata de forma radicalmente diferente.

**Ley** — restricción absoluta. El agente no la cuestiona, no la negocia, no la viola bajo ninguna
circunstancia. Si una acción la viola, la acción no se ejecuta.

**Convención** — patrón esperado con excepciones posibles bajo autorización humana explícita. Si un
agente detecta que la solución óptima viola una convención, no actúa unilateralmente. Pausa y escala al
humano con precisión: qué convención, por qué la viola, qué gana, qué riesgo introduce. El humano decide.

Ambas se declaran con identificadores únicos para ser referenciables desde cualquier señal, estado de
sesión o nodo del árbol.

**Flujo de violación autorizada de convención:**

## ```

Agente detecta conflicto con convención
│
▼
Emite señal: escalado_humano
{ tipo: violación_convención, convención: CONV-XXX,
razón, alternativa, pregunta }
│
┌─────┴──────┐
▼ ▼
Autoriza     Deniega
│ │
▼ ▼
Registra     Agente busca solución
violación    que respeta convención
autorizada
```


Una violación autorizada genera simultáneamente tres efectos: se registra en el estado de sesión para que el
validador la entienda, emite una señal automática para el auditor, y al cierre el auditor propone al humano
cómo actualizar el contrato (mantener, añadir excepción documentada, o revisar la convención).

---

### Las dimensiones

Las dimensiones son los tipos de gap que un nodo puede capturar. Se activan mediante preguntas
diagnóstico. Si la respuesta es sí, la dimensión existe y se documenta. Si es no, no se escribe — ni vacía, ni
con "no aplica". La ausencia es información.

**Estructural**
> ¿Hay algo en cómo está organizado esto que no sea obvio desde dentro?

**Intencional**
> ¿Hay alguna decisión tomada aquí que alguien podría deshacer sin saber que la está deshaciendo?

**Normativo**
> ¿Hay algo que no se debe hacer aquí aunque el código no lo impida?

**Contractual**
> ¿Este nodo asume algo de su entorno, o su entorno asume algo de él, que no esté explícito en el código?

**Divergencia**
> ¿Hay algo aquí que se comporta diferente a lo que el contexto superior llevaría a esperar?

**Estado**
> ¿Está este nodo en un momento que alguien debería conocer antes de tocarlo?

---

### Cuándo se actualiza un nodo

Se actualiza cuando cambia un gap que documenta, cuando aparece un gap nuevo, o cuando un gap
desaparece. No se actualiza cuando cambia la lógica interna sin cambio estructural, cuando se añaden
ficheros dentro de una carpeta ya documentada, o cuando se refactoriza sin mover responsabilidades.

**La actualización del contrato siempre requiere aprobación humana explícita.**

---


### Capa 0: estructura y contenido

```
.context/
├── index.md           # Constitución: identidad, leyes, convenciones, mapas
├── operativa.md       # Comandos, entorno, gotchas
├── convenciones.md    # Detalle de cada convención + excepciones autorizadas
├── dependencias.md    # Dependencias críticas con contexto
└── skills/
├── index.md       # Índice descubrible de skills
└── skill-XXX.md   # Una skill por fichero
```

**`index.md` — La Constitución**

```markdown
---
type: constitution
version: x.x
state: activo | en-transición | legacy
---

## Identidad
Qué es este repo en una o dos frases.
Qué NO es. El límite es tan importante como la definición.

## Tipo
microservicio | monorepo | librería | CLI | infra | config | ...
Implicaciones relevantes de ese tipo para quien trabaja aquí.

## Leyes

- LEY-001: ...
- LEY-002: ...

## Convenciones

- CONV-001: ...
- CONV-002: ...

## Mapa de Capa 1
Lista semántica de las grandes partes del sistema.


No es un índice de carpetas. Una línea de responsabilidad por área.

## Skills disponibles

- SKILL-001: nombre → qué resuelve
- SKILL-002: nombre → qué resuelve
```

**`operativa.md` — El contrato de ejecución**

Permite al agente cerrar el loop de forma autónoma: implementa, ejecuta, verifica. Sin este documento el
agente adivina comandos y falla en cosas triviales.

```markdown
## Entorno
Requisitos previos exactos: versiones de runtime, herramientas necesarias.
Cómo inicializar el entorno desde cero.

## Comandos
| Propósito        | Comando | Notas                    |
|------------------|---------|--------------------------|
| Instalar         | ...     | ...                      |
| Desarrollo local | ...     | ...                      |
| Test unitario    | ...     | ...                      |
| Test integración | ...     | requiere servicio X vivo |
| Build            | ...     | ...                      |
| Deploy staging   | ...     | ...                      |

## Variables de entorno
Qué variables necesita el sistema y para qué.
Dónde vive el fichero de ejemplo.
Cuáles son críticas vs opcionales.

## Gotchas operativos
Cosas que fallan de forma no obvia y cómo resolverlas.
Solo las que cuestan tiempo real si no se conocen.
```

**`convenciones.md` — El libro de estilo técnico**

Desarrolla el detalle de cada convención declarada en la Constitución. Las excepciones autorizadas se
registran aquí al cierre de la sesión que las generó.


```markdown
## CONV-001: nombre
Por qué existe esta convención.
Cómo se aplica en la práctica.
Ejemplo correcto / incorrecto si ayuda.

### Excepciones autorizadas

- [fecha] [alcance]: razón por la que se autorizó la excepción.
```

**`dependencias.md` — El mapa de dependencias críticas**

No es un lockfile. Es el conocimiento sobre dependencias que el código no hace obvio.

```markdown
## Dependencias externas críticas
Las que tienen implicaciones arquitectónicas o restricciones de uso.

| Dependencia | Propósito | Restricciones | Estado |
|-------------|-----------|---------------|--------|

## Dependencias internas
Otros repos o módulos de los que este depende.
Qué asume de ellos, qué contratos existen.

## Dependencias inversas conocidas
Quién depende de este repo y qué asumen de él.
Crítico para entender el impacto de cambios en interfaces públicas.
```

**`skills/index.md` y `skills/skill-XXX.md`**

El índice hace las skills descubribles sin leerlas. Cada skill es un fichero independiente que el agente carga
solo cuando la necesita.

```markdown
---
id: SKILL-XXX
name: nombre descriptivo
triggers: cuándo tiene sentido usar esta skill


## ---

## Contexto
Por qué existe esta skill. Qué problema procedimental resuelve.

## Flujo
Pasos concretos, ordenados, ejecutables.

## Referencias
Nodos del contrato relevantes. Comandos de operativa relevantes.
```

## ---

### Capa 1: el nodo raíz

Puente entre Capa 0 y el árbol de nodos. Describe el sistema como conjunto vivo.

```markdown
---
type: root-node
---

## Grandes áreas
| Área | Responsabilidad | Nodo |
|------|-----------------|------|

## Acoplamientos críticos
Relaciones entre áreas que no son obvias desde el código
y cuyo desconocimiento lleva a romper cosas.

## Zonas de alta transversalidad
Áreas que casi cualquier tarea tocará o deberá tener en cuenta.
Por qué son transversales y qué implica eso.

## Zonas de alta fragilidad
Áreas que requieren especial cuidado.
Por qué son frágiles y qué precauciones aplicar.
```

---


### Capa 1: los nodos de árbol

```markdown
---
scope: ruta/relativa/del/nodo
dimensions: [lista de dimensiones activas]
relations: [rutas de nodos relacionados]
state: activo | en-transición | deprecado | experimental
---

## Estructural
Qué no es obvio en cómo está organizado esto.

## Intencional
Qué decisión existe aquí que alguien podría deshacer sin saberlo.

## Normativo
Qué no se debe hacer aquí aunque el código no lo impida.
Referencias a CONV-XXX o LEY-XXX de Capa 0 si aplica.

## Contractual
Qué asume este nodo del exterior o qué asume el exterior de él.

## Divergencia
Qué se comporta diferente a lo que el contexto superior llevaría a esperar.
Referencia explícita a qué convención o ley diverge y por qué está autorizado.

## Estado
Qué necesita saber alguien antes de tocar esto.
```

Cada sección existe solo si su dimensión está activa. El campo `relations` declara acoplamientos con otros
nodos, visibles o no desde el código, para que el agente de análisis expanda el alcance correctamente.

---

## II. El sistema de agentes

### Naturaleza del sistema


El sistema de agentes no es un pipeline. Es una **máquina de estados** donde las transiciones están
gobernadas por señales, no por orden predefinido. Cada agente puede ceder el control a cualquier otro
cuando detecta que la situación lo requiere.

---

### La unidad de trabajo

Todo el sistema orbita alrededor de una unidad de trabajo. Puede ser un ticket, una feature, un refactor, una
corrección. Independientemente del tipo, toda unidad de trabajo tiene:

- Un **intento**: qué se quiere conseguir
- Un **alcance**: qué partes del repo están involucradas
- Un **resultado**: qué ha cambiado al terminar

Estos tres elementos son el hilo conductor que atraviesa todas las fases.

## ---

### Los agentes operativos

**Agente de Análisis**
Entra con el intento. Lee Capa 0 y nodo raíz de Capa 1 completos. Navega el árbol de nodos descendente y
ascendentemente para entender el alcance real. No toca código, solo lee y razona. Construye un paquete de
contexto curado: para cada nodo relevante, identifica qué dimensión específica necesita cada fase posterior
y por qué. Detecta acoplamientos cruzados vía el campo `relations`. Su output es contexto destilado y un
mapa de referencias documentales para el resto del flujo.

**Agente de Planificación**
Recibe el mapa del análisis. Define la estrategia de implementación respetando el contrato. Descompone el
trabajo en pasos concretos y ordenados. Si detecta que el intento requiere decisiones que superan su
autonomía, pausa e involucra al humano. Puede devolver el control al análisis si descubre que el alcance está
mal definido. Su output es un plan verificable contra el contrato.

**Agente de Desarrollo**
Ejecuta el plan. Opera con el estado de sesión como contexto vivo. Conoce qué skills existen y las invoca
bajo demanda. No toma decisiones arquitectónicas, las escala. Si descubre ambigüedades o evidencias en el
código que contradicen el plan, cede el control de vuelta al análisis con una señal precisa. Su output es
código que implementa el plan dentro de los límites del contrato.

**Agente de Validación**


Verifica que lo producido cumple el plan y no viola el contrato. No solo ejecuta tests, razona sobre coherencia
arquitectónica. Clasifica cualquier problema detectado para determinar a qué agente debe volver el control.
Su output es una declaración de conformidad o un rechazo estructurado.

**Agente Auditor del Contrato**
Se activa al cierre de la sesión, pero acumula señales durante toda ella. Cualquier agente puede emitir una
señal `posible_cambio_contrato` con lo que ha detectado. Al cierre, analiza esas señales, detecta
incongruencias entre el contrato y la realidad actual del repo, formula preguntas precisas al humano y
propone cambios quirúrgicos. El humano aprueba dimensión por dimensión, nodo por nodo. **Es el único
agente con acceso de escritura al contrato.**

## ---

### El orquestador

No razona sobre el código ni sobre el contrato. Razona sobre el flujo. Sus responsabilidades:

- Leer el estado actual de la sesión
- Interpretar la señal entrante
- Determinar el siguiente agente a invocar
- Entregarle el slice relevante del estado de sesión
- Registrar la transición

Es un director de tráfico, no un razonador. Predecible y confiable por diseño.

---

### Las señales de transición

Cada vez que un agente cede el control emite una señal estructurada:

```
Señal {
origen: fase actual
destino: fase siguiente
tipo: completado | ambigüedad | descubrimiento |
cambio_de_alcance | rechazo | escalado_humano |
violación_convención | posible_cambio_contrato
razón: descripción precisa de por qué
contexto: qué información nueva ha emergido
referencias: qué nodos o skills son relevantes para la siguiente fase


## }

## ```

## ---

### El rechazo del validador

El validador no emite rechazos genéricos. Clasifica el problema:

```
Rechazo {
tipo: código | diseño | comprensión | violación_contrato
descripción: qué falló exactamente
destino_recomendado: desarrollo | planificación | análisis | humano
evidencia: qué parte del código y qué parte del contrato están en conflicto
}
```

- Problema de código → desarrollo
- Problema de diseño o enfoque → planificación
- Malentendido del intento → análisis
- Violación del contrato que requiere decisión → humano

## ---

### El flujo operativo

## ```

## ┌─────────────────┐

## │  HUMAN REVIEW   │

## └────────┬────────┘

## │

## ┌──────────────┼──────────────┐

## ▼ ▼ ▼

## ┌─────────┐ ┌──────────┐ ┌──────────┐

## ┌───▶│ ANÁLISIS│──▶│PLANIFICA-│──▶│DESARROLLO│

## │ └─────────┘ │  CIÓN    │ └────┬─────┘

## │ ▲ └──────────┘ │

## │ │ ▲ │

## │ └──────────────┼─────────────┤

## │ │ ▼


## │ ┌────┴──────┐ ┌──────────┐

## │ │ RECHAZO   │◀─│VALIDACIÓN│

## │ └───────────┘ └────┬─────┘

│ │ aprobado
│ ▼
│ ┌─────────┐
└──────────────────────────────────│ AUDITOR │
└────┬────┘
│
┌────▼────┐
│ CERRADO │
└─────────┘
```

---

### El estado de sesión

Estructura viva que cada agente lee y enriquece. Ningún agente sobreescribe lo que escribió otro. Append-
only salvo el plan vigente, que se reemplaza con referencia explícita al anterior.

```
Estado de Sesión
│
├── CABECERA (inmutable)
│ ├── Intento original
│ ├── Contexto base cargado (Capa 0 + nodo raíz Capa 1)
│ └── Alcance inicial estimado
│
├── CONTEXTO DOCUMENTAL CURADO
│ ├── Referencias documentales por fase
│ │ └── { nodo, dimensión, razón, para: [agentes] }
│ ├── Skills referenciadas y cuándo usarlas
│ └── Acoplamientos críticos detectados
│
├── REGISTRO DE ITERACIONES
│ └── Iteración N
│ ├── Estado inicial
│ ├── Fase ejecutada y output producido
│ ├── Señal de salida
│ └── Qué cambió respecto a la iteración anterior


## │

## ├── REGISTRO DE DECISIONES

│ ├── Decisiones tomadas autónomamente
│ └── Decisiones escaladas al humano y sus resoluciones
│
├── VIOLACIONES AUTORIZADAS
│ └── { convención, razón, alcance, autorizada_por, timestamp }
│
├── PLAN VIGENTE
│ └── Plan más reciente con referencia a qué iteración
│       lo produjo y por qué sustituyó al anterior
│
├── SEÑALES POSIBLE_CAMBIO_CONTRATO
│ └── Acumuladas durante la sesión, para el auditor al cierre
│
└── ESTADO ACTUAL
├── Fase activa
├── Agente activo
└── Qué está pendiente de resolver
```

---

### Relación entre estado de sesión y contrato

```
Contrato (permanente, vive en el repo)
│
│  alimenta
▼
Estado de Sesión (temporal, vive en la sesión)
│
│  puede provocar cambios en
▼
Contrato (actualizado, solo con aprobación humana explícita)
```

## ---

## III. Ciclo de vida del contrato


### El agente de Bootstrap

Agente especializado cuya misión es construir el contrato desde cero sobre un repo que no lo tiene. Opera
una única vez por repo, o cuando el contrato está tan desactualizado que es más eficiente reconstruirlo que
auditarlo.

No es el agente auditor operativo. Es un agente distinto con una arquitectura de trabajo diferente: no opera
sobre sesiones de trabajo, opera sobre el repo completo y sobre el conocimiento de las personas que lo
construyeron.

#### Fase 1: Análisis exhaustivo por pasadas progresivas

El agente no necesita tener todo el repo en contexto simultáneamente. Construye comprensión completa a
través de múltiples pasadas progresivas, destilando en cada paso. La ventana de contexto del modelo se usa
para razonamiento y síntesis, nunca para almacenamiento bruto de código.

**Pasada 1 — Estructura**
Solo árbol de directorios y nombres de ficheros, sin leer contenido. Coste mínimo, valor altísimo. El agente
construye un mapa mental de la organización, detecta patrones, anomalías estructurales y zonas de interés.

**Pasada 2 — Superficie**
Para cada fichero relevante: imports, exports, firmas de funciones y clases. No el cuerpo. Herramientas como
AST parsers o tree-sitter extraen esto de forma eficiente. El agente entiende qué hace cada parte sin leer la
implementación.

**Pasada 3 — Dependencias**
Análisis del grafo de dependencias. Qué importa qué, qué depende de qué. Extraíble automáticamente. Muy
denso en información con muy pocos tokens.

**Pasada 4 — Historia**
Git log, git blame, frecuencia de cambios por fichero y módulo. Qué se toca mucho, qué nunca se toca, qué
genera conflictos, qué se reescribió. La historia del repo dice cosas que el código no dice.

**Pasada 5 — Profundidad selectiva**
Con el mapa construido en las pasadas anteriores, el agente identifica zonas que requieren lectura profunda:
módulos de alta complejidad, acoplamientos críticos, zonas de anomalía detectada. Solo estas se leen
completas. Aquí se aprovechan modelos de ventana grande cuando el módulo lo requiere.

**Pasada 6 — Síntesis**
El agente distila todo lo aprendido en un documento de análisis interno. No es el contrato, es la base sobre la
que construirá el contrato y formulará las preguntas del interrogatorio. Este documento cabe en la ventana de


contexto porque es una destilación, no el repo completo.

## ```

Pasadas 1-4: Herramientas (bash, AST, git)
Coste mínimo, cobertura total del repo

Pasada 5:    Modelo con ventana grande para zonas críticas
Cobertura selectiva, profundidad máxima

Pasada 6:    Síntesis en ventana estándar
El modelo trabaja sobre destilado, no sobre código raw
```

El análisis produce dos outputs: un borrador preliminar del contrato, y un **mapa de incógnitas**: todo lo que
el agente ha detectado pero no puede resolver porque el código no lo dice.

#### Fase 2: Extracción de conocimiento tácito

El código nunca contiene todo el conocimiento relevante. Hay conocimiento que no deja ninguna traza:
decisiones tomadas antes de que existiera el código actual, cosas que se intentaron y se descartaron,
restricciones externas de negocio o legales, planes futuros que condicionan decisiones actuales, contexto
histórico, convenciones tan asumidas que nadie las escribió.

Para capturar este conocimiento la extracción opera en dos subfases:

**Subfase A: Volcado proactivo**

Antes de que el agente haga ninguna pregunta, el humano tiene un espacio para volcar libremente todo lo
que sabe. No responde preguntas, habla. El agente escucha y toma notas.

Para facilitar el volcado sin que sea un folio en blanco, se ofrecen **marcos de activación**: preguntas
diseñadas no para obtener respuestas concretas, sino para activar memoria y conocimiento tácito.

## ```

Marcos de activación:

— "¿Qué le dirías a alguien en su primer día trabajando
en este repo que no está en el código?"

— "¿Hay algo que hayas tenido que explicar más de una
vez a personas distintas?"


— "¿Qué es lo que más miedo te da que alguien rompa
sin darse cuenta?"

— "¿Hay restricciones que vienen de fuera del equipo
técnico: negocio, legal, cliente?"

— "¿Hay algo que esté así por razones históricas
que ya no existen pero que no se ha cambiado?"

— "¿Hay planes futuros que condicionan cómo está
estructurado esto ahora?"

— "¿Qué se intentó antes de llegar a la solución
actual, y por qué no funcionó?"
```

Estos marcos no buscan respuestas completas. Buscan abrir puertas. El humano puede responder con una
frase o con media hora de explicación.

**Subfase B: Interrogatorio dirigido por incógnitas**

El agente formula preguntas precisas derivadas del mapa de incógnitas del análisis, enriquecidas ahora con
el volcado proactivo del humano. No hace preguntas genéricas. Hace preguntas derivadas de lo que ha visto.

Ejemplo: *"He detectado que el módulo de pagos nunca importa directamente desde el módulo de usuarios
aunque hay lógica que sugeriría que debería hacerlo. ¿Es esto una restricción arquitectónica deliberada?"*

Cada respuesta refina el borrador. Cada respuesta puede generar nuevas preguntas. El interrogatorio termina
cuando el agente ya no tiene incógnitas sin resolver que el humano pueda responder.

**La pregunta de cierre — siempre, sin excepción:**

> *"Hemos analizado el repo y hemos hablado durante este tiempo. ¿Hay algo importante que no hayamos
tocado y que alguien debería saber para trabajar bien aquí?"*

Es la red de seguridad final. Simple, abierta, y efectiva para capturar lo que se escapó.

#### Output del bootstrap


La Capa 0 completa y todos los nodos de Capa 1 justificados por el análisis y el interrogatorio. No es un
borrador que hay que revisar posteriormente: es el contrato inicial, validado por el humano durante el propio
proceso de construcción.

---

### El agente de Auditoría Integral

Mantiene el contrato vivo a lo largo del tiempo. Opera en modo diferencial: no construye desde cero, audita la
evolución desde el último checkpoint.

Su input es el contrato existente más todo el delta desde el último checkpoint: commits, PRs, cambios
estructurales, violaciones autorizadas registradas en sesiones anteriores.

```
Lee contrato vigente
│
▼
Analiza delta desde último checkpoint
(misma arquitectura de pasadas que el bootstrap,
pero focalizada solo en lo que ha cambiado)
│
▼
Detecta tres tipos de divergencia:
— Contrato desactualizado: el repo cambió pero el contrato no
— Contrato obsoleto: documenta algo que ya no existe
— Gaps nuevos: hay conocimiento tácito nuevo no capturado
│
▼
Interrogatorio focalizado en las divergencias detectadas
(mucho más breve que el bootstrap, solo aborda el delta)
│
▼
Propone actualizaciones quirúrgicas al contrato
│
▼
Aprobación humana → contrato actualizado
```

#### Cuándo se activa la auditoría integral


No se basa en tiempo fijo. Se orienta a eventos, porque una auditoría temporal puede coincidir con baja
actividad y no aportar nada.

Se activa cuando:

- Se acumula un número significativo de sesiones desde la última auditoría
- Se produce un cambio arquitectónico mayor
- El agente auditor operativo acumula demasiadas señales `posible_cambio_contrato` sin resolver
- Como mínimo, una vez por sprint o ciclo de release como garantía de fondo

---

*— Documento en construcción —*


