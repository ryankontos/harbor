import Foundation

@MainActor
final class DashboardStore: ObservableObject {
    @Published private(set) var snapshot: DashboardSnapshot?
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    private let client: APIClient

    init(settings: AppSettings) {
        self.client = APIClient(settings: settings)
    }

    func refresh() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let snapshot = try await client.fetchDashboard()
            self.snapshot = snapshot
            self.errorMessage = nil

            if let expectedNextAt = snapshot.heartbeat.nextExpectedAt {
                HeartbeatMonitor.shared.scheduleWatchdog(expectedNextAt: expectedNextAt)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func triggerSpeedTest() async {
        do {
            try await client.triggerSpeedTest()
            try? await Task.sleep(for: .seconds(1))
            await refresh()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func runControl(id: String) async {
        do {
            try await client.runControl(id: id)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
