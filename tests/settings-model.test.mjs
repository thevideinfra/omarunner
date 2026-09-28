import { test } from "node:test"
import assert from "node:assert/strict"
import { loadJsModule } from "./helpers/load-js-module.mjs"
const S = await loadJsModule("SettingsModel.js")

test("defaults match the tuned launcher", () => {
  assert.deepEqual(S.resolve({}), { width: 420, rows: 9, density: 28, fontScale: 85, hintScale: 100, fontFamily: "", border: 2,
    opacity: 100, radius: -1,
    fuzzy: true, categories: true, hints: true })
})

test("resolve keeps valid presets and rejects the rest", () => {
  const r = S.resolve({ settings: { width: 680, rows: 2, border: "2", fuzzy: false, hints: "no", fontFamily: "Adwaita Sans" } })
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
  const page = S.pageRows(S.resolve({ settings: { width: 510 } }))
  const width = page.rows.find(r => r.id === "omarunner-settings.width")
  assert.equal(width.label, "Width · Wide")
  assert.equal(width.kind, "menu")
  const wide = page.rows.find(r => r.parent === "omarunner-settings.width" && r.label === "Wide")
  assert.equal(wide.kind, "setting-option")
  assert.equal(wide.value, "width=510")
  assert.equal(page.checked[wide.id], true)
  const fuzzy = page.rows.find(r => r.id === "omarunner-settings.fuzzy")
  assert.equal(fuzzy.kind, "setting-toggle")
  assert.equal(page.checked["omarunner-settings.fuzzy"], true)
})

test("the Settings page lists its entries alphabetically, choices in preset order", () => {
  const page = S.pageRows(S.defaults())
  const top = page.rows.filter(r => r.parent === "omarunner-settings").map(r => r.label.split(" · ")[0])
  assert.deepEqual(top, [...top].sort((a, b) => a.localeCompare(b)))
  assert.equal(top[0], "Border")
  const widths = page.rows.filter(r => r.parent === "omarunner-settings.width").map(r => r.label)
  assert.deepEqual(widths, ["Narrow", "Normal", "Wide", "Extra wide", "Custom…"])
  assert.deepEqual(page.rows.map(r => r.order), page.rows.map((_, i) => i))
})

test("hint size resolves from its presets", () => {
  assert.equal(S.resolve({ settings: { hintScale: 115 } }).hintScale, 115)
  assert.equal(S.resolve({ settings: { hintScale: 300 } }).hintScale, 100)
})

// -- Custom values: typed on a setting's page, validated against a range.

test("custom numbers inside the range resolve; outside fall back", () => {
  assert.equal(S.resolve({ settings: { width: 600 } }).width, 600)
  assert.equal(S.resolve({ settings: { width: 5000 } }).width, 420)
  assert.equal(S.resolve({ settings: { border: 7 } }).border, 7)
  assert.equal(S.resolve({ settings: { rows: 2.5 } }).rows, 9)
})

test("customChoice parses typed input per setting", () => {
  assert.deepEqual(S.customChoice("width", " 600 "), { value: 600, label: "600" })
  assert.equal(S.customChoice("width", "60"), null)
  assert.equal(S.customChoice("width", "wide"), null)
  assert.deepEqual(S.customChoice("fontScale", "92%"), { value: 92, label: "92%" })
  assert.deepEqual(S.customChoice("fontFamily", "Adwaita Sans"), { value: "Adwaita Sans", label: "Adwaita Sans" })
  assert.equal(S.customChoice("fontFamily", "  "), null)
  assert.equal(S.customChoice("nope", "5"), null)
})

