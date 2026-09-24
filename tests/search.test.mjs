// Characterization tests for RunnerModel's search/route helpers. None of these
// existed in either recovered plan document; they were added during a later
// fix wave and must be pinned directly against the shipped source so upstream
// drift (or an accidental behavior change) is caught.
import { test } from "node:test"
import assert from "node:assert/strict"
import { loadRunnerModel } from "./helpers/load-runner-model.mjs"

const RunnerModel = await loadRunnerModel()

test("searchableToken turns dot/underscore/hyphen runs into a single space", () => {
  assert.equal(RunnerModel.searchableToken("foo_bar-baz.qux"), "foo bar baz qux")
  assert.equal(RunnerModel.searchableToken("a...b___c---d"), "a b c d")
  assert.equal(RunnerModel.searchableToken(""), "")
  assert.equal(RunnerModel.searchableToken(null), "")
})

test("nameSearchText joins the label, the tokenized leaf id, and tokenized aliases, lowercased", () => {
  const entry = { id: "apps.org.gnome.Nautilus", label: "Files", aliases: ["File Manager", "org.gnome.Nautilus"] }
  assert.equal(RunnerModel.nameSearchText(entry), "files nautilus file manager org gnome nautilus")
})

test("nameSearchText survives an entry with no aliases, and a missing entry", () => {
  // The three joined parts are [label, leaf id, aliases.join(" ")]; with no
  // aliases the last part is "", which still costs a trailing space.
  assert.equal(RunnerModel.nameSearchText({ id: "setup.power", label: "Power" }), "power power ")
  assert.equal(RunnerModel.nameSearchText(null), "")
})

test("termInSearchWords requires a whole-word match, not a substring", () => {
  assert.equal(RunnerModel.termInSearchWords("cat", "concatenate cats"), false)
  assert.equal(RunnerModel.termInSearchWords("cats", "concatenate cats"), true)
  assert.equal(RunnerModel.termInSearchWords("", "anything at all"), false)
})

test("descriptionTextMatches requires every query term to be a whole word somewhere in the text", () => {
  assert.equal(RunnerModel.descriptionTextMatches("power menu", "the power menu appears here"), true)
  assert.equal(RunnerModel.descriptionTextMatches("power men", "the power menu appears here"), false)
  assert.equal(RunnerModel.descriptionTextMatches("", "anything"), true)
})

test("matchesQuery rejects the root row and anything the guards hid", () => {
  assert.equal(RunnerModel.matchesQuery({ id: "root", label: "Go" }, "go", true), false)
  assert.equal(RunnerModel.matchesQuery({ id: "x", label: "Something" }, "some", false), false)
  assert.equal(RunnerModel.matchesQuery(null, "x", true), false)
})

test("matchesQuery accepts a term as either a name substring or a whole-word description match", () => {
  const entry = { id: "setup.power", label: "Power", aliases: [], description: "shut down or restart the machine" }
  assert.equal(RunnerModel.matchesQuery(entry, "pow", true), true, "name substring")
  assert.equal(RunnerModel.matchesQuery(entry, "restart", true), true, "whole-word description match")
  assert.equal(RunnerModel.matchesQuery(entry, "resta", true), false, "partial word in description does not match")
  assert.equal(RunnerModel.matchesQuery(entry, "pow unrelated", true), false, "every term must match")
})

// searchScore's tiers, pinned to exact values against a small hand-built
// items map so depthFor()/order contributions are known quantities.
//
//   root (order 0, depth 0)
//   style (order 1, depth 0, parent root)
//     style.theme (order 2, depth 1, kind "action")
//   apps (order 3, depth 0, kind "menu")
//     apps.zen (order 99, depth 1, kind "app", label "Zen Browser")
//     apps.foot (order 7, depth 1, kind "app", label "foot")

function scoreFixture() {
  const parsed = RunnerModel.parseMenuJsonc(`{
    "root": { "label": "Omarchy" },
    "style": { "label": "Style" },
    "style.theme": { "label": "Theme", "action": "omarchy-theme-menu" },
    "apps": { "label": "Apps" }
  }`)
  const { items } = RunnerModel.mergeMenuSources(parsed, [])
  items["apps.zen"] = { id: "apps.zen", parent: "apps", kind: "app", label: "Zen Browser", aliases: [], description: "", order: 99 }
  items["apps.foot"] = { id: "apps.foot", parent: "apps", kind: "app", label: "foot", aliases: [], description: "", order: 7 }
  return items
}

test("searchScore: exact label match, kind menu, at root — score 2 minus the menu penalty", () => {
  const items = scoreFixture()
  // base 2 (exact match, parent === root) - 2 (kind menu) = 0; depth 0, order 3
  assert.equal(RunnerModel.searchScore(items, items.apps, "apps"), 0 * 1000 + 0 * 25 + 3)
})

test("searchScore: exact label match, kind action, not at root — score 0, no kind penalty", () => {
  const items = scoreFixture()
  // base 0 (exact match, parent !== root); "action" gets no kind adjustment; depth 1, order 2
  assert.equal(RunnerModel.searchScore(items, items["style.theme"], "theme"), 0 * 1000 + 1 * 25 + 2)
})

test("searchScore: prefix match beats plain substring match", () => {
  const items = scoreFixture()
  const prefix = RunnerModel.searchScore(items, items.style, "sty")   // "style".indexOf("sty") === 0 -> base 10
  const substring = RunnerModel.searchScore(items, items.apps, "pp")  // "apps".indexOf("pp") === 1 -> base 30
  assert.equal(prefix, 10 * 1000 - 2 * 1000 + 0 * 25 + 1) // kind menu: -2
  assert.equal(substring, 30 * 1000 - 2 * 1000 + 0 * 25 + 3)
  assert.ok(prefix < substring)
})

