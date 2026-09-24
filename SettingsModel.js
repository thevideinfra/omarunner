// Launcher settings: stored under "settings" in omarunner.json, shown on the
// in-launcher Settings page as preset choices and on/off toggles.
function CHOICES() {
  return [
    { key: "width", label: "Width", choices: [
      { value: 420, label: "Narrow" }, { value: 510, label: "Normal" },
      { value: 680, label: "Wide" }, { value: 840, label: "Extra wide" }] },
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
function RANGES() {
  return { width: [300, 1600], rows: [3, 20], density: [18, 48], fontScale: [50, 200], hintScale: [50, 200], border: [0, 10],
    opacity: [30, 100], radius: [0, 30] }
}

function inRange(key, value) {
  var range = RANGES()[key]
  return !!range && typeof value === "number" && Math.floor(value) === value && value >= range[0] && value <= range[1]
}

function TOGGLES() {
  return [
    { key: "fuzzy", label: "Fuzzy matching" },
    { key: "categories", label: "Category column" },
    { key: "hints", label: "Ctrl+number hints" }
  ]
}

function defaults() {
  return { width: 510, rows: 9, density: 28, fontScale: 85, hintScale: 100, fontFamily: "", border: 2, opacity: 100, radius: -1, fuzzy: true, categories: true, hints: true }
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
  for (var i = 0; i < list.length; i++) {
    var key = list[i].key
    if (!(key in given)) continue
    if (key === "fontFamily") { if (typeof given[key] === "string") out[key] = given[key]; continue }
    if (inRange(key, given[key])) { out[key] = given[key]; continue }
    for (var c = 0; c < list[i].choices.length; c++) if (list[i].choices[c].value === given[key]) out[key] = given[key]
  }
  var toggles = TOGGLES()
  for (var t = 0; t < toggles.length; t++) if (typeof given[toggles[t].key] === "boolean") out[toggles[t].key] = given[toggles[t].key]
  return out
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

function currentLabel(key, value) {
  var choice = choiceFor(key)
  if (!choice) return String(value)
  for (var i = 0; i < choice.choices.length; i++) if (choice.choices[i].value === value) return choice.choices[i].label
  return "Custom (" + value + ")"
}

// Typed input on a setting's page: { value, label } or null. A trailing "%"
// or "px" is allowed; percent settings keep it in the label.
function customChoice(key, text) {
  var raw = String(text || "").trim()
  if (key === "fontFamily") return raw && raw.length <= 64 ? { value: raw, label: raw } : null
  if (!RANGES()[key]) return null
  var match = /^(\d+)\s*(%|px)?$/i.exec(raw)
  if (!match) return null
  var value = Number(match[1])
  if (!inRange(key, value)) return null
  var percent = key === "fontScale" || key === "hintScale" || key === "opacity"
  return { value: value, label: percent ? value + "%" : String(value) }
}

// While typing on "settings.<key>", the typed value as a pickable row, in the
// display-row shape buildRows produces.
function customDisplayRow(activeMenu, text) {
  var menu = String(activeMenu || "")
  if (menu.indexOf("settings.") !== 0) return null
  var key = menu.slice(9)
  var choice = customChoice(key, text)
  if (!choice) return null
  return { itemId: menu + ".typed", kind: "setting-option", icon: "", iconFont: "", appIcon: "", appId: "",
    label: "Use " + choice.label, target: "", detail: "", path: "", childCount: 0, action: "", provider: "",
    score: 0, section: "", sourceId: "", value: key + "=" + choice.value }
}

function customHint(key) {
  if (key === "fontFamily") return "Type a font name"
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
function pageRows(settingsIn) {
  var settings = settingsIn || defaults()
  var entries = []
  var checked = ({})
  var list = CHOICES()
  for (var i = 0; i < list.length; i++) {
    var key = list[i].key
    var menuId = "settings." + key
    var group = [menuRow(menuId, "settings", list[i].label + " · " + currentLabel(key, settings[key]), 0)]
    for (var c = 0; c < list[i].choices.length; c++) {
      var choice = list[i].choices[c]
      var id = menuId + "." + c
      group.push({ id: id, parent: menuId, kind: "setting-option", icon: "", iconFont: "", label: choice.label, title: "",
        target: "", description: "", action: "", provider: "", aliases: [], when: "", checked: "config",
        value: key + "=" + choice.value, order: 0 })
      checked[id] = settings[key] === choice.value
    }
    // Custom…: a reminder of what may be typed here, ticked for a custom value.
    var customId = menuId + ".custom"
    group.push({ id: customId, parent: menuId, kind: "setting-custom", icon: "", iconFont: "", label: "Custom…", title: "",
      target: "", description: customHint(key), action: "", provider: "", aliases: [], when: "", checked: "config",
      value: key, order: 0 })
    checked[customId] = !isPreset(key, settings[key])
    entries.push({ name: list[i].label, rows: group })
  }
  var toggles = TOGGLES()
  for (var t = 0; t < toggles.length; t++) {
    var toggleId = "settings." + toggles[t].key
    entries.push({ name: toggles[t].label, rows: [{ id: toggleId, parent: "settings", kind: "setting-toggle", icon: "",
      iconFont: "", label: toggles[t].label, title: "", target: "", description: "", action: "", provider: "",
      aliases: [], when: "", checked: "config", value: toggles[t].key, order: 0 }] })
    checked[toggleId] = settings[toggles[t].key] === true
  }
  entries.sort(function(a, b) { return a.name.localeCompare(b.name) })
  var rows = []
  for (var e = 0; e < entries.length; e++) {
    for (var r = 0; r < entries[e].rows.length; r++) {
      entries[e].rows[r].order = rows.length
      rows.push(entries[e].rows[r])
    }
  }
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
    customDisplayRow: customDisplayRow }
}
