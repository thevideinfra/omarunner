// Clipboard source: "cb" lists Omarchy's clipboard history, newest first.
// "cb git" filters text entries, "cb screenshot" (or image, img, picture,
// or just "cb scr") lists copied images, and "cb list" opens the full clipboard manager. Only
// the prefix shows history, so copied secrets never surface in a normal search.
function claims(query) { return /^cb(\s|$)/i.test(String(query || "").trim()) }

function filter(query) { return claims(query) ? String(query).trim().slice(2).trim() : "" }

function isListCommand(query) { return claims(query) && filter(query).toLowerCase() === "list" }

function parseHistory(text) {
  var parsed
  try { parsed = JSON.parse(String(text || "")) } catch (e) { return [] }
  return Array.isArray(parsed) ? parsed : []
}

function IMAGE_WORDS() { return ["screenshot", "screenshots", "image", "images", "img", "picture", "pictures", "png"] }

function isText(entry) { return !!entry && entry.type === "text" && typeof entry.text === "string" }
function isImage(entry) { return !!entry && entry.type === "image" && typeof entry.path === "string" }

// How a single term relates to the image words: "exact" (screenshot, img),
// "prefix" (2+ letters starting one: sc, scr, im, pic), or "".
function imageWordMatch(term) {
  var words = IMAGE_WORDS()
  if (words.indexOf(term) >= 0) return "exact"
  if (term.length < 2) return ""
  for (var i = 0; i < words.length; i++) if (words[i].indexOf(term) === 0) return "prefix"
  return ""
}

// An empty filter lists every entry. An image word lists images only; the
// start of one lists images first, then text containing it, so "cb scr" shows
// screenshots and still finds a copied "script.sh". Anything else matches
// text entries containing every term. Indices are positions in the file.
function matches(history, filterText) {
  var terms = String(filterText || "").toLowerCase().split(/\s+/).filter(function(t) { return t.length > 0 })
  var list = Array.isArray(history) ? history : []
  var imageMode = terms.length === 1 ? imageWordMatch(terms[0]) : ""
  var images = []
  var texts = []
  for (var i = 0; i < list.length; i++) {
    var entry = list[i]
    if (terms.length === 0) {
      if (isText(entry) || isImage(entry)) texts.push({ entry: entry, index: i })
      continue
    }
    if (isImage(entry)) {
      if (imageMode) images.push({ entry: entry, index: i })
      continue
    }
    if (!isText(entry) || imageMode === "exact") continue
    var text = entry.text.toLowerCase()
    var ok = true
    for (var t = 0; t < terms.length; t++) if (text.indexOf(terms[t]) < 0) { ok = false; break }
    if (ok) texts.push({ entry: entry, index: i })
  }
  return images.concat(texts)
}

function label(text) {
  var lines = String(text).split("\n")
  var first = ""
  for (var i = 0; i < lines.length; i++) if (lines[i].trim()) { first = lines[i]; break }
  first = first.replace(/\s+/g, " ").trim()
  return first.length > 80 ? first.slice(0, 79) + "…" : first
}

function baseRow(id, icon, rowLabel, detail, value) {
  return {
    itemId: "clipboard." + id, kind: "source", icon: icon, iconFont: "", appIcon: "", appId: "",
    label: rowLabel, target: "", detail: detail, path: "", childCount: 0,
    action: "", provider: "", score: 0, section: "", sourceId: "clipboard", value: value
  }
}

// Values carry their kind: "text:<text>", "image:<path>", or "list:". A text
// row carries the text, not the index: a copy between search and Enter shifts
// every index, so the index is resolved against the latest history.
function row(match) {
  var entry = match.entry
  if (isImage(entry)) {
    var image = baseRow(match.index, "image-x-generic", "Image", String(entry.capturedAt || ""), "image:" + entry.path)
    image.appIcon = "file://" + encodeURI(entry.path)
    return image
  }
  var lineCount = String(entry.text).split("\n").length
  return baseRow(match.index, "edit-paste", label(entry.text), lineCount > 1 ? lineCount + " lines" : "", "text:" + entry.text)
}

function listRow() {
  return baseRow("list", "edit-paste", "Open clipboard manager", "All clipboard history", "list:")
}

// The rows for one query. Nothing without the cb prefix: an unprefixed query
// has an empty filter, which would otherwise list the whole history.
function rowsFor(history, query, maxRows) {
  if (!claims(query)) return []
  if (isListCommand(query)) return [listRow()]
  return matches(history, filter(query)).slice(0, maxRows).map(row)
}

function resolveIndex(history, text) {
  var list = Array.isArray(history) ? history : []
  for (var i = 0; i < list.length; i++) if (isText(list[i]) && list[i].text === text) return i
  return -1
}

function findImage(history, path) {
  var list = Array.isArray(history) ? history : []
  for (var i = 0; i < list.length; i++) if (isImage(list[i]) && list[i].path === path) return list[i]
  return null
}

// Enter pastes into the previous window; copyOnly (Shift+Enter) only copies.
function activateArgv(history, value, copyOnly) {
  var text = String(value || "")
  if (text === "list:") return ["omarchy-menu-clipboard"]
  if (text.indexOf("image:") === 0) {
    var image = findImage(history, text.slice(6))
    if (!image) return []
    var fileArgv = ["omarchy-clipboard-paste-file"]
    if (copyOnly) fileArgv.push("--copy-only")
    return fileArgv.concat([String(image.mime || "image/png"), image.path])
  }
  if (text.indexOf("text:") === 0) {
    var index = resolveIndex(history, text.slice(5))
    if (index < 0) return []
    var argv = ["omarchy-clipboard-paste-text"]
    if (copyOnly) argv.push("--copy-only")
    return argv.concat(["--history-index", String(index)])
  }
  return []
}

if (typeof module !== "undefined") {
  module.exports = { claims: claims, filter: filter, isListCommand: isListCommand, parseHistory: parseHistory,
    matches: matches, label: label, row: row, listRow: listRow, rowsFor: rowsFor, resolveIndex: resolveIndex, activateArgv: activateArgv }
}
