import dns from "node:dns/promises";
import os from "node:os";
import { spawn } from "node:child_process";
import si from "systeminformation";
import speedTest from "speedtest-net";
import type { FastifyBaseLogger } from "fastify";
import { config } from "./config.js";
import { NotificationService } from "./notifications.js";
import { StateStore } from "./store.js";
import type {
  BatterySnapshot,
  ConnectivitySnapshot,
  CpuSnapshot,
  MemorySnapshot,
  NetworkInterruption,
  ProcessSnapshot,
  SpeedTestResult,
  StorageVolume
} from "./types.js";

function round(value: number, precision = 1): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export class MonitoringCoordinator {
  private failureCount = 0;
  private outageStartedAt: string | null = null;
  private heartbeatSequence = 0;
  private latestBatteryPowerState: boolean | null = null;

  constructor(
    private readonly logger: FastifyBaseLogger,
    private readonly store: StateStore,
    private readonly notifications: NotificationService
  ) {}

  async start(): Promise<void> {
    await this.collectSystemSnapshot();
    await this.checkConnectivity();
    void this.runSpeedTest(true);

    setInterval(() => {
      void this.collectSystemSnapshot();
      void this.checkConnectivity();
    }, config.pollIntervalMs);

    setInterval(() => {
      void this.sendHeartbeat();
    }, config.heartbeatIntervalMs);

    setInterval(() => {
      void this.runSpeedTest(true);
    }, config.speedTestIntervalMinutes * 60_000);
  }

  async collectSystemSnapshot(): Promise<void> {
    const [
      battery,
      currentLoad,
      cpuTemperature,
      cpu,
      fsSize,
      memory,
      processes
    ] = await Promise.all([
      si.battery(),
      si.currentLoad(),
      si.cpuTemperature(),
      si.cpu(),
      si.fsSize(),
      si.mem(),
      si.processes()
    ]);

    const batterySnapshot: BatterySnapshot = {
      levelPercent: Number.isFinite(battery.percent) ? round(battery.percent) : null,
      chargeStatus: battery.hasBattery
        ? battery.isCharging
          ? battery.percent >= 99
            ? "full"
            : "charging"
          : "unplugged"
        : "unknown",
      isPowerConnected: battery.acConnected ?? null,
      cycleCount: battery.cycleCount ?? null,
      temperatureCelsius: null,
      estimatedMinutesRemaining:
        battery.acConnected || !Number.isFinite(battery.timeRemaining) || battery.timeRemaining < 0
          ? null
          : Math.round(battery.timeRemaining)
    };

    const cpuSnapshot: CpuSnapshot = {
      loadPercent: round(currentLoad.currentLoad),
      speedGHz: Number.isFinite(cpu.speed) ? round(cpu.speed, 2) : null,
      temperatureCelsius: cpuTemperature.main ?? null,
      coreCount: os.cpus().length
    };

    const memorySnapshot: MemorySnapshot = {
      usedBytes: memory.used,
      totalBytes: memory.total,
      usedPercent: round((memory.used / memory.total) * 100)
    };

    const storage: StorageVolume[] = fsSize
      .filter((volume) => volume.size > 0)
      .map((volume) => ({
        name: volume.fs,
        mount: volume.mount,
        usedBytes: volume.used,
        totalBytes: volume.size,
        usedPercent: round((volume.used / volume.size) * 100)
      }))
      .sort((left, right) => right.totalBytes - left.totalBytes)
      .slice(0, 5);

    const runningProcesses: ProcessSnapshot[] = processes.list
      .sort((left, right) => (right.cpu ?? 0) - (left.cpu ?? 0))
      .slice(0, 8)
      .map((process) => ({
        pid: process.pid,
        name: process.name || process.command || "Unknown",
        cpuPercent: round(process.cpu ?? 0),
        memoryPercent: round(process.mem ?? 0),
        startedAt: null
      }));

    this.store.updatePartial({
      battery: batterySnapshot,
      cpu: cpuSnapshot,
      memory: memorySnapshot,
      storage,
      runningProcesses
    });

    const recordedAt = new Date().toISOString();
    this.store.appendTrendSample("cpuLoad", {
      recordedAt,
      value: cpuSnapshot.loadPercent
    });
    this.store.appendTrendSample("memoryUsed", {
      recordedAt,
      value: memorySnapshot.usedPercent
    });

    if (batterySnapshot.levelPercent !== null) {
      this.store.appendTrendSample("batteryLevel", {
        recordedAt,
        value: batterySnapshot.levelPercent
      });
    }

    if (this.latestBatteryPowerState !== null && batterySnapshot.isPowerConnected === false && this.latestBatteryPowerState !== false) {
      await this.notifications.sendCriticalAlert(
        `${config.serverName} unplugged`,
        "Power was disconnected from the server.",
        { event: "power-disconnected" }
      );
    }

    this.latestBatteryPowerState = batterySnapshot.isPowerConnected;
  }

  async checkConnectivity(): Promise<void> {
    const checkedAt = new Date().toISOString();
    let online = false;

    try {
      await dns.resolve("apple.com");
      online = true;
      this.failureCount = 0;
    } catch {
      this.failureCount += 1;
      online = false;
    }

    const state: ConnectivitySnapshot = {
      isOnline: online,
      lastCheckedAt: checkedAt,
      outageActiveSince: this.outageStartedAt,
      lastRecoveredAt: null
    };

    if (!online && this.failureCount >= config.networkFailureThreshold && !this.outageStartedAt) {
      this.outageStartedAt = checkedAt;
      const interruption: NetworkInterruption = {
        startedAt: checkedAt,
        endedAt: null,
        durationSeconds: null,
        reason: "DNS lookup failure"
      };
      this.store.appendInterruption(interruption);
      state.outageActiveSince = this.outageStartedAt;
      await this.notifications.sendCriticalAlert(
        `${config.serverName} network outage`,
        "The server appears to be offline.",
        { event: "network-outage", started_at: checkedAt }
      );
    }

    if (online && this.outageStartedAt) {
      const recoveredAt = checkedAt;
      const durationSeconds = Math.round(
        (new Date(recoveredAt).getTime() - new Date(this.outageStartedAt).getTime()) / 1000
      );
      this.store.appendInterruption({
        startedAt: this.outageStartedAt,
        endedAt: recoveredAt,
        durationSeconds,
        reason: "Recovered"
      });
      state.lastRecoveredAt = recoveredAt;
      this.outageStartedAt = null;
    }

    this.store.updatePartial({
      connectivity: {
        ...state,
        outageActiveSince: this.outageStartedAt
      }
    });

    this.store.appendTrendSample("connectivity", {
      recordedAt: checkedAt,
      value: online ? 1 : 0
    });
  }

  async runSpeedTest(isAutomated: boolean): Promise<SpeedTestResult | null> {
    try {
      const result = await speedTest({ acceptLicense: true, acceptGdpr: true });
      const record: SpeedTestResult = {
        ranAt: new Date().toISOString(),
        downloadMbps: round((result.download.bandwidth * 8) / 1_000_000),
        uploadMbps: round((result.upload.bandwidth * 8) / 1_000_000),
        latencyMs: round(result.ping.latency),
        isp: result.isp ?? null,
        isAutomated
      };
      this.store.appendSpeedTest(record);
      return record;
    } catch (error) {
      this.logger.warn({ error }, "Speed test failed");
      return null;
    }
  }

  async sendHeartbeat(): Promise<void> {
    const sentAt = new Date();
    const expectedNextAt = new Date(sentAt.getTime() + config.heartbeatIntervalMs + config.heartbeatGraceMs);
    this.heartbeatSequence += 1;
    this.store.setHeartbeat(sentAt.toISOString(), expectedNextAt.toISOString());
    await this.notifications.sendSilentHeartbeat(this.heartbeatSequence, expectedNextAt.toISOString());
  }

  executeControl(id: string): boolean {
    const control = config.controls.find((item) => item.id === id);

    if (!control) {
      return false;
    }

    spawn(control.command, {
      shell: true,
      cwd: process.cwd(),
      detached: false,
      stdio: "ignore"
    }).unref();

    return true;
  }
}
