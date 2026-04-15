import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import { MonitoringCoordinator } from "./monitor.js";
import { StateStore } from "./store.js";
import { z } from "zod";

const registerClientSchema = z.object({
  token: z.string().min(10),
  platform: z.enum(["ios", "macos"]),
  name: z.string().min(1).max(80)
});

const unregisterClientSchema = z.object({
  token: z.string().min(10)
});

function unauthorized(reply: FastifyReply): FastifyReply {
  return reply.code(401).send({ error: "Unauthorized" });
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function isAuthorized(request: FastifyRequest): boolean {
  const header = request.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return false;
  }

  if (!safeEqual(header.slice("Bearer ".length), config.apiToken)) {
    return false;
  }

  if (config.clientSharedSecret) {
    const providedSecret = request.headers["x-harbor-client-secret"];
    if (typeof providedSecret !== "string" || !safeEqual(providedSecret, config.clientSharedSecret)) {
      return false;
    }
  }

  return true;
}

export async function registerRoutes(app: FastifyInstance, store: StateStore, monitor: MonitoringCoordinator): Promise<void> {
  app.addHook("preHandler", async (request, reply) => {
    if (request.url === "/healthz") {
      return;
    }

    if (!isAuthorized(request)) {
      return unauthorized(reply);
    }
  });

  app.get("/healthz", async () => ({
    ok: true,
    serverName: config.serverName,
    publicBaseURL: config.publicBaseURL
  }));

  app.get("/v1/dashboard", async () =>
    store.getSnapshot(
      config.serverName,
      config.heartbeatIntervalMs,
      config.heartbeatGraceMs,
      config.controls.map(({ id, title }) => ({ id, title }))
    )
  );

  app.get("/v1/config", async () => ({
    serverName: config.serverName,
    publicBaseURL: config.publicBaseURL,
    endpointMode: config.endpointMode,
    security: {
      clientSharedSecretEnabled: Boolean(config.clientSharedSecret)
    },
    registeredClients: store.getRegisteredClients().map(({ token, ...client }) => ({
      ...client,
      tokenSuffix: token.slice(-8)
    }))
  }));

  app.post<{ Body: unknown }>("/v1/register-device", async (request, reply) => {
    const parsed = registerClientSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid payload" });
    }

    store.registerClient(parsed.data);
    return { ok: true };
  });

  app.post<{ Body: unknown }>("/v1/unregister-device", async (request, reply) => {
    const parsed = unregisterClientSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid payload" });
    }

    const removed = store.unregisterClient(parsed.data.token);

    if (!removed) {
      return reply.code(404).send({ error: "Unknown token" });
    }

    return { ok: true };
  });

  app.post("/v1/actions/speed-test", async () => {
    const result = await monitor.runSpeedTest(false);
    return { ok: Boolean(result), result };
  });

  app.post<{ Params: { id: string } }>("/v1/actions/control/:id", async (request, reply) => {
    const ok = monitor.executeControl(request.params.id);

    if (!ok) {
      return reply.code(404).send({ error: "Unknown control" });
    }

    return { ok: true };
  });
}
