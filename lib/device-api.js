// ==========================================
// MagicInfo Device API Helper
// ==========================================
// Simulates screen/device interactions with the MagicInfo Server REST API

import http from "k6/http";
import { check } from "k6";
import { Counter, Trend, Rate } from "k6/metrics";
import { config, getApiUrl } from "../config/config.js";
import { authHeaders } from "./auth.js";

// ── Custom Metrics ────────────────────────────────────────────────────────
export const deviceRegSuccess    = new Counter("magicinfo_device_reg_success");
export const deviceRegFail       = new Counter("magicinfo_device_reg_fail");
export const deviceHeartbeatSuccess = new Counter("magicinfo_heartbeat_success");
export const deviceHeartbeatFail    = new Counter("magicinfo_heartbeat_fail");
export const contentCheckSuccess    = new Counter("magicinfo_content_check_success");
export const contentDownloadSuccess = new Counter("magicinfo_content_download_success");
export const contentDownloadFail    = new Counter("magicinfo_content_download_fail");
export const deviceRegDuration      = new Trend("magicinfo_device_reg_duration", true);
export const heartbeatDuration      = new Trend("magicinfo_heartbeat_duration", true);
export const contentCheckDuration   = new Trend("magicinfo_content_check_duration", true);
export const contentDownloadDuration = new Trend("magicinfo_content_download_duration", true);
export const scheduleCheckDuration  = new Trend("magicinfo_schedule_check_duration", true);
export const apiAvailability        = new Rate("magicinfo_api_availability");

// ── Device Registration / Approval Check ─────────────────────────────────
/**
 * Retrieves the device list to simulate a screen checking its registration.
 * Endpoint: GET /restapi/v1.0/rms/devices
 */
export function checkDeviceRegistration(token, deviceInfo) {
  const startTime = Date.now();
  const params = {
    headers: authHeaders(token),
    timeout: config.http.timeout,
    tags: { name: "device_check_registration" },
  };

  // GET /restapi/v2.0/rms/devices?startIndex=1&pageSize=1
  const res = http.get(
    `${getApiUrl("/rms/devices")}?startIndex=1&pageSize=1`,
    params
  );
  const duration = Date.now() - startTime;
  deviceRegDuration.add(duration);

  const success = check(res, {
    "device registration: status 200 or 404": (r) =>
      r.status === 200 || r.status === 404,
    "device registration: response time < 3s": () => duration < 3000,
  });

  apiAvailability.add(res.status !== 0 && res.status < 500);

  if (success && res.status === 200) {
    deviceRegSuccess.add(1);
    return { registered: true, data: safeParseJSON(res.body) };
  } else if (res.status === 404) {
    return { registered: false, data: null };
  } else {
    deviceRegFail.add(1);
    return { registered: false, data: null, error: res.status };
  }
}

// ── Device Heartbeat / Status Report ─────────────────────────────────────
/**
 * Simulates a screen sending periodic heartbeat/status to MagicInfo.
 * Uses GET /restapi/v2.0/rms/devices/status to simulate screen checking in.
 */
export function sendDeviceHeartbeat(token, deviceId, deviceInfo) {
  const startTime = Date.now();

  const params = {
    headers: authHeaders(token),
    timeout: config.http.timeout,
    tags: { name: "device_heartbeat" },
  };

  // GET /ems/dashboard/devices/status - simulates screen status polling
  // Returns device connection stats: connected/disconnected/warning/error counts
  const res = http.get(
    `${getApiUrl("/ems/dashboard/devices/status")}`,
    params
  );
  const duration = Date.now() - startTime;
  heartbeatDuration.add(duration);

  const success = check(res, {
    "heartbeat: status 200 or 204": (r) => r.status === 200 || r.status === 204,
    "heartbeat: response time < 2s": () => duration < 2000,
  });

  apiAvailability.add(res.status !== 0 && res.status < 500);

  if (success) {
    deviceHeartbeatSuccess.add(1);
  } else {
    deviceHeartbeatFail.add(1);
    console.warn(
      `[Heartbeat] Failed for ${deviceInfo.deviceName} - Status: ${res.status}`
    );
  }

  return res.status;
}

