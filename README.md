# Harbor

Harbor is a two-part system for keeping an eye on a home Mac server without turning the client into a noisy admin panel:

- `server/`: a lightweight TypeScript + Fastify monitoring daemon for macOS
- `ios/HarborDashboard/`: a shared SwiftUI client with an iPhone target and a native macOS target
- The UI stays intentionally compact while surfacing short history and trend views

## What it does

- Collects battery, charge, CPU, memory, storage, process, connectivity, and speed test data
- Keeps lightweight recent history for CPU, memory, battery, and connectivity trends
- Records network interruption history
- Sends silent APNS heartbeat notifications on a fixed cadence
- Lets the iPhone app raise a local alert when a heartbeat is missed
- Sends direct alert pushes for critical events like power disconnects and network outages
- Exposes a versioned HTTP API with HTTPS-friendly custom-hostname support
- Includes a built-in cookie-authenticated web dashboard for browser access
- Supports runtime APNS device registration so the server can learn clients dynamically
- Supports a hardened deployment model with Cloudflare Tunnel, HTTPS, bearer auth, and an optional second shared secret

## Recommended internet-facing setup

If you want a public hostname without a static IP, the safest path is:

1. Run the API locally on `127.0.0.1:8787`.
2. Publish it through Cloudflare Tunnel instead of exposing your router.
3. Put your hostname behind Cloudflare Access.
4. Keep the app's bearer token enabled, and optionally require the extra client shared secret at the origin.

This gives you:

- HTTPS on the public endpoint
- No inbound port-forwarding to your home network
- Cloudflare edge authentication before the request reaches your server
- Origin-side application authentication even after the tunnel

If you also want SSH without a static IP, give SSH its own hostname such as `ssh.example.com`.
Use `server.example.com` for the HTTPS dashboard/API and `ssh.example.com` for the SSH service.

## Server setup

1. Install dependencies:

   ```bash
   cd server
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your values.
   For a tunnel-backed deployment, keep `HOST=127.0.0.1`, set `PUBLIC_ENDPOINT_MODE=custom`, set `CUSTOM_BASE_URL=https://server.example.com`, use strong random values for `API_TOKEN` and `CLIENT_SHARED_SECRET`, and set `WEB_PASSWORD` plus `WEB_SESSION_SECRET` for the browser dashboard.

3. Run the daemon locally:

   ```bash
   npm run dev
   ```

4. For `launchd`, build and install:

   ```bash
   npm run build
   ./scripts/install-launchd.sh
   ```

5. For Cloudflare Tunnel, start from `server/cloudflared/config.example.yml`.
   That example includes one hostname for the dashboard/API and one for SSH.

## Browser dashboard

Once `WEB_PASSWORD` is set, Harbor exposes:

- `/login`: password sign-in page
- `/dashboard`: cookie-authenticated browser dashboard

The dashboard stays intentionally compact and is separate from the bearer-token API used by the Apple clients.

## Client setup

1. Generate the Xcode project:

   ```bash
   cd ios/HarborDashboard
   xcodegen generate
   ```

2. Open `HarborDashboard.xcodeproj`.

3. Build either:
   - `HarborDashboard` for iPhone
   - `HarborDashboardMac` for a native Mac dashboard client

4. Open Settings in the app and enter your token, host, and optional custom base URL.

5. If you protect the hostname with Cloudflare Access, paste the service token's client ID and client secret into the Cloudflare Access section.

6. If you enable the extra origin secret, paste the same value into the client shared secret field.

## Deploy from your dev Mac to your server Mac

1. Copy `.env.deploy.example` to `.env.deploy`.

2. Fill in:
   - `DEPLOY_HOST`: your server Mac hostname or SSH target
   - `DEPLOY_USER`: the remote macOS user
   - `DEPLOY_PATH`: where Harbor should live on the server Mac
   - `SERVER_ENV_FILE`: the local path to the server `.env` file you want uploaded

3. Run:

   ```bash
   ./scripts/deploy-server.sh
   ```

This script:

- builds the server locally on your dev Mac
- syncs the runtime bundle to the server Mac with `rsync`
- uploads the selected server env file as `server/.env`
- installs production dependencies remotely
- reloads the `launchd` agent on the server Mac

## APNS heartbeat design

The server sends a silent push with `expected_next_at`.
The iPhone app immediately schedules a local notification for that time.
Each new heartbeat replaces the previous scheduled watchdog notification.
If a heartbeat never arrives, the scheduled local notification fires and tells you the server likely went dark.

This approach is intentionally simple and future-friendly:

- The app stays mostly dumb and display-focused.
- The server remains the source of truth for monitoring.
- The network location is abstracted behind config instead of hardcoded to Tailscale.
- The same shared UI can grow into a public iPhone and Mac client without throwing away the architecture.
