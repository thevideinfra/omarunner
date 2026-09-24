import { test } from "node:test"
import assert from "node:assert/strict"
import { loadJsModule } from "./helpers/load-js-module.mjs"
const S = await loadJsModule("SettingsModel.js")

test("defaults match the tuned launcher", () => {
  assert.deepEqual(S.resolve({}), { width: 510, rows: 9, density: 28, fontScale: 85, fontFamily: "", border: 2,
    fuzzy: true, categories: true, hints: true })
})

test("resolve keeps valid presets and rejects the rest", () => {
  const r = S.resolve({ settings: { width: 680, rows: 3, border: "2", fuzzy: false, hints: "no", fontFamily: "Adwaita Sans" } })
  assert.equal(r.width, 680)
  assert.equal(r.rows, 9)
  assert.equal(r.border, 2)
  assert.equal(r.fuzzy, false)
  assert.equal(r.hints, true)
  assert.equal(r.fontFamily, "Adwaita Sans")
  assert.deepEqual(S.resolve({ settings: [] }), S.defaults())
})

test("withSetting and toggled keep other config keys", () => {
  const config = { sources: { files: false }, webSearchUrl: "x" }
  const next = S.toggled(S.withSetting(config, "width", 420), "fuzzy")
  assert.deepEqual(next, { sources: { files: false }, webSearchUrl: "x", settings: { width: 420, fuzzy: false } })
  assert.deepEqual(config, { sources: { files: false }, webSearchUrl: "x" })
})

test("applyOption parses numeric and string values", () => {
  assert.equal(S.applyOption({}, "rows=12").settings.rows, 12)
  assert.equal(S.applyOption({}, "fontFamily=serif").settings.fontFamily, "serif")
  assert.equal(S.applyOption({}, "fontFamily=").settings.fontFamily, "")
  assert.deepEqual(S.applyOption({ a: 1 }, "junk"), { a: 1 })
})

test("the page shows current values and ticks the chosen option", () => {
  const page = S.pageRows(S.resolve({ settings: { width: 680 } }))
  const width = page.rows.find(r => r.id === "settings.width")
  assert.equal(width.label, "Width · Wide")
  assert.equal(width.kind, "menu")
  const wide = page.rows.find(r => r.parent === "settings.width" && r.label === "Wide")
  assert.equal(wide.kind, "setting-option")
  assert.equal(wide.value, "width=680")
  assert.equal(page.checked[wide.id], true)
  const fuzzy = page.rows.find(r => r.id === "settings.fuzzy")
  assert.equal(fuzzy.kind, "setting-toggle")
  assert.equal(page.checked["settings.fuzzy"], true)
})
