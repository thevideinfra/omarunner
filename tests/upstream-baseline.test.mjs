import { test } from "node:test"
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, writeFile, copyFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const run = promisify(execFile)
const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const script = join(root, "bin", "omarunner-diff-upstream")

async function diff(menuDir) {
  try {
    const { stdout } = await run(script, ["--menu-dir", menuDir])
    return { code: 0, stdout }
  } catch (error) {
    return { code: error.code, stdout: error.stdout || "" }
  }
}

test("reports no drift against the vendored baseline itself", async () => {
  const result = await diff(join(root, "upstream"))
  assert.equal(result.code, 0)
})

test("reports drift when a vendored file differs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "omarunner-"))
  await copyFile(join(root, "upstream", "Menu.qml"), join(dir, "Menu.qml"))
  await writeFile(join(dir, "MenuModel.js"), "// changed\n")
  const result = await diff(dir)
  assert.equal(result.code, 1)
  assert.match(result.stdout, /MenuModel\.js/)
})

test("reports a missing file distinctly", async () => {
  const dir = await mkdtemp(join(tmpdir(), "omarunner-"))
  const result = await diff(dir)
  assert.equal(result.code, 2)
})
