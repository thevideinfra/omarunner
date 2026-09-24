import { test } from "node:test"
import assert from "node:assert/strict"
import { loadRunnerModel } from "./helpers/load-runner-model.mjs"

const RunnerModel = await loadRunnerModel()

// A miniature menu tree in the same JSONC shape the shell parses at startup.
const MENU_JSONC = `{
  "root": { "label": "Omarchy" },
  "apps": { "label": "Apps" },
  "apps.editor": { "label": "Editor", "action": "run-editor" },
  "style": { "label": "Style" },
  "style.theme": { "label": "Theme", "action": "omarchy-theme-menu" },
  "style.font": { "label": "Font", "action": "omarchy-font-menu", "when": "font-guard" },
  "learn": { "label": "Learn" },
  "learn.keybindings": { "label": "Keybindings", "action": "omarchy-menu-keybindings" }
}`

function fixture() {
  const parsed = RunnerModel.parseMenuJsonc(MENU_JSONC)
  return RunnerModel.mergeMenuSources(parsed, [])
}

function build(activeMenu, query) {
  const { items, itemOrder } = fixture()
  return RunnerModel.buildRows(items, itemOrder, {}, {}, activeMenu, query)
}

test("root with an empty query produces no rows", () => {
  const result = build("root", "")
  assert.deepEqual(result.rows, [])
  assert.equal(result.searchDivider, false)
})

test("root with a whitespace-only query still produces no rows", () => {
  assert.deepEqual(build("root", "   ").rows, [])
})

test("a submenu with an empty query lists its children", () => {
  const labels = build("style", "").rows.map(row => row.label)
  assert.deepEqual(labels, ["Theme", "Font"])
})

test("a query at root searches the whole tree, not just the top level", () => {
  const labels = build("root", "theme").rows.map(row => row.label)
  assert.deepEqual(labels, ["Theme"])
})

test("query rows carry their parent path as detail", () => {
  const [row] = build("root", "keybindings").rows
  assert.equal(row.label, "Keybindings")
  assert.equal(row.detail, "Learn")
})

test("current-level matches sort ahead of drill-down matches and set the divider", () => {
  const result = build("style", "f")
  assert.equal(result.rows[0].label, "Font")
  assert.equal(result.searchDivider, false)
})

test("an unknown active menu falls back to root", () => {
  const result = build("nope", "")
  assert.equal(result.activeMenu, "root")
  assert.deepEqual(result.rows, [])
})

test("hidden entries are dropped from an empty-query submenu", () => {
  const { items, itemOrder } = fixture()
  const result = RunnerModel.buildRows(items, itemOrder, { "style.font": false }, {}, "style", "")
  assert.deepEqual(result.rows.map(row => row.label), ["Theme"])
})

test("the apps submenu is listed alphabetically", () => {
  const parsed = RunnerModel.parseMenuJsonc(`{
    "root": { "label": "Omarchy" },
    "apps": { "label": "Apps" },
    "apps.zed": { "label": "Zed", "action": "zed" },
    "apps.brave": { "label": "Brave", "action": "brave" }
  }`)
  const { items, itemOrder } = RunnerModel.mergeMenuSources(parsed, [])
  const labels = RunnerModel.buildRows(items, itemOrder, {}, {}, "apps", "").rows.map(row => row.label)
  assert.deepEqual(labels, ["Brave", "Zed"])
})

// -- Phase 1: source groups appended after menu rows (RunnerModel.js's 7th
// buildRows argument), reconciled against the shipped displayRow's
// sourceId/value roles.

function sourceRow(label, sourceId) {
  return { itemId: sourceId + "." + label, kind: "source", icon: "", iconFont: "", appIcon: "", appId: "",
    label, target: "", detail: "", path: "", childCount: 0, action: "", provider: "", score: 0,
    section: "", sourceId, value: "/home/x/" + label }
}

test("menu rows carry empty sourceId and value roles", () => {
  const [row] = build("root", "theme").rows
  assert.equal(row.sourceId, "")
  assert.equal(row.value, "")
})

