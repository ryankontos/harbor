import Foundation

struct DashboardSnapshot: Codable, Sendable {
    let serverName: String
    let generatedAt: Date
    let battery: BatterySnapshot
    let cpu: CPUSnapshot
    let memory: MemorySnapshot
    let storage: [StorageVolume]
    let connectivity: ConnectivitySnapshot
    let runningProcesses: [ProcessSnapshot]
    let interruptions: [NetworkInterruption]
    let speedTests: [SpeedTestResult]
    let trends: DashboardTrends
    let controls: [ControlDefinition]
    let heartbeat: HeartbeatSnapshot
}

struct DashboardTrends: Codable, Sendable {
    let cpuLoad: [MetricSample]
    let memoryUsed: [MetricSample]
    let batteryLevel: [MetricSample]
    let connectivity: [MetricSample]
}

struct BatterySnapshot: Codable, Sendable {
    let levelPercent: Double?
    let chargeStatus: String
    let isPowerConnected: Bool?
    let cycleCount: Int?
    let temperatureCelsius: Double?
    let estimatedMinutesRemaining: Int?
}

struct CPUSnapshot: Codable, Sendable {
    let loadPercent: Double
    let speedGHz: Double?
    let temperatureCelsius: Double?
    let coreCount: Int
}

struct MemorySnapshot: Codable, Sendable {
    let usedBytes: Int64
    let totalBytes: Int64
    let usedPercent: Double
}

struct StorageVolume: Codable, Sendable, Identifiable {
    var id: String { "\(name)-\(mount)" }
    let name: String
    let mount: String
    let usedBytes: Int64
    let totalBytes: Int64
    let usedPercent: Double
}

struct ConnectivitySnapshot: Codable, Sendable {
    let isOnline: Bool
    let lastCheckedAt: Date
    let outageActiveSince: Date?
    let lastRecoveredAt: Date?
}

struct ProcessSnapshot: Codable, Sendable, Identifiable {
    var id: Int { pid }
    let pid: Int
    let name: String
    let cpuPercent: Double
    let memoryPercent: Double
    let startedAt: Date?
}

struct NetworkInterruption: Codable, Sendable, Identifiable {
    var id: String { startedAt.ISO8601Format() + (endedAt?.ISO8601Format() ?? "active") }
    let startedAt: Date
    let endedAt: Date?
    let durationSeconds: Int?
    let reason: String
}

struct SpeedTestResult: Codable, Sendable, Identifiable {
    var id: String { ranAt.ISO8601Format() }
    let ranAt: Date
    let downloadMbps: Double
    let uploadMbps: Double
    let latencyMs: Double
    let isp: String?
    let isAutomated: Bool
}

struct MetricSample: Codable, Sendable, Identifiable {
    var id: String { recordedAt.ISO8601Format() }
    let recordedAt: Date
    let value: Double
}

struct ControlDefinition: Codable, Sendable, Identifiable {
    let id: String
    let title: String
}

struct HeartbeatSnapshot: Codable, Sendable {
    let intervalMs: Int
    let graceMs: Int
    let lastSentAt: Date?
    let nextExpectedAt: Date?
}
