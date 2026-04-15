import Foundation
#if os(iOS)
import UIKit
#endif

enum EndpointMode: String, CaseIterable, Codable, Identifiable {
    case magicDNS
    case custom

    var id: String { rawValue }
}

@MainActor
final class AppSettings: ObservableObject {
    static let shared = AppSettings()

    @Published var endpointMode: EndpointMode {
        didSet { defaults.set(endpointMode.rawValue, forKey: Keys.endpointMode) }
    }

    @Published var magicDNSHost: String {
        didSet { defaults.set(magicDNSHost, forKey: Keys.magicDNSHost) }
    }

    @Published var port: Int {
        didSet { defaults.set(port, forKey: Keys.port) }
    }

    @Published var apiToken: String {
        didSet { defaults.set(apiToken, forKey: Keys.apiToken) }
    }

    @Published var clientSharedSecret: String {
        didSet { defaults.set(clientSharedSecret, forKey: Keys.clientSharedSecret) }
    }

    @Published var cloudflareAccessClientID: String {
        didSet { defaults.set(cloudflareAccessClientID, forKey: Keys.cloudflareAccessClientID) }
    }

    @Published var cloudflareAccessClientSecret: String {
        didSet { defaults.set(cloudflareAccessClientSecret, forKey: Keys.cloudflareAccessClientSecret) }
    }

    @Published var customBaseURL: String {
        didSet { defaults.set(customBaseURL, forKey: Keys.customBaseURL) }
    }

    @Published var deviceName: String {
        didSet { defaults.set(deviceName, forKey: Keys.deviceName) }
    }

    private let defaults = UserDefaults.standard

    private enum Keys {
        static let endpointMode = "app.endpointMode"
        static let magicDNSHost = "app.magicDNSHost"
        static let port = "app.port"
        static let apiToken = "app.apiToken"
        static let clientSharedSecret = "app.clientSharedSecret"
        static let cloudflareAccessClientID = "app.cloudflareAccessClientID"
        static let cloudflareAccessClientSecret = "app.cloudflareAccessClientSecret"
        static let customBaseURL = "app.customBaseURL"
        static let deviceName = "app.deviceName"
    }

    private init() {
        endpointMode = EndpointMode(rawValue: defaults.string(forKey: Keys.endpointMode) ?? "magicDNS") ?? .magicDNS
        magicDNSHost = defaults.string(forKey: Keys.magicDNSHost) ?? "harbor-server"
        port = defaults.object(forKey: Keys.port) as? Int ?? 8787
        apiToken = defaults.string(forKey: Keys.apiToken) ?? "change-me"
        clientSharedSecret = defaults.string(forKey: Keys.clientSharedSecret) ?? ""
        cloudflareAccessClientID = defaults.string(forKey: Keys.cloudflareAccessClientID) ?? ""
        cloudflareAccessClientSecret = defaults.string(forKey: Keys.cloudflareAccessClientSecret) ?? ""
        customBaseURL = defaults.string(forKey: Keys.customBaseURL) ?? ""
        #if os(macOS)
        deviceName = defaults.string(forKey: Keys.deviceName) ?? Host.current().localizedName ?? "Desktop Dashboard"
        #else
        deviceName = defaults.string(forKey: Keys.deviceName) ?? UIDevice.current.name
        #endif
    }

    var baseURL: URL {
        switch endpointMode {
        case .magicDNS:
            return URL(string: "http://\(magicDNSHost):\(port)")!
        case .custom:
            if let url = URL(string: customBaseURL), !customBaseURL.isEmpty {
                return url
            }
            return URL(string: "http://\(magicDNSHost):\(port)")!
        }
    }

    var hasCloudflareAccessServiceToken: Bool {
        !cloudflareAccessClientID.isEmpty && !cloudflareAccessClientSecret.isEmpty
    }

    var hasClientSharedSecret: Bool {
        !clientSharedSecret.isEmpty
    }
}
