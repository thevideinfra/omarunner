// Calculator source: plain arithmetic evaluated here, anything with units or
// words handed to qalc. No eval/Function anywhere.
function stripPrefix(query) {
  var text = String(query || "").trim()
  return text.charAt(0) === "=" ? text.slice(1).trim() : text
}

function forced(query) { return String(query || "").trim().charAt(0) === "=" }

function normalize(expr) {
  return String(expr || "").replace(/×/g, "*").replace(/÷/g, "/")
}

// Digits, operators and parentheses only, with at least one binary operator
// between operands — "2" is not a calculation, "=2" is.
function isArithmetic(query) {
  var expr = normalize(stripPrefix(query))
  if (!expr || !/^[\d\s.+\-*\/%^()]+$/.test(expr) || !/\d/.test(expr)) return false
  if (forced(query)) return true
  return /[\d.)]\s*[+\-*\/%^]\s*[-\d.(]/.test(expr)
}

// Units, currency, functions and percentages go to qalc: a digit and a letter,
// plus a conversion word, a function call, or "% of". "=" forces it.
function wantsQalc(query) {
  if (isArithmetic(query)) return false
  var expr = stripPrefix(query)
  if (!expr) return false
  if (forced(query)) return true
  if (!/\d/.test(expr) || !/[a-z]/i.test(expr)) return false
  return /\s(to|in|as)\s/i.test(expr) || expr.indexOf("->") >= 0 || /[a-z]\(/i.test(expr) || /%\s*of\s/i.test(expr)
}

// Rewrites launcher shorthand into what qalc reads unambiguously:
// "% of" becomes "% *", "c"/"f"/"k" beside a number become temperatures when
// the target is one too, "in" becomes "to" (qalc reads "in" as inches), and a
// "-" before the target unit turns off mixed units (6.2 mi, not mi + yd + in).
function qalcExpression(query) {
  var expr = stripPrefix(query).replace(/%\s*of\s+/gi, "% * ")
  var match = /^(.*?)\s+(?:to|in|as|->)\s+([+\-]?[^\s]+)$/i.exec(expr)
  if (!match) return expr
  var from = match[1]
  var target = match[2]
  var temps = { c: "°C", f: "°F", k: "K" }
  var fromTemp = /^(.*\d)\s*°?([cfk])$/i.exec(from)
  var toTemp = /^°?([cfk])$/i.exec(target)
  if (fromTemp && toTemp) {
    from = fromTemp[1] + " " + temps[fromTemp[2].toLowerCase()]
    target = temps[toTemp[1].toLowerCase()]
  }
  if (target.charAt(0) !== "+" && target.charAt(0) !== "-") target = "-" + target
  return from + " to " + target
}

// Leading space keeps an expression like "-5 to f" from reading as an option;
// -m caps a runaway calculation.
function qalcArgs(query) {
  return ["sh", "-c", "command -v qalc >/dev/null || exit 127; exec qalc -t -m 1500 \"$1\"", "sh", " " + qalcExpression(query)]
}

function parseQalc(stdoutText) {
  var lines = String(stdoutText || "").split("\n").map(function(l) { return l.trim() }).filter(function(l) { return l.length > 0 })
  if (lines.length === 0) return ""
  var last = lines[lines.length - 1]
  for (var i = 0; i < lines.length; i++) if (/^(error|warning):/i.test(lines[i])) return ""
  return last
}

// Recursive descent: expr = term (("+"|"-") term)*, term = power (("*"|"/"|"%") power)*,
// unary = "-" unary | power, power = primary ("^" unary)?, primary = number | "(" expr ")".
// Unary minus binds looser than "^", so -2^2 is -4.
function evaluate(input) {
  var raw = normalize(input)
  if (/[\d.]\s+[\d.]/.test(raw)) return null
  var text = raw.replace(/\s+/g, "")
  var pos = 0

  function peek() { return text.charAt(pos) }
  function fail() { throw new Error("parse") }

  function number() {
    var match = /^(\d+\.?\d*|\.\d+)/.exec(text.slice(pos))
    if (!match) fail()
    pos += match[0].length
    return parseFloat(match[0])
  }

  function primary() {
    if (peek() === "(") {
      pos++
      var value = expr()
      if (peek() !== ")") fail()
      pos++
      return value
    }
    return number()
  }

  function unary() {
    if (peek() === "-") { pos++; return -unary() }
    if (peek() === "+") { pos++; return unary() }
    return power()
  }

  function power() {
    var base = primary()
    if (peek() === "^") { pos++; return Math.pow(base, unary()) }
    return base
  }

  function term() {
    var value = unary()
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      var op = text.charAt(pos++)
      var rhs = unary()
      if ((op === "/" || op === "%") && rhs === 0) fail()
      value = op === "*" ? value * rhs : op === "/" ? value / rhs : value % rhs
    }
    return value
  }

  function expr() {
    var value = term()
    while (peek() === "+" || peek() === "-") {
      var op = text.charAt(pos++)
      value = op === "+" ? value + term() : value - term()
    }
    return value
  }

  try {
    if (!text) return null
    var result = expr()
    if (pos !== text.length || !isFinite(result)) return null
    return result
  } catch (e) {
    return null
  }
}

function format(value) {
  if (value === null || value === undefined || !isFinite(value)) return ""
  var parts = Number(value).toPrecision(12).split("e")
  var mantissa = parts[0].indexOf(".") >= 0 ? parts[0].replace(/0+$/, "").replace(/\.$/, "") : parts[0]
  var text = parts.length > 1 ? mantissa + "e" + parts[1] : mantissa
  return text === "-0" ? "0" : text
}

function row(result, query) {
  return {
    itemId: "calc.result", kind: "source", icon: "accessories-calculator", iconFont: "", appIcon: "", appId: "",
    label: "= " + result, target: "", detail: stripPrefix(query), path: "", childCount: 0, action: "", provider: "",
    score: 0, section: "", sourceId: "calc", value: String(result)
  }
}

function copyArgv(value) { return value ? ["wl-copy", "--", String(value)] : [] }

if (typeof module !== "undefined") {
  module.exports = {
    isArithmetic: isArithmetic, wantsQalc: wantsQalc, qalcExpression: qalcExpression, qalcArgs: qalcArgs, parseQalc: parseQalc,
    evaluate: evaluate, format: format, row: row, copyArgv: copyArgv
  }
}