test("searchScore: an alias/id match (nameText) scores behind a label substring match", () => {
  const items = scoreFixture()
  items["style.theme"].aliases = ["dark mode"]
  // "dark" is not in the label but is in nameText via the alias; base 40, no kind penalty (action)
  assert.equal(RunnerModel.searchScore(items, items["style.theme"], "dark"), 40 * 1000 + 1 * 25 + 2)
})

test("searchScore: a whole-word description match scores behind a nameText match", () => {
  const items = scoreFixture()
  items.apps.description = "install and manage software"
  // base 60 (description whole-word match) - 2 (kind menu)
  assert.equal(RunnerModel.searchScore(items, items.apps, "software"), 58 * 1000 + 0 * 25 + 3)
})

test("searchScore: matching in neither label, nameText nor as a whole description word falls back to the default tier (80)", () => {
  const items = scoreFixture()
  items.apps.description = "install software here"
  // "apps software" is not a name substring and fails descriptionTextMatches
  // (its own first term, "apps", is not a whole word in the description) -> default 80, -2 for kind menu
  assert.equal(RunnerModel.searchScore(items, items.apps, "apps software"), 78 * 1000 + 0 * 25 + 3)
})

test("searchScore: an app whose label contains the query as a whole word outranks an exact-labeled menu entry", () => {
  const items = scoreFixture()
  // "zen browser".split(/\s+/) includes "zen" -> base 0, then -5 for kind app
  const zen = RunnerModel.searchScore(items, items["apps.zen"], "zen")
  assert.equal(zen, -5 * 1000 + 1 * 25 + 99)
  const menuExact = RunnerModel.searchScore(items, items.apps, "apps")
  assert.ok(zen < menuExact, "an app row should sort ahead of an exact-labeled menu row")
})

test("searchScore: an exact-labeled app still takes the exact-match tier before the app penalty", () => {
  const items = scoreFixture()
  // label === needle takes priority over the "app whole word" branch; base 0
  // (parent "apps" !== root), then -5 for kind app
  assert.equal(RunnerModel.searchScore(items, items["apps.foot"], "foot"), -5 * 1000 + 1 * 25 + 7)
})

test("slugify lowercases, collapses non-alphanumerics to single hyphens, and trims them", () => {
  assert.equal(RunnerModel.slugify("Hello, World!"), "hello-world")
  assert.equal(RunnerModel.slugify("  Already-slug_ish  "), "already-slug-ish")
})

test("slugify falls back to \"item\" for input with no alphanumerics", () => {
  assert.equal(RunnerModel.slugify(""), "item")
  assert.equal(RunnerModel.slugify("!!!"), "item")
  assert.equal(RunnerModel.slugify(null), "item")
})

// resolveRoute: exact id beats alias, aliases normalize underscores to
// hyphens, app rows are never routable (their aliases carry .desktop
// Keywords/GenericName for search, not menu routes), and an unknown string
// falls through as the literal input.

function routeFixture() {
  const parsed = RunnerModel.parseMenuJsonc(`{
    "root": { "label": "Omarchy" },
    "setup": { "label": "Setup" },
    "setup.power": { "label": "Power", "action": "systemctl poweroff", "aliases": ["power-menu", "poweroff"] },
    "apps": { "label": "Apps" }
  }`)
  const { items, itemOrder } = RunnerModel.mergeMenuSources(parsed, [])
  items["apps.htop"] = { id: "apps.htop", parent: "apps", kind: "app", label: "htop", aliases: ["system-monitor", "htop"], order: itemOrder.length }
  itemOrder.push("apps.htop")
  return { items, itemOrder }
}

test("resolveRoute maps empty input, and the go/menu placeholders, to root", () => {
  const { items, itemOrder } = routeFixture()
  assert.equal(RunnerModel.resolveRoute(items, itemOrder, ""), "root")
  assert.equal(RunnerModel.resolveRoute(items, itemOrder, "go"), "root")
  assert.equal(RunnerModel.resolveRoute(items, itemOrder, "MENU"), "root")
})

test("resolveRoute matches a real id case-insensitively before trying aliases", () => {
  const { items, itemOrder } = routeFixture()
  assert.equal(RunnerModel.resolveRoute(items, itemOrder, "SETUP.POWER"), "setup.power")
})

test("resolveRoute matches a declared alias, normalizing underscores to hyphens on both sides", () => {
  const { items, itemOrder } = routeFixture()
  assert.equal(RunnerModel.resolveRoute(items, itemOrder, "power_menu"), "setup.power")
  assert.equal(RunnerModel.resolveRoute(items, itemOrder, "POWEROFF"), "setup.power")
})

test("resolveRoute never routes through an app row's aliases", () => {
  const { items, itemOrder } = routeFixture()
  // apps.htop declares alias "system-monitor", but app aliases are skipped,
  // so this falls through to the literal input rather than resolving to it.
  assert.equal(RunnerModel.resolveRoute(items, itemOrder, "system-monitor"), "system-monitor")
})

test("resolveRoute falls through to the literal (normalized) input for an unknown route", () => {
  const { items, itemOrder } = routeFixture()
  assert.equal(RunnerModel.resolveRoute(items, itemOrder, "no_such_route"), "no-such-route")
})
