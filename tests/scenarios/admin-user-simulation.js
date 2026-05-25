// ==========================================
// MagicInfo Load Test — 2 Kịch Bản
// ==========================================
// Hỗ trợ 2 chế độ chạy qua biến môi trường ENV:
//   ENV=smoke      : 200 màn hình +  5 quản trị viên (~7 phút)
//   ENV=enterprise : 1.200 màn hình + 20 quản trị viên (~14 phút)
//
// Luồng quản trị viên (thực tế):
//   Đăng nhập → DS thiết bị → Dashboard → Nội dung → Playlist → THOAT
//   (mỗi admin chỉ làm 1 phiên duy nhất, không lặp)

import { sleep, check } from "k6";
import { Counter, Trend } from "k6/metrics";
import http from "k6/http";
import { config, getApiUrl, getAuthUrl, generateScreenId } from "../../config/config.js";
import { authenticate } from "../../lib/auth.js";
import {
  sendDeviceHeartbeat,
  checkContentUpdate,
  listDevices,
  apiAvailability,
} from "../../lib/device-api.js";

// ── Chế độ chạy ─────────────────────────────────────────────────────────────────────────
const ENV            = __ENV.ENV || "smoke";
const isEnterprise   = ENV === "enterprise";
const SCREEN_COUNT   = isEnterprise ? 1200 : 200;
const ADMIN_COUNT    = isEnterprise ? 20   : 5;
const SCREEN_RAMP_UP = isEnterprise ? "3m"  : "1m";
const SCREEN_SUSTAIN = isEnterprise ? "10m" : "5m";
const SCENARIO_LABEL = isEnterprise
  ? "Enterprise — 20 Quản Trị Viên + 1.200 Màn Hình"
  : "Smoke — 5 Quản Trị Viên + 200 Màn Hình";

// ── Custom Metrics — Quản trị viên ────────────────────────────────────────────────
const adminLoginSuccess      = new Counter("admin_login_success");
const adminLoginFail         = new Counter("admin_login_fail");
const adminLoginDuration     = new Trend("admin_login_duration",     true);
const adminDashboardDuration  = new Trend("admin_dashboard_duration",   true);
const adminContentDuration    = new Trend("admin_content_list_duration",true);
const adminPlaylistDuration   = new Trend("admin_playlist_duration",    true);
const adminPageSuccess        = new Counter("admin_page_success");
const adminPageFail           = new Counter("admin_page_fail");

// ── Custom Metrics — bổ sung cho quản trị viên ──────────────────────────────
// apiAvailability được import trực tiếp từ device-api.js (tránh khai báo trùng metric)
const adminDeviceListDuration = new Trend("admin_device_list_duration", true);

// ── Auth headers helper ───────────────────────────────────────────────────────
function authHeaders(token) {
  return { "api_key": token, "Content-Type": "application/json" };
}

// ── Test Options — 2 nhóm VU song song ──────────────────────────────────────────────────
export const options = {
  scenarios: {
    // Nhóm 1: Màn hình — số lượng tự động theo ENV
    screen_group: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: SCREEN_RAMP_UP, target: SCREEN_COUNT },
        { duration: SCREEN_SUSTAIN, target: SCREEN_COUNT },
        { duration: "30s",          target: 0             },
      ],
      gracefulRampDown: "30s",
      exec: "screenVU",
      tags: { group: "screen" },
    },
    // Nhóm 2: ADMIN_COUNT quản trị viên — mỗi người làm 1 phiên duy nhất rồi thoát
    admin_group: {
      executor: "per-vu-iterations",
      vus:        ADMIN_COUNT,  // 5 (smoke) hoặc 20 (enterprise)
      iterations: 1,            // mỗi admin chỉ chạy 1 lần
      maxDuration: "12m",
      gracefulStop: "30s",
      exec: "adminVU",
      tags: { group: "admin" },
      startTime: "30s",         // bắt đầu sau khi màn hình đã online
    },
  },

  thresholds: {
    // ── Ngưỡng chung ──
    http_req_failed:    ["rate<0.05"],
    http_req_duration:  ["p(95)<3000", "p(99)<8000"],
    magicinfo_api_availability: ["rate>0.95"],

    // ── Ngưỡng màn hình ──
    magicinfo_heartbeat_duration:         ["p(95)<2000"],
    magicinfo_content_check_duration:     ["p(95)<3000"],
    magicinfo_schedule_check_duration:    ["p(95)<3000"],
    magicinfo_content_download_duration:  ["p(95)<10000"],
    magicinfo_auth_duration:              ["p(95)<1000"],

    // ── Ngưỡng quản trị viên ──
    admin_login_duration:         ["p(95)<2000"],
    admin_device_list_duration:   ["p(95)<2000"],
    admin_dashboard_duration:     ["p(95)<2000"],
    admin_content_list_duration:  ["p(95)<3000"],
    admin_playlist_duration:      ["p(95)<3000"],
  },
};

