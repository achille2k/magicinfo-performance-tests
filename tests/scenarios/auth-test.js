// ==========================================
// MagicInfo Auth-Only Test
// ==========================================
// Tests the authentication endpoint in isolation
// Useful for baseline measurements before full simulation

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter, Rate } from "k6/metrics";
import { config, getAuthUrl } from "../../config/config.js";

// ── Custom Metrics ────────────────────────────────────────────────────────
const authResponseTime = new Trend("auth_response_time", true);
const authSuccessRate = new Rate("auth_success_rate");
const authTokenRefresh = new Counter("auth_token_refresh_count");

// ── Test Options ──────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    auth_test: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "15s", target: 20 },
        { duration: "30s", target: 50 },
        { duration: "30s", target: 100 },
        { duration: "15s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    auth_response_time: ["p(95)<1000", "p(99)<2000"],
    auth_success_rate: ["rate>0.95"],
    http_req_failed: ["rate<0.05"],
  },
};

// ── Default Function ──────────────────────────────────────────────────────
export default function () {
  // ── Test 1: Login ──────────────────────────────────────────────────────
  const loginStart = Date.now();
  const loginRes = http.post(
    getAuthUrl(),
    JSON.stringify({
      username: config.auth.username,
      password: config.auth.password,
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      tags: { name: "auth_login" },
    }
  );

  const loginTime = Date.now() - loginStart;
  authResponseTime.add(loginTime);

  const loginSuccess = check(loginRes, {
    "login: status 200": (r) => r.status === 200,
    "login: has token": (r) => {
      try {
        const body = JSON.parse(r.body);
        return !!(body.token || body.api_token);
      } catch {
        return false;
      }
    },
    "login: response time < 1s": () => loginTime < 1000,
  });

  authSuccessRate.add(loginSuccess);

  if (!loginSuccess) {
    console.error(`[Auth Test] Login failed: ${loginRes.status} - ${loginRes.body}`);
    sleep(2);
    return;
  }

  const token = JSON.parse(loginRes.body).token || JSON.parse(loginRes.body).api_token;

  sleep(1);

  // ── Test 2: Token Refresh ──────────────────────────────────────────────
  const refreshRes = http.get(`${getAuthUrl()}/refresh`, {
    headers: {
      "Content-Type": "application/json",
      api_token: token,
    },
    tags: { name: "auth_refresh" },
  });

  check(refreshRes, {
    "token refresh: status 200": (r) => r.status === 200,
    "token refresh: has new token": (r) => {
      try {
        const body = JSON.parse(r.body);
        return !!(body.token || body.api_token);
      } catch {
        return false;
      }
    },
  });

  authTokenRefresh.add(1);

  sleep(1);
}
