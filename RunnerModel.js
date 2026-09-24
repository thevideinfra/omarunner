function stripJsonc(raw) {
  return String(raw || "")
    .replace(/^\s*\/\/[^\n]*(\n|$)/gm, "")
    .replace(/,(\s*[}\]])/g, "$1")
}

function normalizeAliases(value) {
  if (Array.isArray(value)) return value.filter(function(v) { return v })
  if (typeof value === "string" && value) return [value]
  return []
}

function normalizeItem(id, raw) {
  var value = raw || {}
  var aliases = normalizeAliases(value.aliases)
  var parent = value.parent
  if (parent === undefined)
    parent = id.indexOf(".") >= 0 ? id.split(".").slice(0, -1).join(".") : "root"
  if (id === "root") parent = ""

  var kind = value.action ? "action" : (value.target ? "link" : "menu")

  return {
    id: id,
    parent: parent,
    kind: kind,
    icon: value.icon || "",
    iconFont: value.iconFont || "",
    label: value.label || id,
    title: value.title || "",
    target: value.target || "",
    description: value.description || "",
    action: value.action || "",
    provider: value.provider || "",
    aliases: aliases,
    when: value.when || "",
    checked: value.checked || ""
  }
}

function parseMenuJsonc(raw) {
  var stripped = stripJsonc(raw)
  if (!stripped.trim()) return []

  var parsed
  try {
    parsed = JSON.parse(stripped)
  } catch (e) {
    return []
  }
  if (typeof parsed !== "object" || parsed === null) return []

  var source = (parsed.items && typeof parsed.items === "object" && !Array.isArray(parsed.items))
    ? parsed.items
    : parsed
  var out = []
  for (var id in source) {
    var entry = source[id]
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue
    out.push(normalizeItem(id, entry))
  }
  return out
}

function mergeMenuSources(defaultItems, userItems) {
  var nextItems = ({})
  var nextOrder = []
  var sources = [defaultItems || [], userItems || []]

  for (var s = 0; s < sources.length; s++) {
    var src = sources[s]
    for (var i = 0; i < src.length; i++) {
      var entry = src[i]
      if (!entry || !entry.id) continue
      if (!nextItems[entry.id]) nextOrder.push(entry.id)
      var prior = nextItems[entry.id] || {}
      var merged = {}
      for (var k in prior) merged[k] = prior[k]
      for (var k2 in entry) merged[k2] = entry[k2]
      merged.id = entry.id
      nextItems[entry.id] = merged
    }
  }

  if (!nextItems.root) {
    nextItems.root = { id: "root", parent: "", kind: "menu", icon: "", iconFont: "", label: "Go", title: "", target: "", description: "", aliases: [], when: "", checked: "", action: "", provider: "" }
    nextOrder.unshift("root")
  }
  for (var k3 = 0; k3 < nextOrder.length; k3++) nextItems[nextOrder[k3]].order = k3

  return {
    items: nextItems,
    itemOrder: nextOrder
  }
}

// Both merges below return fresh items/itemOrder objects for the caller to
// assign in one go. They must never write into the maps they are handed: those
// live in QML `var` properties, and an in-place write into such an object is
// occasionally dropped by the engine — the key lands with an undefined value.
// A lost write used to leave an id in itemOrder with no item behind it, and
// the next merge then kept that orphan and appended a second row for the same
// app, so the launcher listed it twice (and again on every later rescan).

// Swaps every app row for the current set. Rows keep the order they arrive in;
// ids already claimed (including duplicate desktop ids) are listed once.
function mergeAppRows(items, itemOrder, appRows) {
  var source = items || ({})
  var order = Array.isArray(itemOrder) ? itemOrder : []
  var rows = Array.isArray(appRows) ? appRows : []
  var nextItems = ({})
  var nextOrder = []

  for (var i = 0; i < order.length; i++) {
    var id = order[i]
    var existing = source[id]
    // Orphans (an id with no item) are dropped rather than carried forward,
    // so a single lost write cannot compound into a duplicate row.
    if (!existing || existing.kind === "app") continue
    nextItems[id] = existing
    nextOrder.push(id)
  }

  for (var j = 0; j < rows.length; j++) {
    var row = rows[j]
    if (!row || !row.id || nextItems[row.id]) continue
    row.order = nextOrder.length
    nextItems[row.id] = row
    nextOrder.push(row.id)
  }

  return { items: nextItems, itemOrder: nextOrder }
}

