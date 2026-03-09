import * as fs from "node:fs";
import * as path from "node:path";
import { Logger } from "../../utils/logger.js";

export type SessionRegistry = {
  sessionId: string;
  sessionFile: string;
  name: string;
  role: string;
};

export class SessionRegistryManager {
  private static currentSessionId: string;

  private static registryPath(): string {
    return path.join(
      process.cwd(),
      "sessions",
      SessionRegistryManager.current(),
      "registry.json"
    );
  }

  private static ensureFile(): void {
    const filePath = SessionRegistryManager.registryPath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, "[]", { encoding: "utf8" });
    }
  }

  // Upsert por role: evita duplicados si el mismo subagente se re-registra
  static register(session: SessionRegistry): void {
    Logger.log({ register: session });
    SessionRegistryManager.ensureFile();
    const sessions = SessionRegistryManager.list();
    const existing = sessions.findIndex(
      (s) => s.sessionId === session.sessionId
    );
    if (existing !== -1) {
      sessions[existing] = session;
    } else {
      sessions.push(session);
    }
    fs.writeFileSync(
      SessionRegistryManager.registryPath(),
      JSON.stringify(sessions, null, 2),
      { encoding: "utf8" }
    );
  }

  static list(): SessionRegistry[] {
    SessionRegistryManager.ensureFile();
    const raw = fs.readFileSync(SessionRegistryManager.registryPath(), {
      encoding: "utf8",
    });
    return JSON.parse(raw);
  }

  static getByRole(role: string): SessionRegistry | undefined {
    return SessionRegistryManager.list().find((s) => s.role === role);
  }

  static setCurrent(sessionId: string): void {
    SessionRegistryManager.currentSessionId = sessionId;
  }

  static current(): string {
    if (!SessionRegistryManager.currentSessionId) {
      throw new Error(
        "SessionRegistryManager: no hay sesión activa. Llama a setCurrent() primero."
      );
    }
    return SessionRegistryManager.currentSessionId;
  }
}
