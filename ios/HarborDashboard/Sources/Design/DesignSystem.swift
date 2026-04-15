import SwiftUI

enum DashboardPalette {
    static let backgroundTop = Color(red: 0.08, green: 0.12, blue: 0.18)
    static let backgroundBottom = Color(red: 0.02, green: 0.03, blue: 0.07)
    static let panel = Color.white.opacity(0.08)
    static let panelStrong = Color.white.opacity(0.14)
    static let outline = Color.white.opacity(0.12)
    static let textPrimary = Color.white
    static let textSecondary = Color.white.opacity(0.72)
    static let accent = Color(red: 0.20, green: 0.88, blue: 0.78)
    static let warning = Color(red: 1.0, green: 0.73, blue: 0.32)
    static let danger = Color(red: 1.0, green: 0.47, blue: 0.38)
}

struct DashboardCardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [DashboardPalette.panelStrong, DashboardPalette.panel],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .stroke(DashboardPalette.outline, lineWidth: 1)
            )
    }
}

extension View {
    func dashboardCard() -> some View {
        modifier(DashboardCardModifier())
    }
}