// ── Setup: kiểm tra kết nối server ────────────────────────────────────────────
export function setup() {
  const res = http.get(
    getApiUrl("/ems/dashboard/devices/status"),
    { headers: { "Content-Type": "application/json" }, timeout: "10s" }
  );
  console.log(`[Setup] Server đáp ứng HTTP ${res.status} — ${config.server.baseUrl}`);
  if (res.status === 0) {
    console.error("[Setup] ⚠️  Không kết nối được server! Kiểm tra MAGICINFO_BASE_URL.");
  }
  return {};
}

// ═══════════════════════════════════════════════════════════════════════
// NHÓM 1: MÀN HÌNH — giống screen-simulation.js
// ═══════════════════════════════════════════════════════════════════════
let screenToken     = null;
let screenTokenTime = 0;
let screenInfo      = null;
let screenIteration = 0;

export function screenVU() {
  // Lấy/làm mới token
  const now = Date.now() / 1000;
  if (!screenToken || (now - screenTokenTime) > config.auth.tokenRefreshInterval) {
    const token = authenticate();
    if (token) {
      screenToken     = token;
      screenTokenTime = now;
      if (!screenInfo) screenInfo = generateScreenId(__VU);
    } else {
      sleep(5);
      return;
    }
  }

  screenIteration++;

  // Heartbeat mỗi vòng lặp (~5 giây sleep)
  sendDeviceHeartbeat(screenToken, screenInfo?.deviceName || `SCREEN-${__VU}`, screenInfo);
  apiAvailability.add(1);

  // Kiểm tra nội dung mỗi 5 lần heartbeat (~25 giây thực)
  if (screenIteration % 5 === 0) {
    checkContentUpdate(screenToken, screenInfo?.deviceName || `SCREEN-${__VU}`, screenInfo);
  }

  sleep(5 + Math.random() * 2);
}

// ═══════════════════════════════════════════════════════════════════════
// NHÓM 2: QUẢN TRỊ VIÊN — 1 phiên duy nhất rồi thoát
// ═══════════════════════════════════════════════════════════════════
/**
 * Mô phỏng 1 phiên làm việc của quản trị viên:
 *   Đăng nhập → DS thiết bị → Dashboard → Nội dung → Playlist → THOAT
 *   Không lặp lại — giống người dùng thực
 */
