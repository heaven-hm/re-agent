import AppKit

private let calculatorBackground = NSColor(srgbRed: 40.0 / 255, green: 40.0 / 255, blue: 39.0 / 255, alpha: 1)
private let calculatorDigit = NSColor(srgbRed: 81.0 / 255, green: 81.0 / 255, blue: 80.0 / 255, alpha: 1)
private let calculatorUtility = NSColor(srgbRed: 112.0 / 255, green: 112.0 / 255, blue: 111.0 / 255, alpha: 1)
private let calculatorText = NSColor(srgbRed: 237.0 / 255, green: 237.0 / 255, blue: 237.0 / 255, alpha: 1)
private let calculatorOrange = NSColor(srgbRed: 241.0 / 255, green: 154.0 / 255, blue: 56.0 / 255, alpha: 1)

private final class CalculatorCircle: NSButton {
    var fill: NSColor = calculatorDigit
    var glyph = ""
    var fontSize: CGFloat = 23
    var actionBlock: (() -> Void)?
    private var hovered = false
    private var tracking: NSTrackingArea?

    init(frame: NSRect, glyph: String, label: String, fill: NSColor, fontSize: CGFloat = 23) {
        super.init(frame: frame)
        self.glyph = glyph
        self.fill = fill
        self.fontSize = fontSize
        title = label
        isBordered = false
        setAccessibilityLabel(label)
        setAccessibilityRole(.button)
        target = self
        action = #selector(activate)
        focusRingType = .none
    }
    required init?(coder: NSCoder) { fatalError("Unsupported archived control") }
    @objc private func activate() { actionBlock?() }
    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let tracking { removeTrackingArea(tracking) }
        tracking = NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeInActiveApp], owner: self)
        if let tracking { addTrackingArea(tracking) }
    }
    override func mouseEntered(with event: NSEvent) { hovered = true; needsDisplay = true }
    override func mouseExited(with event: NSEvent) { hovered = false; needsDisplay = true }
    override func draw(_ dirtyRect: NSRect) {
        let color = isHighlighted ? fill.blended(withFraction: 0.25, of: .white)! : hovered ? fill.blended(withFraction: 0.08, of: .white)! : fill
        color.setFill()
        NSBezierPath(ovalIn: bounds.insetBy(dx: 0.3, dy: 0.3)).fill()
        if glyph == "mode" {
            let rect = NSRect(x: 14, y: 11, width: 12, height: 18)
            let outline = NSBezierPath(roundedRect: rect, xRadius: 2, yRadius: 2)
            calculatorText.setStroke(); outline.lineWidth = 1.4; outline.stroke()
            calculatorText.setFill()
            NSBezierPath(rect: NSRect(x: 16, y: 23, width: 8, height: 3)).fill()
            for row in 0..<3 { for column in 0..<3 {
                NSBezierPath(ovalIn: NSRect(x: 16 + CGFloat(column) * 3, y: 13 + CGFloat(row) * 3, width: 1.8, height: 1.8)).fill()
            } }
            return
        }
        let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: fontSize, weight: .regular), .foregroundColor: calculatorText]
        let size = glyph.size(withAttributes: attributes)
        glyph.draw(at: NSPoint(x: (bounds.width - size.width) / 2, y: (bounds.height - size.height) / 2 - 0.5), withAttributes: attributes)
    }
}

private final class CalculatorSurface: NSView {
    let engine: CalculatorEngine
    private let result = NSTextField(labelWithString: "0")
    private let expression = NSTextField(labelWithString: "")
    private var clearButton: CalculatorCircle?
    private var clearKey = "AC"

