import "dotenv/config";
import { z } from "zod";
import type { ControlDefinition } from "./types.js";

const envSchema = z.object({
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(8787),
  SERVER_NAME: z.string().default("Harbor"),
  API_TOKEN: z.string().default("change-me"),
  CLIENT_SHARED_SECRET: z.string().default(""),
  PUBLIC_ENDPOINT_MODE: z.enum(["magicdns", "custom"]).default("magicdns"),
  MAGICDNS_HOST: z.string().default("harbor-server"),
  CUSTOM_BASE_URL: z.string().default(""),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  HEARTBEAT_GRACE_MS: z.coerce.number().int().positive().default(90_000),
  NETWORK_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(2),
  SPEEDTEST_INTERVAL_MINUTES: z.coerce.number().int().positive().default(180),
  PERSIST_PATH: z.string().default("./data/state.json"),
  APNS_TEAM_ID: z.string().default(""),
  APNS_KEY_ID: z.string().default(""),
  APNS_KEY_PATH: z.string().default(""),
  APNS_BUNDLE_ID: z.string().default("dev.harbor.dashboard"),
  APNS_PRODUCTION: z
    .string()
    .transform((value) => value.toLowerCase() === "true")
    .default(false),
  APNS_DEVICE_TOKENS: z.string().default(""),
  CONTROL_COMMANDS_JSON: z.string().default("[]")
});

const raw = envSchema.parse(process.env);

function parseControls(value: string): ControlDefinition[] {
  try {
    const parsed = JSON.parse(value) as ControlDefinition[];
    return parsed.filter((item) => item?.id && item?.title && item?.command);
  } catch {
    return [];
  }
}

function resolvePublicBaseURL(): string {
  if (raw.PUBLIC_ENDPOINT_MODE === "custom" && raw.CUSTOM_BASE_URL) {
    return raw.CUSTOM_BASE_URL;
  }

  return `http://${raw.MAGICDNS_HOST}:${raw.PORT}`;
}

export const config = {
  host: raw.HOST,
  port: raw.PORT,
  serverName: raw.SERVER_NAME,
  apiToken: raw.API_TOKEN,
  clientSharedSecret: raw.CLIENT_SHARED_SECRET,
  endpointMode: raw.PUBLIC_ENDPOINT_MODE,
  magicDNSHost: raw.MAGICDNS_HOST,
  customBaseURL: raw.CUSTOM_BASE_URL,
  publicBaseURL: resolvePublicBaseURL(),
  pollIntervalMs: raw.POLL_INTERVAL_MS,
  heartbeatIntervalMs: raw.HEARTBEAT_INTERVAL_MS,
  heartbeatGraceMs: raw.HEARTBEAT_GRACE_MS,
  networkFailureThreshold: raw.NETWORK_FAILURE_THRESHOLD,
  speedTestIntervalMinutes: raw.SPEEDTEST_INTERVAL_MINUTES,
  persistPath: raw.PERSIST_PATH,
  apns: {
    teamId: raw.APNS_TEAM_ID,
    keyId: raw.APNS_KEY_ID,
    keyPath: raw.APNS_KEY_PATH,
    bundleId: raw.APNS_BUNDLE_ID,
    production: raw.APNS_PRODUCTION,
    deviceTokens: raw.APNS_DEVICE_TOKENS.split(",")
      .map((token) => token.trim())
      .filter(Boolean)
  },
  controls: parseControls(raw.CONTROL_COMMANDS_JSON)
} as const;
