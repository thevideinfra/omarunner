import { test } from "node:test"
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { readFile, mkdtemp, mkdir, symlink, lstat, readlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const run = promisify(execFile)
const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const cli = join(root, "bin", "omarunner")
const uninstall = join(root, "uninstall.sh")

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

// -- Fresh: uninstall.sh against a disposable $HOME. Never touches the real
// HOME; uninstall.sh is invoked with HOME pointed at a mkdtemp() directory, so
// the only filesystem state at risk is inside that temp tree.

async function tempHome() {
  const home = await mkdtemp(join(tmpdir(), "omarunner-home-"))
  await mkdir(join(home, ".config", "omarchy", "plugins"), { recursive: true })
  await mkdir(join(home, ".local", "bin"), { recursive: true })
  return home
}

function runUninstall(home) {
  return run(uninstall, [], { env: { ...process.env, HOME: home } })
}

test("uninstall removes a plugin symlink that points into this checkout", async () => {
  const home = await tempHome()
  const target = join(home, ".config", "omarchy", "plugins", "videinfra.omarunner")
  await symlink(root, target)

  const { stdout } = await runUninstall(home)

  assert.match(stdout, /Removed .*videinfra\.omarunner/)
  await assert.rejects(lstat(target), error => error.code === "ENOENT")
})

test("uninstall removes the omarunner bin symlink that points into this checkout", async () => {
  const home = await tempHome()
  const link = join(home, ".local", "bin", "omarunner")
  await symlink(join(root, "bin", "omarunner"), link)

  const { stdout } = await runUninstall(home)

  assert.match(stdout, /Removed .*\.local\/bin\/omarunner/)
  await assert.rejects(lstat(link), error => error.code === "ENOENT")
})

test("uninstall leaves a plugin symlink pointing elsewhere and reports it skipped", async () => {
  const home = await tempHome()
  const elsewhere = await mkdtemp(join(tmpdir(), "omarunner-other-"))
  const target = join(home, ".config", "omarchy", "plugins", "videinfra.omarunner")
  await symlink(elsewhere, target)

  const { stdout } = await runUninstall(home)

  assert.match(stdout, /Skipped .*videinfra\.omarunner/)
  const stat = await lstat(target)
  assert.ok(stat.isSymbolicLink())
  assert.equal(await readlink(target), elsewhere)
})

test("uninstall leaves a bin symlink pointing elsewhere and reports it skipped", async () => {
  const home = await tempHome()
  const elsewhere = join((await mkdtemp(join(tmpdir(), "omarunner-other-"))), "some-other-binary")
  const link = join(home, ".local", "bin", "omarunner")
  await symlink(elsewhere, link)

  const { stdout } = await runUninstall(home)

  assert.match(stdout, /Skipped .*\.local\/bin\/omarunner/)
  const stat = await lstat(link)
  assert.ok(stat.isSymbolicLink())
  assert.equal(await readlink(link), elsewhere)
})

// Read-only guard: the real, live-installed plugin symlink is never touched by
// this suite. Skipped on any machine where omarunner is not installed.
test("the real installed plugin symlink is untouched by this suite", async (t) => {
  const home = process.env.HOME
  const realTarget = join(home, ".config", "omarchy", "plugins", "videinfra.omarunner")

  let stat
  try {
    stat = await lstat(realTarget)
  } catch (error) {
    if (error.code === "ENOENT") { t.skip("omarunner is not installed on this machine"); return }
    throw error
  }

  assert.ok(stat.isSymbolicLink(), `${realTarget} exists but is not a symlink`)
})

// -- install.sh names optional packages that are missing, and still succeeds.

test("install.sh warns about missing optional packages and still installs", async () => {
  const { symlink: link, rm } = await import("node:fs/promises")
  const home = await mkdtemp(join(tmpdir(), "omarunner-install-"))
  const pathDir = join(home, "bin-minimal")
  await mkdir(pathDir)
  for (const tool of ["bash", "ln", "mkdir", "dirname", "env"]) await link(`/usr/bin/${tool}`, join(pathDir, tool))
  const { stderr } = await run(join(root, "install.sh"), [], { env: { HOME: home, PATH: pathDir } })
  assert.match(stderr, /libqalculate \(qalc\)/)
  assert.match(stderr, /fzf: fuzzy ranking/)
  assert.match(stderr, /fd: file and folder search/)
  assert.equal(await readlink(join(home, ".config", "omarchy", "plugins", "videinfra.omarunner")), root)
  await rm(home, { recursive: true, force: true })
})
