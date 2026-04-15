import Charts
import SwiftUI

struct DashboardView: View {
    @ObservedObject var settings: AppSettings
    @StateObject private var store: DashboardStore
    @State private var showingSettings = false

    init(settings: AppSettings) {
        self.settings = settings
        _store = StateObject(wrappedValue: DashboardStore(settings: settings))
    }

    var body: some View {
        ZStack {
            background

            ScrollView {
                Group {
                    #if os(macOS)
                    HStack(alignment: .top, spacing: 18) {
                        macSidebar
                        dashboardContent
                    }
                    .frame(maxWidth: 1320)
                    #else
                    dashboardContent
                        .frame(maxWidth: 1180)
                    #endif
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 24)
            }
            .refreshable {
                await store.refresh()
            }
        }
        .task {
            await store.refresh()
        }
        .alert("Connection issue", isPresented: Binding(
            get: { store.errorMessage != nil },
            set: { if !$0 { store.errorMessage = nil } }
        ), actions: {
            Button("OK") {
                store.errorMessage = nil
            }
        }, message: {
            Text(store.errorMessage ?? "")
        })
        .toolbar {
            ToolbarItem {
                Button("Settings") {
                    showingSettings = true
                }
            }
        }
        .sheet(isPresented: $showingSettings) {
            NavigationStack {
                SettingsView(settings: settings)
            }
            .preferredColorScheme(.dark)
        }
    }

    @ViewBuilder
    private var dashboardContent: some View {
        VStack(alignment: .leading, spacing: 18) {
            header

            if let snapshot = store.snapshot {
                hero(snapshot: snapshot)
                statsGrid(snapshot: snapshot)
                trendsSection(snapshot: snapshot)
                storageSection(snapshot: snapshot)
                processesSection(snapshot: snapshot)
                networkSection(snapshot: snapshot)
                controlsSection(snapshot: snapshot)
            } else if store.isLoading {
                ProgressView()
                    .tint(.white)
                    .frame(maxWidth: .infinity, minHeight: 300)
            } else {
                emptyState
            }
        }
    }

    #if os(macOS)
    private var macSidebar: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Desktop View")
                .font(.system(.title3, design: .rounded, weight: .bold))
                .foregroundStyle(DashboardPalette.textPrimary)

            sidebarRow(title: "Endpoint", value: settings.baseURL.host() ?? settings.baseURL.absoluteString)
            sidebarRow(title: "Mode", value: settings.endpointMode == .magicDNS ? "MagicDNS" : "Custom")
            sidebarRow(title: "Token", value: settings.apiToken.isEmpty ? "Missing" : "Configured")
            sidebarRow(title: "Device", value: settings.deviceName)
            if let snapshot = store.snapshot {
                sidebarRow(title: "Server", value: snapshot.serverName)
                sidebarRow(title: "Status", value: snapshot.connectivity.isOnline ? "Healthy" : "Offline")
            }

            Divider()
                .overlay(DashboardPalette.outline)

            Button("Refresh now") {
                Task { await store.refresh() }
            }
            .buttonStyle(.borderedProminent)

