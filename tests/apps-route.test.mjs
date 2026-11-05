import { test } from "node:test"
import assert from "node:assert/strict"
import { loadRunnerModel } from "./helpers/load-runner-model.mjs"

const RunnerModel = await loadRunnerModel()

// Omarchy 4.5 gives the Apps row both a provider and a dock action. omarunner
// keeps showing its own app list: a provider row is a menu, not a leaf.
const MENU = `{
  "root": { "label": "Omarchy" },
  "apps": { "label": "Apps", "aliases": ["app"], "provider": "apps", "action": "omarchy-shell omarchy.dock apps" },
  "learn.keybindings": { "label": "Keybindings", "action": "omarchy-menu-keybindings" }
}`

function merged() {
  return RunnerModel.mergeMenuSources(RunnerModel.parseMenuJsonc(MENU), [])
}

test("a row with a provider stays a menu even when it has an action", () => {
  const { items } = merged()
  assert.equal(items.apps.kind, "menu")
  assert.equal(items.apps.provider, "apps")
})

test("a row with only an action is still a leaf", () => {
  const { items } = merged()
  assert.equal(items["learn.keybindings"].kind, "action")
})

test("the apps route resolves to the menu, not the dock action", () => {
  const { items, itemOrder } = merged()
  const id = RunnerModel.resolveRoute(items, itemOrder, "apps")
  assert.equal(items[id].kind, "menu")
})
