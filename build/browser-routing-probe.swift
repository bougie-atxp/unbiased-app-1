// Integration probe: ask Launch Services to route a URL, and verify which
// application process actually received it. Never changes default handlers.
import AppKit
import Foundation

guard CommandLine.arguments.count == 3,
      let url = URL(string: CommandLine.arguments[1]),
      let hiddenPID = Int32(CommandLine.arguments[2]),
      let defaultApp = NSWorkspace.shared.urlForApplication(toOpen: url),
      let defaultID = Bundle(url: defaultApp)?.bundleIdentifier else {
    fputs("Could not resolve the current default application\n", stderr)
    exit(1)
}
let config = NSWorkspace.OpenConfiguration()
config.activates = false
var finished = false
var passed = false
NSWorkspace.shared.open(url, configuration: config) { application, error in
    if let application = application {
        passed = error == nil && application.processIdentifier != hiddenPID &&
            application.bundleIdentifier == defaultID && defaultID != "ai.unbiased.browser"
        let result: [String: Any] = [
            "passed": passed,
            "pid": application.processIdentifier,
            "bundleId": application.bundleIdentifier ?? "",
            "defaultBundleId": defaultID,
            "automationPID": hiddenPID,
            "url": url.absoluteString
        ]
        if let data = try? JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]),
           let text = String(data: data, encoding: .utf8) { print(text) }
    } else { fputs("Launch Services open failed: \(String(describing: error))\n", stderr) }
    finished = true
}
let deadline = Date().addingTimeInterval(20)
while !finished && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.05)) }
exit(passed ? 0 : 1)