// Swaps the rows one provider contributed, leaving every other item untouched.
// Rows carry the id of the submenu that produced them, so a provider that runs
// again drops its previous batch — a plugin that was just enabled disappears
// from the Enable list — without disturbing static children declared in JSONC.
function swapProviderRows(items, itemOrder, menuId, rows) {
  var source = items || ({})
  var order = Array.isArray(itemOrder) ? itemOrder : []
  var incoming = Array.isArray(rows) ? rows : []
  var nextItems = ({})
  var nextOrder = []

  for (var i = 0; i < order.length; i++) {
    var id = order[i]
    var existing = source[id]
    if (!existing || existing.providerMenu === menuId) continue
    nextItems[id] = existing
    nextOrder.push(id)
  }

  for (var j = 0; j < incoming.length; j++) {
    var row = incoming[j]
    if (!row || !row.id || nextItems[row.id]) continue
    row.providerMenu = menuId
    row.order = nextOrder.length
    nextItems[row.id] = row
    nextOrder.push(row.id)
  }

  return { items: nextItems, itemOrder: nextOrder }
}

function item(items, id) {
  return items && items[id] ? items[id] : null
}

// Routes may name a real id (`system`, `setup.power`) or an alias declared in
// JSONC (`power-menu`, `settings`). An exact id beats any alias, and app rows
// are never routable: their aliases carry .desktop Keywords and GenericName
// for search, so an installed application could otherwise shadow a menu route
// (htop ships `Keywords=system;...`). Unknown strings fall through as the
// literal input so misspellings still attempt to open that id.
function resolveRoute(items, itemOrder, input) {
  var raw = String(input || "").toLowerCase().replace(/_/g, "-")
  if (!raw || raw === "go" || raw === "menu") return "root"
  if (item(items, raw)) return raw
  var order = Array.isArray(itemOrder) ? itemOrder : []
  for (var i = 0; i < order.length; i++) {
    var entry = item(items, order[i])
    if (!entry || entry.kind === "app" || !entry.aliases) continue
    for (var j = 0; j < entry.aliases.length; j++) {
      var alias = String(entry.aliases[j] || "").toLowerCase().replace(/_/g, "-")
      if (alias === raw) return entry.id
    }
  }
  return raw
}

function slugify(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item"
}

function depthFor(items, id) {
  var depth = 0
  var current = item(items, id)
  var guard = 0

  while (current && current.parent && current.parent !== "root" && guard < 32) {
    depth += 1
    current = item(items, current.parent)
    guard += 1
  }

  return depth
}

function pathFor(items, id) {
  var labels = []
  var current = item(items, id)
  var guard = 0

  while (current && current.id !== "root" && guard < 32) {
    labels.unshift(current.label)
    current = item(items, current.parent)
    guard += 1
  }

  return labels.join(" › ")
}

function parentPathFor(items, id) {
  var entry = item(items, id)
  if (!entry || !entry.parent || entry.parent === "root") return ""
  return pathFor(items, entry.parent)
}

function isDescendantOf(items, id, ancestorId) {
  if (ancestorId === "root") return id !== "root"

  var current = item(items, id)
  var guard = 0
  while (current && current.parent && guard < 32) {
    if (current.parent === ancestorId) return true
    current = item(items, current.parent)
    guard += 1
  }

  return false
}

function childCount(items, itemOrder, id) {
  var count = 0
  var order = Array.isArray(itemOrder) ? itemOrder : []
  for (var i = 0; i < order.length; i++) {
    var entry = item(items, order[i])
    if (entry && entry.parent === id) count += 1
  }
  return count
}

function isVisible(items, itemOrder, whenResults, entry, depth) {
  if (!entry) return false
  if (entry.when && whenResults && whenResults[entry.id] === false) return false
  if (entry.kind !== "menu" && entry.kind !== "link") return true
  if (entry.provider) return true

  var guard = depth || 0
  if (guard >= 32) return false

  var target = entry.kind === "link" ? entry.target : entry.id
  var order = Array.isArray(itemOrder) ? itemOrder : []
  for (var i = 0; i < order.length; i++) {
    var child = item(items, order[i])
    if (child && child.parent === target && isVisible(items, itemOrder, whenResults, child, guard + 1)) return true
  }

  return false
}

