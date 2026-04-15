export type ChargeStatus = "charging" | "unplugged" | "full" | "unknown";

export interface BatterySnapshot {
  levelPercent: number | null;
  chargeStatus: ChargeStatus;
  isPowerConnected: boolean | null;
  cycleCount: number | null;
  temperatureCelsius: number | null;
  estimatedMinutesRemaining: number | null;
}

export interface StorageVolume {
  name: string;
  mount: string;
  usedBytes: number;
  totalBytes: number;
  usedPercent: number;
}

export interface CpuSnapshot {
  loadPercent: number;
  speedGHz: number | null;
  temperatureCelsius: number | null;
  coreCount: number;
}

export interface MemorySnapshot {
  usedBytes: number;
  totalBytes: number;
  usedPercent: number;
}

export interface ProcessSnapshot {
  pid: number;
  name: string;
  cpuPercent: number;
  memoryPercent: number;
  startedAt: string | null;
}

export interface ConnectivitySnapshot {
  isOnline: boolean;
  lastCheckedAt: string;
  outageActiveSince: string | null;
  lastRecoveredAt: string | null;
}

export interface NetworkInterruption {
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  reason: string;
}

export interface SpeedTestResult {
  ranAt: string;
  downloadMbps: number;
  uploadMbps: number;
  latencyMs: number;
  isp: string | null;
  isAutomated: boolean;
}

export interface MetricSample {
  recordedAt: string;
  value: number;
}

export interface DashboardTrends {
  cpuLoad: MetricSample[];
  memoryUsed: MetricSample[];
  batteryLevel: MetricSample[];
  connectivity: MetricSample[];
}

export interface ControlDefinition {
  id: string;
  title: string;
  command: string;
}

export interface DashboardSnapshot {
  serverName: string;
  generatedAt: string;
  battery: BatterySnapshot;
  cpu: CpuSnapshot;
  memory: MemorySnapshot;
  storage: StorageVolume[];
  connectivity: ConnectivitySnapshot;
  runningProcesses: ProcessSnapshot[];
  interruptions: NetworkInterruption[];
  speedTests: SpeedTestResult[];
  trends: DashboardTrends;
  controls: Array<Pick<ControlDefinition, "id" | "title">>;
  heartbeat: {
    intervalMs: number;
    graceMs: number;
    lastSentAt: string | null;
    nextExpectedAt: string | null;
  };
}

export interface RegisteredClient {
  token: string;
  platform: "ios" | "macos";
  name: string;
  registeredAt: string;
  lastSeenAt: string;
}
