// Shell command source: "> cmd" runs cmd. Enter opens it in a terminal that
// stays open afterwards; Shift+Enter runs it in the background.
function claims(query) { return String(query || "").trim().charAt(0) === ">" }

function command(query) {
  if (!claims(query)) return ""
  return String(query).trim().slice(1).trim()
}

function row(cmd) {
  return {
    itemId: "command.run", kind: "source", icon: "utilities-terminal", iconFont: "", appIcon: "", appId: "",
    label: "Run " + cmd, target: "", detail: "Enter: terminal · Shift+Enter: background", path: "", childCount: 0,
    action: "", provider: "", score: 0, section: "", sourceId: "command", value: cmd
  }
}

function terminalArgv(cmd) {
  return cmd ? ["omarchy-launch-terminal", "bash", "-lc", cmd + "; exec bash"] : []
}

function backgroundArgv(cmd) { return cmd ? ["bash", "-lc", cmd] : [] }

if (typeof module !== "undefined") {
  module.exports = { claims: claims, command: command, row: row, terminalArgv: terminalArgv, backgroundArgv: backgroundArgv }
}