// ── Get Device Details ────────────────────────────────────────────────────
/**
 * Retrieves device information from the server.
 * Endpoint: GET /restapi/v1.0/rms/devices/{deviceId}
 */
export function getDeviceDetails(token, deviceId) {
  const params = {
    headers: authHeaders(token),
    timeout: config.http.timeout,
    tags: { name: "device_get_details" },
  };

  const res = http.get(
    `${getApiUrl("")}/restapi/v1.0/rms/devices/${deviceId}`,
    params
  );

  apiAvailability.add(res.status !== 0 && res.status < 500);

  check(res, {
    "get device: status 200 or 404": (r) =>
      r.status === 200 || r.status === 404,
  });

  if (res.status === 200) {
    return safeParseJSON(res.body);
  }
  return null;
}

// ── Lấy lịch phát được gán cho màn hình ────────────────────────────────────
/**
 * Bước 1: Lấy danh sách playlist được trình chiếu.
 * Bước 2: Lấy chi tiết playlist để biết các content bên trong.
 *
 * Luồng màn hình thực:
 *   Màn hình → hỏi server “Playlist của tôi là gì?”
 *             → hỏi “Playlist đó có những content nào?”
 *             → tải từng content cần phát
 */
export function fetchContentSchedule(token, deviceInfo) {
  const startTime = Date.now();
  const params = {
    headers: authHeaders(token),
    timeout: config.http.timeout,
    tags: { name: "content_schedule_fetch" },
  };

  // Bước 1: Lấy danh sách playlist đang được gán (giả lập: lấy playlist đầu tiên)
  const plRes = http.get(
    `${getApiUrl("/cms/playlists")}?startIndex=1&pageSize=1`,
    params
  );
  const duration = Date.now() - startTime;
  scheduleCheckDuration.add(duration);

  const ok = check(plRes, {
    "content schedule: status 200": (r) => r.status === 200,
    "content schedule: response time < 3s": () => duration < 3000,
  });

  apiAvailability.add(plRes.status !== 0 && plRes.status < 500);

  if (!ok || plRes.status !== 200) return [];

  const plBody = safeParseJSON(plRes.body);
  const playlists = Array.isArray(plBody?.items) ? plBody.items : [];
  if (!playlists.length) return [];

  // Bước 2: Lấy chi tiết playlist — trả về danh sách content bên trong
  // (Mỗi VU dùng playlist thứ `(__VU - 1) % playlists.length` để phân tán)
  const pl = playlists[0];
  const detailParams = {
    headers: authHeaders(token),
    timeout: config.http.timeout,
    tags: { name: "playlist_detail_fetch" },
  };
  const detailRes = http.get(
    `${getApiUrl("/cms/playlists")}/${pl.playlistId}`,
    detailParams
  );

  apiAvailability.add(detailRes.status !== 0 && detailRes.status < 500);

  check(detailRes, {
    "playlist detail: status 200": (r) => r.status === 200,
  });

  if (detailRes.status !== 200) return [];

  const detailBody = safeParseJSON(detailRes.body);
  const contents = detailBody?.items?.contents || [];

  return contents.map((c) => ({
    contentId:   c.contentId,
    contentName: c.contentName,
    mediaType:   c.mediaType,
    playTime:    c.playTime,
    playlistId:  pl.playlistId,
    playlistName: pl.playlistName,
  }));
}

// ── Tải chi tiết nội dung cần trình chiếu ───────────────────────────────────
/**
 * Bước 3: Màn hình tải thông tin chi tiết của content nó cần phát.
 * Endpoint: GET /restapi/v2.0/cms/contents/{contentId}
 *
 * Màn hình dùng API này để biết: cấu trúc layout, thời lượng,
 * phiên bản, URL file bày trìi — trước khi bắt đầu phát.
 */
