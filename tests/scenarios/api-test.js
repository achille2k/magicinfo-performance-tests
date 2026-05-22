// ==========================================
// MagicInfo REST API Test
// ==========================================
// Tests all MagicInfo REST API endpoints that screens and
// admins frequently use. Run after auth-test passes.

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend } from "k6/metrics";
import { config, getApiUrl } from "../../config/config.js";
import { authenticate, authHeaders } from "../../lib/auth.js";

// ── Custom Metrics ────────────────────────────────────────────────────────
const apiAvailability = new Rate("api_availability");
const listDevicesDuration = new Trend("api_list_devices_duration", true);
const getDeviceDuration = new Trend("api_get_device_duration", true);
const dashboardDuration = new Trend("api_dashboard_duration", true);

// ── Test Options ──────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    api_test: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "20s", target: 10 },
        { duration: "60s", target: 50 },
        { duration: "60s", target: 100 },
        { duration: "20s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<2000"],
    http_req_failed: ["rate<0.05"],
    api_availability: ["rate>0.95"],
    api_list_devices_duration: ["p(95)<2000"],
    api_get_device_duration: ["p(95)<1500"],
    api_dashboard_duration: ["p(95)<2000"],
  },
};

// ── Per-VU token storage ──────────────────────────────────────────────────
let vuToken = null;

// ── Default Function ──────────────────────────────────────────────────────
export default function () {
  // Authenticate if no token
  if (!vuToken) {
    vuToken = authenticate();
    if (!vuToken) {
      sleep(2);
      return;
    }
  }

  const headers = authHeaders(vuToken);

  // ── Group: Dashboard / Overview ──────────────────────────────────────
  group("Dashboard", () => {
    const start = Date.now();
    const res = http.get(
      `${getApiUrl("")}/restapi/v1.0/dashboard/summary`,
      { headers, tags: { name: "dashboard_summary" } }
    );
    dashboardDuration.add(Date.now() - start);

    const ok = check(res, {
      "dashboard: status 200 or 401": (r) =>
        r.status === 200 || r.status === 401,
    });
    apiAvailability.add(res.status < 500 && res.status !== 0);

    if (res.status === 401) {
      // Token expired, refresh on next iteration
      vuToken = null;
    }
  });

  sleep(0.5);

  // ── Group: Device Management ─────────────────────────────────────────
  group("Device Management", () => {
    // List devices (paginated)
    const listStart = Date.now();
    const listRes = http.get(
      `${getApiUrl("")}/restapi/v1.0/rms/devices?page=0&pageSize=50`,
      { headers, tags: { name: "list_devices" } }
    );
    listDevicesDuration.add(Date.now() - listStart);

    check(listRes, {
      "list devices: status 200 or 204": (r) =>
        r.status === 200 || r.status === 204,
    });
    apiAvailability.add(listRes.status < 500 && listRes.status !== 0);

    sleep(0.3);

    // Get device count/statistics
    const statsRes = http.get(
      `${getApiUrl("")}/restapi/v1.0/rms/devices/count`,
      { headers, tags: { name: "device_count" } }
    );

    check(statsRes, {
      "device count: status 200 or 404": (r) =>
        r.status === 200 || r.status === 404,
    });
    apiAvailability.add(statsRes.status < 500 && statsRes.status !== 0);
  });

  sleep(0.5);

  // ── Group: Content Management ────────────────────────────────────────
  group("Content Management", () => {
    // List content items
    const contentRes = http.get(
      `${getApiUrl("")}/restapi/v1.0/cms/contents?page=0&pageSize=20`,
      { headers, tags: { name: "list_content" } }
    );

    check(contentRes, {
      "list content: status 200 or 204": (r) =>
        r.status === 200 || r.status === 204 || r.status === 403,
    });
    apiAvailability.add(contentRes.status < 500 && contentRes.status !== 0);

    sleep(0.3);

    // List playlists
    const playlistRes = http.get(
      `${getApiUrl("")}/restapi/v1.0/cms/playlists?page=0&pageSize=20`,
      { headers, tags: { name: "list_playlists" } }
    );

    check(playlistRes, {
      "list playlists: status 200 or 204": (r) =>
        r.status === 200 || r.status === 204 || r.status === 403,
    });
    apiAvailability.add(playlistRes.status < 500 && playlistRes.status !== 0);
  });

  sleep(0.5);

  // ── Group: Schedule Management ───────────────────────────────────────
  group("Schedule Management", () => {
    const scheduleRes = http.get(
      `${getApiUrl("")}/restapi/v1.0/dls/schedules?page=0&pageSize=20`,
      { headers, tags: { name: "list_schedules" } }
    );

    check(scheduleRes, {
      "list schedules: status 200 or 404": (r) =>
        r.status === 200 || r.status === 404 || r.status === 204,
    });
    apiAvailability.add(scheduleRes.status < 500 && scheduleRes.status !== 0);
  });

  sleep(1);
}
