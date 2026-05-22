// ==========================================
// MagicInfo Screen Simulation - Main Scenario
// ==========================================
// Giả lập 200 màn hình kết nối đến MagicInfo Server
// Mỗi VU (Virtual User) = 1 màn hình
//
// Vòng đời màn hình:
//  1. Xác thực để lấy API token
//  2. Kiểm tra đăng ký thiết bị
//  3. Gửi heartbeat định kỳ
//  4. Kiểm tra cập nhật nội dung

import { sleep } from "k6";
import { SharedArray } from "k6/data";
import { Counter, Rate, Trend } from "k6/metrics";
import { config, generateScreenId } from "../../config/config.js";
import { authenticate, refreshToken } from "../../lib/auth.js";
import {
  checkDeviceRegistration,
  sendDeviceHeartbeat,
  checkContentUpdate,
  fetchContentSchedule,
  downloadContentFile,
  getServerInfo,
} from "../../lib/device-api.js";

// ── Scenario Selector ─────────────────────────────────────────────────────
const ENV = __ENV.ENV || "load";
const scenario = config.scenarios[ENV] || config.scenarios.load;

// ── Test Options ──────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    screen_simulation: buildScenario(ENV, scenario),
  },

  thresholds: {
    // Overall HTTP performance
    http_req_duration: [
      `p(95)<${config.thresholds.httpReqDurationP95}`,
      `p(99)<${config.thresholds.httpReqDurationP99}`,
    ],
    http_req_failed: [`rate<${config.thresholds.httpReqFailedRate}`],

    // Authentication
    magicinfo_auth_duration: [
      `p(95)<${config.thresholds.authDurationP95}`,
    ],

    // Device registration
    magicinfo_device_reg_duration: [
      `p(95)<${config.thresholds.deviceRegDurationP95}`,
    ],

    // Heartbeat
    magicinfo_heartbeat_duration: ["p(95)<2000"],

    // Tải nội dung
    magicinfo_content_download_duration: ["p(95)<10000"],
    magicinfo_schedule_check_duration:   ["p(95)<3000"],

    // Content checks
    magicinfo_content_check_duration: ["p(95)<3000"],

    // API availability
    magicinfo_api_availability: ["rate>0.95"],

    // Custom business counters - just track, no threshold
    magicinfo_auth_success: [],
    magicinfo_auth_fail: [],
    magicinfo_heartbeat_success: [],
    magicinfo_heartbeat_fail: [],
    magicinfo_content_download_success: [],
    magicinfo_content_download_fail: [],
  },
};

// ── Build K6 Scenario Config ──────────────────────────────────────────────
function buildScenario(envName, scenarioCfg) {
  if (envName === "stress") {
    // Stress uses ramping stages
    return {
      executor: "ramping-vus",
      startVUs: 0,
      stages: scenarioCfg.stages,
      gracefulRampDown: "30s",
    };
  }

  // Smoke/Load/Soak use constant VUs
  const stages = [];

  if (scenarioCfg.rampUp) {
    stages.push({ duration: scenarioCfg.rampUp, target: scenarioCfg.vus });
  }

  stages.push({ duration: scenarioCfg.duration, target: scenarioCfg.vus });

  if (scenarioCfg.rampDown) {
    stages.push({ duration: scenarioCfg.rampDown, target: 0 });
  } else {
    stages.push({ duration: "30s", target: 0 });
  }

  return {
    executor: "ramping-vus",
    startVUs: 0,
    stages,
    gracefulRampDown: "30s",
  };
}

// ── VU State ──────────────────────────────────────────────────────────────
let vuToken = null;
let vuTokenTime = 0;
let vuDeviceInfo = null;
let vuDeviceId = null;
let vuHeartbeatCount = 0;
let vuContentCheckCount = 0;

