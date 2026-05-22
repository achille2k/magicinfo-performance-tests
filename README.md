# MagicInfo Server - Performance Test Suite

<p align="center">
  <strong>K6 performance testing suite giả lập 200 màn hình kết nối đến Samsung MagicInfo Server</strong>
</p>

---

## 📋 Mô tả

Project này sử dụng [Grafana K6](https://k6.io/) để kiểm thử hiệu năng Samsung MagicInfo Server bằng cách giả lập **200 màn hình** kết nối đồng thời, bao gồm:

- 🔐 **Xác thực** (API token management)
- 📡 **Đăng ký thiết bị** (Device registration/check)
- 💓 **Heartbeat** định kỳ (mỗi 30 giây)
- 📋 **Lấy playlist** được gán cho màn hình (mỗi 5 phút)
- 📥 **Tải metadata nội dung** trong playlist đó (đúng nội dung được trình chiếu)

## 🏗 Cấu trúc Project

```
magicinfo-performance-tests/
├── config/
│   └── config.js              # Cấu hình trung tâm (server URL, credentials, thresholds)
├── lib/
│   ├── auth.js                # Xác thực & quản lý token
│   └── device-api.js          # REST API calls (heartbeat, content check, v.v.)
├── tests/
│   └── scenarios/
│       ├── screen-simulation.js  # 🎯 Kịch bản chính: 200 màn hình
│       ├── auth-test.js          # Kiểm thử endpoint xác thực
│       └── api-test.js           # Kiểm thử REST API endpoints
├── scripts/
│   ├── generate-report.js    # Tạo báo cáo HTML tiếng Việt từ kết quả
│   └── generate-doc.js       # Tạo tài liệu hướng dẫn bàn giao (HTML/Word)
├── docs/                      # Tài liệu hướng dẫn sử dụng
├── reports/                   # Báo cáo HTML/JSON (tự tạo sau khi chạy test)
├── .env                       # Cấu hình credentials (không commit lên git)
└── package.json
```

## ⚙️ Cài đặt

### 1. Cài đặt K6

```powershell
# Windows (Chocolatey)
choco install k6

# Windows (Winget)
winget install k6

# Windows (Scoop)
scoop install k6
```

### 2. Cấu hình môi trường

Chỉnh sửa file `.env`:

```env
MAGICINFO_BASE_URL=http://localhost:7001
MAGICINFO_USERNAME=admin
MAGICINFO_PASSWORD=your_password
```

| Biến | Mô tả | Mặc định |
|------|-------|---------|
| `MAGICINFO_BASE_URL` | URL của MagicInfo Server | `http://localhost:7001` |
| `MAGICINFO_USERNAME` | Tài khoản admin | `admin` |
| `MAGICINFO_PASSWORD` | Mật khẩu | `admin` |
| `VIRTUAL_USERS` | Số màn hình giả lập | `200` |

## 🚀 Chạy Tests

> **Lưu ý PowerShell**: Dùng `"--env=MAGICINFO_PASSWORD=..."` (có ngoặc kép bao ngoài) nếu mật khẩu chứa ký tự đặc biệt như `!`.

### Smoke Test (5 màn hình - kiểm tra nhanh ~2 phút)
```powershell
& "C:\Program Files\k6\k6.exe" run `
  --env ENV=smoke `
  --env MAGICINFO_BASE_URL=http://localhost:7001 `
  --env MAGICINFO_USERNAME=admin `
  "--env=MAGICINFO_PASSWORD=your_password" `
  tests/scenarios/screen-simulation.js
```

### Load Test (200 màn hình - ~7 phút) ✅ Đã xác nhận hoạt động
```powershell
& "C:\Program Files\k6\k6.exe" run `
  --env ENV=load `
  --env MAGICINFO_BASE_URL=http://localhost:7001 `
  --env MAGICINFO_USERNAME=admin `
  "--env=MAGICINFO_PASSWORD=your_password" `
  tests/scenarios/screen-simulation.js
```

### Stress Test (tăng dần đến 250 màn hình)
```powershell
& "C:\Program Files\k6\k6.exe" run `
  --env ENV=stress `
  --env MAGICINFO_BASE_URL=http://localhost:7001 `
  --env MAGICINFO_USERNAME=admin `
  "--env=MAGICINFO_PASSWORD=your_password" `
  tests/scenarios/screen-simulation.js
```

### Soak Test (200 màn hình - 30 phút)
```powershell
& "C:\Program Files\k6\k6.exe" run `
  --env ENV=soak `
  --env MAGICINFO_BASE_URL=http://localhost:7001 `
  --env MAGICINFO_USERNAME=admin `
  "--env=MAGICINFO_PASSWORD=your_password" `
  tests/scenarios/screen-simulation.js
```

### Tạo báo cáo HTML sau khi chạy test
```powershell
# Tự động đọc file JSON mới nhất trong reports/
node scripts/generate-report.js

# Hoặc chỉ định file cụ thể
node scripts/generate-report.js reports/summary-load-2026-05-22T02-34-37.json
```

## 📊 Giải thích các Scenario

### `screen-simulation.js` - Kịch bản chính

Mỗi Virtual User (VU) đại diện cho **1 màn hình**, thực hiện đúng vòng đời của màn hình thực:

```
[Khởi động]
  └─ Xác thực → lấy JWT token   (POST /auth)
  └─ Kiểm tra đăng ký thiết bị  (GET  /rms/devices)

[Vòng lặp hoạt động — lặp lại mỗi ~5 giây]
  ├─ Gửi Heartbeat               (GET /ems/dashboard/devices/status)
  │
  └─ [Mỗi 5 phút] Luồng tải nội dung:
       Bước 1: Lấy danh sách playlist được gán cho màn hình
               (GET /cms/playlists?startIndex=1&pageSize=1)
       Bước 2: Lấy chi tiết playlist → biết content nào cần phát
               (GET /cms/playlists/{playlistId})
       Bước 3: Tải metadata chi tiết của content cần phát
               (GET /cms/contents/{contentId})
```

> **Lưu ý thiết kế**: Mỗi màn hình chỉ tải nội dung trong playlist **được gán cho nó**,
> không tải toàn bộ CMS. Đây là đúng hành vi của màn hình MagicInfo thực tế.
> Các VU được phân tán để không cùng gọi một content, tránh cache bias.

### Các profile test

| Profile | VUs | Thời gian | Mục đích |
|---------|-----|-----------|----------|
| `smoke` | 5 | ~2 phút | Kiểm tra nhanh kết nối |
| `load` | 200 | ~7 phút | Load test chính (mục tiêu) |
| `stress` | 50→250 | ~10 phút | Tìm điểm giới hạn server |
| `soak` | 200 | 30 phút | Kiểm tra rò rỉ tài nguyên |

## 📈 Thresholds (Ngưỡng chấp nhận)

| Metric | Ngưỡng |
|--------|--------|
| HTTP P95 response time | < 2.000ms |
| HTTP P99 response time | < 5.000ms |
| Tỷ lệ lỗi HTTP | < 5% |
| Xác thực P95 | < 1.000ms |
| Đăng ký thiết bị P95 | < 3.000ms |
| Heartbeat P95 | < 2.000ms |
| Tính khả dụng API | > 95% |

## 🔧 Custom Metrics

| Metric | Loại | Mô tả |
|--------|------|-------|
| `magicinfo_auth_success` | Counter | Số lần xác thực thành công |
| `magicinfo_auth_fail` | Counter | Số lần xác thực thất bại |
| `magicinfo_auth_duration` | Trend | Thời gian xác thực (ms) |
| `magicinfo_device_reg_duration` | Trend | Thời gian truy vấn đăng ký thiết bị (ms) |
| `magicinfo_heartbeat_success` | Counter | Số heartbeat thành công |
| `magicinfo_heartbeat_fail` | Counter | Số heartbeat thất bại |
| `magicinfo_heartbeat_duration` | Trend | Thời gian gửi heartbeat (ms) |
| `magicinfo_schedule_check_duration` | Trend | Thời gian lấy playlist + chi tiết (ms) |
| `magicinfo_content_download_success` | Counter | Số lần tải metadata content thành công |
| `magicinfo_content_download_fail` | Counter | Số lần tải metadata content thất bại |
| `magicinfo_content_download_duration` | Trend | Thời gian tải metadata content (ms) |
| `magicinfo_content_check_duration` | Trend | Thời gian toàn bộ chu kỳ kiểm tra nội dung (ms) |
| `magicinfo_api_availability` | Rate | Tỷ lệ API khả dụng (không 5xx/timeout) |

## 📝 MagicInfo API Reference (v2.0)

| Endpoint | Method | Mục đích |
|----------|--------|---------|
| `/MagicInfo/restapi/v2.0/auth` | POST | Đăng nhập, lấy JWT token |
| `/MagicInfo/restapi/v2.0/rms/devices` | GET | Danh sách thiết bị đã đăng ký |
| `/MagicInfo/restapi/v2.0/ems/dashboard/devices/status` | GET | Trạng thái thiết bị (heartbeat) |
| `/MagicInfo/restapi/v2.0/cms/playlists` | GET | Danh sách playlist (lọc theo thiết bị) |
| `/MagicInfo/restapi/v2.0/cms/playlists/{playlistId}` | GET | Chi tiết playlist kèm danh sách content |
| `/MagicInfo/restapi/v2.0/cms/contents/{contentId}` | GET | Metadata chi tiết của nội dung cần phát |

**Auth header**: `api_key: <JWT_token>`

### Luồng tải nội dung chi tiết

```
Màn hình                          MagicInfo Server
   │                                      │
   │── GET /cms/playlists ───────────────>│  "Playlist của tôi là gì?"
   │<─ [{playlistId, playlistName, ...}] ─│
   │                                      │
   │── GET /cms/playlists/{id} ──────────>│  "Playlist này có những content nào?"
   │<─ {contents: [{contentId, ...}]} ───│
   │                                      │
   │── GET /cms/contents/{contentId} ───>│  "Tải metadata content tôi cần phát"
   │<─ {layout, duration, version, ...} ─│
```

## 💡 Lưu ý

- **Port mặc định**: MagicInfo Server dùng port `7001` (HTTP) hoặc `7002` (HTTPS)
- **Staggering**: Script tự động phân tán kết nối để tránh thundering herd
- **Token refresh**: Token được tự động làm mới sau 30 phút
- **Báo cáo**: Mỗi lần chạy tự tạo file JSON/TXT/HTML trong thư mục `reports/`
