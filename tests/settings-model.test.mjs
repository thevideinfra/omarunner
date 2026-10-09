import { test } from "node:test"
import assert from "node:assert/strict"
import { loadJsModule } from "./helpers/load-js-module.mjs"
const S = await loadJsModule("SettingsModel.js")

test("defaults match the tuned launcher", () => {
  assert.deepEqual(S.resolve({}), { width: 420, rows: 9, density: 28, fontScale: 85, hintScale: 100, fontFamily: "", border: 2,
    opacity: 100, radius: -1, accent: "theme", location: "center", recents: 5, recentsOn: false, favoritesShown: 30, favoritesOn: true,
    fuzzy: true, categories: true, hints: true, about: true })
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
  assert.equal(top[0], "Accent")
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

test("the Settings page offers a Keybindings… row that runs the setup command", () => {
  const cmd = "omarchy-launch-floating-terminal-with-presentation /x/omarunner-setup"
  const page = S.pageRows(S.defaults(), cmd)
  const row = page.rows.find(r => r.id === "omarunner-settings.keys")
  assert.equal(row.label, "Keybindings…")
  assert.equal(row.kind, "action")
  assert.equal(row.action, cmd)
  assert.equal(row.parent, "omarunner-settings")
  // Alphabetical among the top-level entries, between Hint size and Opacity.
  const top = page.rows.filter(r => r.parent === "omarunner-settings").map(r => r.label.split(" · ")[0].replace("…", ""))
  assert.deepEqual(top, [...top].sort((a, b) => a.localeCompare(b)))
  assert.equal(S.pageRows(S.defaults()).rows.some(r => r.id === "omarunner-settings.keys"), false)
})

// -- Accent colour and the About row.

test("accent defaults to the theme and takes palette names or a hex colour", () => {
  assert.equal(S.resolve({}).accent, "theme")
  assert.equal(S.resolve({ settings: { accent: "blue" } }).accent, "blue")
  assert.equal(S.resolve({ settings: { accent: "#ff8800" } }).accent, "#ff8800")
  assert.equal(S.resolve({ settings: { accent: "chartreuse" } }).accent, "theme")
  assert.equal(S.resolve({ settings: { accent: "#12345" } }).accent, "theme")
  assert.deepEqual(S.customChoice("accent", " #FF8800 "), { value: "#FF8800", label: "#FF8800" })
  assert.equal(S.customChoice("accent", "orange"), null)
  assert.equal(S.currentLabel("accent", "theme"), "Theme")
  assert.equal(S.currentLabel("accent", "#ff8800"), "Custom (#ff8800)")
  assert.equal(S.applyOption({}, "accent=cyan").settings.accent, "cyan")
})

test("accent options carry a swatch glyph and the page lists Accent first alphabetically", () => {
  const page = S.pageRows(S.defaults())
  const options = page.rows.filter(r => r.parent === "omarunner-settings.accent" && r.kind === "setting-option")
  assert.deepEqual(options.map(r => r.label), ["Theme", "Blue", "Cyan", "Green", "Magenta", "Yellow", "Red", "Orange"])
  assert.equal(options.every(r => r.icon === "●"), true)
  assert.equal(options[1].value, "accent=blue")
  assert.equal(page.rows.filter(r => r.parent === "omarunner-settings")[0].label, "Accent · Theme")
  assert.equal(S.customHint("accent"), "Type a hex colour, like #ff8800")
})

test("the version and GitHub link is a header item, not a row on the Settings page", () => {
  const page = S.pageRows(S.defaults(), "", { version: "0.3.0", openCommand: "xdg-open x" })
  assert.equal(page.rows.some(r => r.id.endsWith(".github")), false)
  assert.equal(page.rows.filter(r => r.parent === "omarunner-settings")[0].label, "Accent · Theme")
  assert.deepEqual(page.rows.map(r => r.order), page.rows.map((_, i) => i))
  assert.equal(S.defaults().about, true)
})

test("the About switch is a normal Settings toggle", () => {
  const page = S.pageRows(S.defaults())
  const row = page.rows.find(r => r.value === "about")
  assert.equal(row.kind, "setting-toggle")
  assert.equal(row.label, "Version and GitHub link")
  assert.equal(S.toggled({}, "about").settings.about, false)
})

// -- Location, recent launches and Favorites.

test("location defaults to the center and offers the top", () => {
  assert.equal(S.resolve({}).location, "center")
  assert.equal(S.resolve({ settings: { location: "top" } }).location, "top")
  assert.equal(S.resolve({ settings: { location: "bottom" } }).location, "center")
  const page = S.pageRows(S.defaults())
  const options = page.rows.filter(r => r.parent === "omarunner-settings.location" && r.kind === "setting-option")
  assert.deepEqual(options.map(r => r.label + "=" + r.value), ["Very top=location=edge", "Almost top=location=high", "Upper=location=top", "High center=location=low", "Center=location=center"])
  assert.equal(S.applyOption({}, "location=top").settings.location, "top")
})

test("recent launches are off by default; the amount is 3, 5 or 8 and a custom range", () => {
  assert.equal(S.resolve({}).recentsOn, false)
  assert.equal(S.resolve({}).recents, 5)
  assert.equal(S.currentLabel("recents", 5), "5")
  assert.equal(S.resolve({ settings: { recents: 12 } }).recents, 12)
  assert.equal(S.resolve({ settings: { recents: 99 } }).recents, 5)
  const page = S.pageRows(S.defaults())
  const menu = page.rows.find(r => r.id === "omarunner-settings.launches")
  assert.equal(menu.label, "Recent launches")
  assert.equal(menu.parent, "omarunner-settings")
  assert.equal(page.checked["omarunner-settings.launches"], false)
  const inside = page.rows.filter(r => r.parent === "omarunner-settings.launches")
  assert.deepEqual(inside.map(r => [r.kind, r.label]), [["setting-toggle", "Show on start"], ["setting-option", "3"], ["setting-option", "5"], ["setting-option", "8"], ["setting-custom", "Custom…"]])
  assert.equal(inside[0].value, "recentsOn")
  assert.equal(page.checked[inside[2].id], true)
  assert.equal(inside[1].value, "recents=3")
  assert.equal(S.customDisplayRow("omarunner-settings.launches", "10").value, "recents=10")
  assert.equal(S.customDisplayRow("omarunner-settings.favorites", "12").value, "favoritesShown=12")
  assert.equal(S.keyForMenu("omarunner-settings.width"), "width")
  assert.deepEqual(S.customChoice("recents", "10"), { value: 10, label: "10" })
  assert.equal(S.customChoice("recents", "0"), null)
  assert.equal(S.toggled({}, "recentsOn").settings.recentsOn, true)
})

test("settings saved before the switches existed keep their meaning", () => {
  assert.equal(S.resolve({ settings: { recents: 0 } }).recentsOn, false)
  assert.equal(S.resolve({ settings: { recents: 0 } }).recents, 5)
  const on = S.resolve({ settings: { recents: 8 } })
  assert.deepEqual([on.recentsOn, on.recents], [true, 8])
  const favOff = S.resolve({ settings: { favoritesShown: 0 } })
  assert.deepEqual([favOff.favoritesOn, favOff.favoritesShown], [false, 30])
  assert.deepEqual([S.resolve({ settings: { favoritesShown: 3 } }).favoritesOn, S.resolve({ settings: { favoritesShown: 3 } }).favoritesShown], [true, 3])
})

test("the Favorites entry lists the pinned items, or says how to pin one", () => {
  const favorites = [
    { key: "app:firefox", kind: "app", label: "Firefox", detail: "", appId: "firefox" },
    { key: "source:files:/a.txt", kind: "source", label: "a.txt", detail: "docs/a.txt", sourceId: "files", value: "/a.txt" }
  ]
  const page = S.pageRows(S.defaults(), "", favorites)
  assert.equal(page.rows.find(r => r.id === "omarunner-settings.favorites").label, "Favorites")
  const items = page.rows.filter(r => r.parent === "omarunner-settings.favorites" && r.kind === "favorite-item")
  assert.deepEqual(items.map(r => [r.kind, r.label, r.value]), [["favorite-item", "Firefox", "app:firefox"], ["favorite-item", "a.txt", "source:files:/a.txt"]])
  assert.equal(items[1].description, "docs/a.txt")
  const empty = S.pageRows(S.defaults(), "", [])
    const note = empty.rows.filter(r => r.parent === "omarunner-settings.favorites" && r.kind === "note")
  assert.deepEqual(note.map(r => [r.kind, r.label]), [["note", "No favorites yet"]])
  assert.equal(note[0].description, "Press Ctrl+P on a result to pin it")
  const top = page.rows.filter(r => r.parent === "omarunner-settings").map(r => r.label.split(" · ")[0])
  assert.deepEqual(top, [...top].sort((a, b) => a.localeCompare(b)))
  assert.deepEqual(page.rows.map(r => r.order), page.rows.map((_, i) => i))
})

test("favorites switch on by default; the amount is 3, 5, 8 or All", () => {
  assert.equal(S.resolve({}).favoritesOn, true)
  assert.equal(S.resolve({}).favoritesShown, 30)
  assert.equal(S.currentLabel("favoritesShown", 30), "All")
  assert.equal(S.resolve({ settings: { favoritesShown: 4 } }).favoritesShown, 4)
  const page = S.pageRows(S.defaults())
  assert.equal(page.checked["omarunner-settings.favorites"], true)
  const inside = page.rows.filter(r => r.parent === "omarunner-settings.favorites")
  assert.deepEqual(inside.slice(0, 2).map(r => [r.kind, r.label]), [["setting-toggle", "Show on start"], ["setting-option", "3"]])
  const options = page.rows.filter(r => r.parent === "omarunner-settings.favorites" && r.kind === "setting-option")
  assert.deepEqual(options.map(r => r.label), ["3", "5", "8", "All"])
})

test("pinned items and the no-favorites note sit in their own group, so a divider separates them", () => {
  const fav = [{ key: "app:foot", kind: "app", label: "foot", detail: "", appId: "foot" }]
  const rows = S.pageRows(S.defaults(), "", fav).rows.filter(r => r.parent === "omarunner-settings.favorites")
  assert.deepEqual(rows.map(r => r.section || ""), ["", "", "", "", "", "", "group:pinned"])
  const none = S.pageRows(S.defaults(), "", []).rows.filter(r => r.kind === "note")
  assert.equal(none[0].section, "group:pinned")
})
