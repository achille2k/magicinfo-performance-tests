// ==========================================
// MagicInfo Performance Tests - Configuration
// ==========================================
// Central configuration for all test scenarios
// Supported ENV values: smoke | load | stress | soak | enterprise

export const config = {
  // ── Server Settings ──────────────────────────────────────────────────────
  server: {
    baseUrl: __ENV.MAGICINFO_BASE_URL || "http://localhost:7001",
    apiVersion: "v2.0",
    // MagicInfo 9 API base path (xác nhận từ Swagger spec)
    apiPath: "/MagicInfo/restapi/v2.0",
    // Auth endpoint: POST /MagicInfo/restapi/v2.0/auth
    authPath: "/MagicInfo/restapi/v2.0/auth",
  },

  // ── Authentication ────────────────────────────────────────────────────────
  auth: {
    username: __ENV.MAGICINFO_USERNAME || "admin",
    password: __ENV.MAGICINFO_PASSWORD || "admin",
    tokenRefreshInterval: 1800, // seconds (30 min)
  },

  // ── Screen Simulation ─────────────────────────────────────────────────────
  screens: {
    totalScreens: parseInt(__ENV.VIRTUAL_USERS) || 200,
    devicePrefix: "PERF-SCREEN",
    // Simulated screen types for realistic test distribution
    types: ["LFDM", "LEDS", "QMR", "PMR", "BHT"],
    // Screen poll intervals (in seconds)
    heartbeatInterval: 30,
    statusPollInterval: 60,
    contentCheckInterval: 300,
  },

  // ── Test Thresholds ───────────────────────────────────────────────────────
  thresholds: {
    httpReqDurationP95: parseInt(__ENV.HTTP_REQ_DURATION_P95) || 2000, // ms
    httpReqDurationP99: 5000,
    httpReqFailedRate: parseFloat(__ENV.HTTP_REQ_FAILED_RATE) || 0.05, // 5%
    authDurationP95: 1000, // ms
  },

  // ── Scenario Profiles ─────────────────────────────────────────────────────
  scenarios: {
    smoke: {
      vus: 5,
      duration: "1m",
      rampUp: "10s",
    },
    load: {
      vus: 200,
      duration: "5m",
      rampUp: "1m",
      rampDown: "30s",
    },
    stress: {
      stages: [
        { duration: "1m", target: 50 },
        { duration: "2m", target: 100 },
        { duration: "2m", target: 150 },
        { duration: "2m", target: 200 },
        { duration: "2m", target: 250 },  // Push beyond target
        { duration: "1m", target: 0 },
      ],
    },
    soak: {
      vus: 200,
      duration: "30m",
      rampUp: "2m",
    },
    // 1200 màn hình — kiểm tra năng lực hệ thống quy mô lớn
    enterprise: {
      vus: 1200,
      duration: "10m",
      rampUp: "3m",
      rampDown: "1m",
    },
  },

  // ── HTTP Options ──────────────────────────────────────────────────────────
  http: {
    timeout: "30s",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "MagicInfo-Screen/4.0",
    },
  },
};

// ── Helper: Get API URL ───────────────────────────────────────────────────
export function getApiUrl(path) {
  return `${config.server.baseUrl}${config.server.apiPath}${path}`;
}

// ── Helper: Get Auth URL ──────────────────────────────────────────────────
export function getAuthUrl() {
  return `${config.server.baseUrl}${config.server.authPath}`;
}

// ── Helper: Generate Screen Identity ─────────────────────────────────────
export function generateScreenId(vuId) {
  const paddedId = String(vuId).padStart(4, "0");
  const mac = generateMac(vuId);
  const screenType =
    config.screens.types[vuId % config.screens.types.length];
  return {
    deviceName: `${config.screens.devicePrefix}-${paddedId}`,
    macAddress: mac,
    deviceType: screenType,
    serialNumber: `SN${paddedId}${Date.now().toString().slice(-6)}`,
    firmwareVersion: "4.0.0.0",
    resolution: "1920x1080",
    orientation: vuId % 4 === 0 ? "PORTRAIT" : "LANDSCAPE",
  };
}

// ── Helper: Generate MAC Address ─────────────────────────────────────────
function generateMac(seed) {
  const hex = (n) => n.toString(16).padStart(2, "0").toUpperCase();
  const bytes = [
    0xAA,
    (seed >> 16) & 0xff,
    (seed >> 8) & 0xff,
    seed & 0xff,
    (seed * 7) & 0xff,
    (seed * 13) & 0xff,
  ];
  return bytes.map(hex).join(":");
}
