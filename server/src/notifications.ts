import apn from "apn";
import { readFileSync } from "node:fs";
import type { FastifyBaseLogger } from "fastify";
import { config } from "./config.js";
import type { RegisteredClient } from "./types.js";

interface PushPayload {
  [key: string]: unknown;
}

export class NotificationService {
  private provider: apn.Provider | null = null;
  private readonly enabled: boolean;
  private readonly deviceTokenProvider: () => RegisteredClient[];

  constructor(private readonly logger: FastifyBaseLogger, deviceTokenProvider: () => RegisteredClient[]) {
    this.deviceTokenProvider = deviceTokenProvider;
    this.enabled =
      Boolean(config.apns.teamId) &&
      Boolean(config.apns.keyId) &&
      Boolean(config.apns.keyPath);

    if (this.enabled) {
      this.provider = new apn.Provider({
        token: {
          key: readFileSync(config.apns.keyPath),
          keyId: config.apns.keyId,
          teamId: config.apns.teamId
        },
        production: config.apns.production
      });
    } else {
      this.logger.warn("APNS is not fully configured; push sending is disabled.");
    }
  }

  async sendSilentHeartbeat(sequence: number, expectedNextAt: string): Promise<void> {
    await this.send({
      aps: {
        "content-available": 1
      },
      kind: "heartbeat",
      sequence,
      expected_next_at: expectedNextAt
    });
  }

  async sendCriticalAlert(title: string, body: string, payload: PushPayload = {}): Promise<void> {
    await this.send({
      aps: {
        alert: { title, body },
        sound: "default"
      },
      kind: "critical-event",
      ...payload
    });
  }

  private async send(payload: PushPayload): Promise<void> {
    const tokens = Array.from(
      new Set([
        ...config.apns.deviceTokens,
        ...this.deviceTokenProvider().map((client) => client.token)
      ])
    );

    if (!this.provider || tokens.length === 0) {
      return;
    }

    const note = new apn.Notification();
    note.topic = config.apns.bundleId;
    note.payload = payload;
    const pushType =
      payload.aps && typeof payload.aps === "object" && "alert" in (payload.aps as object) ? "alert" : "background";
    (note as apn.Notification & { pushType?: "alert" | "background" }).pushType = pushType;
    note.priority = pushType === "background" ? 5 : 10;

    const result = await this.provider.send(note, tokens);

    if (result.failed.length > 0) {
      this.logger.warn({ failed: result.failed }, "Some APNS notifications failed");
    }
  }
}
