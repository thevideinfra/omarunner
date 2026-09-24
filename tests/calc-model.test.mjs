import { test } from "node:test"
import assert from "node:assert/strict"
import { loadJsModule } from "./helpers/load-js-module.mjs"
const C = await loadJsModule("CalcModel.js")

test("arithmetic needs a binary operator unless forced with =", () => {
  assert.equal(C.isArithmetic("2+2"), true)
  assert.equal(C.isArithmetic("(1 + 2) * 3"), true)
  assert.equal(C.isArithmetic("2"), false)
  assert.equal(C.isArithmetic("=2"), true)
  assert.equal(C.isArithmetic("-5"), false)
  assert.equal(C.isArithmetic("3 × 4"), true)
  assert.equal(C.isArithmetic("firefox"), false)
  assert.equal(C.isArithmetic("1,5+2"), false)
  assert.equal(C.isArithmetic("2024-09"), true)
})

test("evaluate honours precedence, associativity and unary minus", () => {
  assert.equal(C.evaluate("2+3*4"), 14)
  assert.equal(C.evaluate("(2+3)*4"), 20)
  assert.equal(C.evaluate("2^3^2"), 512)
  assert.equal(C.evaluate("-2^2"), -4)
  assert.equal(C.evaluate("10 % 4"), 2)
  assert.equal(C.evaluate("8 ÷ 2 × 3"), 12)
  assert.equal(C.evaluate(".5*4"), 2)
})

test("evaluate rejects bad input and division by zero", () => {
  for (const bad of ["1/0", "5 % 0", "(1+2", "1+", "2 3", "", "1..2"]) {
    assert.equal(C.evaluate(bad), null, bad)
  }
})

test("format trims float noise and trailing zeros", () => {
  assert.equal(C.format(C.evaluate("0.1+0.2")), "0.3")
  assert.equal(C.format(10), "10")
  assert.equal(C.format(1 / 3), "0.333333333333")
  assert.equal(C.format(2 ** 70), "1.18059162072e+21")
  assert.equal(C.format(-0), "0")
})

test("qalc takes units, functions and percentages, not plain words", () => {
  assert.equal(C.wantsQalc("10 km to mi"), true)
  assert.equal(C.wantsQalc("5 usd in eur"), true)
  assert.equal(C.wantsQalc("sqrt(16)"), true)
  assert.equal(C.wantsQalc("20% of 300"), true)
  assert.equal(C.wantsQalc("=pi"), true)
  assert.equal(C.wantsQalc("firefox"), false)
  assert.equal(C.wantsQalc("mp3 player"), false)
  assert.equal(C.wantsQalc("2+2"), false)
})

test("qalc argv passes the expression as one argument", () => {
  const argv = C.qalcArgs("=-5 c to f")
  assert.equal(argv[0], "sh")
  assert.equal(argv[argv.length - 1], " -5 °C to -°F")
})

test("parseQalc returns the last line and drops errors", () => {
  assert.equal(C.parseQalc("6.21371192 mi\n"), "6.21371192 mi")
  assert.equal(C.parseQalc("error: Unknown unit\n"), "")
  assert.equal(C.parseQalc(""), "")
})

test("row copies the bare result", () => {
  const r = C.row("4", "2+2")
  assert.equal(r.label, "= 4")
  assert.equal(r.detail, "2+2")
  assert.equal(r.value, "4")
  assert.deepEqual(C.copyArgv("4"), ["wl-copy", "--", "4"])
})

test("qalcExpression rewrites launcher shorthand", () => {
  assert.equal(C.qalcExpression("10 km to mi"), "10 km to -mi")
  assert.equal(C.qalcExpression("5 usd in eur"), "5 usd to -eur")
  assert.equal(C.qalcExpression("100f to c"), "100 °F to -°C")
  assert.equal(C.qalcExpression("300 k to c"), "300 K to -°C")
  assert.equal(C.qalcExpression("90 min to +h"), "90 min to +h")
  assert.equal(C.qalcExpression("20% of 300"), "20% * 300")
  assert.equal(C.qalcExpression("sqrt(16)"), "sqrt(16)")
})
