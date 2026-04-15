declare module "speedtest-net" {
  interface SpeedtestResult {
    download: {
      bandwidth: number;
    };
    upload: {
      bandwidth: number;
    };
    ping: {
      latency: number;
    };
    isp?: string;
  }

  interface SpeedtestOptions {
    acceptLicense?: boolean;
    acceptGdpr?: boolean;
  }

  export default function speedTest(options?: SpeedtestOptions): Promise<SpeedtestResult>;
}
