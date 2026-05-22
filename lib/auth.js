// ==========================================
// MagicInfo Authentication Helper
// ==========================================
// Handles token acquisition and management
// API: POST /MagicInfo/restapi/v2.0/auth
// Payload: { grantType: "password", username, password }
// Response: { token, refreshToken }

import http from "k6/http";
import { check } from "k6";
import { Counter, Trend } from "k6/metrics";
import { config, getAuthUrl, getApiUrl } from "../config/config.js";

// ── Custom Metrics ────────────────────────────────────────────────────────
export const authSuccessCount = new Counter("magicinfo_auth_success");
export const authFailCount = new Counter("magicinfo_auth_fail");
export const authDuration = new Trend("magicinfo_auth_duration", true);
export const tokenRefreshCount = new Counter("magicinfo_token_refresh");

// ── Authenticate: Get API Token ───────────────────────────────────────────
/**
 * Authenticates with the MagicInfo Server and returns a token.
 * Endpoint: POST /MagicInfo/openapi/auth
 */
export function authenticate() {
  const startTime = Date.now();

  // MagicInfo 9 auth payload: grantType + username + password
  const payload = JSON.stringify({
    grantType: "password",
    username: config.auth.username,
    password: config.auth.password,
  });

  const params = {
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    timeout: config.http.timeout,
    tags: { name: "auth_login" },
  };

  const res = http.post(getAuthUrl(), payload, params);
  const duration = Date.now() - startTime;
  authDuration.add(duration);

  const success = check(res, {
    "auth: status is 200": (r) => r.status === 200,
    "auth: token received": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.token !== undefined;
      } catch {
        return false;
      }
    },
  });

  if (success) {
    authSuccessCount.add(1);
    try {
      const body = JSON.parse(res.body);
      return body.token;
    } catch {
      console.error(`[Auth] Failed to parse token response: ${res.body}`);
      authFailCount.add(1);
      return null;
    }
  } else {
    authFailCount.add(1);
    console.error(
      `[Auth] Login failed - Status: ${res.status}, Body: ${res.body}`
    );
    return null;
  }
}

// ── Refresh Token ─────────────────────────────────────────────────────────
/**
 * Refreshes an existing API token.
 * Endpoint: GET /MagicInfo/openapi/auth/refresh
 */
export function refreshToken(currentToken) {
  // MagicInfo 9: refresh dùng POST /auth với grantType=refresh_token
  const payload = JSON.stringify({
    grantType: "refresh_token",
    token: currentToken,
  });

  const params = {
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    timeout: config.http.timeout,
    tags: { name: "auth_refresh" },
  };

  const res = http.post(getAuthUrl(), payload, params);

  const success = check(res, {
    "token refresh: status is 200": (r) => r.status === 200,
    "token refresh: has new token": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.token !== undefined;
      } catch {
        return false;
      }
    },
  });

  if (success) {
    tokenRefreshCount.add(1);
    try {
      const body = JSON.parse(res.body);
      return body.token;
    } catch {
      return currentToken;
    }
  }

  return currentToken;
}

// ── Build Authenticated Headers ───────────────────────────────────────────
// MagicInfo 9 uses 'api_key' header (from Swagger securityDefinitions)
export function authHeaders(token) {
  return {
    ...config.http.headers,
    api_key: token,
  };
}
