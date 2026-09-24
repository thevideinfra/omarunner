// Loads one of the plugin's QML JavaScript resources as an ES module. They are
// plain function declarations with no exports, so the export list is built from
// the declarations themselves, the same way load-runner-model.mjs does it.
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

export async function loadJsModule(fileName) {
  const here = dirname(fileURLToPath(import.meta.url))
  const source = await readFile(join(here, "..", "..", fileName), "utf8")
  const names = [...source.matchAll(/^function\s+([A-Za-z0-9_$]+)\s*\(/gm)].map(m => m[1])
  const module = `${source}\nexport { ${names.join(", ")} }\n`
  return import(`data:text/javascript;base64,${Buffer.from(module).toString("base64")}`)
}
