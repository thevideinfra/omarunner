import { test } from "node:test"
import assert from "node:assert/strict"
import { loadJsModule } from "./helpers/load-js-module.mjs"
const M = await loadJsModule("SourceModel.js")

// Reconciled against the shipped SourceModel.js, which lost SOURCE_IDS() and
// sourceLabel() (the source registry now lives only in Runner.qml's
// root.sources) and changed isEnabled()'s default from "false unless true" to
// "true unless explicitly false" — a source absent from the config, or absent
// from a stale config written before it existed, is enabled by default.

test("default config has no per-source overrides and sets DuckDuckGo", () => {
  assert.deepEqual(M.defaultConfig(), { sources: {}, webSearchUrl: "https://duckduckgo.com/?q=" })
})

test("parseConfig keeps a boolean source flag from a partial file", () => {
  const c = M.parseConfig('{"sources":{"files":false}}')
  assert.equal(c.sources.files, false)
  assert.equal(c.webSearchUrl, "https://duckduckgo.com/?q=")
})

test("parseConfig keeps unknown keys so a hand edit survives a toggle", () => {
  const c = M.parseConfig('{"sources":{"files":true,"future":false},"extra":1}')
  assert.equal(c.sources.future, false)
  assert.equal(c.extra, 1)
})

test("parseConfig falls back to defaults on malformed, empty, or non-object input", () => {
  assert.deepEqual(M.parseConfig("{nope"), M.defaultConfig())
  assert.deepEqual(M.parseConfig(""), M.defaultConfig())
  assert.deepEqual(M.parseConfig("[]"), M.defaultConfig())
})

test("parseConfig drops a non-boolean source flag rather than coercing it", () => {
  assert.deepEqual(M.parseConfig('{"sources":{"files":"no"}}').sources, {})
})

test("isValidConfigText accepts a JSON object and rejects arrays or garbage", () => {
  assert.equal(M.isValidConfigText('{"a":1}'), true)
  assert.equal(M.isValidConfigText("[]"), false)
  assert.equal(M.isValidConfigText("not json"), false)
})

test("toggled flips one source relative to its current effective state and leaves the input untouched", () => {
  const base = M.defaultConfig()
  const next = M.toggled(base, "files")
  assert.equal(next.sources.files, false) // absent counts as enabled, so toggling disables it
  assert.equal(base.sources.files, undefined)
})

test("toggled flips an explicitly-disabled source back on", () => {
  const base = M.parseConfig('{"sources":{"files":false}}')
  assert.equal(M.toggled(base, "files").sources.files, true)
})

test("serialize writes pretty JSON with a trailing newline", () => {
  assert.equal(M.serialize({ a: 1 }), '{\n  "a": 1\n}\n')
})

test("isEnabled treats an absent or unknown source as enabled; only an explicit false disables it", () => {
  assert.equal(M.isEnabled(M.defaultConfig(), "files"), true)
  assert.equal(M.isEnabled(M.defaultConfig(), "nope"), true)
  assert.equal(M.isEnabled({ sources: { files: false } }, "files"), false)
})

// sourcePageRows(config, sourceList) now takes the live source registry list
// (built from Runner.qml's root.sources) instead of an internal SOURCE_IDS().

test("sourcePageRows lists each source from the given registry as a toggle row", () => {
  const rows = M.sourcePageRows(M.defaultConfig(), [{ sourceId: "files", groupLabel: "Files" }])
  assert.deepEqual(rows.map(r => [r.id, r.parent, r.kind, r.label, r.value, r.checked]),
    [["sources.files", "sources", "source-toggle", "Files", "files", "config"]])
})

test("sourcePageRows returns nothing for an empty registry", () => {
  assert.deepEqual(M.sourcePageRows(M.defaultConfig(), []), [])
})

test("sourcePageRows falls back to the source id as a label when none is given", () => {
  const rows = M.sourcePageRows(M.defaultConfig(), [{ sourceId: "files" }])
  assert.equal(rows[0].label, "files")
})

test("the Sources page lists sources alphabetically", () => {
  const rows = M.sourcePageRows({}, [
    { sourceId: "files", groupLabel: "Files" }, { sourceId: "apps", groupLabel: "Applications" },
    { sourceId: "calc", groupLabel: "Calculator" }, { sourceId: "clipboard", groupLabel: "Clipboard" }])
  assert.deepEqual(rows.map(r => r.label), ["Applications", "Calculator", "Clipboard", "Files"])
  assert.deepEqual(rows.map(r => r.order), [0, 1, 2, 3])
})

test("each Sources page row carries its source's hint as description", () => {
  const rows = M.sourcePageRows({}, [{ sourceId: "clipboard", groupLabel: "Clipboard", hint: "cb · cb list" }, { sourceId: "x", groupLabel: "X" }])
  assert.equal(rows[0].description, "cb · cb list")
  assert.equal(rows[1].description, "")
})
