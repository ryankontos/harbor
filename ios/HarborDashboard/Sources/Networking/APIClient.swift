import Foundation

enum ClientPlatform: String {
    case ios
    case macos
}

enum APIError: LocalizedError {
    case invalidResponse
    case statusCode(Int)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "The server response was invalid."
        case let .statusCode(code):
            return "The server returned status code \(code)."
        }
    }
}

@MainActor
struct APIClient {
    let settings: AppSettings

    init(settings: AppSettings = .shared) {
        self.settings = settings
    }

    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    func fetchDashboard() async throws -> DashboardSnapshot {
        try await request(path: "v1/dashboard", method: "GET")
    }

    func triggerSpeedTest() async throws {
        let _: ActionResponse = try await request(path: "v1/actions/speed-test", method: "POST")
    }

    func runControl(id: String) async throws {
        let _: ActionResponse = try await request(path: "v1/actions/control/\(id)", method: "POST")
    }

    func registerDevice(token: String, platform: ClientPlatform) async throws {
        let payload = DeviceRegistration(token: token, platform: platform.rawValue, name: settings.deviceName)
        let _: ActionResponse = try await request(path: "v1/register-device", method: "POST", body: payload)
    }

    private func request<Response: Decodable>(path: String, method: String) async throws -> Response {
        var request = URLRequest(url: settings.baseURL.appendingPathComponent(path))
        request.httpMethod = method
        applySecurityHeaders(to: &request)
        request.timeoutInterval = 15

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard 200 ..< 300 ~= httpResponse.statusCode else {
            throw APIError.statusCode(httpResponse.statusCode)
        }

        return try decoder.decode(Response.self, from: data)
    }

    private func request<Response: Decodable, Body: Encodable>(path: String, method: String, body: Body) async throws -> Response {
        var request = URLRequest(url: settings.baseURL.appendingPathComponent(path))
        request.httpMethod = method
        applySecurityHeaders(to: &request)
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 15
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard 200 ..< 300 ~= httpResponse.statusCode else {
            throw APIError.statusCode(httpResponse.statusCode)
        }

        return try decoder.decode(Response.self, from: data)
    }

    private func applySecurityHeaders(to request: inout URLRequest) {
        request.addValue("Bearer \(settings.apiToken)", forHTTPHeaderField: "Authorization")

        if settings.hasClientSharedSecret {
            request.addValue(settings.clientSharedSecret, forHTTPHeaderField: "X-Harbor-Client-Secret")
        }

        if settings.hasCloudflareAccessServiceToken {
            request.addValue(settings.cloudflareAccessClientID, forHTTPHeaderField: "CF-Access-Client-Id")
            request.addValue(settings.cloudflareAccessClientSecret, forHTTPHeaderField: "CF-Access-Client-Secret")
        }
    }
}

private struct ActionResponse: Decodable {
    let ok: Bool
}

private struct DeviceRegistration: Encodable {
    let token: String
    let platform: String
    let name: String
}
