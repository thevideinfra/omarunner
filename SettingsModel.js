// Launcher settings: stored under "settings" in omarunner.json, shown on the
// in-launcher Settings page as preset choices and on/off toggles.
function CHOICES() {
  return [
    { key: "accent", label: "Accent", choices: [
      { value: "theme", label: "Theme" }, { value: "blue", label: "Blue" }, { value: "cyan", label: "Cyan" },
      { value: "green", label: "Green" }, { value: "magenta", label: "Magenta" }, { value: "yellow", label: "Yellow" },
      { value: "red", label: "Red" }, { value: "orange", label: "Orange" }] },
    { key: "location", label: "Location", choices: [
      { value: "edge", label: "Very top" }, { value: "high", label: "Almost top" }, { value: "top", label: "Higher" },
      { value: "low", label: "High" }, { value: "center", label: "Center" },
      { value: "down1", label: "Low" }, { value: "down2", label: "Lower" }, { value: "down3", label: "Almost bottom" },
      { value: "bottom", label: "Very bottom" }] },
    { key: "favoritesShown", label: "Amount", under: "favorites", choices: [
      { value: 3, label: "3" }, { value: 5, label: "5" }, { value: 8, label: "8" }, { value: 30, label: "All" }] },
    { key: "recents", label: "Amount", under: "launches", choices: [
      { value: 3, label: "3" }, { value: 5, label: "5" }, { value: 8, label: "8" }] },
    { key: "width", label: "Width", choices: [
      { value: 300, label: "Narrow" }, { value: 420, label: "Normal" },
      { value: 510, label: "Wide" }, { value: 680, label: "Extra wide" }] },
    { key: "rows", label: "Rows before scrolling", choices: [
      { value: 5, label: "5" }, { value: 7, label: "7" }, { value: 9, label: "9" }, { value: 12, label: "12" }] },
    { key: "density", label: "Row height", choices: [
      { value: 24, label: "Compact" }, { value: 28, label: "Normal" }, { value: 34, label: "Comfortable" }] },
    { key: "fontScale", label: "Text size", choices: [
      { value: 75, label: "75%" }, { value: 85, label: "85%" }, { value: 100, label: "100%" }, { value: 115, label: "115%" }] },
    { key: "hintScale", label: "Hint size", choices: [
      { value: 85, label: "Small" }, { value: 100, label: "Normal" }, { value: 115, label: "Large" }] },
    { key: "fontFamily", label: "Font", choices: [
      { value: "", label: "Omarchy default" }, { value: "sans-serif", label: "Sans" }, { value: "serif", label: "Serif" }] },
    { key: "opacity", label: "Opacity", choices: [
      { value: 70, label: "70%" }, { value: 85, label: "85%" }, { value: 95, label: "95%" }, { value: 100, label: "100%" }] },
    { key: "radius", label: "Corner radius", choices: [
      { value: -1, label: "Theme" }, { value: 0, label: "Square" }, { value: 6, label: "Slight" }, { value: 12, label: "Round" }] },
    { key: "border", label: "Border", choices: [
      { value: 0, label: "None" }, { value: 1, label: "1px" }, { value: 2, label: "2px" }, { value: 3, label: "3px" }] }
  ]
}

// Custom values a user may type on a setting's page: whole numbers in range.
// fontFamily takes any font name instead.
// The Settings page's menu id. Not "settings": Omarchy's Setup menu answers to
// that alias, and an exact id would shadow it.
function PAGE_ID() { return "omarunner-settings" }

function RANGES() {
  return { width: [300, 1600], rows: [3, 20], density: [18, 48], fontScale: [50, 200], hintScale: [50, 200], border: [0, 10],
    opacity: [30, 100], radius: [0, 30], recents: [1, 20], favoritesShown: [1, 30] }
}

function inRange(key, value) {
  var range = RANGES()[key]
  return !!range && typeof value === "number" && Math.floor(value) === value && value >= range[0] && value <= range[1]
}

function TOGGLES() {
  return [
    { key: "fuzzy", label: "Fuzzy matching" },
    { key: "categories", label: "Category column" },
    { key: "hints", label: "Ctrl+number hints" },
    { key: "favoritesOn", label: "Show on start", under: "favorites" },
    { key: "recentsOn", label: "Show on start", under: "launches" },
    { key: "about", label: "Version and GitHub link" }
  ]
}

