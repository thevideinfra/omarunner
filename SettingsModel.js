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
    { key: "fontFamily", label: "Font", choices: [
      { value: "", label: "Omarchy default" }, { value: "sans-serif", label: "Sans" }, { value: "serif", label: "Serif" }] },
    { key: "border", label: "Border", choices: [
      { value: 0, label: "None" }, { value: 1, label: "1px" }, { value: 2, label: "2px" }, { value: 3, label: "3px" }] }
  ]
}

function TOGGLES() {
  return [
    { key: "fuzzy", label: "Fuzzy matching" },
    { key: "categories", label: "Category column" },
    { key: "hints", label: "Ctrl+number hints" }
  ]
}

function defaults() {
  return { width: 510, rows: 9, density: 28, fontScale: 85, fontFamily: "", border: 2, fuzzy: true, categories: true, hints: true }
}

function choiceFor(key) {
  var list = CHOICES()
  for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i]
  return null
}

// Merges config.settings over the defaults. Choice keys must hold one of
// their preset values, except fontFamily, which accepts any family name a
// hand-edit puts there; toggles must be booleans.
function resolve(config) {
  var out = defaults()
  var given = config && config.settings && typeof config.settings === "object" && !Array.isArray(config.settings) ? config.settings : ({})
  var list = CHOICES()
  for (var i = 0; i < list.length; i++) {
    var key = list[i].key
    if (!(key in given)) continue
    if (key === "fontFamily") { if (typeof given[key] === "string") out[key] = given[key]; continue }
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

function currentLabel(key, value) {
  var choice = choiceFor(key)
  if (!choice) return String(value)
  for (var i = 0; i < choice.choices.length; i++) if (choice.choices[i].value === value) return choice.choices[i].label
  return String(value)
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
function pageRows(settingsIn) {
  var settings = settingsIn || defaults()
  var rows = []
  var checked = ({})
  var list = CHOICES()
  for (var i = 0; i < list.length; i++) {
    var key = list[i].key
    var menuId = "settings." + key
    rows.push(menuRow(menuId, "settings", list[i].label + " · " + currentLabel(key, settings[key]), rows.length))
    for (var c = 0; c < list[i].choices.length; c++) {
      var choice = list[i].choices[c]
      var id = menuId + "." + c
      rows.push({ id: id, parent: menuId, kind: "setting-option", icon: "", iconFont: "", label: choice.label, title: "",
        target: "", description: "", action: "", provider: "", aliases: [], when: "", checked: "config",
        value: key + "=" + choice.value, order: rows.length })
      checked[id] = settings[key] === choice.value
    }
  }
  var toggles = TOGGLES()
  for (var t = 0; t < toggles.length; t++) {
    var toggleId = "settings." + toggles[t].key
    rows.push({ id: toggleId, parent: "settings", kind: "setting-toggle", icon: "", iconFont: "", label: toggles[t].label,
      title: "", target: "", description: "", action: "", provider: "", aliases: [], when: "", checked: "config",
      value: toggles[t].key, order: rows.length })
    checked[toggleId] = settings[toggles[t].key] === true
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
    currentLabel: currentLabel, pageRows: pageRows, applyOption: applyOption }
}