function labelFor(entry, checkedResults) {
  if (!entry) return ""
  if (entry.checked && checkedResults && checkedResults[entry.id]) return entry.label + " ✓"
  return entry.label
}

function searchableToken(value) {
  return String(value || "").replace(/[._-]+/g, " ")
}

function leafIdFor(id) {
  var parts = String(id || "").split(".")
  return parts.length > 0 ? parts[parts.length - 1] : id
}

function nameSearchText(entry) {
  if (!entry) return ""
  var aliases = []
  var values = Array.isArray(entry.aliases) ? entry.aliases : []
  for (var i = 0; i < values.length; i++) aliases.push(searchableToken(values[i]))
  return [entry.label, searchableToken(leafIdFor(entry.id)), aliases.join(" ")].join(" ").toLowerCase()
}

function termInSearchWords(term, text) {
  var words = String(text || "").toLowerCase().split(/\s+/)
  for (var i = 0; i < words.length; i++) {
    if (words[i] === term) return true
  }
  return false
}

function descriptionTextMatches(query, text) {
  var terms = String(query || "").toLowerCase().trim().split(/\s+/)
  for (var i = 0; i < terms.length; i++) {
    if (terms[i] && !termInSearchWords(terms[i], text)) return false
  }
  return true
}

// Letters of needle in order inside text: the number of skipped letters
// between the first and last hit, or -1 when they do not all appear in order.
function fuzzyGaps(needle, text) {
  var n = String(needle || "")
  var t = String(text || "")
  var pos = -1
  var first = -1
  for (var i = 0; i < n.length; i++) {
    pos = t.indexOf(n.charAt(i), pos + 1)
    if (pos < 0) return -1
    if (first < 0) first = pos
  }
  return n.length === 0 ? -1 : pos - first + 1 - n.length
}

// The query with spaces removed, when long enough to match fuzzily.
function isConfigRow(entry) {
  return !!entry && (entry.kind === "source-toggle" || entry.kind === "setting-option" || entry.kind === "setting-toggle" ||
    entry.kind === "setting-custom")
}

function fuzzyNeedle(query) {
  var compact = String(query || "").toLowerCase().replace(/\s+/g, "")
  return compact.length >= 3 ? compact : ""
}

// Fuzzy hits must start where a word starts ("frfox" in Firefox, "hapt" in
// Touchpad Haptics) and keep the letters close: no more skipped letters than
// typed ones. Without both, long labels like "Clipboard" match almost any
// three letters.
function fuzzyWordStart(needle, text) {
  var n = String(needle || "")
  var t = String(text || "")
  if (!n) return false
  for (var start = t.indexOf(n.charAt(0)); start >= 0; start = t.indexOf(n.charAt(0), start + 1)) {
    if (start > 0 && /[a-z0-9]/.test(t.charAt(start - 1))) continue
    var gaps = fuzzyGaps(n, t.slice(start))
    if (gaps >= 0 && gaps <= n.length) return true
  }
  return false
}

function fuzzyMatches(entry, query) {
  var needle = fuzzyNeedle(query)
  return needle !== "" && fuzzyWordStart(needle, String(entry.label || "").toLowerCase())
}

function matchesQuery(entry, query, visible, fuzzy) {
  if (!entry || entry.id === "root") return false
  if (!visible) return false

  var nameText = nameSearchText(entry)
  var descriptionText = String(entry.description || "").toLowerCase()
  var terms = String(query || "").toLowerCase().trim().split(/\s+/)

  for (var i = 0; i < terms.length; i++) {
    if (!terms[i]) continue
    if (nameText.indexOf(terms[i]) >= 0) continue
    if (termInSearchWords(terms[i], descriptionText)) continue
    return fuzzy === true && fuzzyMatches(entry, query)
  }

  return true
}

function aliasEquals(entry, needle) {
  var values = Array.isArray(entry.aliases) ? entry.aliases : []
  for (var i = 0; i < values.length; i++) if (searchableToken(values[i]).toLowerCase() === needle) return true
  return false
}