function defaults() {
  return { width: 420, rows: 9, density: 28, fontScale: 85, hintScale: 100, fontFamily: "", border: 2, opacity: 100, radius: -1, accent: "theme", location: "center", recents: 5, recentsOn: false, favoritesShown: 30, favoritesOn: true, fuzzy: true, categories: true, hints: true, about: true }
}

function choiceFor(key) {
  var list = CHOICES()
  for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i]
  return null
}

// Merges config.settings over the defaults. Choice keys must hold a preset
// value or a whole number in their custom range; fontFamily accepts any
// family name; toggles must be booleans.
function resolve(config) {
  var out = defaults()
  var given = config && config.settings && typeof config.settings === "object" && !Array.isArray(config.settings) ? config.settings : ({})
  var list = CHOICES()
  // Earlier versions kept the on/off state in the amount: 0 meant off.
  if (given.recents === 0 && !("recentsOn" in given)) { given = withKey(given, "recentsOn", false); delete given.recents }
  else if (typeof given.recents === "number" && given.recents > 0 && !("recentsOn" in given)) given = withKey(given, "recentsOn", true)
  if (given.favoritesShown === 0 && !("favoritesOn" in given)) { given = withKey(given, "favoritesOn", false); delete given.favoritesShown }
  for (var i = 0; i < list.length; i++) {
    var key = list[i].key
    if (!(key in given)) continue
    if (key === "fontFamily") {
      // Trimmed; blank or over-long names fall back to the theme default.
      var family = typeof given[key] === "string" ? given[key].trim() : ""
      out[key] = family.length <= 64 ? family : ""
      continue
    }
    if (key === "accent") { if (isHexColour(given[key])) out[key] = given[key] }
    if (inRange(key, given[key])) { out[key] = given[key]; continue }
    for (var c = 0; c < list[i].choices.length; c++) if (list[i].choices[c].value === given[key]) out[key] = given[key]
  }
  var toggles = TOGGLES()
  for (var t = 0; t < toggles.length; t++) if (typeof given[toggles[t].key] === "boolean") out[toggles[t].key] = given[toggles[t].key]
  return out
}

function withKey(object, key, value) {
  var copy = ({})
  for (var k in object) copy[k] = object[k]
  copy[key] = value
  return copy
}

function withSetting(config, key, value) {
  var next = JSON.parse(JSON.stringify(config || ({})))
  if (!next.settings || typeof next.settings !== "object" || Array.isArray(next.settings)) next.settings = ({})
  next.settings[key] = value
  return next
}

function toggled(config, key) { return withSetting(config, key, !resolve(config)[key]) }

function isPreset(key, value) {
  var choice = choiceFor(key)
  if (!choice) return false
  for (var i = 0; i < choice.choices.length; i++) if (choice.choices[i].value === value) return true
  return false
}

function isHexColour(value) { return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) }

function currentLabel(key, value) {
  var choice = choiceFor(key)
  if (!choice) return String(value)
  for (var i = 0; i < choice.choices.length; i++) if (choice.choices[i].value === value) return choice.choices[i].label
  return "Custom (" + value + ")"
}

// Typed input on a setting's page: { value, label } or null. A unit may follow
// the number, but only the setting's own: "%" for percentages, "px" for sizes.
function customChoice(key, text) {
  var raw = String(text || "").trim()
  if (key === "fontFamily") return raw && raw.length <= 64 ? { value: raw, label: raw } : null
  if (key === "accent") return isHexColour(raw) ? { value: raw, label: raw } : null
  if (!RANGES()[key]) return null
  var match = /^(\d+)\s*(%|px)?$/i.exec(raw)
  if (!match) return null
  var percent = key === "fontScale" || key === "hintScale" || key === "opacity"
  var unit = String(match[2] || "").toLowerCase()
  if (unit && unit !== (percent ? "%" : "px")) return null
  if (unit === "px" && key === "rows") return null
  var value = Number(match[1])
  if (!inRange(key, value)) return null
  return { value: value, label: percent ? value + "%" : String(value) }
}

