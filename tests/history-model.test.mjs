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

test("favoritesShown caps or hides the favorites; pinned items stay out of history", () => {
  const favs = ["a", "b", "c"].map(n => H.entryFromRow({ ...file, value: "/" + n, label: n }))
  assert.deepEqual(H.startGroups(favs, [], 0, 2)[0].rows.map(r => r.label), ["a", "b"])
  assert.deepEqual(H.startGroups(favs, [], 0)[0].rows.map(r => r.label), ["a", "b", "c"])
  assert.deepEqual(H.startGroups(favs, [], 0, 0), [])
  const hist = H.record([], favs[0], 1, 50)
  assert.deepEqual(H.startGroups(favs, hist, 5, 0), [])
})

test("sameKeys compares lists by key, optionally by order", () => {
  const a = { key: "a" }, b = { key: "b" }
  assert.equal(H.sameKeys([a, b], [b, a]), true)
  assert.equal(H.sameKeys([a, b], [b, a], true), false)
  assert.equal(H.sameKeys([a], [a, b]), false)
})

test("pinning past the limit changes nothing; moving the first item up changes nothing", () => {
  let f = []
  for (let i = 0; i < 30; i++) f = H.toggleFavorite(f, H.entryFromRow({ ...file, value: "/f" + i, label: "f" + i }))
  const extra = H.entryFromRow({ ...file, value: "/extra", label: "extra" })
  assert.equal(H.sameKeys(H.toggleFavorite(f, extra), f), true)
  assert.equal(H.sameKeys(H.moveFavorite(f, f[0].key, -1), f, true), true)
  assert.equal(H.sameKeys(H.moveFavorite(f, f[0].key, 1), f, true), false)
})

test("entries whose app is gone or path is missing are left out of the start screen", () => {
  const gone = H.entryFromRow({ ...file, value: "/gone/a.txt", label: "gone" })
  const here = H.entryFromRow({ ...file, value: "/here/b.txt", label: "here" })
  const uninstalled = H.entryFromRow(app)
  assert.deepEqual(H.entryPaths([gone, here, uninstalled, gone]), ["/gone/a.txt", "/here/b.txt"])
  assert.equal(H.entryPath({ kind: "source", sourceId: "locations", value: "/x" }), "")
  const skip = H.unavailableKeys([gone, here, uninstalled], ["other"], { "/gone/a.txt": true })
  assert.deepEqual(Object.keys(skip).sort(), [gone.key, uninstalled.key].sort())
  assert.deepEqual(Object.keys(H.unavailableKeys([uninstalled], [], {})), [])
  const groups = H.startGroups([gone, here], [uninstalled], 5, 30, skip)
  assert.deepEqual(groups.map(g => g.rows.map(r => r.label)), [["here"]])
})
