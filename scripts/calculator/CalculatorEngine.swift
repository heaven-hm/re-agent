import Foundation

/// Independent basic-mode state machine. UI observations remain the behavioral oracle.
final class CalculatorEngine {
    var onChange: (() -> Void)?
    private(set) var display = "0"
    private(set) var expression = ""
    var clearTitle: String { entry.isEmpty || fresh ? "AC" : "C" }
    private var entry = ""
    private var values: [Double] = []
    private var operators: [String] = []
    private var fresh = true
    private var completed = false
    private var lastOperator: String?
    private var lastOperand: Double?
    private var error = false
    private var percentagePresentation: String?
    private let recoveredLaws: [String: String]
    init(recoveredLaws: [String: String] = ["+":"add", "-":"subtract", "*":"multiply", "/":"divide"]) { self.recoveredLaws = recoveredLaws }

    func press(_ input: String) {
        let token = ["+/−":"sign", "+/-":"sign", "±":"sign", "%":"percent", "×":"*", "÷":"/", "−":"-", "AC":"allclear", "C":"entryclear" ][input] ?? input
        defer { onChange?() }
        if token == "allclear" { reset(); return }
        if token == "clear" || token == "entryclear" {
            if clearTitle == "AC" { reset() } else { entry = ""; display = "0"; fresh = true; error = false; percentagePresentation = nil }
            return
        }
        if error { reset() }
        if token.count == 1, let character = token.first, character.isNumber {
            beginEntry()
            if entry == "0" { entry = token } else if entry == "-0" { entry = "-" + token } else if entry.count < 16 { entry += token }
            display = entry; return
        }
        if token == "." {
            beginEntry()
            if entry.isEmpty { entry = "0" }
            if !entry.contains(".") { entry += "." }
            display = entry; return
        }
        if token == "backspace" {
            if !fresh && !completed {
                entry = String(entry.dropLast()); if entry.isEmpty || entry == "-" { entry = "0" }
                display = entry
            }
            return
        }
        if token == "sign" {
            if entry.isEmpty { entry = display; fresh = false }
            entry = entry.hasPrefix("-") ? String(entry.dropFirst()) : "-" + entry
            display = entry; return
        }
        if token == "percent" {
            let presentation = display + "%"
            var number = current / 100
            if let op = operators.last, op == "+" || op == "-", let base = values.last { number *= base }
            entry = format(number); display = presentation; percentagePresentation = presentation; fresh = false; return
        }
        if ["+", "-", "*", "/"].contains(token) {
            if completed { values = []; operators = []; completed = false }
            if fresh && !operators.isEmpty { operators[operators.count - 1] = token; return }
            values.append(current)
            while let previous = operators.last, precedence(previous) >= precedence(token), values.count >= 2 { reduce() }
            operators.append(token)
            expression = format(values.last ?? current) + " " + symbol(token)
            entry = ""; fresh = true; return
        }
        if token == "=" {
            if completed, let op = lastOperator, let operand = lastOperand {
                let lhs = current; let result = calculate(lhs, op, operand)
                expression = format(lhs) + symbol(op) + format(operand)
                finish(result); return
            }
            if operators.isEmpty, let presentation = percentagePresentation {
                expression = presentation; finish(current); return
            }
            guard !operators.isEmpty else { return }
            let operand = current
            lastOperator = operators.last; lastOperand = operand
            values.append(operand)
            let parts = zip(values, operators + [""]).map { format($0.0) + symbol($0.1) }
            expression = parts.joined()
            while !operators.isEmpty && values.count >= 2 { reduce() }
            finish(values.first ?? operand)
        }
    }
    private var current: Double { Double(entry.isEmpty ? display.replacingOccurrences(of: ",", with: "") : entry) ?? 0 }
    private func beginEntry() {
        if completed { reset() }
        if fresh { entry = ""; fresh = false }
    }
    private func reset() {
        entry = ""; values = []; operators = []; fresh = true; completed = false
        lastOperator = nil; lastOperand = nil; error = false; display = "0"; expression = ""
        percentagePresentation = nil
    }
    private func precedence(_ op: String) -> Int { op == "*" || op == "/" ? 2 : 1 }
    private func symbol(_ op: String) -> String { ["*":"×", "/":"÷", "-":"−"][op] ?? op }
    private func calculate(_ lhs: Double, _ op: String, _ rhs: Double) -> Double {
        switch recoveredLaws[op] { case "add": return lhs + rhs; case "subtract": return lhs - rhs; case "multiply": return lhs * rhs; case "divide": return lhs / rhs; default: return .nan }
    }
    private func reduce() {
        let rhs = values.removeLast(), lhs = values.removeLast(), op = operators.removeLast()
        values.append(calculate(lhs, op, rhs))
    }
    private func finish(_ number: Double) {
        display = format(number); entry = display; fresh = true; completed = true; values = []; operators = []
        error = !number.isFinite
        percentagePresentation = nil
    }
    private func format(_ number: Double) -> String {
        guard number.isFinite else { return "Error" }
        if number == 0 { return "0" }
        return String(format: "%.15g", locale: Locale(identifier: "en_US_POSIX"), number)
    }
}