function searchScore(items, entry, query, fuzzy) {
  var needle = String(query || "").toLowerCase().trim()
  var label = entry.label.toLowerCase()
  var nameText = nameSearchText(entry)
  var descriptionText = String(entry.description || "").toLowerCase()
  var score = 80

  if (label === needle) score = entry.parent === "root" ? 2 : 0
  // An installed app whose name contains the query as a whole word ("zen"
  // for Zen Browser) beats exact-labeled menu entries like Install > Zen.
  else if (entry.kind === "app" && label.split(/\s+/).indexOf(needle) >= 0) score = 0
  else if (label.indexOf(needle) === 0) score = 10
  else if (label.indexOf(needle) >= 0) score = 30
  // An alias naming the query exactly: an action ("restart" on Reboot) is the
  // thing asked for; a submenu with that alias (Update) only groups related
  // entries, so it ranks below.
  else if (aliasEquals(entry, needle)) score = (entry.kind === "menu" || entry.kind === "link") ? 20 : 5
  else if (nameText.indexOf(needle) >= 0) score = 40
  else if (descriptionTextMatches(needle, descriptionText)) score = 60
  // A fuzzy-only hit ranks below everything else, tighter hits first.
  else if (fuzzy === true && !matchesQuery(entry, query, true, false) && fuzzyMatches(entry, query))
    score = 85 + Math.min(9, fuzzyGaps(fuzzyNeedle(query), label))

  if (entry.kind === "menu" || entry.kind === "link") score -= 2
  // App rows sort after all menu items, so they lose the tiebreak below to an
  // equal match. Outrank those, but stay inside the tier so better ones win.
  if (entry.kind === "app") score -= 5

  return score * 1000 + depthFor(items, entry.id) * 25 + entry.order
}

function displayRow(items, itemOrder, checkedResults, entry, detail, score, section) {
  var target = entry.kind === "link" ? entry.target : entry.id
  return {
    itemId: entry.id,
    kind: entry.kind,
    icon: entry.icon,
    iconFont: entry.iconFont || "",
    appIcon: entry.appIcon || "",
    appId: entry.appId || "",
    label: labelFor(entry, checkedResults),
    target: target,
    detail: detail || "",
    path: pathFor(items, entry.id),
    childCount: (entry.kind === "menu" || entry.kind === "link") ? childCount(items, itemOrder, target) : 0,
    action: entry.action || "",
    provider: entry.provider || "",
    score: score || 0,
    section: section || "",
    sourceId: entry.sourceId || "",
    value: entry.value || ""
  }
}

// Commands a `checked:` expression reads a value out of. Every sibling row
// asks the same one -- Defaults > Browser has seven rows all comparing
// against `omarchy-default-browser` -- so the batch runs it once and the rows
// read the captured answer.
//
// The capture has to be eager. These are read inside `$(...)`, and a value
// cached while one expression runs lives in that subshell only, so a lazy
// memo never survives to the expression after it.
var GUARD_READERS = [
  "omarchy-channel-current",
  "omarchy-default-agent",
  "omarchy-default-browser",
  "omarchy-default-editor",
  "omarchy-default-terminal",
  "omarchy-dns"
]