test("source groups append after menu rows with named sections", () => {
  const { items, itemOrder } = fixture()
  const groups = [{ sourceId: "files", groupLabel: "Files", maxRows: 5, rows: [sourceRow("theme.txt", "files")] }]
  const r = RunnerModel.buildRows(items, itemOrder, {}, {}, "root", "theme", groups)
  assert.deepEqual(r.rows.map(x => x.label), ["Theme", "theme.txt"])
  assert.equal(r.rows[1].section, "source:files")
  assert.deepEqual(r.sectionLabels, { "source:files": "Files" })
})

test("source groups are capped at maxRows", () => {
  const { items, itemOrder } = fixture()
  const rows = ["a", "b", "c", "d"].map(l => sourceRow(l, "files"))
  const r = RunnerModel.buildRows(items, itemOrder, {}, {}, "root", "zzz", [{ sourceId: "files", groupLabel: "Files", maxRows: 2, rows }])
  assert.deepEqual(r.rows.map(x => x.label), ["a", "b"])
})

test("empty source groups add no rows and no label", () => {
  const { items, itemOrder } = fixture()
  const r = RunnerModel.buildRows(items, itemOrder, {}, {}, "root", "theme", [{ sourceId: "files", groupLabel: "Files", maxRows: 5, rows: [] }])
  assert.deepEqual(r.rows.map(x => x.label), ["Theme"])
  assert.deepEqual(r.sectionLabels, {})
})

test("source groups are ignored inside a submenu", () => {
  const { items, itemOrder } = fixture()
  const r = RunnerModel.buildRows(items, itemOrder, {}, {}, "style", "t", [{ sourceId: "files", groupLabel: "Files", maxRows: 5, rows: [sourceRow("t.txt", "files")] }])
  assert.equal(r.rows.some(x => x.sourceId === "files"), false)
})

test("source groups are ignored at a collapsed root", () => {
  const { items, itemOrder } = fixture()
  const r = RunnerModel.buildRows(items, itemOrder, {}, {}, "root", "", [{ sourceId: "files", groupLabel: "Files", maxRows: 5, rows: [sourceRow("t.txt", "files")] }])
  assert.deepEqual(r.rows, [])
})

// -- Fix-wave drift: buildRows() also skips kind: "source-toggle" rows from a
// root search (typing "files" + Enter must not flip the Files source off from
// the search results), but lists them normally on their own "sources" page.
// Neither plan document mentions this; it was added after both were written.

function sourcesFixture() {
  const { items, itemOrder } = fixture()
  // Mirrors what Runner.qml's refreshSourcePage() actually injects: a
  // "sources" menu node plus one source-toggle child per registered source.
  const sourcesMenu = { id: "sources", parent: "root", kind: "menu", icon: "", iconFont: "", label: "Sources",
    title: "Sources", target: "", description: "", action: "", provider: "",
    aliases: [], when: "", checked: "", order: itemOrder.length }
  const toggle = { id: "sources.files", parent: "sources", kind: "source-toggle", icon: "", iconFont: "",
    label: "Files", title: "", target: "", description: "", action: "", provider: "",
    aliases: [], when: "", checked: "config", value: "files", order: itemOrder.length + 1 }
  items[sourcesMenu.id] = sourcesMenu
  items[toggle.id] = toggle
  const nextOrder = itemOrder.concat([sourcesMenu.id, toggle.id])
  return { items, itemOrder: nextOrder }
}

test("a source-toggle row is invisible to a root search", () => {
  const { items, itemOrder } = sourcesFixture()
  const r = RunnerModel.buildRows(items, itemOrder, {}, {}, "root", "files")
  assert.equal(r.rows.some(row => row.itemId === "sources.files"), false)
})

test("a source-toggle row is searchable on the sources page itself", () => {
  const { items, itemOrder } = sourcesFixture()
  const r = RunnerModel.buildRows(items, itemOrder, {}, {}, "sources", "files")
  assert.deepEqual(r.rows.map(row => row.itemId), ["sources.files"])
})