            Spacer()
        }
        .frame(width: 260, alignment: .topLeading)
        .dashboardCard()
    }

    private func sidebarRow(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased())
                .font(.system(.caption2, design: .rounded, weight: .bold))
                .foregroundStyle(DashboardPalette.textSecondary)
            Text(value)
                .font(.system(.body, design: .rounded, weight: .medium))
                .foregroundStyle(DashboardPalette.textPrimary)
        }
    }
    #endif

    private var background: some View {
        ZStack {
            LinearGradient(
                colors: [DashboardPalette.backgroundTop, DashboardPalette.backgroundBottom],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            Circle()
                .fill(DashboardPalette.accent.opacity(0.18))
                .frame(width: 280, height: 280)
                .blur(radius: 30)
                .offset(x: 120, y: -240)

            Circle()
                .fill(DashboardPalette.warning.opacity(0.15))
                .frame(width: 240, height: 240)
                .blur(radius: 24)
                .offset(x: -140, y: 320)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Harbor")
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .foregroundStyle(DashboardPalette.textPrimary)

            Text("Quietly watching your home Mac, without turning into a cluttered control room.")
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(DashboardPalette.textSecondary)
        }
    }

    private func hero(snapshot: DashboardSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(snapshot.serverName)
                        .font(.system(.title2, design: .rounded, weight: .bold))
                    Text(snapshot.connectivity.isOnline ? "Online and reporting" : "Offline or degraded")
                        .font(.system(.headline, design: .rounded))
                        .foregroundStyle(snapshot.connectivity.isOnline ? DashboardPalette.accent : DashboardPalette.danger)
                }

                Spacer()

                Text(snapshot.generatedAt.formatted(date: .omitted, time: .shortened))
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(DashboardPalette.textSecondary)
            }

            HStack(spacing: 14) {
                metricPill(label: "Battery", value: "\(Int(snapshot.battery.levelPercent ?? 0))%")
                metricPill(label: "CPU", value: "\(Int(snapshot.cpu.loadPercent))%")
                metricPill(label: "Memory", value: "\(Int(snapshot.memory.usedPercent))%")
            }

            if let remaining = snapshot.battery.estimatedMinutesRemaining, snapshot.battery.chargeStatus == "unplugged" {
                Text("Estimated battery left: \(remaining / 60)h \(remaining % 60)m")
                    .font(.system(.footnote, design: .rounded, weight: .medium))
                    .foregroundStyle(DashboardPalette.warning)
            }
        }
        .foregroundStyle(DashboardPalette.textPrimary)
        .dashboardCard()
    }

    private func statsGrid(snapshot: DashboardSnapshot) -> some View {
        LazyVGrid(columns: statColumns, spacing: 14) {
            statCard(
                title: "Charge",
                value: snapshot.battery.chargeStatus.capitalized,
                detail: snapshot.battery.isPowerConnected == true ? "On power" : "Battery mode",
                accent: DashboardPalette.accent
            )

            statCard(
                title: "Cores",
                value: "\(snapshot.cpu.coreCount)",
                detail: snapshot.cpu.temperatureCelsius.map { "\($0.formatted(.number.precision(.fractionLength(1))))°C" } ?? "Temp unavailable",
                accent: DashboardPalette.warning
            )

            statCard(
                title: "Storage",
                value: snapshot.storage.first.map { "\($0.usedPercent.formatted(.number.precision(.fractionLength(0))))%" } ?? "--",
                detail: snapshot.storage.first?.mount ?? "No disk data",
                accent: DashboardPalette.textPrimary
            )

            statCard(
                title: "Heartbeat",
                value: snapshot.heartbeat.nextExpectedAt?.formatted(date: .omitted, time: .shortened) ?? "--",
                detail: "Expected next silent push",
                accent: DashboardPalette.accent
            )
        }
    }

    private var statColumns: [GridItem] {
        #if os(macOS)
        return [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())]
        #else
        return [GridItem(.flexible()), GridItem(.flexible())]
        #endif
    }

    private func trendsSection(snapshot: DashboardSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionTitle("Recent Trends")

            LazyVGrid(columns: trendColumns, spacing: 14) {
                trendCard(
                    title: "CPU Load",
                    subtitle: "Last \(snapshot.trends.cpuLoad.count) samples",
                    accent: DashboardPalette.accent,
                    samples: snapshot.trends.cpuLoad,
                    yRange: 0 ... 100,
                    latestLabel: percentLabel(snapshot.trends.cpuLoad.first?.value)
                )

                trendCard(
                    title: "Memory Use",
                    subtitle: "Working set pressure",
                    accent: DashboardPalette.warning,
                    samples: snapshot.trends.memoryUsed,
                    yRange: 0 ... 100,
                    latestLabel: percentLabel(snapshot.trends.memoryUsed.first?.value)
                )

                trendCard(
                    title: "Battery",
                    subtitle: "Recent battery level",
                    accent: DashboardPalette.textPrimary,
                    samples: snapshot.trends.batteryLevel,
                    yRange: 0 ... 100,
                    latestLabel: percentLabel(snapshot.trends.batteryLevel.first?.value)
                )

                trendCard(
                    title: "Connectivity",
                    subtitle: "1 means online",
                    accent: snapshot.connectivity.isOnline ? DashboardPalette.accent : DashboardPalette.danger,
                    samples: snapshot.trends.connectivity,
                    yRange: 0 ... 1,
                    latestLabel: snapshot.connectivity.isOnline ? "Online" : "Offline"
                )
            }
        }
        .foregroundStyle(DashboardPalette.textPrimary)
    }

    private var trendColumns: [GridItem] {
        #if os(macOS)
        return [GridItem(.flexible()), GridItem(.flexible())]
        #else
        return [GridItem(.flexible())]
        #endif
    }

    private func storageSection(snapshot: DashboardSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("Storage")

            ForEach(snapshot.storage) { volume in
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(volume.mount)
                            .font(.system(.headline, design: .rounded, weight: .semibold))
                        Spacer()
                        Text("\(Int(volume.usedPercent))%")
                            .foregroundStyle(DashboardPalette.textSecondary)
                    }

                    ProgressView(value: volume.usedPercent, total: 100)
                        .tint(volume.usedPercent > 85 ? DashboardPalette.danger : DashboardPalette.accent)

                    Text("\(ByteCountFormatter.string(fromByteCount: volume.usedBytes, countStyle: .file)) used of \(ByteCountFormatter.string(fromByteCount: volume.totalBytes, countStyle: .file))")
                        .font(.system(.caption, design: .rounded))
                        .foregroundStyle(DashboardPalette.textSecondary)
                }
            }
        }
        .foregroundStyle(DashboardPalette.textPrimary)
        .dashboardCard()
    }

    private func processesSection(snapshot: DashboardSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("Running Processes")

            ForEach(snapshot.runningProcesses) { process in
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(process.name)
                            .font(.system(.headline, design: .rounded, weight: .semibold))
                        Text("PID \(process.pid)")
                            .font(.system(.caption, design: .rounded))
                            .foregroundStyle(DashboardPalette.textSecondary)
                    }

                    Spacer()

                    VStack(alignment: .trailing, spacing: 4) {
                        Text("\(process.cpuPercent.formatted(.number.precision(.fractionLength(1))))% CPU")
                        Text("\(process.memoryPercent.formatted(.number.precision(.fractionLength(1))))% MEM")
                            .foregroundStyle(DashboardPalette.textSecondary)
                    }
                    .font(.system(.caption, design: .rounded, weight: .medium))
                }
                .padding(.vertical, 2)
            }
        }
        .foregroundStyle(DashboardPalette.textPrimary)
        .dashboardCard()
    }

    private func networkSection(snapshot: DashboardSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionTitle("Network")

            VStack(alignment: .leading, spacing: 10) {
                Text("Recent interruptions")
                    .font(.system(.headline, design: .rounded, weight: .semibold))

                if snapshot.interruptions.isEmpty {
                    Text("No recent outages recorded.")
                        .font(.system(.subheadline, design: .rounded))
                        .foregroundStyle(DashboardPalette.textSecondary)
                } else {
                    ForEach(snapshot.interruptions.prefix(4)) { interruption in
                        HStack(alignment: .top) {
                            Circle()
                                .fill(interruption.endedAt == nil ? DashboardPalette.danger : DashboardPalette.warning)
                                .frame(width: 10, height: 10)
                                .padding(.top, 6)

                            VStack(alignment: .leading, spacing: 4) {
                                Text(interruption.reason)
                                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                                Text("\(interruption.startedAt.formatted(date: .numeric, time: .shortened))")
                                    .font(.system(.caption, design: .rounded))
                                    .foregroundStyle(DashboardPalette.textSecondary)
                            }

                            Spacer()

                            if let duration = interruption.durationSeconds {
                                Text("\(duration)s")
                                    .font(.system(.caption, design: .rounded, weight: .semibold))
                            } else {
                                Text("Active")
                                    .font(.system(.caption, design: .rounded, weight: .semibold))
                                    .foregroundStyle(DashboardPalette.danger)
                            }
                        }
                    }
                }
            }

            VStack(alignment: .leading, spacing: 10) {
                Text("Speed tests")
                    .font(.system(.headline, design: .rounded, weight: .semibold))

                if let latest = snapshot.speedTests.first {
                    HStack(spacing: 12) {
                        metricPill(label: "Down", value: "\(Int(latest.downloadMbps)) Mbps")
                        metricPill(label: "Up", value: "\(Int(latest.uploadMbps)) Mbps")
                        metricPill(label: "Ping", value: "\(Int(latest.latencyMs)) ms")
                    }

                    if snapshot.speedTests.count > 1 {
                        speedHistoryChart(results: Array(snapshot.speedTests.prefix(10).reversed()))
                    }
                } else {
                    Text("No speed tests yet.")
                        .font(.system(.subheadline, design: .rounded))
                        .foregroundStyle(DashboardPalette.textSecondary)
                }
            }
        }
        .foregroundStyle(DashboardPalette.textPrimary)
        .dashboardCard()
    }

    private func trendCard(
        title: String,
        subtitle: String,
        accent: Color,
        samples: [MetricSample],
        yRange: ClosedRange<Double>,
        latestLabel: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.system(.headline, design: .rounded, weight: .semibold))
                    Text(subtitle)
                        .font(.system(.caption, design: .rounded))
                        .foregroundStyle(DashboardPalette.textSecondary)
                }

                Spacer()

                Text(latestLabel)
                    .font(.system(.caption, design: .rounded, weight: .bold))
                    .foregroundStyle(accent)
            }

            if samples.isEmpty {
                Text("Waiting for enough history to draw a trend.")
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(DashboardPalette.textSecondary)
                    .frame(maxWidth: .infinity, minHeight: 120, alignment: .leading)
            } else {
                Chart(Array(samples.reversed())) { sample in
                    AreaMark(
                        x: .value("Time", sample.recordedAt),
                        y: .value("Value", sample.value)
                    )
                    .foregroundStyle(
                        LinearGradient(
                            colors: [accent.opacity(0.35), accent.opacity(0.02)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )

                    LineMark(
                        x: .value("Time", sample.recordedAt),
                        y: .value("Value", sample.value)
                    )
                    .foregroundStyle(accent)
                    .interpolationMethod(.catmullRom)
                }
                .chartYScale(domain: yRange)
                .chartXAxis(.hidden)
                .chartYAxis {
                    AxisMarks(position: .leading, values: [yRange.lowerBound, yRange.upperBound]) { value in
                        AxisGridLine(stroke: StrokeStyle(lineWidth: 0.6))
                            .foregroundStyle(DashboardPalette.outline)
                        AxisValueLabel {
                            if let number = value.as(Double.self) {
                                Text("\(Int(number))")
                            }
                        }
                    }
                }
                .frame(height: 140)
            }
        }
        .dashboardCard()
    }

    private func speedHistoryChart(results: [SpeedTestResult]) -> some View {
        Chart(results) { result in
            LineMark(
                x: .value("Time", result.ranAt),
                y: .value("Download", result.downloadMbps)
            )
            .foregroundStyle(DashboardPalette.accent)
            .interpolationMethod(.catmullRom)

            LineMark(
                x: .value("Time", result.ranAt),
                y: .value("Upload", result.uploadMbps)
            )
            .foregroundStyle(DashboardPalette.warning)
            .interpolationMethod(.catmullRom)
        }
        .chartXAxis(.hidden)
        .chartYAxis {
            AxisMarks(position: .leading) {
                AxisGridLine(stroke: StrokeStyle(lineWidth: 0.6))
                    .foregroundStyle(DashboardPalette.outline)
                AxisValueLabel()
            }
        }
        .frame(height: 140)
    }

    private func controlsSection(snapshot: DashboardSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("Controls")

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ControlButton(title: "Refresh") {
                        Task { await store.refresh() }
                    }

                    ControlButton(title: "Run Speed Test") {
                        Task { await store.triggerSpeedTest() }
                    }

                    ForEach(snapshot.controls) { control in
                        ControlButton(title: control.title) {
                            Task { await store.runControl(id: control.id) }
                        }
                    }
                }
                .padding(.vertical, 4)
            }
        }
        .foregroundStyle(DashboardPalette.textPrimary)
        .dashboardCard()
    }

    private func statCard(title: String, value: String, detail: String, accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(.system(.caption, design: .rounded, weight: .bold))
                .foregroundStyle(DashboardPalette.textSecondary)

            Text(value)
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundStyle(accent)

            Text(detail)
                .font(.system(.footnote, design: .rounded))
                .foregroundStyle(DashboardPalette.textSecondary)
        }
        .dashboardCard()
    }

    private func sectionTitle(_ title: String) -> some View {
        Text(title)
            .font(.system(.title3, design: .rounded, weight: .bold))
    }

    private func metricPill(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.system(.caption2, design: .rounded, weight: .bold))
                .foregroundStyle(DashboardPalette.textSecondary)
            Text(value)
                .font(.system(.headline, design: .rounded, weight: .semibold))
                .foregroundStyle(DashboardPalette.textPrimary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            Capsule(style: .continuous)
                .fill(Color.white.opacity(0.08))
        )
    }

    private func percentLabel(_ value: Double?) -> String {
        guard let value else { return "--" }
        return "\(Int(value.rounded()))%"
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "dot.radiowaves.left.and.right")
                .font(.system(size: 32))
                .foregroundStyle(DashboardPalette.accent)
            Text("No dashboard data yet")
                .font(.system(.headline, design: .rounded, weight: .semibold))
                .foregroundStyle(DashboardPalette.textPrimary)
            Text("Start the server utility, then pull to refresh.")
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(DashboardPalette.textSecondary)
        }
        .frame(maxWidth: .infinity, minHeight: 280)
        .dashboardCard()
    }
}

#Preview {
    DashboardView(settings: .shared)
}
