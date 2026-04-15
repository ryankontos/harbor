import SwiftUI

struct SettingsView: View {
    @ObservedObject var settings: AppSettings

    var body: some View {
        Form {
            Section("Connection") {
                Picker("Endpoint", selection: $settings.endpointMode) {
                    Text("MagicDNS").tag(EndpointMode.magicDNS)
                    Text("Custom URL").tag(EndpointMode.custom)
                }

                TextField("MagicDNS host", text: $settings.magicDNSHost)
                TextField("Port", value: $settings.port, format: .number)

                if settings.endpointMode == .custom {
                    TextField("Custom base URL", text: $settings.customBaseURL)
                        #if os(iOS)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        #endif

                    Text("Use your HTTPS hostname here, for example `https://server.example.com`.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            Section("Security") {
                SecureField("API token", text: $settings.apiToken)
                SecureField("Client shared secret", text: $settings.clientSharedSecret)
                Text("Optional second factor checked by the origin server.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section("Cloudflare Access") {
                SecureField("CF Access client ID", text: $settings.cloudflareAccessClientID)
                SecureField("CF Access client secret", text: $settings.cloudflareAccessClientSecret)
                Text("Use a Cloudflare Access service token for native app requests to your HTTPS hostname.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section("Client") {
                TextField("Device name", text: $settings.deviceName)
                Text(settings.baseURL.absoluteString)
                    .font(.footnote.monospaced())
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .navigationTitle("Settings")
        #if os(macOS)
        .frame(minWidth: 420, minHeight: 320)
        #endif
    }
}
