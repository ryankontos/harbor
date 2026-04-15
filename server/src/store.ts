import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  BatterySnapshot,
  ConnectivitySnapshot,
  DashboardTrends,
  CpuSnapshot,
  DashboardSnapshot,
  MemorySnapshot,
  MetricSample,
  NetworkInterruption,
  ProcessSnapshot,
  RegisteredClient,
  SpeedTestResult,
  StorageVolume
} from "./types.js";

interface PersistedState {
  battery: BatterySnapshot;
  cpu: CpuSnapshot;
  memory: MemorySnapshot;
  storage: StorageVolume[];
  runningProcesses: ProcessSnapshot[];
  interruptions: NetworkInterruption[];
  speedTests: SpeedTestResult[];
  trends: DashboardTrends;
  connectivity: ConnectivitySnapshot;
  heartbeat: {
    lastSentAt: string | null;
    nextExpectedAt: string | null;
  };
  registeredClients: RegisteredClient[];
}

const defaultState: PersistedState = {
  battery: {
    levelPercent: null,
    chargeStatus: "unknown",
    isPowerConnected: null,
    cycleCount: null,
    temperatureCelsius: null,
    estimatedMinutesRemaining: null
  },
  cpu: {
    loadPercent: 0,
    speedGHz: null,
    temperatureCelsius: null,
    coreCount: 0
  },
  memory: {
    usedBytes: 0,
    totalBytes: 0,
    usedPercent: 0
  },
  storage: [],
  runningProcesses: [],
  interruptions: [],
  speedTests: [],
  trends: {
    cpuLoad: [],
    memoryUsed: [],
    batteryLevel: [],
    connectivity: []
  },
  connectivity: {
    isOnline: true,
    lastCheckedAt: new Date(0).toISOString(),
    outageActiveSince: null,
    lastRecoveredAt: null
  },
  heartbeat: {
    lastSentAt: null,
    nextExpectedAt: null
  },
  registeredClients: []
};

export class StateStore {
  private state: PersistedState = defaultState;
  private persistTimer: NodeJS.Timeout | null = null;

  constructor(private readonly persistPath: string) {}

  async load(): Promise<void> {
    try {
      const text = await readFile(this.persistPath, "utf8");
      const parsed = JSON.parse(text) as PersistedState;
      this.state = { ...defaultState, ...parsed };
    } catch {
      this.state = defaultState;
    }
  }

  getSnapshot(serverName: string, heartbeatIntervalMs: number, graceMs: number, controls: DashboardSnapshot["controls"]): DashboardSnapshot {
    return {
      serverName,
      generatedAt: new Date().toISOString(),
      battery: this.state.battery,
      cpu: this.state.cpu,
      memory: this.state.memory,
      storage: this.state.storage,
      connectivity: this.state.connectivity,
      runningProcesses: this.state.runningProcesses,
      interruptions: this.state.interruptions,
      speedTests: this.state.speedTests,
      trends: this.state.trends,
      controls,
      heartbeat: {
        intervalMs: heartbeatIntervalMs,
        graceMs,
        lastSentAt: this.state.heartbeat.lastSentAt,
        nextExpectedAt: this.state.heartbeat.nextExpectedAt
      }
    };
  }

  updatePartial(partial: Partial<PersistedState>): void {
    this.state = { ...this.state, ...partial };
    this.schedulePersist();
  }

  appendInterruption(interruption: NetworkInterruption): void {
    this.state.interruptions = [interruption, ...this.state.interruptions].slice(0, 100);
    this.schedulePersist();
  }

  appendSpeedTest(result: SpeedTestResult): void {
    this.state.speedTests = [result, ...this.state.speedTests].slice(0, 100);
    this.schedulePersist();
  }

  appendTrendSample(key: keyof DashboardTrends, sample: MetricSample): void {
    this.state.trends = {
      ...this.state.trends,
      [key]: [sample, ...this.state.trends[key]].slice(0, 120)
    };
    this.schedulePersist();
  }

  setHeartbeat(lastSentAt: string, nextExpectedAt: string): void {
    this.state.heartbeat = { lastSentAt, nextExpectedAt };
    this.schedulePersist();
  }

  getRegisteredClients(): RegisteredClient[] {
    return this.state.registeredClients;
  }

  registerClient(client: Omit<RegisteredClient, "registeredAt" | "lastSeenAt">): void {
    const now = new Date().toISOString();
    const existing = this.state.registeredClients.find((item) => item.token === client.token);

    if (existing) {
      existing.name = client.name;
      existing.platform = client.platform;
      existing.lastSeenAt = now;
    } else {
      this.state.registeredClients = [
        {
          ...client,
          registeredAt: now,
          lastSeenAt: now
        },
        ...this.state.registeredClients
      ].slice(0, 50);
    }

    this.schedulePersist();
  }

  unregisterClient(token: string): boolean {
    const next = this.state.registeredClients.filter((client) => client.token !== token);
    const removed = next.length != this.state.registeredClients.length;
    this.state.registeredClients = next;

    if (removed) {
      this.schedulePersist();
    }

    return removed;
  }

  private schedulePersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }

    this.persistTimer = setTimeout(() => {
      void this.persist();
    }, 250);
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.persistPath), { recursive: true });
    await writeFile(this.persistPath, JSON.stringify(this.state, null, 2));
  }
}
