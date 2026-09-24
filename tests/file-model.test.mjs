import { test } from "node:test"
import assert from "node:assert/strict"
import { loadJsModule } from "./helpers/load-js-module.mjs"
const F = await loadJsModule("FileModel.js")
const HOME = "/home/ks"

// fdArgs: reconciled against the shipped FileModel.js, which dropped --hidden
// (dot-directories are skipped by default, not searched) and added --exclude
// for a set of bulky cache/vendor trees beyond .git and node_modules. The
// original plan's argv index (13) predates both changes.
const BASE_ARGS = ["fd", "--type", "f", "--ignore-case", "--color", "never",
  "--exclude", ".git", "--exclude", "node_modules", "--exclude", ".cache", "--exclude", ".cargo",
  "--exclude", ".rustup", "--exclude", ".npm", "--exclude", ".oh-my-zsh", "--exclude", "go/pkg",
  "--exclude", ".local/share"]

test("fdArgs builds a case-insensitive home search, excluding cache/vendor trees", () => {
  assert.deepEqual(F.fdArgs("invoice", HOME), [...BASE_ARGS, "--max-results", "40", "invoice", HOME])
})

test("fdArgs no longer passes --hidden", () => {
  assert.equal(F.fdArgs("invoice", HOME).includes("--hidden"), false)
})

test("fdArgs joins terms with .* and escapes regex metacharacters", () => {
  const args = F.fdArgs("proton inv", HOME)
  assert.equal(args[args.length - 2], "proton.*inv")
  const args2 = F.fdArgs("a.b (1)", HOME)
  assert.equal(args2[args2.length - 2], "a\\.b.*\\(1\\)")
})

test("fdArgs refuses queries under two characters", () => {
  assert.deepEqual(F.fdArgs("a", HOME), [])
  assert.deepEqual(F.fdArgs("  ", HOME), [])
})

test("fileRow shapes label, home-relative detail and value", () => {
  const r = F.fileRow("/home/ks/Documents/proton-invoice.pdf", HOME)
  assert.equal(r.label, "proton-invoice.pdf")
  assert.equal(r.detail, "Documents/proton-invoice.pdf")
  assert.equal(r.value, "/home/ks/Documents/proton-invoice.pdf")
  assert.equal(r.kind, "source")
  assert.equal(r.sourceId, "files")
  assert.equal(r.icon, "application-pdf")
  assert.equal(r.appIcon, "")
})

test("fileRow gives images a file:// thumbnail", () => {
  const r = F.fileRow("/home/ks/Pictures/qr code.PNG", HOME)
  assert.equal(r.appIcon, "file:///home/ks/Pictures/qr%20code.PNG")
})

test("iconName falls back to text-x-generic", () => {
  assert.equal(F.iconName("/x/notes.md"), "text-x-generic")
  assert.equal(F.iconName("/x/Makefile"), "text-x-generic")
  assert.equal(F.iconName("/x/a.zip"), "package-x-generic")
})

test("fileRows parses fd output and skips blank lines", () => {
  const rows = F.fileRows("/home/ks/a.txt\n\n/home/ks/b.txt\n", HOME, "")
  assert.deepEqual(rows.map(r => r.label), ["a.txt", "b.txt"])
})

// fileRows(stdout, home, query) reconciled against the shipped FileModel.js:
// it now takes a query and sorts before the group cap: basename-prefix match,
// then paths with no hidden segment, then shallower depth, then alphabetical.
// None of this ranking existed in either plan document.

test("fileRows ranks a basename-prefix match ahead of a mere substring match", () => {
  const stdout = "/home/ks/proton-invoice.pdf\n/home/ks/invoice-2024.pdf\n"
  const rows = F.fileRows(stdout, HOME, "invoice")
  assert.deepEqual(rows.map(r => r.label), ["invoice-2024.pdf", "proton-invoice.pdf"])
})

test("fileRows ranks a visible path ahead of one with a hidden segment", () => {
  const stdout = "/home/ks/.config/notes.txt\n/home/ks/Notes/notes.txt\n"
  const rows = F.fileRows(stdout, HOME, "notes")
  assert.deepEqual(rows.map(r => r.detail), ["Notes/notes.txt", ".config/notes.txt"])
})

test("fileRows ranks a shallower path ahead of a deeper one, prefix and hidden tied", () => {
  const stdout = "/home/ks/a/b/c/notes.txt\n/home/ks/notes.txt\n"
  const rows = F.fileRows(stdout, HOME, "notes")
  assert.deepEqual(rows.map(r => r.detail), ["notes.txt", "a/b/c/notes.txt"])
})

test("fileRows falls back to alphabetical once prefix, hidden and depth all tie", () => {
  const stdout = "/home/ks/zeta.txt\n/home/ks/alpha.txt\n"
  const rows = F.fileRows(stdout, HOME, "")
  assert.deepEqual(rows.map(r => r.label), ["alpha.txt", "zeta.txt"])
})

test("openCommand and revealCommand quote paths", () => {
  assert.equal(F.openCommand("/home/ks/it's here.txt"), "xdg-open '/home/ks/it'\\''s here.txt'")
  assert.equal(F.revealCommand("/home/ks/Docs/a.txt"), "nautilus '/home/ks/Docs'")
})

test("command builders reject empty paths", () => {
  assert.equal(F.openCommand(""), "")
  assert.equal(F.revealCommand(""), "")
})

test("fzfArgs passes the query and fd argv positionally", () => {
  const argv = F.fzfArgs("bind lua", HOME)
  assert.equal(argv[0], "sh")
  assert.ok(argv[2].includes('fzf --filter "$q" --scheme=path'))
  assert.equal(argv[4], "bind lua")
  assert.deepEqual(argv.slice(5, 10), ["fd", "--type", "f", "--color", "never"])
  assert.deepEqual(argv.slice(-2), [".", HOME])
  assert.deepEqual(F.fzfArgs("a", HOME), [])
})

test("fileRows keeps fzf's order when asked", () => {
  const out = `${HOME}/deep/a/b/zeta.txt\n${HOME}/alpha.txt\n`
  assert.deepEqual(F.fileRows(out, HOME, "a", true).map(r => r.label), ["zeta.txt", "alpha.txt"])
  assert.deepEqual(F.fileRows(out, HOME, "a", false).map(r => r.label), ["alpha.txt", "zeta.txt"])
})
