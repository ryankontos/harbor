import Foundation
import UserNotifications

@MainActor
final class HeartbeatMonitor {
    static let shared = HeartbeatMonitor()

    private let center = UNUserNotificationCenter.current()
    private let watchdogIdentifier = "heartbeat-watchdog"

    func requestNotificationPermissionIfNeeded() {
        center.requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in }
    }

    func handleRemoteNotification(_ userInfo: [AnyHashable: Any]) {
        guard
            let kind = userInfo["kind"] as? String,
            kind == "heartbeat",
            let expectedNextAtString = userInfo["expected_next_at"] as? String,
            let expectedNextAt = ISO8601DateFormatter().date(from: expectedNextAtString)
        else {
            return
        }

        scheduleWatchdog(expectedNextAt: expectedNextAt)
    }

    func scheduleWatchdog(expectedNextAt: Date) {
        center.removePendingNotificationRequests(withIdentifiers: [watchdogIdentifier])

        let content = UNMutableNotificationContent()
        content.title = "Server heartbeat missed"
        content.body = "Harbor missed its expected heartbeat window."
        content.sound = .default

        let interval = max(expectedNextAt.timeIntervalSinceNow, 5)
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
        let request = UNNotificationRequest(identifier: watchdogIdentifier, content: content, trigger: trigger)

        center.add(request)
    }
}
