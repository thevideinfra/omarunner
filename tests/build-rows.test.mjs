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
  assert.deepEqual(r.sectionLabels, { "group:menu": "Omarchy", "source:files": "Files" })
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
  assert.deepEqual(r.sectionLabels, { "group:menu": "Omarchy" })
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

// -- KRunner layout: a root search groups menu-tree rows into Applications and
// Omarchy, each labelled in the category column, ordered by best score.

function appsFixture() {
  const { items, itemOrder } = fixture()
  const app = (id, label) => ({ id, parent: "apps", kind: "app", icon: "", iconFont: "", appIcon: label.toLowerCase(),
    appId: label.toLowerCase() + ".desktop", label, title: "", target: "", description: "", action: "", provider: "",
    aliases: [], when: "", checked: "" })
  return RunnerModel.mergeAppRows(items, itemOrder, [app("apps.themer", "Themer"), app("apps.fontforge", "FontForge")])
}

test("a root search splits menu rows and app rows into labelled groups", () => {
  const { items, itemOrder } = appsFixture()
  const r = RunnerModel.buildRows(items, itemOrder, {}, {}, "root", "theme")
  assert.deepEqual(r.rows.map(x => [x.label, x.section]), [["Theme", "group:menu"], ["Themer", "group:apps"]])
  assert.deepEqual(r.sectionLabels, { "group:menu": "Omarchy", "group:apps": "Applications" })
  assert.equal(r.searchDivider, false)
})

test("the group holding the best-scored row comes first", () => {
  const { items, itemOrder } = appsFixture()
  const r = RunnerModel.buildRows(items, itemOrder, {}, {}, "root", "fontforge")
  assert.equal(r.rows[0].section, "group:apps")
  const r2 = RunnerModel.buildRows(items, itemOrder, {}, {}, "root", "font")
  assert.deepEqual(r2.rows.map(x => x.section), ["group:menu", "group:apps"])
})

test("source groups follow both menu-tree groups", () => {
  const { items, itemOrder } = appsFixture()
  const groups = [{ sourceId: "files", groupLabel: "Files", maxRows: 5, rows: [sourceRow("theme.txt", "files")] }]
  const r = RunnerModel.buildRows(items, itemOrder, {}, {}, "root", "theme", groups)
  assert.deepEqual(r.rows.map(x => x.section), ["group:menu", "group:apps", "source:files"])
})

test("a root search groups drill-down matches without a drilldown divider", () => {
  const r = build("root", "e")
  assert.equal(r.searchDivider, false)
  assert.equal(r.rows.every(x => x.section === "group:menu"), true)
})

test("a submenu search has no group sections", () => {
  const r = build("style", "t")
  assert.equal(r.rows.some(x => x.section.indexOf("group:") === 0), false)
  assert.deepEqual(r.sectionLabels, {})
})

// -- Sources page: Applications and Omarchy are toggleable like any source.
// buildRows' 8th argument names the menu-tree groups switched off.

test("a hidden apps group drops app rows from a root search", () => {
  const { items, itemOrder } = appsFixture()
  const r = RunnerModel.buildRows(items, itemOrder, {}, {}, "root", "theme", [], { apps: true })
  assert.deepEqual(r.rows.map(x => x.label), ["Theme"])
  assert.deepEqual(r.sectionLabels, { "group:menu": "Omarchy" })
})

test("a hidden menu group drops Omarchy rows from a root search", () => {
  const { items, itemOrder } = appsFixture()
  const r = RunnerModel.buildRows(items, itemOrder, {}, {}, "root", "theme", [], { menu: true })
  assert.deepEqual(r.rows.map(x => x.label), ["Themer"])
})

test("hidden groups never affect submenus", () => {
  const r = RunnerModel.buildRows(fixture().items, fixture().itemOrder, {}, {}, "style", "", [], { menu: true })
  assert.deepEqual(r.rows.map(x => x.label), ["Theme", "Font"])
})

// -- More sources: leading groups (calculator, locations) sit above the
// menu-tree groups; an exclusive group (a claimed prefix like "kill ") hides
// everything else; System entries form their own Session group.

test("a leading source group comes before the menu-tree groups", () => {
  const { items, itemOrder } = appsFixture()
  const groups = [
    { sourceId: "files", groupLabel: "Files", maxRows: 5, rows: [sourceRow("theme.txt", "files")] },
    { sourceId: "calc", groupLabel: "Calculator", maxRows: 1, leading: true, rows: [sourceRow("= 4", "calc")] }
  ]
  const r = RunnerModel.buildRows(items, itemOrder, {}, {}, "root", "theme", groups)
  assert.deepEqual(r.rows.map(x => x.section), ["source:calc", "group:menu", "group:apps", "source:files"])
})