export function adminVU() {
  // Mỗi VU là 1 admin riêng biệt, token được lưu trong scope VU
  let token = null;

  // ── Bước 1: Đăng nhập (mỗi admin chỉ login 1 lần duy nhất) ────────────
  {
    const t0 = Date.now();
    const res = http.post(
      getAuthUrl(),
      JSON.stringify({
        grantType: "password",
        username:  config.auth.username,
        password:  config.auth.password,
      }),
      {
        headers: { "Content-Type": "application/json" },
        tags:    { name: "admin_login", group: "admin" },
        timeout: "15s",
      }
    );
    const dur = Date.now() - t0;
    adminLoginDuration.add(dur);

    const ok = check(res, {
      "admin login: status 200": (r) => r.status === 200,
      "admin login: có token":   (r) => !!r.json("token"),
    });

    if (ok && res.status === 200) {
      token = res.json("token");
      adminLoginSuccess.add(1);
    } else {
      adminLoginFail.add(1);
      console.warn(`[Admin VU ${__VU}] Đăng nhập thất bại — HTTP ${res.status}`);
      return; // thoát luôn, không tiếp tục
    }
    sleep(1 + Math.random()); // think time sau đăng nhập
  }

  const hdrs = {
    headers: authHeaders(token),
    timeout: "15s",
    tags: { group: "admin" },
  };

  // ── Bước 2: Xem danh sách thiết bị ──────────────────────────────────────
  {
    const t0   = Date.now();
    const data = listDevices(token, 0, 20);
    const dur  = Date.now() - t0;
    adminDeviceListDuration.add(dur);

    const ok = data !== null;
    ok ? adminPageSuccess.add(1) : adminPageFail.add(1);
    if (ok) console.log(`[Admin VU ${__VU}] 📋 Danh sách thiết bị — ${data?.totalCount ?? "?"} thiết bị (${dur}ms)`);
  }
  sleep(2 + Math.random() * 3); // xem danh sách thiết bị ~2-5 giây

  // ── Bước 3: Xem Dashboard trạng thái thiết bị ───────────────────────────
  {
    const t0  = Date.now();
    const res = http.get(
      getApiUrl("/ems/dashboard/devices/status"),
      { ...hdrs, tags: { name: "admin_dashboard", group: "admin" } }
    );
    const dur = Date.now() - t0;
    adminDashboardDuration.add(dur);
    apiAvailability.add(res.status > 0 && res.status < 500);

    const ok = check(res, {
      "admin dashboard: status 200": (r) => r.status === 200,
    });
    ok ? adminPageSuccess.add(1) : adminPageFail.add(1);
    if (ok) console.log(`[Admin VU ${__VU}] 📊 Dashboard trạng thái (${dur}ms)`);
  }
  sleep(3 + Math.random() * 4); // xem dashboard ~3-7 giây

  // ── Bước 4: Duyệt thư viện nội dung ─────────────────────────────────────
  {
    const t0  = Date.now();
    const res = http.get(
      `${getApiUrl("/cms/contents")}?startIndex=1&pageSize=20`,
      { ...hdrs, tags: { name: "admin_content_list", group: "admin" } }
    );
    const dur = Date.now() - t0;
    adminContentDuration.add(dur);
    apiAvailability.add(res.status > 0 && res.status < 500);

    const ok = check(res, {
      "admin content list: status 200": (r) => r.status === 200,
    });
    ok ? adminPageSuccess.add(1) : adminPageFail.add(1);

    if (ok && res.status === 200) {
      const items = res.json("items") || [];
      if (Array.isArray(items) && items.length > 0) {
        const pick = items[Math.floor(Math.random() * items.length)];
        if (pick?.contentId) {
          const t1 = Date.now();
          const r2 = http.get(
            `${getApiUrl("/cms/contents")}/${pick.contentId}`,
            { ...hdrs, tags: { name: "admin_content_detail", group: "admin" } }
          );
          check(r2, { "admin content detail: status 200": (r) => r.status === 200 });
          r2.status === 200 ? adminPageSuccess.add(1) : adminPageFail.add(1);
          console.log(`[Admin VU ${__VU}] 🖼  Xem nội dung "${pick.contentName}" (${Date.now()-t1}ms)`);
        }
      }
      console.log(`[Admin VU ${__VU}] 📁 Thư viện nội dung (${dur}ms)`);
    }
  }
  sleep(3 + Math.random() * 5); // duyệt nội dung ~3-8 giây

  // ── Bước 5: Xem playlist ─────────────────────────────────────────────
  {
    const t0  = Date.now();
    const res = http.get(
      `${getApiUrl("/cms/playlists")}?startIndex=1&pageSize=20`,
      { ...hdrs, tags: { name: "admin_playlist_list", group: "admin" } }
    );
    const dur = Date.now() - t0;
    adminPlaylistDuration.add(dur);
    apiAvailability.add(res.status > 0 && res.status < 500);

    const ok = check(res, {
      "admin playlist list: status 200": (r) => r.status === 200,
    });
    ok ? adminPageSuccess.add(1) : adminPageFail.add(1);

    // Click vào 1 playlist để xem chi tiết
    if (ok && res.status === 200) {
      const items = res.json("items") || [];
      if (Array.isArray(items) && items.length > 0) {
        const pick = items[Math.floor(Math.random() * items.length)];
        if (pick?.playlistId) {
          const t1 = Date.now();
          const r2 = http.get(
            `${getApiUrl("/cms/playlists")}/${pick.playlistId}`,
            { ...hdrs, tags: { name: "admin_playlist_detail", group: "admin" } }
          );
          check(r2, { "admin playlist detail: status 200": (r) => r.status === 200 });
          r2.status === 200 ? adminPageSuccess.add(1) : adminPageFail.add(1);
          console.log(`[Admin VU ${__VU}] 🎞  Xem playlist "${pick.playlistName}" (${Date.now()-t1}ms)`);
        }
      }
      console.log(`[Admin VU ${__VU}] 📂 Danh sách playlist (${dur}ms)`);
    }
  }
  sleep(3 + Math.random() * 7); // think time dài hơn trước khi lặp ~3-10 giây
}