    init(engine: CalculatorEngine) {
        self.engine = engine
        super.init(frame: NSRect(x: 0, y: 0, width: 198, height: 350))
        wantsLayer = true
        layer?.backgroundColor = calculatorBackground.cgColor
        result.frame = NSRect(x: 9, y: 242, width: 180, height: 39)
        result.font = NSFont.systemFont(ofSize: 31, weight: .regular)
        result.textColor = calculatorText
        result.alignment = .right
        result.lineBreakMode = .byTruncatingHead
        result.setAccessibilityIdentifier("calculator-result")
        result.setAccessibilityLabel("Result")
        addSubview(result)
        expression.frame = NSRect(x: 9, y: 282, width: 180, height: 28)
        expression.font = NSFont.systemFont(ofSize: 22, weight: .regular)
        expression.textColor = NSColor(srgbRed: 0.64, green: 0.64, blue: 0.63, alpha: 1)
        expression.alignment = .right
        expression.lineBreakMode = .byTruncatingHead
        expression.setAccessibilityIdentifier("calculator-expression")
        expression.setAccessibilityLabel("Expression")
        addSubview(expression)
        let rows: [[(String, String, String)]] = [
            [("AC", "AC", "All Clear"), ("+/−", "+/-", "Change Sign"), ("%", "%", "Percent"), ("÷", "/", "Divide")],
            [("7", "7", "7"), ("8", "8", "8"), ("9", "9", "9"), ("×", "*", "Multiply")],
            [("4", "4", "4"), ("5", "5", "5"), ("6", "6", "6"), ("−", "-", "Subtract")],
            [("1", "1", "1"), ("2", "2", "2"), ("3", "3", "3"), ("+", "+", "Add")],
            [("mode", "mode", "Calculator Mode"), ("0", "0", "0"), (".", ".", "Decimal Point"), ("=", "=", "Equals")]
        ]
        for (rowIndex, row) in rows.enumerated() {
            for (column, item) in row.enumerated() {
                let fill = column == 3 ? calculatorOrange : rowIndex == 0 ? calculatorUtility : calculatorDigit
                let size: CGFloat = rowIndex == 0 && column == 0 ? 17 : rowIndex == 0 && column == 1 ? 18 : column == 3 ? 29 : 23
                let button = CalculatorCircle(frame: NSRect(x: 10 + CGFloat(column) * 46, y: 8 + CGFloat(4 - rowIndex) * 46, width: 40, height: 40), glyph: item.0, label: item.2, fill: fill, fontSize: size)
                button.setAccessibilityIdentifier("calculator-key-\(item.1)")
                if item.1 == "mode" {
                    button.actionBlock = { [weak self, weak button] in if let button { self?.showModeMenu(button) } }
                } else {
                    button.actionBlock = { [weak self] in
                        guard let self else { return }
                        self.engine.press(item.1 == "AC" ? self.clearKey : item.1)
                    }
                }
                if rowIndex == 0 && column == 0 { clearButton = button }
                addSubview(button)
            }
        }
        engine.onChange = { [weak self] in self?.refresh() }
        refresh()
    }
    required init?(coder: NSCoder) { fatalError("Unsupported archived surface") }
    override var acceptsFirstResponder: Bool { true }
    private func refresh() {
        result.stringValue = engine.display
        expression.stringValue = engine.expression
        let length = engine.display.count
        result.font = NSFont.systemFont(ofSize: length > 10 ? max(16, 31 * 10 / CGFloat(length)) : 31, weight: .regular)
        clearKey = engine.clearTitle
        clearButton?.glyph = clearKey
        clearButton?.title = clearKey == "AC" ? "All Clear" : "Clear"
        clearButton?.setAccessibilityLabel(clearKey == "AC" ? "All Clear" : "Clear")
        clearButton?.needsDisplay = true
    }
    private func showModeMenu(_ sender: NSView) {
        let menu = NSMenu()
        let basic = NSMenuItem(title: "Basic", action: nil, keyEquivalent: "")
        basic.state = .on
        menu.addItem(basic)
        menu.popUp(positioning: nil, at: NSPoint(x: 0, y: sender.bounds.height), in: sender)
    }
    override func keyDown(with event: NSEvent) {
        guard let characters = event.charactersIgnoringModifiers else { return }
        let key: String
        switch characters {
        case "\r", "\n", "=": key = "="
        case "\u{1b}": key = "AC"
        case "\u{7f}", "\u{8}": key = "backspace"
        case "x", "X", "*": key = "*"
        case "c", "C": key = event.modifierFlags.contains(.option) ? "AC" : clearKey
        default: key = characters
        }
        if "0123456789.+-*/%=".contains(key) || ["AC", "C", "backspace"].contains(key) { engine.press(key) }
        else { super.keyDown(with: event) }
    }
    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        if event.modifierFlags.contains(.command), event.charactersIgnoringModifiers == "c" {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(engine.display, forType: .string)
            return true
        }
        if event.modifierFlags.contains(.command), event.charactersIgnoringModifiers == "v", let text = NSPasteboard.general.string(forType: .string) {
            for character in text.trimmingCharacters(in: .whitespacesAndNewlines) { if "0123456789.-".contains(character) { engine.press(String(character)) } }
            return true
        }
        return super.performKeyEquivalent(with: event)
    }
}

func createCalculatorWindow(engine: CalculatorEngine) -> NSWindow {
    let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 198, height: 350), styleMask: [.titled, .closable, .miniaturizable, .fullSizeContentView], backing: .buffered, defer: false)
    window.title = "Calculator"
    window.titleVisibility = .hidden
    window.titlebarAppearsTransparent = true
    window.backgroundColor = calculatorBackground
    window.isMovableByWindowBackground = true
    window.isReleasedWhenClosed = false
    window.contentView = CalculatorSurface(engine: engine)
    window.center()
    window.makeFirstResponder(window.contentView)
    return window
}
