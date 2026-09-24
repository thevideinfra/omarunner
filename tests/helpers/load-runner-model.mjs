// RunnerModel.js is a QML JavaScript resource: plain function declarations, no
// exports. Append an export list built from its own declarations and load the
// result as a module, so the pure helpers can be tested outside a running shell.
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

export async function loadRunnerModel() {
  const here = dirname(fileURLToPath(import.meta.url))
  const source = await readFile(join(here, "..", "..", "RunnerModel.js"), "utf8")
  const names = [...source.matchAll(/^function\s+([A-Za-z0-9_$]+)\s*\(/gm)].map(m => m[1])
  const module = `${source}\nexport { ${names.join(", ")} }\n`
  return import(`data:text/javascript;base64,${Buffer.from(module).toString("base64")}`)
}