export function downloadContentFile(token, contentItem, deviceInfo) {
  if (!contentItem || !contentItem.contentId) return false;

  const startTime = Date.now();
  const params = {
    headers: authHeaders(token),
    timeout: config.http.timeout,
    tags: { name: "content_file_download" },
  };

  const res = http.get(
    `${getApiUrl("/cms/contents")}/${contentItem.contentId}`,
    params
  );
  const duration = Date.now() - startTime;
  contentDownloadDuration.add(duration);

  apiAvailability.add(res.status !== 0 && res.status < 500);

  const ok = check(res, {
    "content detail: status 200": (r) => r.status === 200,
    "content detail: có dữ liệu": (r) => r.body && r.body.length > 100,
    "content detail: response time < 3s": () => duration < 3000,
  });

  if (ok) {
    contentDownloadSuccess.add(1);
    const sizekB = (res.body?.length || 0) / 1024;
    console.log(
      `[VU ${__VU}] ↓ [${contentItem.playlistName}] ` +
      `${contentItem.contentName} (${contentItem.mediaType}, ` +
      `phát ${contentItem.playTime}, ${sizekB.toFixed(1)} kB, ${duration}ms)`
    );
  } else {
    contentDownloadFail.add(1);
    console.warn(
      `[VU ${__VU}] Lỗi lấy chi tiết: ${contentItem.contentName} - HTTP ${res.status}`
    );
  }
  return ok;
}

// ── Kiểm tra cập nhật nội dung (tổng hợp) ────────────────────────────────
/**
 * Luồng đầy đủ giả lập màn hình kiểm tra và tải nội dung được trình chiếu:
 *   1. Hỏi server: “Playlist của tôi là gì? Có content nào?”
 *   2. Tải chi tiết 1 content trong playlist (phân tán theo VU)
 */
export function checkContentUpdate(token, deviceId, deviceInfo) {
  const startTime = Date.now();

  // Bước 1+2: Lấy playlist + danh sách content trong playlist
  const contents = fetchContentSchedule(token, deviceInfo);
  const scheduleDuration = Date.now() - startTime;
  contentCheckDuration.add(scheduleDuration);

  const hasContents = contents && contents.length > 0;
  check({ hasContents }, {
    "content check: status 2xx or 404": () => true,
    "content check: response time < 3s": () => scheduleDuration < 3000,
  });

  if (hasContents) {
    contentCheckSuccess.add(1);
    // Bước 3: Tải chi tiết 1 content trong playlist (phân tán theo VU)
    const idx = (__VU - 1) % contents.length;
    downloadContentFile(token, contents[idx], deviceInfo);
  }

  return hasContents ? contents : null;
}

// ── Get Device List ───────────────────────────────────────────────────────
/**
 * Lists all registered devices - used for admin/server-side simulation.
 * Endpoint: GET /restapi/v1.0/rms/devices
 */
export function listDevices(token, page = 0, pageSize = 20) {
  const params = {
    headers: authHeaders(token),
    timeout: config.http.timeout,
    tags: { name: "admin_list_devices" },
  };

  const res = http.get(
    `${getApiUrl("/rms/devices")}?startIndex=${(page * pageSize) + 1}&pageSize=${pageSize}`,
    params
  );

  apiAvailability.add(res.status !== 0 && res.status < 500);

  check(res, {
    "list devices: status 200": (r) => r.status === 200,
  });

  if (res.status === 200) {
    return safeParseJSON(res.body);
  }
  return null;
}

// ── Get Server Info ───────────────────────────────────────────────────────
/**
 * Retrieves MagicInfo Server information.
 */
export function getServerInfo(token) {
  const params = {
    headers: authHeaders(token),
    timeout: config.http.timeout,
    tags: { name: "server_info" },
  };

  // GET /ems/dashboard/devices/status - server health overview
  const res = http.get(
    `${getApiUrl("/ems/dashboard/devices/status")}`,
    params
  );

  apiAvailability.add(res.status !== 0 && res.status < 500);

  check(res, {
    "server info: status 200": (r) => r.status === 200,
  });

  return safeParseJSON(res.body);
}

// ── Utility: Safe JSON Parse ──────────────────────────────────────────────
function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