// Package and command presence account for most of what the guards ask, and
// asked one at a time they are almost all fork: the shipped menu spends over
// a second on them. Answer them inside the guard process instead. These
// shadow the real commands for the batch only, so they have to agree with
// them everywhere, including for no arguments at all (present is true of
// nothing, missing is not).
//
// `pacman -Q` resolves a name through what installed packages provide, not
// just what they are called -- with gvim installed it reports `vim` as
// present -- so the set has to carry provides too, or `install.editor.vim`
// comes back and offers to install what is already there. A version
// constraint (`bash>=1`) is not a name any set can answer, so it goes to
// pacman itself; no shipped guard writes one.
//
// `pacman -Qi` wraps a long list across continuation lines whenever COLUMNS
// is set in the environment, which a login shell may well have done, so the
// parser follows the indented lines rather than reading the first one and
// dropping half of what is installed.
function guardHelpers() {
  return 'declare -A __omarchy_pkgs=()\n'
    + 'mapfile -t __omarchy_pkg_names < <({ pacman -Qq; LC_ALL=C pacman -Qi'
    + " | awk '/^[A-Za-z]/ { provides = ($0 ~ /^Provides/); sub(/^[^:]*: /, \"\") }"
    + ' provides && $0 != "None" { n = split($0, p, " ");'
    + ' for (i = 1; i <= n; i++) { sub(/[<>=].*/, "", p[i]); print p[i] } }\'; } 2>/dev/null)\n'
    + 'for __omarchy_pkg in "${__omarchy_pkg_names[@]}"; do __omarchy_pkgs[$__omarchy_pkg]=1; done\n'
    + '__omarchy_pkg_has() { [[ -n ${__omarchy_pkgs[$1]-} ]] && return 0; '
    + '[[ $1 == *[\\<\\>=]* ]] && { pacman -Q "$1" &>/dev/null; return; }; return 1; }\n'
    + 'omarchy-pkg-present() { local p; for p in "$@"; do __omarchy_pkg_has "$p" || return 1; done; return 0; }\n'
    + 'omarchy-pkg-missing() { local p; for p in "$@"; do __omarchy_pkg_has "$p" || return 0; done; return 1; }\n'
    + 'omarchy-cmd-present() { local c; for c in "$@"; do command -v "$c" &>/dev/null || return 1; done; return 0; }\n'
    + 'omarchy-cmd-missing() { local c; for c in "$@"; do command -v "$c" &>/dev/null || return 0; done; return 1; }\n'
}

// Substitute the captured answer into the expression rather than shadowing
// the reader with a function. `$(reader)` and the variable holding what it
// printed are interchangeable -- both strip trailing newlines, both split the
// same way unquoted -- while a function would also catch `command -v reader`,
// `VAR=x reader`, and every other form, and answer those wrong. Anything but
// the plain substitution is left alone to run the real command.
function guardPrelude(guards) {
  var prelude = guardHelpers()

  for (var i = 0; i < GUARD_READERS.length; i++) {
    // The guards arrive already substituted, so what marks a reader as wanted
    // is the slot standing in for it, not the call it replaced.
    if (guards.indexOf(guardReaderSlot(i)) < 0) continue
    // `|| :` so a reader that exits nonzero cannot take the batch down with
    // it under a login shell that turned on errexit.
    prelude += "__omarchy_read_" + i + "=$(" + GUARD_READERS[i] + " 2>/dev/null) || :\n"
  }

  return prelude
}

function guardReaderSlot(index) {
  return "${__omarchy_read_" + index + "}"
}

function substituteGuardReaders(expression) {
  for (var i = 0; i < GUARD_READERS.length; i++)
    expression = expression.split("$(" + GUARD_READERS[i] + ")").join(guardReaderSlot(i))

  return expression
}

function guardLine(id, tag, expression) {
  return "if { " + substituteGuardReaders(expression) + "; } >/dev/null 2>&1; then echo "
    + id + ":" + tag + ":1; else echo " + id + ":" + tag + ":0; fi\n"
}

// One bash script for every `when:` and `checked:` in the menu, reporting
// `<id>:<w|c>:<0|1>` per line. Speed is the whole point: the menu opens on
// the last evaluation's answers, so however long this takes is how long a row
// can contradict the state it describes.
function guardScript(items) {
  var guards = ""
  var ids = Object.keys(items || {})

  for (var i = 0; i < ids.length; i++) {
    var entry = items[ids[i]]
    if (!entry) continue
    if (entry.when) guards += guardLine(ids[i], "w", entry.when)
    if (entry.checked) guards += guardLine(ids[i], "c", entry.checked)
  }

  return guards ? guardPrelude(guards) + guards : ""
}