// ── Teardown ──────────────────────────────────────────────────────────────────────────────────
export function teardown() {
  console.log(`
[Teardown] ${SCENARIO_LABEL}
[Teardown] Màn hình giả lập  : ${SCREEN_COUNT}
[Teardown] Quản trị viên     : ${ADMIN_COUNT}
  `);
}

// ── Handle Summary: xuất JSON + text ─────────────────────────────────────────
export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const envKey    = isEnterprise ? "enterprise" : "smoke";
  const jsonFile  = `reports/summary-${envKey}-${timestamp}.json`;
  const txtFile   = `reports/summary-${envKey}-${timestamp}.txt`;

  const lines = [
    "=".repeat(65),
    `  MagicInfo Mixed Load Test Report`,
    `  Kịch bản : ${SCENARIO_LABEL}`,
    `  Hoàn thành: ${new Date().toLocaleString("vi-VN")}`,
    "=".repeat(65), "",
    "THRESHOLDS", "-".repeat(45),
  ];

  for (const [name, thresh] of Object.entries(data.metrics)) {
    if (thresh.thresholds) {
      for (const [expr, result] of Object.entries(thresh.thresholds)) {
        lines.push(`  [${result.ok ? "PASS" : "FAIL"}] ${name}: ${expr}`);
      }
    }
  }

  const showTrend   = (key, label) => { const m = data.metrics[key]; if (!m?.values?.avg) return; const v = m.values; lines.push(`  ${label}\n    avg=${v.avg.toFixed(1)}ms  p90=${(v["p(90)"]||0).toFixed(1)}ms  p95=${(v["p(95)"]||0).toFixed(1)}ms  max=${(v.max||0).toFixed(1)}ms`); };
  const showRate    = (key, label) => { const m = data.metrics[key]; if (!m?.values) return; lines.push(`  ${label}: ${(m.values.rate*100).toFixed(2)}%`); };
  const showCounter = (key, label) => { const m = data.metrics[key]; if (!m?.values) return; lines.push(`  ${label}: ${m.values.count}`); };

  lines.push("", `── QUẢN TRỊ VIÊN (${ADMIN_COUNT} VUs) ──`, "-".repeat(45));
  showTrend("admin_login_duration",          "Đăng nhập");
  showTrend("admin_device_list_duration",    "Danh sách thiết bị");
  showTrend("admin_dashboard_duration",      "Dashboard trạng thái");
  showTrend("admin_content_list_duration",   "Thư viện nội dung");
  showTrend("admin_playlist_duration",       "Danh sách playlist");
  lines.push("");
  showCounter("admin_login_success",  "Admin đăng nhập thành công");
  showCounter("admin_page_success",   "Trang admin thành công");
  showCounter("admin_login_fail",     "Admin đăng nhập thất bại");
  showCounter("admin_page_fail",      "Trang admin thất bại");

  lines.push("", `── MÀN HÌNH (${SCREEN_COUNT} VUs) ──`, "-".repeat(45));
  showTrend("magicinfo_auth_duration",          "Xác thực");
  showTrend("magicinfo_heartbeat_duration",     "Heartbeat");
  showTrend("magicinfo_content_check_duration", "Kiểm tra nội dung");
  lines.push("");
  showRate("http_req_failed",            "HTTP Failed");
  showRate("magicinfo_api_availability", "API Availability");
  lines.push("");
  showCounter("http_reqs",                   "Tổng requests");
  showCounter("magicinfo_auth_success",      "Auth màn hình thành công");
  showCounter("magicinfo_heartbeat_success", "Heartbeat thành công");

  lines.push("", "=".repeat(65));
  const summary = lines.join("\n");
  return {
    [jsonFile]: JSON.stringify(data, null, 2),
    [txtFile]:  summary,
    stdout:     "\n" + summary + "\n",
  };
}
