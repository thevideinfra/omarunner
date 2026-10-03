import { test } from "node:test"
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const run = promisify(execFile)
const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const cli = join(root, "bin", "omarunner")

// A stub omarchy-shell earlier on PATH records its arguments instead of
// talking to the running shell.
const stubDir = join(root, "tests", "fixtures", "bin")

async function cliRun(args) {
  return run(cli, args, { env: { ...process.env, PATH: `${stubDir}:${process.env.PATH}` } })
}

test("toggle with no route defaults to root", async () => {
  const { stdout } = await cliRun(["toggle"])
  assert.equal(stdout.trim(), 'shell toggle videinfra.omarunner {"menu":"root"}')
})

test("no verb at all defaults to toggle root", async () => {
  const { stdout } = await cliRun([])
  assert.equal(stdout.trim(), 'shell toggle videinfra.omarunner {"menu":"root"}')
})

test("summon passes the route through", async () => {
  const { stdout } = await cliRun(["summon", "apps"])
  assert.equal(stdout.trim(), 'shell summon videinfra.omarunner {"menu":"apps"}')
})

test("close needs no payload", async () => {
  const { stdout } = await cliRun(["close"])
  assert.equal(stdout.trim(), "shell hide videinfra.omarunner")
})

test("an unknown verb exits 2", async () => {
  await assert.rejects(cliRun(["frobnicate"]), error => error.code === 2)
})

test("the CLI and the manifest agree on the plugin id", async () => {
  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"))
  const script = await readFile(cli, "utf8")
  assert.ok(script.includes(manifest.id), "bin/omarunner does not mention the manifest id")
})