// The setting a settings menu edits: its own key, or for the Favorites and
// Recent launches pages (which list their amounts inline) the amount's key.
// Pages that list their presets inline: picking one stays on the page.
function listsInline(menu) { return menu === PAGE_ID() + ".favorites" || menu === PAGE_ID() + ".launches" }

function keyForMenu(menu) {
  var prefix = PAGE_ID() + "."
  if (String(menu || "").indexOf(prefix) !== 0) return ""
  var id = String(menu).slice(prefix.length)
  if (id === "favorites") return "favoritesShown"
  if (id === "launches") return "recents"
  return id
}

// While typing on "omarunner-settings.<key>", the typed value as a pickable row, in the
// display-row shape buildRows produces.
function customDisplayRow(activeMenu, text) {
  var menu = String(activeMenu || "")
  var key = keyForMenu(menu)
  if (!key) return null
  var choice = customChoice(key, text)
  // A preset with that value is already listed; don't offer it twice.
  if (!choice || isPreset(key, choice.value)) return null
  return { itemId: menu + ".typed", kind: "setting-option", icon: "", iconFont: "", appIcon: "", appId: "",
    label: "Use " + choice.label, target: "", detail: "", path: "", childCount: 0, action: "", provider: "",
    score: 0, section: "", sourceId: "", value: key + "=" + choice.value }
}

// Choices that allow a typed value: numbers in a range, a font name, a colour.
function hasCustom(key) { return key === "fontFamily" || key === "accent" || !!RANGES()[key] }

function customHint(key) {
  if (key === "fontFamily") return "Type a font name"
  if (key === "accent") return "Type a hex colour, like #ff8800"
  var range = RANGES()[key]
  return "Type a number, " + range[0] + "–" + range[1]
}

// "12" -> 12 for numeric keys; option rows carry their value as a string role.
function parseValue(key, text) {
  var choice = choiceFor(key)
  if (!choice) return text
  return typeof choice.choices[0].value === "number" ? Number(text) : String(text)
}

function menuRow(id, parent, label, order) {
  return { id: id, parent: parent, kind: "menu", icon: "", iconFont: "", label: label, title: label, target: "",
    description: "", action: "", provider: "", aliases: [], when: "", checked: "", order: order }
}

