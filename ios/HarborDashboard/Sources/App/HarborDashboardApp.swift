import SwiftUI

@main
struct HarborDashboardApp: App {
    @StateObject private var settings = AppSettings.shared
    #if os(iOS)
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    #endif

    @SceneBuilder
    var body: some Scene {
        mainScene
        #if os(macOS)
        settingsScene
        #endif
    }

    @SceneBuilder
    private var mainScene: some Scene {
        WindowGroup {
            DashboardView(settings: settings)
                .preferredColorScheme(.dark)
                .task {
                    HeartbeatMonitor.shared.requestNotificationPermissionIfNeeded()
                }
        }
        #if os(macOS)
        .defaultSize(width: 1180, height: 860)
        #endif
    }

    #if os(macOS)
    @SceneBuilder
    private var settingsScene: some Scene {
        Settings {
            SettingsView(settings: settings)
        }
    }
    #endif
}
