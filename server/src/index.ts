import helmet from "@fastify/helmet";
import Fastify from "fastify";
import { config } from "./config.js";
import { MonitoringCoordinator } from "./monitor.js";
import { NotificationService } from "./notifications.js";
import { registerRoutes } from "./routes.js";
import { StateStore } from "./store.js";

const app = Fastify({
  logger: {
    transport: {
      target: "pino-pretty"
    }
  }
});

await app.register(helmet, {
  global: true,
  contentSecurityPolicy: false
});

const store = new StateStore(config.persistPath);
await store.load();

const notifications = new NotificationService(app.log, () => store.getRegisteredClients());
const monitor = new MonitoringCoordinator(app.log, store, notifications);
await monitor.start();

await registerRoutes(app, store, monitor);

await app.listen({
  host: config.host,
  port: config.port
});

app.log.info(
  {
    host: config.host,
    port: config.port,
    publicBaseURL: config.publicBaseURL
  },
  "Harbor monitor server started"
);
