import { test } from "node:test"
import assert from "node:assert/strict"
import { loadJsModule } from "./helpers/load-js-module.mjs"
const H = await loadJsModule("HistoryModel.js")

const app = { itemId: "apps.firefox", kind: "app", icon: "", iconFont: "", appIcon: "firefox", appId: "firefox", label: "Firefox",
  target: "", detail: "", action: "", sourceId: "", value: "" }
const file = { itemId: "files./home/ks/a.txt", kind: "source", icon: "text-x-generic", iconFont: "", appIcon: "", appId: "", label: "a.txt",
  target: "", detail: "docs/a.txt", action: "", sourceId: "files", value: "/home/ks/a.txt" }
const menu = { itemId: "style.theme", kind: "action", icon: "", iconFont: "", appIcon: "", appId: "", label: "Theme",
  target: "", detail: "", action: "omarchy-theme-menu", sourceId: "", value: "" }

test("only apps, files, folders, recent files and menu actions are recorded", () => {
  assert.equal(H.recordable(app), true)
  assert.equal(H.recordable(file), true)
  assert.equal(H.recordable({ ...file, sourceId: "folders" }), true)
  assert.equal(H.recordable({ ...file, sourceId: "recent" }), true)
  assert.equal(H.recordable(menu), true)
  for (const sourceId of ["clipboard", "command", "kill", "calc", "web", "windows", "locations"]) {
    assert.equal(H.recordable({ ...file, sourceId }), false, sourceId)
  }
  assert.equal(H.recordable({ ...menu, itemId: "omarunner-settings.keys" }), false)
  assert.equal(H.recordable({ ...menu, action: "" }), false)
  assert.equal(H.recordable({ kind: "setting-toggle", itemId: "x" }), false)
  assert.equal(H.recordable(null), false)
})

test("pinnable adds opened locations and submenus, never the settings pages", () => {
  assert.equal(H.pinnable({ ...file, sourceId: "locations" }), true)
  assert.equal(H.pinnable({ itemId: "style", kind: "menu", target: "style", label: "Style" }), true)
  assert.equal(H.pinnable({ itemId: "omarunner-settings", kind: "menu", label: "x" }), false)
  assert.equal(H.pinnable({ ...file, sourceId: "clipboard" }), false)
})

test("entries get stable keys per kind", () => {
  assert.equal(H.keyFor(app), "app:firefox")
  assert.equal(H.keyFor(file), "source:files:/home/ks/a.txt")
  assert.equal(H.keyFor(menu), "action:style.theme")
  assert.equal(H.keyFor({ kind: "menu", itemId: "style", target: "style" }), "menu:style")
})

test("a launch moves its entry to the front and counts, within the cap", () => {
  const e = H.entryFromRow(app)
  let h = H.record([], e, 100, 3)
  h = H.record(h, H.entryFromRow(file), 200, 3)
  h = H.record(h, H.entryFromRow(menu), 300, 3)
  assert.deepEqual(h.map(x => x.key), ["action:style.theme", "source:files:/home/ks/a.txt", "app:firefox"])
  h = H.record(h, e, 400, 3)
  assert.deepEqual(h.map(x => x.key)[0], "app:firefox")
  assert.equal(h[0].count, 2)
  assert.equal(h[0].last, 400)
  h = H.record(h, H.entryFromRow({ ...file, value: "/home/ks/b.txt", label: "b.txt" }), 500, 3)
  assert.equal(h.length, 3)
})

test("clean drops malformed stored entries", () => {
  const out = H.clean([{ key: "app:x", kind: "app", label: "X", appId: "x" }, { kind: "app" }, null, "x",
    { key: "app:x", kind: "app" }, { key: "weird", kind: "evil" }], 10)
  assert.deepEqual(out.map(e => e.key), ["app:x"])
  assert.deepEqual(H.clean("nope", 10), [])
})

test("pinning toggles, unpinning removes, reordering swaps", () => {
  let f = H.toggleFavorite([], { ...H.entryFromRow(app) })
  f = H.toggleFavorite(f, H.entryFromRow(file))
  f = H.toggleFavorite(f, H.entryFromRow(menu))
  assert.deepEqual(f.map(e => e.label), ["Firefox", "a.txt", "Theme"])
  assert.equal(H.isFavorite(f, "app:firefox"), true)
  assert.deepEqual(H.moveFavorite(f, "action:style.theme", -1).map(e => e.label), ["Firefox", "Theme", "a.txt"])
  assert.deepEqual(H.moveFavorite(f, "app:firefox", -1).map(e => e.label), ["Firefox", "a.txt", "Theme"])
  assert.deepEqual(H.moveFavorite(f, "action:style.theme", 1).map(e => e.label), ["Firefox", "a.txt", "Theme"])
  assert.deepEqual(H.removeFavorite(f, "source:files:/home/ks/a.txt").map(e => e.label), ["Firefox", "Theme"])
  assert.deepEqual(H.toggleFavorite(f, H.entryFromRow(app)).map(e => e.label), ["a.txt", "Theme"])
})

test("favorites cap at 30", () => {
  let f = []
  for (let i = 0; i < 35; i++) f = H.toggleFavorite(f, H.entryFromRow({ ...file, value: "/f" + i, label: "f" + i }))
  assert.equal(f.length, 30)
})

test("the start groups list favorites first, then recents that are not pinned", () => {
  const fav = [H.entryFromRow(app)]
  let hist = []
  hist = H.record(hist, H.entryFromRow(menu), 1, 50)
  hist = H.record(hist, H.entryFromRow(app), 2, 50)
  hist = H.record(hist, H.entryFromRow(file), 3, 50)
  const groups = H.startGroups(fav, hist, 5)
  assert.deepEqual(groups.map(g => g.section), ["start:favorites", "start:history"])
  assert.deepEqual(groups[0].rows.map(r => r.label), ["Firefox"])
  assert.deepEqual(groups[1].rows.map(r => r.label), ["a.txt", "Theme"])
  assert.equal(groups[1].rows[0].section, "start:history")
  assert.deepEqual(H.startGroups(fav, hist, 1)[1].rows.map(r => r.label), ["a.txt"])
  assert.deepEqual(H.startGroups(fav, hist, 0).map(g => g.section), ["start:favorites"])
  assert.deepEqual(H.startGroups([], hist, 0), [])
  assert.deepEqual(H.startGroups([], [], 5), [])
})

test("rows rebuilt from entries carry every display role and can be activated again", () => {
  const row = H.rowFromEntry(H.entryFromRow(file), "start:history")
  for (const role of ["itemId", "kind", "icon", "iconFont", "appIcon", "appId", "label", "target", "detail", "path", "childCount",
    "action", "provider", "score", "section", "sourceId", "value"]) assert.ok(role in row, role)
  assert.equal(row.sourceId, "files")
  assert.equal(row.value, "/home/ks/a.txt")
})
