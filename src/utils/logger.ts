import * as fs from "node:fs";

export class Logger {
  private static readonly path = `${process.cwd()}/log.txt`;

  static log(data: string | object) {
    const log = this.getLog();
    fs.writeFileSync(
      this.path,
      `${log}\n${typeof data === "object" ? JSON.stringify(data) : data}`
    );
  }

  private static getLog() {
    return fs.readFileSync(this.path, {
      encoding: "utf8",
    });
  }
}