if (typeof module !== "undefined") {
  module.exports = {
    guardReaders: GUARD_READERS,
    guardScript: guardScript,
    withSessionAliases: withSessionAliases,
    fuzzyGaps: fuzzyGaps,
    fuzzyWordStart: fuzzyWordStart,
    isConfigRow: isConfigRow,
    stripJsonc: stripJsonc,
    normalizeAliases: normalizeAliases,
    normalizeItem: normalizeItem,
    parseMenuJsonc: parseMenuJsonc,
    mergeMenuSources: mergeMenuSources,
    mergeAppRows: mergeAppRows,
    swapProviderRows: swapProviderRows,
    item: item,
    resolveRoute: resolveRoute,
    slugify: slugify,
    depthFor: depthFor,
    pathFor: pathFor,
    parentPathFor: parentPathFor,
    isDescendantOf: isDescendantOf,
    childCount: childCount,
    isVisible: isVisible,
    labelFor: labelFor,
    searchableToken: searchableToken,
    leafIdFor: leafIdFor,
    nameSearchText: nameSearchText,
    termInSearchWords: termInSearchWords,
    descriptionTextMatches: descriptionTextMatches,
    matchesQuery: matchesQuery,
    searchScore: searchScore,
    displayRow: displayRow,
    buildRows: buildRows
  }
}

// Rows the runner shows for a given menu and query. Lifted out of the QML so
// the collapse rule is testable: at the root with no query the runner is a
// bare input line, which is the whole point of omarunner. Inside a submenu an
// empty query still lists that submenu's children, because drill-down (Style >
// Theme, Apps > ...) has to keep working.
// KRunner session words for the System submenu, so "restart" finds Reboot.
function SESSION_ALIASES() {
  return {
    "system.lock": ["lock screen"],
    "system.suspend": ["sleep"],
    "system.logout": ["log out", "sign out", "logoff"],
    "system.reboot": ["restart"],
    "system.shutdown": ["power off", "poweroff", "halt", "turn off"]
  }
}

function withSessionAliases(items) {
  var extra = SESSION_ALIASES()
  var out = ({})
  for (var id in items) {
    var entry = items[id]
    if (entry && extra[id]) {
      var copy = ({})
      for (var key in entry) copy[key] = entry[key]
      var aliases = Array.isArray(entry.aliases) ? entry.aliases.slice() : []
      for (var a = 0; a < extra[id].length; a++) if (aliases.indexOf(extra[id][a]) < 0) aliases.push(extra[id][a])
      copy.aliases = aliases
      entry = copy
    }
    out[id] = entry
  }
  return out
}

