import * as fs from "node:fs";
import * as path from "node:path";
import { SessionRegistryManager } from "../tools/sub-agents/session-registry.js";

export class Logger {
  private static path() {
    return `${process.cwd()}/.sessions/${SessionRegistryManager.current()}/log.txt`;
  }

  private static ensureFile(): void {
    const filePath = Logger.path();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, "", { encoding: "utf8" });
    }
  }

  static log(data: string | object) {
    Logger.ensureFile();
    const log = this.getLog();
    fs.writeFileSync(
      this.path(),
      `${log}\n${typeof data === "object" ? JSON.stringify(data) : data}`
    );
  }

  private static getLog() {
    return fs.readFileSync(this.path(), {
      encoding: "utf8",
    });
  }
}
