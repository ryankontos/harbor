import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import { MonitoringCoordinator } from "./monitor.js";
import { StateStore } from "./store.js";
import {
  clearSessionCookie,
  createSessionCookie,
  getSession,
  isWebAuthenticated,
  renderDashboardPage,
  renderLoginPage,
  sendLoginRedirect,
  validateWebCsrf
} from "./web.js";
import { z } from "zod";

const registerClientSchema = z.object({
  token: z.string().min(10),
  platform: z.enum(["ios", "macos"]),
  name: z.string().min(1).max(80)
});

const unregisterClientSchema = z.object({
  token: z.string().min(10)
});

const webLoginSchema = z.object({
  username: z.string().min(1).max(80),
  password: z.string().min(1).max(200)
});

function unauthorized(reply: FastifyReply): FastifyReply {
  return reply.code(401).send({ error: "Unauthorized" });
}

function webUnauthorized(request: FastifyRequest, reply: FastifyReply): FastifyReply {
  if (request.url.startsWith("/web/api/")) {
    return unauthorized(reply);
  }

  return sendLoginRedirect(reply);
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
    const pathname = request.url.split("?")[0] ?? request.url;

    if (pathname === "/healthz" || pathname === "/" || pathname === "/login" || pathname === "/web/login") {
      return;
    }

    if (pathname === "/dashboard" || pathname === "/web/logout" || pathname.startsWith("/web/")) {
      if (!config.web.enabled) {
        return reply.code(503).send({ error: "Web dashboard authentication is not configured" });
      }

      if (!isWebAuthenticated(request)) {
        return webUnauthorized(request, reply);
      }

      if (request.method !== "GET" && !validateWebCsrf(request)) {
        return reply.code(403).send({ error: "Invalid CSRF token" });
      }

      return;
    }

    if (!isAuthorized(request)) {
      return unauthorized(reply);
    }
  });

  app.get("/", async (request, reply) => {
    if (config.web.enabled && isWebAuthenticated(request)) {
      return reply.redirect("/dashboard");
    }

    return reply.redirect(config.web.enabled ? "/login" : "/healthz");
  });

  app.get("/login", async (_, reply) =>
    reply.type("text/html; charset=utf-8").send(renderLoginPage(config.serverName))
  );

  app.post<{ Body: unknown }>("/web/login", async (request, reply) => {
    if (!config.web.enabled) {
      return reply.code(503).send({ error: "Web dashboard authentication is not configured" });
    }

    const parsed = webLoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return unauthorized(reply);
    }

    const { username, password } = parsed.data;
    if (!safeEqual(username, config.web.username) || !safeEqual(password, config.web.password)) {
      return unauthorized(reply);
    }

    const session = createSessionCookie();
    reply.header("Set-Cookie", session.cookie);
    return { ok: true };
  });

  app.post("/web/logout", async (_, reply) => {
    reply.header("Set-Cookie", clearSessionCookie());
    return { ok: true };
  });

  app.get("/dashboard", async (request, reply) => {
    const session = getSession(request);
    if (!session) {
      return sendLoginRedirect(reply);
    }

    return reply.type("text/html; charset=utf-8").send(renderDashboardPage(config.serverName, session.csrfToken));
  });

  app.get("/healthz", async () => ({
    ok: true,
    serverName: config.serverName,
    publicBaseURL: config.publicBaseURL
  }));

  app.get("/web/api/dashboard", async () =>
    store.getSnapshot(
      config.serverName,
      config.heartbeatIntervalMs,
      config.heartbeatGraceMs,
      config.controls.map(({ id, title }) => ({ id, title }))
    )
  );

  app.post("/web/api/actions/speed-test", async () => {
    const result = await monitor.runSpeedTest(false);
    return { ok: Boolean(result), result };
  });

  app.post<{ Params: { id: string } }>("/web/api/actions/control/:id", async (request, reply) => {
    const ok = monitor.executeControl(request.params.id);

    if (!ok) {
      return reply.code(404).send({ error: "Unknown control" });
    }

    return { ok: true };
  });

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