// hiddenGroups: { apps: true, menu: true, session: true } switches a menu-tree group off in
// the root search (Sources page); submenus are never filtered.
// fuzzy: letters-in-order matching for queries of 3+ characters.
function buildRows(items, itemOrder, whenResults, checkedResults, activeMenu, query, sourceGroups, hiddenGroups, fuzzy) {
  var active = item(items, activeMenu) ? activeMenu : "root"
  var trimmed = String(query || "").trim()
  var order = Array.isArray(itemOrder) ? itemOrder : []
  var rows = []
  var divider = false

  if (!trimmed) {
    if (active === "root") return { activeMenu: active, rows: [], searchDivider: false, sectionLabels: {} }

    for (var j = 0; j < order.length; j++) {
      var child = item(items, order[j])
      if (!child || child.parent !== active) continue
      if (!isVisible(items, itemOrder, whenResults, child)) continue
      rows.push(displayRow(items, itemOrder, checkedResults, child, child.description, child.order))
    }

    // DesktopEntries can reorder its values when an application starts. Keep
    // the Apps menu alphabetical independently of provider refreshes.
    if (active === "apps") {
      rows.sort(function(a, b) {
        var aLabel = String(a.label || "").toLowerCase()
        var bLabel = String(b.label || "").toLowerCase()
        if (aLabel < bLabel) return -1
        if (aLabel > bLabel) return 1
        var aId = String(a.itemId || "")
        var bId = String(b.itemId || "")
        if (aId < bId) return -1
        if (aId > bId) return 1
        return 0
      })
    }

    return { activeMenu: active, rows: rows, searchDivider: false, sectionLabels: {} }
  }

  var currentRows = []
  var drilldownRows = []

  for (var i = 0; i < order.length; i++) {
    var entry = item(items, order[i])
    if (!entry || entry.id === "root") continue
    // A Sources-page toggle surfacing in a root search would let "files" +
    // Enter switch the Files source off; toggles only list on their own page.
    // Config rows (Sources and Settings pages) only list on their own page,
    // so a root search for "files" or "wide" cannot flip a setting.
    if (isConfigRow(entry) && entry.parent !== active) continue
    if (!isDescendantOf(items, entry.id, active)) continue
    if (!matchesQuery(entry, trimmed, isVisible(items, itemOrder, whenResults, entry), fuzzy)) continue

    var detail = parentPathFor(items, entry.id)
    var row = displayRow(items, itemOrder, checkedResults, entry, detail, searchScore(items, entry, trimmed, fuzzy))
    if (entry.parent === active) currentRows.push(row)
    else drilldownRows.push(row)
  }

  var searchSort = function(a, b) {
    if (a.score !== b.score) return a.score - b.score
    return a.path.localeCompare(b.path)
  }

  var labels = ({})
  if (active !== "root") {
    currentRows.sort(searchSort)
    drilldownRows.sort(searchSort)
    divider = currentRows.length > 0 && drilldownRows.length > 0
    if (divider) {
      for (var d = 0; d < drilldownRows.length; d++) drilldownRows[d].section = "drilldown"
    }
    rows = currentRows.concat(drilldownRows)
    return { activeMenu: active, rows: rows, searchDivider: divider, sectionLabels: labels }
  }

  // The root search feeds the category column. Source groups come as
  // { sourceId, groupLabel, maxRows, rows, leading, exclusive, fallback }.
  var groups = Array.isArray(sourceGroups) ? sourceGroups : []
  var appendSource = function(group) {
    if (!group || !Array.isArray(group.rows) || group.rows.length === 0) return
    var section = "source:" + group.sourceId
    var cap = group.maxRows > 0 ? group.maxRows : group.rows.length
    for (var s = 0; s < group.rows.length && s < cap; s++) {
      group.rows[s].section = section
      rows.push(group.rows[s])
    }
    labels[section] = group.groupLabel
  }

  // A source that claimed the query by its prefix ("kill ", "cb ", ">") owns
  // the whole list.
  var claimed = false
  for (var x = 0; x < groups.length; x++) {
    if (groups[x] && groups[x].exclusive) { claimed = true; appendSource(groups[x]) }
  }
  if (claimed) return { activeMenu: active, rows: rows, searchDivider: false, sectionLabels: labels }

  for (var lg = 0; lg < groups.length; lg++) if (groups[lg] && groups[lg].leading) appendSource(groups[lg])

  // Menu-tree rows split into Omarchy, Applications and Session (the System
  // submenu); the group holding the best match leads.
  var hidden = hiddenGroups || ({})
  var treeGroups = [{ key: "menu", section: "group:menu", label: "Omarchy", rows: [] },
                    { key: "apps", section: "group:apps", label: "Applications", rows: [] },
                    { key: "session", section: "group:session", label: "Session", rows: [] }]
  var matched = currentRows.concat(drilldownRows)
  for (var m = 0; m < matched.length; m++) {
    var slot = matched[m].kind === "app" ? 1 : String(matched[m].itemId).indexOf("system.") === 0 ? 2 : 0
    if (!hidden[treeGroups[slot].key]) treeGroups[slot].rows.push(matched[m])
  }
  var filled = []
  for (var tg = 0; tg < treeGroups.length; tg++) {
    if (treeGroups[tg].rows.length === 0) continue
    treeGroups[tg].rows.sort(searchSort)
    treeGroups[tg].rank = tg
    filled.push(treeGroups[tg])
  }
  filled.sort(function(a, b) { return (a.rows[0].score - b.rows[0].score) || (a.rank - b.rank) })
  for (var f = 0; f < filled.length; f++) {
    for (var tr = 0; tr < filled[f].rows.length; tr++) {
      filled[f].rows[tr].section = filled[f].section
      rows.push(filled[f].rows[tr])
    }
    labels[filled[f].section] = filled[f].label
  }

  for (var tgx = 0; tgx < groups.length; tgx++)
    if (groups[tgx] && !groups[tgx].leading && !groups[tgx].fallback) appendSource(groups[tgx])

  // Fallback groups (the web search row) only fill an otherwise empty list.
  if (rows.length === 0) for (var fb = 0; fb < groups.length; fb++) if (groups[fb] && groups[fb].fallback) appendSource(groups[fb])
  return { activeMenu: active, rows: rows, searchDivider: divider, sectionLabels: labels }
}