test("an exclusive group replaces every other row", () => {
  const { items, itemOrder } = appsFixture()
  const groups = [
    { sourceId: "files", groupLabel: "Files", maxRows: 5, rows: [sourceRow("theme.txt", "files")] },
    { sourceId: "kill", groupLabel: "Kill", maxRows: 8, exclusive: true, rows: [sourceRow("Kill theme", "kill")] }
  ]
  const r = RunnerModel.buildRows(items, itemOrder, {}, {}, "root", "theme", groups)
  assert.deepEqual(r.rows.map(x => x.label), ["Kill theme"])
  assert.deepEqual(r.sectionLabels, { "source:kill": "Kill" })
})

test("an exclusive group with no rows still hides everything else", () => {
  const { items, itemOrder } = appsFixture()
  const r = RunnerModel.buildRows(items, itemOrder, {}, {}, "root", "theme",
    [{ sourceId: "kill", groupLabel: "Kill", maxRows: 8, exclusive: true, rows: [] }])
  assert.deepEqual(r.rows, [])
})

function sessionFixture() {
  const parsed = RunnerModel.parseMenuJsonc(`{
    "root": { "label": "Omarchy" },
    "system": { "label": "System" },
    "system.lock": { "label": "Lock", "action": "omarchy-system-lock" },
    "system.reboot": { "label": "Reboot", "action": "omarchy-system-reboot" },
    "system.shutdown": { "label": "Shutdown", "action": "omarchy-system-shutdown" },
    "style": { "label": "Style" },
    "style.lockscreen": { "label": "Lockscreen", "action": "x" }
  }`)
  const merged = RunnerModel.mergeMenuSources(parsed, [])
  return { items: RunnerModel.withSessionAliases(merged.items), itemOrder: merged.itemOrder }
}

test("System entries form a Session group", () => {
  const { items, itemOrder } = sessionFixture()
  const r = RunnerModel.buildRows(items, itemOrder, {}, {}, "root", "lock")
  assert.deepEqual(r.rows.map(x => [x.label, x.section]), [["Lock", "group:session"], ["Lockscreen", "group:menu"]])
  assert.equal(r.sectionLabels["group:session"], "Session")
})

test("KRunner session words reach the System entries", () => {
  const { items, itemOrder } = sessionFixture()
  const labels = q => RunnerModel.buildRows(items, itemOrder, {}, {}, "root", q).rows.map(x => x.label)
  assert.deepEqual(labels("restart"), ["Reboot"])
  assert.deepEqual(labels("power off"), ["Shutdown"])
})

test("a hidden session group drops System entries", () => {
  const { items, itemOrder } = sessionFixture()
  const r = RunnerModel.buildRows(items, itemOrder, {}, {}, "root", "lock", [], { session: true })
  assert.deepEqual(r.rows.map(x => x.label), ["Lockscreen"])
})

test("an exact alias on an action outranks the same alias on a submenu", () => {
  const parsed = RunnerModel.parseMenuJsonc(`{
    "root": { "label": "Omarchy" },
    "update": { "label": "Update", "aliases": ["restart", "refresh"] },
    "update.process": { "label": "Process", "title": "Restart" },
    "update.process.shell": { "label": "Shell", "action": "omarchy-restart-shell" },
    "system": { "label": "System" },
    "system.reboot": { "label": "Reboot", "action": "omarchy-system-reboot" }
  }`)
  const merged = RunnerModel.mergeMenuSources(parsed, [])
  const items = RunnerModel.withSessionAliases(merged.items)
  const r = RunnerModel.buildRows(items, merged.itemOrder, {}, {}, "root", "restart")
  assert.equal(r.rows[0].label, "Reboot")
  assert.equal(r.rows[0].section, "group:session")
})

// -- Fuzzy matching (9th buildRows argument): letters in order inside the
// label, for queries of 3+ characters, ranked below every normal match.

function fuzzyFixture() {
  const { items, itemOrder } = fixture()
  const app = (id, label) => ({ id, parent: "apps", kind: "app", icon: "", iconFont: "", appIcon: "", appId: id,
    label, title: "", target: "", description: "", action: "", provider: "", aliases: [], when: "", checked: "" })
  return RunnerModel.mergeAppRows(items, itemOrder, [app("apps.firefox", "Firefox"), app("apps.frfx", "Frfx Tool")])
}

test("fuzzy matching finds letters in order only when enabled", () => {
  const { items, itemOrder } = fuzzyFixture()
  const on = RunnerModel.buildRows(items, itemOrder, {}, {}, "root", "frfox", [], {}, true)
  assert.deepEqual(on.rows.map(x => x.label), ["Firefox"])
  const off = RunnerModel.buildRows(items, itemOrder, {}, {}, "root", "frfox", [], {}, false)
  assert.deepEqual(off.rows, [])
})

test("fuzzy hits rank below substring hits", () => {
  const { items, itemOrder } = fuzzyFixture()
  const r = RunnerModel.buildRows(items, itemOrder, {}, {}, "root", "frfx", [], {}, true)
  assert.deepEqual(r.rows.map(x => x.label), ["Frfx Tool", "Firefox"])
})

test("fuzzy needs three characters", () => {
  const { items, itemOrder } = fuzzyFixture()
  assert.deepEqual(RunnerModel.buildRows(items, itemOrder, {}, {}, "root", "fe", [], {}, true).rows, [])
})