// The Settings page tree: one submenu per choice (label shows the current
// value), one toggle row per switch. `checked` maps row id -> ✓.
// Page entries are alphabetical by name; a submenu's choices keep their
// preset order (Narrow, Normal, Wide...).
// setupCommand: shell command that opens the keybinding wizard; when given,
// a "Keybindings…" row runs it. (The version and GitHub link is a header item
// in Runner.qml, switched by the "about" setting.)
function pageRows(settingsIn, setupCommand, favorites) {
  var settings = settingsIn || defaults()
  var entries = []
  var checked = ({})
  var list = CHOICES()

  // A choice submenu (its label shows the current value) with its presets and
  // Custom… row, under `parentId`.
  // `inline` lists the presets straight in `parentId` (Favorites, Recent
  // launches) instead of behind a submenu row.
  function choiceGroup(item, parentId, inline) {
    var key = item.key
    var menuId = inline ? parentId : PAGE_ID() + "." + key
    var group = inline ? [] : [menuRow(menuId, parentId, item.label + " · " + currentLabel(key, settings[key]), 0)]
    for (var c = 0; c < item.choices.length; c++) {
      var choice = item.choices[c]
      var id = PAGE_ID() + "." + key + "." + c
      // Accent choices show their colour as a dot in the row's icon spot.
      group.push({ id: id, parent: menuId, kind: "setting-option", icon: key === "accent" ? "●" : "", iconFont: "", label: choice.label, title: "",
        target: "", description: "", action: "", provider: "", aliases: [], when: "", checked: "config",
        value: key + "=" + choice.value, order: 0 })
      checked[id] = settings[key] === choice.value
    }
    // Custom…: a reminder of what may be typed here, ticked for a custom value.
    var customId = PAGE_ID() + "." + key + ".custom"
    if (hasCustom(key)) group.push({ id: customId, parent: menuId, kind: "setting-custom", icon: "", iconFont: "", label: "Custom…", title: "",
      target: "", description: customHint(key), action: "", provider: "", aliases: [], when: "", checked: "config",
      value: key, order: 0 })
    if (hasCustom(key)) checked[customId] = !isPreset(key, settings[key])
    return group
  }

  function toggleRow(toggle, parentId) {
    var toggleId = PAGE_ID() + "." + toggle.key
    checked[toggleId] = settings[toggle.key] === true
    return { id: toggleId, parent: parentId, kind: "setting-toggle", icon: "", iconFont: "", label: toggle.label, title: "",
      target: "", description: "", action: "", provider: "", aliases: [], when: "", checked: "config", value: toggle.key, order: 0 }
  }

  // A menu row that wears an ON/OFF badge, with its on/off switch and amount
  // inside, followed by `extra` rows.
  function switchedEntry(name, under, onKey, extra) {
    var menuId = PAGE_ID() + "." + under
    var rows = [menuRow(menuId, PAGE_ID(), name, 0)]
    checked[menuId] = settings[onKey] === true
    var toggles = TOGGLES()
    for (var t = 0; t < toggles.length; t++) if (toggles[t].key === onKey) rows.push(toggleRow(toggles[t], menuId))
    for (var i = 0; i < list.length; i++) if (list[i].under === under) rows = rows.concat(choiceGroup(list[i], menuId, true))
    return { name: name, rows: rows.concat(extra || []) }
  }

  for (var i = 0; i < list.length; i++) {
    if (list[i].under) continue
    entries.push({ name: list[i].label, rows: choiceGroup(list[i], PAGE_ID()) })
  }
  var toggles = TOGGLES()
  for (var t = 0; t < toggles.length; t++) {
    if (toggles[t].under) continue
    entries.push({ name: toggles[t].label, rows: [toggleRow(toggles[t], PAGE_ID())] })
  }

  // Favorites: on/off, how many show, then the pinned items (removable here),
  // or a note on how to pin one.
  var pinned = Array.isArray(favorites) ? favorites : []
  var favId = PAGE_ID() + ".favorites"
  var pins = []
  if (pinned.length === 0) {
    pins.push({ id: favId + ".none", parent: favId, kind: "note", icon: "", iconFont: "", label: "No favorites yet", title: "",
      target: "", description: "Press Ctrl+P on a result to pin it", action: "", provider: "", aliases: [], when: "", checked: "",
      value: "", order: 0, section: "group:pinned" })
  }
  for (var p = 0; p < pinned.length; p++) {
    pins.push({ id: favId + "." + p, parent: favId, kind: "favorite-item", icon: "", iconFont: "", label: String(pinned[p].label || ""),
      title: "", target: "", description: String(pinned[p].detail || ""), action: "", provider: "", aliases: [], when: "",
      checked: "", value: String(pinned[p].key || ""), order: 0, section: "group:pinned" })
  }
  entries.push(switchedEntry("Favorites", "favorites", "favoritesOn", pins))
  entries.push(switchedEntry("Recent launches", "launches", "recentsOn", []))
  if (setupCommand) {
    entries.push({ name: "Keybindings", rows: [{ id: PAGE_ID() + ".keys", parent: PAGE_ID(), kind: "action", icon: "",
      iconFont: "", label: "Keybindings…", title: "", target: "", description: "Choose the keys that open omarunner",
      action: setupCommand, provider: "", aliases: [], when: "", checked: "", value: "", order: 0 }] })
  }
  entries.sort(function(a, b) { return a.name.localeCompare(b.name) })
  var rows = []
  for (var e = 0; e < entries.length; e++) {
    for (var r = 0; r < entries[e].rows.length; r++) rows.push(entries[e].rows[r])
  }
  for (var o = 0; o < rows.length; o++) rows[o].order = o
  return { rows: rows, checked: checked }
}

// Applies one option row's "key=value" to the config.
function applyOption(config, optionValue) {
  var text = String(optionValue || "")
  var eq = text.indexOf("=")
  if (eq <= 0) return config
  var key = text.slice(0, eq)
  return withSetting(config, key, parseValue(key, text.slice(eq + 1)))
}

if (typeof module !== "undefined") {
  module.exports = { defaults: defaults, resolve: resolve, withSetting: withSetting, toggled: toggled,
    currentLabel: currentLabel, pageRows: pageRows, applyOption: applyOption, customChoice: customChoice,
    customDisplayRow: customDisplayRow, keyForMenu: keyForMenu, listsInline: listsInline, customHint: customHint }
}
