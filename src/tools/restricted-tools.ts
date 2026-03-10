import * as path from "node:path";
import * as fs from "node:fs";
import {
  createReadTool,
  createWriteTool,
  createEditTool,
  createBashTool,
  createGrepTool,
  createFindTool,
  createLsTool,
  type ReadOperations,
  type WriteOperations,
  type EditOperations,
} from "@mariozechner/pi-coding-agent";
import type { AgentTool } from "@mariozechner/pi-agent-core";

// ─── .lock ───────────────────────────────────────────────────────────────────

const DEFAULT_LOCKED_DIRS = [".lock", ".sessions"];

function readLockedDirs(workspaceDir: string): string[] {
  const lockPath = path.join(workspaceDir, ".lock");
  if (!fs.existsSync(lockPath)) return DEFAULT_LOCKED_DIRS;
  return fs
    .readFileSync(lockPath, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"))
    .concat(DEFAULT_LOCKED_DIRS);
}

// ─── Guardia de paths ─────────────────────────────────────────────────────────

function assertAllowed(resolvedPath: string, workspaceDir: string): void {
  const workspace = path.resolve(workspaceDir);
  const inside =
    resolvedPath === workspace || resolvedPath.startsWith(workspace + path.sep);

  if (!inside) {
    throw new Error(`[BLOQUEADO] Path fuera del workspace: "${resolvedPath}"`);
  }

  for (const locked of readLockedDirs(workspaceDir)) {
    const lockedAbs = path.resolve(workspace, locked);
    if (
      resolvedPath === lockedAbs ||
      resolvedPath.startsWith(lockedAbs + path.sep)
    ) {
      throw new Error(
        `[BLOQUEADO] Path dentro de directorio protegido (.lock): "${locked}" → "${resolvedPath}"`
      );
    }
  }
}

// ─── Operations con guardia ───────────────────────────────────────────────────

function createReadOps(workspaceDir: string): ReadOperations {
  return {
    readFile: async (p: string): Promise<Buffer> => {
      assertAllowed(p, workspaceDir);
      return fs.promises.readFile(p);
    },
    access: async (p: string): Promise<void> => {
      assertAllowed(p, workspaceDir);
      return fs.promises.access(p);
    },
  };
}

function createWriteOps(workspaceDir: string): WriteOperations {
  return {
    writeFile: async (p: string, content: string): Promise<void> => {
      assertAllowed(p, workspaceDir);
      return fs.promises.writeFile(p, content, "utf-8");
    },
    mkdir: async (dir: string): Promise<void> => {
      assertAllowed(dir, workspaceDir);
      await fs.promises.mkdir(dir, { recursive: true });
    },
  };
}

function createEditOps(workspaceDir: string): EditOperations {
  return {
    readFile: async (p: string): Promise<Buffer> => {
      assertAllowed(p, workspaceDir);
      return fs.promises.readFile(p);
    },
    writeFile: async (p: string, content: string): Promise<void> => {
      assertAllowed(p, workspaceDir);
      return fs.promises.writeFile(p, content, "utf-8");
    },
    access: async (p: string): Promise<void> => {
      assertAllowed(p, workspaceDir);
      return fs.promises.access(p);
    },
  };
}

// ─── Bash con guardia ─────────────────────────────────────────────────────────

const BLOCKED_BASH_PATTERNS: RegExp[] = [
  // ─── Paths fuera del workspace ───────────────────────────────────────────
  /(?:^|\s|[;&|`(])((?:~|\$HOME|\/)[^\s;|&<>'"]{2,})/, // paths absolutos, ~/, $HOME/
  /(?:^|\s)(\.\.\/)/, // traversal ../../

  // ─── Escalada de privilegios ─────────────────────────────────────────────
  /\bsudo\b/,
  /\bsu\s/,
  /\bdoas\b/,

  // ─── Destrucción de filesystem ───────────────────────────────────────────
  /\bmkfs\b/,
  /\bdd\s+.*of=\/dev/,
  /\bshred\b/,
  /\bwipe\b/,

  // ─── Persistencia / sistema ──────────────────────────────────────────────
  /\bcrontab\b/,
  /\bnohup\b/,
  /\bsystemctl\b/,
  /\bservice\s/,
  /\bat\s/, // at scheduler

  // ─── Git: reescritura de historia ────────────────────────────────────────
  /\bgit\s+rebase\b/, // rebase interactivo o no
  /\bgit\s+filter-branch\b/, // reescritura masiva legacy
  /\bgit\s+filter-repo\b/, // reescritura masiva moderna
  /\bgit\s+commit\b/, // cualquier git commit (incluye --amend, -m, etc.)
  /\bgit\s+commit\s+.*--amend\b/, // modificar commit ya hecho
  /\bgit\s+add\b/, // cualquier git add

  // ─── Git: pérdida de trabajo local ───────────────────────────────────────
  /\bgit\s+reset\s+.*--hard\b/, // descarta cambios sin recuperación
  /\bgit\s+checkout\s+.*--\s/, // descarta cambios en archivo concreto
  /\bgit\s+restore\s+/, // descarta cambios (git >= 2.23)
  /\bgit\s+clean\s+.*-[a-z]*f/, // -f/-fd/-ffx: elimina untracked

  // ─── Git: operaciones remotas destructivas ───────────────────────────────
  /\bgit\s+push\b/, // cualquier git push (con o sin flags, con o sin remoto)
  /\bgit\s+push\s+.*--force\b/, // force push (sobreescribe remoto)
  /\bgit\s+push\s+.*-f\b/,
  /\bgit\s+push\s+.*--force-with-lease\b/,
  /\bgit\s+push\s+.*--delete\b/, // eliminar rama remota
  /\bgit\s+push\s+[^-].*:\s*/, // push con refspec de borrado (refs/:)

  // ─── Git: eliminación de ramas/tags ──────────────────────────────────────
  /\bgit\s+branch\s+.*-[dD]\b/, // -d / -D: borrar rama local
  /\bgit\s+tag\s+.*-d\b/, // borrar tag local

  // ─── Git: submodules y worktrees con riesgo ──────────────────────────────
  /\bgit\s+submodule\s+deinit\b/, // desinicializar submodule
  /\bgit\s+worktree\s+remove\b/,

  // ─── Git: gc y mantenimiento agresivo ────────────────────────────────────
  /\bgit\s+gc\s+.*--prune=now\b/, // purga objetos sin red de seguridad
  /\bgit\s+reflog\s+delete\b/, // elimina historial de reflog
  /\bgit\s+reflog\s+expire\b/,
];

function createRestrictedBashTool(workspaceDir: string): AgentTool<any> {
  const rawBash = createBashTool(workspaceDir);
  const home = process.env.HOME ?? "/root";
  const workspace = path.resolve(workspaceDir);

  return {
    ...rawBash,
    execute: async (id, params, signal, onUpdate) => {
      const p = params as { command: string; timeout?: number };

      for (const pattern of BLOCKED_BASH_PATTERNS) {
        const match = pattern.exec(p.command);
        if (!match) continue;

        const captured: string | undefined = match[1];
        if (captured) {
          const expanded = captured
            .replace(/^\$HOME/, home)
            .replace(/^~/, home);
          const resolved = path.resolve(workspace, expanded);

          if (
            !resolved.startsWith(workspace + path.sep) &&
            resolved !== workspace
          ) {
            return {
              content: [
                {
                  type: "text",
                  text: `[BLOQUEADO] Path fuera del workspace: "${captured}" → "${resolved}"`,
                },
              ],
              details: {},
            };
          }

          for (const locked of readLockedDirs(workspaceDir)) {
            const lockedAbs = path.resolve(workspace, locked);
            if (
              resolved === lockedAbs ||
              resolved.startsWith(lockedAbs + path.sep)
            ) {
              return {
                content: [
                  {
                    type: "text",
                    text: `[BLOQUEADO] Path en directorio protegido (.lock): "${locked}"`,
                  },
                ],
                details: {},
              };
            }
          }
        } else {
          return {
            content: [
              {
                type: "text",
                text: `[BLOQUEADO] Comando no permitido: ${pattern}`,
              },
            ],
            details: {},
          };
        }
      }

      // exactOptionalPropertyTypes: omitir timeout si es undefined
      const bashParams: { command: string; timeout?: number } = {
        command: p.command,
      };
      if (p.timeout !== undefined) bashParams.timeout = p.timeout;

      return rawBash.execute(id, bashParams, signal, onUpdate);
    },
  };
}

// ─── API pública ──────────────────────────────────────────────────────────────

export function createRestrictedTools(workspaceDir: string) {
  return {
    read: createReadTool(workspaceDir, {
      operations: createReadOps(workspaceDir),
    }),
    write: createWriteTool(workspaceDir, {
      operations: createWriteOps(workspaceDir),
    }),
    edit: createEditTool(workspaceDir, {
      operations: createEditOps(workspaceDir),
    }),
    grep: createGrepTool(workspaceDir),
    find: createFindTool(workspaceDir),
    ls: createLsTool(workspaceDir),
    bash: createRestrictedBashTool(workspaceDir),
  };
}
