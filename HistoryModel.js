// Launch history and Favorites: what was launched, what is pinned, and the rows
// shown for them when omarunner opens with nothing typed.
//
// An entry is a flat copy of the display row that was launched or pinned, plus
// a stable key, so it can be shown and activated again without a search.
// Only apps, files, folders and menu actions are recorded: never clipboard
// text, typed commands, kill, calculator results or web searches.

function RECORDED_SOURCES() { return ["files", "folders", "recent"] }
function PINNABLE_SOURCES() { return ["files", "folders", "recent", "locations"] }

function isOwnPage(itemId) {
  var id = String(itemId || "")
  return id === "sources" || id.indexOf("sources.") === 0 || id.indexOf("omarunner-settings") === 0
}

// Rows that count as a launch.
function recordable(row) {
  if (!row) return false
  if (row.kind === "app") return !!row.appId
  if (row.kind === "source") return RECORDED_SOURCES().indexOf(row.sourceId) >= 0 && !!row.value
  if (row.kind === "action") return !!row.action && !isOwnPage(row.itemId)
  return false
}

// Rows that can be pinned: everything recordable, plus opened locations and
// submenus (a pinned "Style" menu opens that menu).
function pinnable(row) {
  if (recordable(row)) return true
  if (!row) return false
  if (row.kind === "source") return PINNABLE_SOURCES().indexOf(row.sourceId) >= 0 && !!row.value
  if (row.kind === "menu" || row.kind === "link") return !isOwnPage(row.itemId)
  return false
}

function keyFor(row) {
  if (!row) return ""
  if (row.kind === "app") return "app:" + row.appId
  if (row.kind === "source") return "source:" + row.sourceId + ":" + row.value
  if (row.kind === "menu" || row.kind === "link") return "menu:" + (row.target || row.itemId)
  return "action:" + row.itemId
}

function str(value) { return value === undefined || value === null ? "" : String(value) }

function entryFromRow(row) {
  return {
    key: keyFor(row), kind: str(row.kind), itemId: str(row.itemId), label: str(row.label), detail: str(row.detail),
    icon: str(row.icon), iconFont: str(row.iconFont), appIcon: str(row.appIcon), appId: str(row.appId),
    target: str(row.target), action: str(row.action), sourceId: str(row.sourceId), value: str(row.value)
  }
}

// Stored entries come from a file; keep only well-formed ones.
function clean(list, max) {
  var out = []
  var seen = ({})
  var source = Array.isArray(list) ? list : []
  for (var i = 0; i < source.length && out.length < max; i++) {
    var e = source[i]
    if (!e || typeof e !== "object" || typeof e.key !== "string" || !e.key || seen[e.key]) continue
    if (["app", "source", "action", "menu", "link"].indexOf(e.kind) < 0) continue
    seen[e.key] = true
    var copy = entryFromRow(e)
    copy.key = e.key
    copy.last = typeof e.last === "number" ? e.last : 0
    copy.count = typeof e.count === "number" ? e.count : 1
    out.push(copy)
  }
  return out
}

// A launch moves its entry to the front with the count raised; the list is
// capped.
function record(history, entry, now, max) {
  var list = clean(history, 1000)
  var count = 1
  var rest = []
  for (var i = 0; i < list.length; i++) {
    if (list[i].key === entry.key) count = list[i].count + 1
    else rest.push(list[i])
  }
  var next = { key: entry.key, kind: entry.kind, itemId: entry.itemId, label: entry.label, detail: entry.detail,
    icon: entry.icon, iconFont: entry.iconFont, appIcon: entry.appIcon, appId: entry.appId, target: entry.target,
    action: entry.action, sourceId: entry.sourceId, value: entry.value, last: now, count: count }
  return [next].concat(rest).slice(0, max || 50)
}

function isFavorite(favorites, key) {
  var list = Array.isArray(favorites) ? favorites : []
  for (var i = 0; i < list.length; i++) if (list[i] && list[i].key === key) return true
  return false
}

// Pin, or unpin when already pinned.
function toggleFavorite(favorites, entry) {
  var list = clean(favorites, 30)
  if (isFavorite(list, entry.key)) return list.filter(function(e) { return e.key !== entry.key })
  var added = entryFromRow(entry)
  added.key = entry.key
  added.last = 0
  added.count = 1
  return list.length >= 30 ? list : list.concat([added])
}

function removeFavorite(favorites, key) {
  return clean(favorites, 30).filter(function(e) { return e.key !== key })
}

function moveFavorite(favorites, key, delta) {
  var list = clean(favorites, 30)
  var from = -1
  for (var i = 0; i < list.length; i++) if (list[i].key === key) from = i
  var to = from + delta
  if (from < 0 || to < 0 || to >= list.length) return list
  var item = list.splice(from, 1)[0]
  list.splice(to, 0, item)
  return list
}

// The display row for an entry, in the shape buildRows produces.
function rowFromEntry(entry, section) {
  return {
    itemId: entry.itemId, kind: entry.kind, icon: entry.icon, iconFont: entry.iconFont, appIcon: entry.appIcon,
    appId: entry.appId, label: entry.label, target: entry.target, detail: entry.detail, path: "", childCount: 0,
    action: entry.action, provider: "", score: 0, section: section || "", sourceId: entry.sourceId, value: entry.value
  }
}

// The groups shown on an empty root: Favorites first (all of them), then the
// most recent launches that are not already favorites (`recents` of them; 0
// turns the history off). `favoritesShown` caps the favorites listed (0 hides
// them; omitted shows all). Pinned items stay out of the history either way.
function startGroups(favorites, history, recents, favoritesShown) {
  var groups = []
  var favs = clean(favorites, 30)
  var shown = typeof favoritesShown === "number" ? favoritesShown : 30
  if (shown > 0 && favs.length > 0) {
    groups.push({ section: "start:favorites", label: "Favorites",
      rows: favs.slice(0, shown).map(function(e) { return rowFromEntry(e, "start:favorites") }) })
  }
  var count = typeof recents === "number" ? recents : 0
  if (count > 0) {
    var rows = clean(history, 50).filter(function(e) { return !isFavorite(favs, e.key) }).slice(0, count)
    if (rows.length > 0) {
      groups.push({ section: "start:history", label: "Recent launches",
        rows: rows.map(function(e) { return rowFromEntry(e, "start:history") }) })
    }
  }
  return groups
}

if (typeof module !== "undefined") {
  module.exports = { recordable: recordable, pinnable: pinnable, keyFor: keyFor, entryFromRow: entryFromRow,
    clean: clean, record: record, isFavorite: isFavorite, toggleFavorite: toggleFavorite, removeFavorite: removeFavorite,
    moveFavorite: moveFavorite, rowFromEntry: rowFromEntry, startGroups: startGroups }
}
