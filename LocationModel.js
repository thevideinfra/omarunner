// Locations source: a query that is a URL or a filesystem path opens directly.
// Bare hosts need a known TLD, so "notes.md" or "setup.sh" stay file names.
function KNOWN_TLDS() {
  return ["com", "org", "net", "io", "dev", "app", "ai", "co", "uk", "de", "edu", "gov", "me", "tv", "gg",
    "xyz", "info", "fr", "nl", "eu", "us", "ca", "jp", "au", "nz", "ch", "se", "no", "fi", "dk", "pl", "it",
    "es", "be", "at", "br", "in", "ru", "cn", "tech", "site", "online", "blog", "cloud", "page", "social", "wiki"]
}

function classify(query, home) {
  var text = String(query || "").trim()
  if (!text || /\s/.test(text)) return null

  if (/^(https?|ftp|file):\/\//i.test(text)) return { kind: "url", url: text }
  if (/^localhost(:\d+)?(\/\S*)?$/i.test(text)) return { kind: "url", url: "http://" + text }
  if (/^www\.[^\s.]+\.[a-z]{2,}(\/\S*)?$/i.test(text)) return { kind: "url", url: "https://" + text }
  var host = /^([a-z0-9-]+\.)+([a-z]{2,})(:\d+)?(\/\S*)?$/i.exec(text)
  if (host && KNOWN_TLDS().indexOf(host[2].toLowerCase()) >= 0) return { kind: "url", url: "https://" + text }

  if (text.charAt(0) === "/") return { kind: "path", path: text }
  if (text === "~" || text.indexOf("~/") === 0) return { kind: "path", path: String(home || "") + text.slice(1) }
  return null
}

// stat -c %F: "directory", "regular file", "regular empty file", "symbolic link"...
function kindLabel(statOutput) {
  var kind = String(statOutput || "").trim()
  if (kind === "directory") return "Folder"
  if (kind.indexOf("regular") === 0) return "File"
  return kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : ""
}

function statArgs(path) { return ["stat", "-L", "-c", "%F", "--", String(path)] }

function row(target, detail, isUrl) {
  return {
    itemId: "locations." + target, kind: "source", icon: isUrl ? "web-browser" : (detail === "Folder" ? "folder" : "text-x-generic"),
    iconFont: "", appIcon: "", appId: "", label: "Open " + target, target: "", detail: detail, path: "", childCount: 0,
    action: "", provider: "", score: 0, section: "", sourceId: "locations", value: target
  }
}

function openArgv(value) { return value ? ["xdg-open", String(value)] : [] }

if (typeof module !== "undefined") {
  module.exports = { classify: classify, kindLabel: kindLabel, statArgs: statArgs, row: row, openArgv: openArgv }
}
