import { test } from "node:test"
import assert from "node:assert/strict"
import { loadJsModule } from "./helpers/load-js-module.mjs"
const F = await loadJsModule("FolderModel.js")
const HOME = "/home/ks"

const LIST = `/home/ks/Documents/
/home/ks/Downloads/
/home/ks/Projects/
/home/ks/Projects/omarunner/
/home/ks/Documents/Docs archive/
/home/ks/.config/hypr/
/etc
/proc
/usr
/home/ks/Downloads/
`
const folders = F.parseList(LIST)
const names = q => F.matches(folders, q, true).map(f => f.path)

test("parseList strips slashes, duplicates and pseudo filesystems", () => {
  assert.equal(folders.some(f => f.path === "/proc"), false)
  assert.equal(folders.filter(f => f.path === "/home/ks/Downloads").length, 1)
  assert.deepEqual(folders[0], { path: "/home/ks/Documents", name: "Documents" })
})

test("editDistance counts a transposition as one step", () => {
  assert.equal(F.editDistance("downlaods", "downloads"), 1)
  assert.equal(F.editDistance("docmuents", "documents"), 1)
  assert.equal(F.editDistance("abc", "abc"), 0)
  assert.equal(F.editDistance("", "abc"), 3)
})

test("names match regardless of case, and typos still find the folder", () => {
  assert.deepEqual(names("documents")[0], "/home/ks/Documents")
  assert.deepEqual(names("DOWNLOADS")[0], "/home/ks/Downloads")
  assert.deepEqual(names("downlaods")[0], "/home/ks/Downloads")
  assert.deepEqual(names("docmuents")[0], "/home/ks/Documents")
  assert.deepEqual(names("downl")[0], "/home/ks/Downloads")
})

test("etc finds /etc without the slash", () => {
  assert.deepEqual(names("etc"), ["/etc"])
})

test("hidden config folders match without their dot", () => {
  assert.deepEqual(names("hypr"), ["/home/ks/.config/hypr"])
})

test("exact beats prefix beats typo, then shallower paths", () => {
  assert.equal(F.matchTier("Documents", "documents"), 0)
  assert.equal(F.matchTier("Documents", "docu"), 1)
  assert.equal(F.matchTier("Documents", "docmuents"), 2)
  assert.equal(F.matchTier("Docs archive", "arch"), 3)
  assert.equal(F.matchTier("omarunner", "omrnr", true), 4)
  assert.equal(F.matchTier("omarunner", "omrnr", false), -1)
  assert.equal(F.matchTier("Documents", "d"), -1)
})

test("short or unrelated queries find nothing; path queries are left to Open", () => {
  assert.deepEqual(names("firefox"), [])
  assert.deepEqual(names("/etc"), [])
  assert.deepEqual(names("~/Documents"), [])
  assert.deepEqual(names("my docs"), [])
})

test("rows show the path under ~ and open or start a terminal there", () => {
  const row = F.row({ path: "/home/ks/Documents", name: "Documents" }, HOME)
  assert.equal(row.label, "Documents")
  assert.equal(row.detail, "~/Documents")
  assert.equal(row.value, "/home/ks/Documents")
  assert.equal(F.row({ path: "/etc", name: "etc" }, HOME).detail, "/etc")
  assert.deepEqual(F.openArgv("/etc"), ["xdg-open", "/etc"])
  assert.deepEqual(F.terminalArgv("/etc"), ["xdg-terminal-exec", "--dir=/etc"])
})

test("fuzzy folder hits keep the letters close", () => {
  assert.equal(F.matchTier("chromium-headless", "code", true), -1)
  assert.equal(F.matchTier("omarunner", "omrnr", true), 4)
})
