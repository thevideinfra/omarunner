// Files source: fd arguments, row shaping, icons, open/reveal commands.
function shellQuote(value) {
  return "'" + String(value === undefined || value === null ? "" : value).replace(/'/g, "'\\''") + "'"
}

function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") }

function fdArgs(query, home) {
  var terms = String(query || "").trim().split(/\s+/).filter(function(t) { return t.length > 0 })
  if (terms.join(" ").length < 2) return []
  var pattern = terms.map(escapeRegex).join(".*")
  var args = ["fd", "--type", "f", "--ignore-case", "--color", "never"]
  var excludes = EXCLUDES()
  for (var i = 0; i < excludes.length; i++) args.push("--exclude", excludes[i])
  return args.concat(["--max-results", "40", pattern, String(home || "")])
}

// Dot-directories are already skipped (no --hidden); these are the bulky
// non-hidden or explicitly-named trees that still drown real documents.
function EXCLUDES() {
  return [".git", "node_modules", ".cache", ".cargo", ".rustup", ".npm", ".oh-my-zsh", "go/pkg", ".local/share"]
}

function extension(path) {
  var base = String(path || "").split("/").pop()
  var dot = base.lastIndexOf(".")
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ""
}

function isImage(path) {
  return ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].indexOf(extension(path)) >= 0
}

function iconName(path) {
  var map = {
    pdf: "application-pdf", zip: "package-x-generic", tar: "package-x-generic", gz: "package-x-generic",
    xz: "package-x-generic", "7z": "package-x-generic", mp3: "audio-x-generic", flac: "audio-x-generic",
    ogg: "audio-x-generic", wav: "audio-x-generic", mp4: "video-x-generic", mkv: "video-x-generic",
    webm: "video-x-generic", mov: "video-x-generic", doc: "x-office-document", docx: "x-office-document",
    odt: "x-office-document", xls: "x-office-spreadsheet", xlsx: "x-office-spreadsheet",
    ods: "x-office-spreadsheet", ppt: "x-office-presentation", pptx: "x-office-presentation",
    odp: "x-office-presentation", html: "text-html", sh: "text-x-script", py: "text-x-script",
    js: "text-x-script", png: "image-x-generic", jpg: "image-x-generic", jpeg: "image-x-generic",
    webp: "image-x-generic", gif: "image-x-generic", bmp: "image-x-generic", svg: "image-x-generic"
  }
  return map[extension(path)] || "text-x-generic"
}

function fileRow(path, home) {
  var full = String(path || "")
  var root = String(home || "")
  var detail = root && full.indexOf(root + "/") === 0 ? full.slice(root.length + 1) : full
  var image = isImage(full)
  return {
    itemId: "files." + full, kind: "source", icon: image ? "" : iconName(full), iconFont: "",
    appIcon: image ? "file://" + encodeURI(full) : "", appId: "", label: full.split("/").pop(),
    target: "", detail: detail, path: "", childCount: 0, action: "", provider: "", score: 0,
    section: "", sourceId: "files", value: full
  }
}

// fd walks in parallel, so its output order changes run to run. Rank before
// the group cap: basename starts with the first query term, then paths with
// no hidden segment, then shallower paths, then alphabetical.
function fileRows(stdoutText, home, query) {
  var lines = String(stdoutText || "").split("\n")
  var first = String(query || "").trim().split(/\s+/)[0].toLowerCase()
  var ranked = []
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim()
    if (!line) continue
    var row = fileRow(line, home)
    var rel = "/" + row.detail
    ranked.push({
      row: row,
      prefix: first && row.label.toLowerCase().indexOf(first) === 0 ? 0 : 1,
      hidden: rel.indexOf("/.") >= 0 ? 1 : 0,
      depth: row.detail.split("/").length,
      path: row.value
    })
  }
  ranked.sort(function(a, b) {
    if (a.prefix !== b.prefix) return a.prefix - b.prefix
    if (a.hidden !== b.hidden) return a.hidden - b.hidden
    if (a.depth !== b.depth) return a.depth - b.depth
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0
  })
  var rows = []
  for (var r = 0; r < ranked.length; r++) rows.push(ranked[r].row)
  return rows
}

function openCommand(path) { return path ? "xdg-open " + shellQuote(path) : "" }

function revealCommand(path) {
  if (!path) return ""
  var dir = String(path).split("/").slice(0, -1).join("/") || "/"
  return "nautilus " + shellQuote(dir)
}

if (typeof module !== "undefined") {
  module.exports = {
    fdArgs: fdArgs,
    fileRow: fileRow,
    fileRows: fileRows,
    openCommand: openCommand,
    revealCommand: revealCommand,
    iconName: iconName,
    isImage: isImage
  }
}
