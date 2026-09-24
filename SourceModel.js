// The omarunner.json config and the Sources page rows. Sources themselves are
// registered in Runner.qml (root.sources); nothing here names one, so a source
// absent from the config is enabled and only an explicit false disables it.
function defaultConfig() {
  return { sources: ({}), webSearchUrl: "https://duckduckgo.com/?q=" }
}

function parseObject(rawText) {
  var parsed
  try { parsed = JSON.parse(String(rawText || "")) } catch (e) { return null }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
  return parsed
}

function isValidConfigText(rawText) { return parseObject(rawText) !== null }

function parseConfig(rawText) {
  var base = defaultConfig()
  var parsed = parseObject(rawText)
  if (!parsed) return base

  var out = ({})
  for (var key in parsed) out[key] = parsed[key]
  var sources = ({})
  var given = parsed.sources && typeof parsed.sources === "object" && !Array.isArray(parsed.sources) ? parsed.sources : ({})
  for (var id in given) if (typeof given[id] === "boolean") sources[id] = given[id]
  out.sources = sources
  if (typeof out.webSearchUrl !== "string" || !out.webSearchUrl) out.webSearchUrl = base.webSearchUrl
  return out
}

function toggled(config, sourceId) {
  var next = JSON.parse(JSON.stringify(config || defaultConfig()))
  if (!next.sources) next.sources = ({})
  next.sources[sourceId] = !isEnabled(config, sourceId)
  return next
}

function isEnabled(config, sourceId) {
  return !(config && config.sources && config.sources[sourceId] === false)
}

function serialize(config) { return JSON.stringify(config, null, 2) + "\n" }

// sourceList: [{ sourceId, groupLabel }], built from Runner.qml's root.sources.
function sourcePageRows(config, sourceList) {
  var list = Array.isArray(sourceList) ? sourceList : []
  var rows = []
  for (var i = 0; i < list.length; i++) {
    var id = String(list[i].sourceId || "")
    if (!id) continue
    rows.push({ id: "sources." + id, parent: "sources", kind: "source-toggle", icon: "", iconFont: "",
      label: String(list[i].groupLabel || id), title: "", target: "", description: "", action: "", provider: "",
      aliases: [], when: "", checked: "config", value: id, order: rows.length })
  }
  return rows
}

if (typeof module !== "undefined") {
  module.exports = {
    defaultConfig: defaultConfig,
    isValidConfigText: isValidConfigText,
    parseConfig: parseConfig,
    toggled: toggled,
    isEnabled: isEnabled,
    serialize: serialize,
    sourcePageRows: sourcePageRows
  }
}