test("fuzzyGaps counts skipped letters, -1 when out of order", () => {
  assert.equal(RunnerModel.fuzzyGaps("frfx", "firefox"), 3)
  assert.equal(RunnerModel.fuzzyGaps("abc", "abc"), 0)
  assert.equal(RunnerModel.fuzzyGaps("xfr", "firefox"), -1)
})

test("settings rows only list inside their own page", () => {
  const { items, itemOrder } = fixture()
  items["settings"] = { id: "settings", parent: "root", kind: "menu", label: "Settings", aliases: [], order: 90 }
  items["settings.width"] = { id: "settings.width", parent: "settings", kind: "menu", label: "Width · Normal", aliases: [], order: 91 }
  items["settings.width.0"] = { id: "settings.width.0", parent: "settings.width", kind: "setting-option", label: "Narrow",
    aliases: [], checked: "config", value: "width=420", order: 92 }
  items["settings.fuzzy"] = { id: "settings.fuzzy", parent: "settings", kind: "setting-toggle", label: "Fuzzy matching",
    aliases: [], checked: "config", value: "fuzzy", order: 93 }
  const order = itemOrder.concat(["settings", "settings.width", "settings.width.0", "settings.fuzzy"])
  assert.equal(RunnerModel.buildRows(items, order, {}, {}, "root", "narrow").rows.length, 0)
  assert.equal(RunnerModel.buildRows(items, order, {}, {}, "root", "fuzzy").rows.length, 0)
  assert.deepEqual(RunnerModel.buildRows(items, order, {}, {}, "settings.width", "narrow").rows.map(x => x.label), ["Narrow"])
})

test("fuzzy needs the first letter at a word start and a tight spread", () => {
  assert.equal(RunnerModel.fuzzyWordStart("lib", "clipboard"), false)
  assert.equal(RunnerModel.fuzzyWordStart("bad", "clipboard"), false)
  assert.equal(RunnerModel.fuzzyWordStart("clpbd", "clipboard"), true)
  assert.equal(RunnerModel.fuzzyWordStart("frfox", "firefox"), true)
  assert.equal(RunnerModel.fuzzyWordStart("scrsvr", "screensaver"), true)
  assert.equal(RunnerModel.fuzzyWordStart("hapt", "touchpad haptics"), true)
  // a, then letters scattered across a long label: too loose
  assert.equal(RunnerModel.fuzzyWordStart("ade", "a very long label with d then e"), false)
})

test("a fallback group shows only when nothing else matched", () => {
  const { items, itemOrder } = appsFixture()
  const web = { sourceId: "web", groupLabel: "Web", maxRows: 1, fallback: true, rows: [sourceRow("Search the web", "web")] }
  const withHits = RunnerModel.buildRows(items, itemOrder, {}, {}, "root", "theme", [web])
  assert.equal(withHits.rows.some(x => x.sourceId === "web"), false)
  assert.equal("source:web" in withHits.sectionLabels, false)
  const alone = RunnerModel.buildRows(items, itemOrder, {}, {}, "root", "zzqx", [web])
  assert.deepEqual(alone.rows.map(x => x.label), ["Search the web"])
  const files = { sourceId: "files", groupLabel: "Files", maxRows: 5, rows: [sourceRow("zzqx.txt", "files")] }
  const afterFiles = RunnerModel.buildRows(items, itemOrder, {}, {}, "root", "zzqx", [files, web])
  assert.deepEqual(afterFiles.rows.map(x => x.label), ["zzqx.txt"])
})

test("fuzzy gaps are measured from the matched word", () => {
  assert.equal(RunnerModel.fuzzyWordGaps("edt", "text editor"), 1)
  assert.equal(RunnerModel.fuzzyWordGaps("lib", "clipboard"), -1)
  assert.equal(RunnerModel.fuzzyWordStart("edt", "text editor"), true)
})

test("Settings and Sources sub-entries stay off the root search", () => {
  const { items, itemOrder } = fixture()
  items["settings"] = { id: "settings", parent: "root", kind: "menu", label: "Settings", aliases: [], order: 90 }
  items["settings.fontFamily"] = { id: "settings.fontFamily", parent: "settings", kind: "menu", label: "Font · Omarchy default", aliases: [], order: 91 }
  items["settings.fontFamily.1"] = { id: "settings.fontFamily.1", parent: "settings.fontFamily", kind: "setting-option", label: "Sans",
    aliases: [], checked: "config", value: "fontFamily=sans-serif", order: 92 }
  const order = itemOrder.concat(["settings", "settings.fontFamily", "settings.fontFamily.1"])
  const labels = q => RunnerModel.buildRows(items, order, {}, {}, "root", q).rows.map(x => x.label)
  assert.deepEqual(labels("font"), ["Font"])
  assert.deepEqual(labels("settings"), ["Settings"])
  assert.deepEqual(RunnerModel.buildRows(items, order, {}, {}, "settings", "font").rows.map(x => x.label), ["Font · Omarchy default"])
})
