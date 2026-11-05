import { test } from "node:test"
import assert from "node:assert/strict"
import { loadRunnerModel } from "./helpers/load-runner-model.mjs"

const RunnerModel = await loadRunnerModel()

const MENU = `{ "root": { "label": "Omarchy" }, "apps": { "label": "Apps", "provider": "apps" } }`

function app(label) {
  return { id: "apps." + label.toLowerCase(), parent: "apps", kind: "app", icon: "", iconFont: "", appIcon: label.toLowerCase(),
    appId: label.toLowerCase() + ".desktop", label, title: "", target: "", description: "", action: "", provider: "",
    aliases: [], when: "", checked: "" }
}

function fixture() {
  const base = RunnerModel.mergeMenuSources(RunnerModel.parseMenuJsonc(MENU), [])
  return RunnerModel.mergeAppRows(base.items, base.itemOrder, [app("Alacritty"), app("Brave"), app("Kitty")])
}

// What HistoryModel.startGroups hands the runner: favorites of every kind.
function startGroups() {
  return [{ section: "start:favorites", label: "Favorites", rows: [
    { itemId: "apps.kitty", kind: "app", appId: "kitty.desktop", label: "Kitty", section: "start:favorites" },
    { itemId: "files", kind: "source", sourceId: "files", value: "/home/ks/a.txt", label: "a.txt", section: "start:favorites" },
    { itemId: "apps.ghost", kind: "app", appId: "ghost.desktop", label: "Ghost", section: "start:favorites" }
  ] }]
}

test("the Apps page lists favorite apps first under a Favorites heading", () => {
  const { items, itemOrder } = fixture()
  const r = RunnerModel.buildRows(items, itemOrder, {}, {}, "apps", "", [], {}, false, startGroups())
  assert.deepEqual(r.rows.map(x => [x.label, x.section]),
    [["Kitty", "start:favorites"], ["Alacritty", "group:apps"], ["Brave", "group:apps"]])
  assert.deepEqual(r.sectionLabels, { "start:favorites": "Favorites", "group:apps": "Applications" })
})

test("the Apps page leaves out favorites that are not apps or not installed", () => {
  const { items, itemOrder } = fixture()
  const r = RunnerModel.buildRows(items, itemOrder, {}, {}, "apps", "", [], {}, false, startGroups())
  assert.equal(r.rows.some(x => x.label === "a.txt" || x.label === "Ghost"), false)
})

test("the Apps page without favorites is the plain A-Z list", () => {
  const { items, itemOrder } = fixture()
  const r = RunnerModel.buildRows(items, itemOrder, {}, {}, "apps", "", [], {}, false, [])
  assert.deepEqual(r.rows.map(x => x.label), ["Alacritty", "Brave", "Kitty"])
  assert.deepEqual(r.sectionLabels, { "group:apps": "Applications" })
})

test("searching the Apps page returns apps only, no favorites group", () => {
  const { items, itemOrder } = fixture()
  const r = RunnerModel.buildRows(items, itemOrder, {}, {}, "apps", "kit", [], {}, false, startGroups())
  assert.deepEqual(r.rows.map(x => x.label), ["Kitty"])
  assert.equal(r.rows[0].section, "group:apps")
  assert.deepEqual(r.sectionLabels, { "group:apps": "Applications" })
})