test("a custom value labels the page row and ticks the Custom row", () => {
  const page = S.pageRows(S.resolve({ settings: { width: 600, fontFamily: "Adwaita Sans" } }))
  assert.equal(page.rows.find(r => r.id === "omarunner-settings.width").label, "Width · Custom (600)")
  assert.equal(page.rows.find(r => r.id === "omarunner-settings.fontFamily").label, "Font · Custom (Adwaita Sans)")
  const custom = page.rows.find(r => r.id === "omarunner-settings.width.custom")
  assert.equal(custom.kind, "setting-custom")
  assert.equal(custom.description, "Type a number, 300–1600")
  assert.equal(page.checked["omarunner-settings.width.custom"], true)
  assert.equal(page.checked["omarunner-settings.rows.custom"], false)
})

test("customDisplayRow offers the typed value as an option row", () => {
  const row = S.customDisplayRow("omarunner-settings.width", "600")
  assert.equal(row.label, "Use 600")
  assert.equal(row.kind, "setting-option")
  assert.equal(row.value, "width=600")
  assert.equal(S.applyOption({}, row.value).settings.width, 600)
  assert.equal(S.customDisplayRow("omarunner-settings.width", "abc"), null)
  assert.equal(S.customDisplayRow("omarunner-settings", "600"), null)
  assert.equal(S.customDisplayRow("omarunner-settings.fontFamily", "Iosevka").value, "fontFamily=Iosevka")
})

test("opacity and corner radius have presets, a theme default and custom ranges", () => {
  const d = S.resolve({})
  assert.equal(d.opacity, 100)
  assert.equal(d.radius, -1)
  assert.equal(S.currentLabel("radius", -1), "Theme")
  assert.equal(S.resolve({ settings: { opacity: 80, radius: 12 } }).opacity, 80)
  assert.equal(S.resolve({ settings: { radius: 12 } }).radius, 12)
  assert.equal(S.resolve({ settings: { opacity: 10 } }).opacity, 100)
  assert.deepEqual(S.customChoice("opacity", "75%"), { value: 75, label: "75%" })
  assert.deepEqual(S.customChoice("radius", "20"), { value: 20, label: "20" })
  assert.equal(S.customChoice("radius", "31"), null)
})

// -- Review fixes.

test("a typed value equal to a preset offers no duplicate Use row", () => {
  assert.equal(S.customDisplayRow("omarunner-settings.fontScale", "85"), null)
  assert.equal(S.customDisplayRow("omarunner-settings.rows", "12"), null)
  assert.equal(S.customDisplayRow("omarunner-settings.fontFamily", "sans-serif"), null)
  assert.equal(S.customDisplayRow("omarunner-settings.fontScale", "92").label, "Use 92%")
})

test("units must match the setting", () => {
  assert.equal(S.customChoice("width", "600%"), null)
  assert.equal(S.customChoice("opacity", "50px"), null)
  assert.deepEqual(S.customChoice("width", "600px"), { value: 600, label: "600" })
  assert.deepEqual(S.customChoice("opacity", "50%"), { value: 50, label: "50%" })
  assert.equal(S.customChoice("rows", "10%"), null)
  assert.deepEqual(S.customChoice("rows", "10"), { value: 10, label: "10" })
})

test("a hand-edited font name is trimmed, and blank means the default", () => {
  assert.equal(S.resolve({ settings: { fontFamily: "  " } }).fontFamily, "")
  assert.equal(S.resolve({ settings: { fontFamily: "  Iosevka " } }).fontFamily, "Iosevka")
  assert.equal(S.resolve({ settings: { fontFamily: "x".repeat(65) } }).fontFamily, "")
})

test("width presets start at the custom minimum: Narrow 300 up to Extra wide 680", () => {
  const page = S.pageRows(S.defaults())
  const widths = page.rows.filter(r => r.parent === "omarunner-settings.width" && r.kind === "setting-option").map(r => r.label + "=" + r.value)
  assert.deepEqual(widths, ["Narrow=width=300", "Normal=width=420", "Wide=width=510", "Extra wide=width=680"])
  assert.equal(page.rows.find(r => r.id === "omarunner-settings.width").label, "Width · Normal")
  assert.equal(S.resolve({ settings: { width: 600 } }).width, 600)
  assert.equal(S.currentLabel("width", 600), "Custom (600)")
})