// ── Setup: Run once before test ───────────────────────────────────────────
export function setup() {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║      MagicInfo Server - Screen Performance Test          ║
║      Scenario: ${ENV.padEnd(10)} | VUs: ${(scenario.vus || "ramping").toString().padEnd(8)}          ║
║      Server: ${config.server.baseUrl.padEnd(40)}  ║
╚══════════════════════════════════════════════════════════╝
  `);

  // Verify server connectivity with a single auth request
  const token = authenticate();
  if (!token) {
    console.error("[Setup] ❌ Cannot authenticate to MagicInfo Server! Check credentials and server URL.");
    return { setupFailed: true };
  }

  const serverInfo = getServerInfo(token);
  console.log(`[Setup] ✅ Server connected. Info: ${JSON.stringify(serverInfo)}`);

  return { setupOk: true, initialToken: token };
}

// ── Default Function: Per-VU screen lifecycle ─────────────────────────────
export default function (data) {
  // Skip if setup failed
  if (data && data.setupFailed) {
    sleep(1);
    return;
  }

  // ── Step 1: Initialize screen identity for this VU ──────────────────
  if (!vuDeviceInfo) {
    vuDeviceInfo = generateScreenId(__VU);
    console.log(`[VU ${__VU}] Screen initialized: ${vuDeviceInfo.deviceName} (${vuDeviceInfo.macAddress})`);
  }

  // ── Step 2: Authenticate (or refresh token) ──────────────────────────
  const now = Date.now() / 1000;
  if (!vuToken || (now - vuTokenTime) > config.auth.tokenRefreshInterval) {
    if (vuToken) {
      vuToken = refreshToken(vuToken);
    } else {
      vuToken = authenticate();
    }
    vuTokenTime = now;

    if (!vuToken) {
      console.error(`[VU ${__VU}] Authentication failed for ${vuDeviceInfo.deviceName}`);
      sleep(5);
      return;
    }
  }

  // ── Step 3: Check device registration status ─────────────────────────
  if (!vuDeviceId) {
    const regResult = checkDeviceRegistration(vuToken, vuDeviceInfo);
    if (regResult.registered && regResult.data) {
      vuDeviceId = regResult.data.deviceId || vuDeviceInfo.deviceName;
    } else {
      // Device not yet registered on server - use device name as ID
      vuDeviceId = vuDeviceInfo.deviceName;
    }
  }

  // ── Step 4: Simulate screen activity loop ────────────────────────────
  // Screens are always connected; simulate their periodic activity
  simulateScreenActivity();
}

// ── Screen Activity Simulation ────────────────────────────────────────────
function simulateScreenActivity() {
  const iterationTime = Date.now();

  // Stagger initial connections to avoid thundering herd
  if (__ITER === 0) {
    // Spread screen connections over first 30 seconds
    const staggerDelay = ((__VU - 1) % 50) * 0.15; // 0 to 7.5 seconds
    sleep(staggerDelay);
  }

  // ── Heartbeat ──────────────────────────────────────────────────
  // Screens send heartbeat every 30 seconds (every iteration)
  sendDeviceHeartbeat(vuToken, vuDeviceId, vuDeviceInfo);
  vuHeartbeatCount++;

  // ── Content Check ──────────────────────────────────────────────
  // Screens check for content updates less frequently (every 5 iterations = ~5min)
  if (vuContentCheckCount === 0 || vuHeartbeatCount % 5 === 0) {
    checkContentUpdate(vuToken, vuDeviceId, vuDeviceInfo);
    vuContentCheckCount++;
  }

  // ── Wait for next heartbeat interval ───────────────────────────
  // In real screens this is 30 seconds; reduced here for test speed
  // Adjust sleep() duration to control API request rate
  const elapsed = (Date.now() - iterationTime) / 1000;
  const waitTime = Math.max(0, config.screens.heartbeatInterval - elapsed);

  // For testing: use shorter interval (5s) unless running soak test
  const testInterval = ENV === "soak" ? waitTime : Math.min(waitTime, 5);
  sleep(testInterval);
}

// ── Teardown: Run once after test ─────────────────────────────────────────
export function teardown(data) {
  console.log(`
[Teardown] Test complete.
[Teardown] Total screens simulated: ${config.screens.totalScreens}
[Teardown] Scenario: ${ENV}
  `);
}

// ── Handle Summary: Export JSON + text summary ────────────────────────────
export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const jsonFile = `reports/summary-${ENV}-${timestamp}.json`;
  const txtFile  = `reports/summary-${ENV}-${timestamp}.txt`;

  const lines = [
    "=".repeat(65),
    "  MagicInfo Performance Test Report",
    `  Scenario : ${ENV.toUpperCase()}`,
    `  Finished : ${new Date().toLocaleString("vi-VN")}`,
    "=".repeat(65),
    "",
    "THRESHOLDS",
    "-".repeat(45),
  ];

  for (const [name, thresh] of Object.entries(data.metrics)) {
    if (thresh.thresholds) {
      for (const [expr, result] of Object.entries(thresh.thresholds)) {
        const icon = result.ok ? "PASS" : "FAIL";
        lines.push(`  [${icon}] ${name}: ${expr}`);
      }
    }
  }

  lines.push("", "KEY METRICS", "-".repeat(45));

  const showTrend = (metricName, label) => {
    const m = data.metrics[metricName];
    if (!m || !m.values) return;
    const v = m.values;
    if (v.avg !== undefined) {
      lines.push(`  ${label}`);
      lines.push(`    avg=${v.avg.toFixed(1)}ms  p90=${(v["p(90)"]||0).toFixed(1)}ms  p95=${(v["p(95)"]||0).toFixed(1)}ms  max=${(v.max||0).toFixed(1)}ms`);
    }
  };
  const showRate = (metricName, label) => {
    const m = data.metrics[metricName];
    if (!m || !m.values) return;
    lines.push(`  ${label}: ${(m.values.rate * 100).toFixed(2)}%`);
  };
  const showCounter = (metricName, label) => {
    const m = data.metrics[metricName];
    if (!m || !m.values) return;
    lines.push(`  ${label}: ${m.values.count}`);
  };

  showTrend("http_req_duration",               "HTTP Request Duration");
  showTrend("magicinfo_auth_duration",          "Auth Duration");
  showTrend("magicinfo_heartbeat_duration",     "Heartbeat Duration");
  showTrend("magicinfo_content_check_duration", "Content Check Duration");
  showTrend("magicinfo_device_reg_duration",    "Device Reg Duration");
  lines.push("");
  showRate("http_req_failed",            "HTTP Failed");
  showRate("magicinfo_api_availability", "API Availability");
  lines.push("");
  showCounter("http_reqs",                       "Total Requests");
  showCounter("iterations",                      "Total Iterations");
  showCounter("magicinfo_auth_success",          "Auth Success");
  showCounter("magicinfo_heartbeat_success",     "Heartbeat Success");
  showCounter("magicinfo_heartbeat_fail",        "Heartbeat Fail");
  showCounter("magicinfo_content_check_success", "Content Check Success");

  lines.push("", "=".repeat(65));
  const summary = lines.join("\n");

  return {
    [jsonFile]: JSON.stringify(data, null, 2),
    [txtFile]:  summary,
    stdout:     "\n" + summary + "\n",
  };
}
