import { test } from "node:test"
import assert from "node:assert/strict"
import { loadJsModule } from "./helpers/load-js-module.mjs"
import { loadRunnerModel } from "./helpers/load-runner-model.mjs"

const RunnerModel = await loadRunnerModel()
const Folder = await loadJsModule("FolderModel.js")
const Kill = await loadJsModule("KillModel.js")
const Windows = await loadJsModule("WindowModel.js")

// Since Omarchy 4.5 an array that has been stored in a QML `var` property
// comes back to JS with Array.prototype and a length but Array.isArray() is
// false. Model functions must still treat it as a list.
function qmlList(values) {
  const list = Object.setPrototypeOf({ length: values.length }, Array.prototype)
  values.forEach((value, index) => { list[index] = value })
  assert.equal(Array.isArray(list), false, "fixture must not be a real array")
  return list
}

test("buildRows keeps source rows whose list is a QML array", () => {
  const { items, itemOrder } = RunnerModel.mergeMenuSources([], [])
  const group = {
    sourceId: "calc", groupLabel: "Calculator", maxRows: 1, leading: false, exclusive: false, fallback: false,
    rows: qmlList([{ label: "4", value: "4" }])
  }
  const result = RunnerModel.buildRows(items, qmlList(itemOrder), {}, {}, "root", "2+2", qmlList([group]), {}, false, undefined)
  assert.deepEqual(result.rows.map(row => row.label), ["4"])
  assert.equal(result.sectionLabels["source:calc"], "Calculator")
})

test("buildRows shows the fallback web row from a QML array", () => {
  const { items, itemOrder } = RunnerModel.mergeMenuSources([], [])
  const group = { sourceId: "web", groupLabel: "Web", maxRows: 1, fallback: true, rows: qmlList([{ label: "Search", value: "u" }]) }
  const result = RunnerModel.buildRows(items, itemOrder, {}, {}, "root", "zzzz", qmlList([group]), {}, false, undefined)
  assert.deepEqual(result.rows.map(row => row.label), ["Search"])
})

test("folder matches accept a QML array", () => {
  const hits = Folder.matches(qmlList([{ name: "Documents", path: "/home/ks/Documents" }]), "docs", false)
  assert.deepEqual(hits.map(h => h.path), ["/home/ks/Documents"])
})

test("kill matches accept a QML array", () => {
  const hits = Kill.matches(qmlList([{ pid: "1", name: "firefox", args: "firefox" }]), "fire")
  assert.deepEqual(hits.map(h => h.pid), ["1"])
})

test("window matches accept a QML array", () => {
  const hits = Windows.matches(qmlList([{ appClass: "kitty", title: "shell", address: "0x1", focusHistoryId: 0 }]), "kitty")
  assert.equal(hits.length, 1)
})
