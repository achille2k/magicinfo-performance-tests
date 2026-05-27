# MagicInfo Server - Performance Test Suite

<p align="center">
  <strong>K6 performance testing suite giả lập môi trường tải cao phối hợp giữa màn hình thông minh (Smart Screen) và Quản trị viên kết nối đến Samsung MagicInfo Server</strong>
</p>

---

## 📋 Mô tả dự án

Dự án này sử dụng [Grafana K6](https://k6.io/) để kiểm thử hiệu năng toàn diện cho Samsung MagicInfo Server. Suite kiểm thử được thiết kế để giả lập hành vi thực tế ở quy mô lớn, chạy song song hai nhóm đối tượng:
1. **Smart Screens (Màn hình giả lập)**: Kết nối liên tục, gửi trạng thái hoạt động (heartbeat) định kỳ và kiểm tra cập nhật lịch chiếu/nội dung từ CMS.
2. **Administrators (Quản trị viên)**: Đăng nhập hệ thống, giám sát thiết bị, duyệt nội dung và quản lý danh sách phát (playlist) rồi thoát.

Dự án đi kèm các công cụ tự động trích xuất và tạo báo cáo HTML/Tài liệu bàn giao chuyên nghiệp bằng Tiếng Việt.

---

## 🏗 Cấu trúc Project

```text
magicinfo-performance-tests/
├── config/
│   └── config.js              # Cấu hình trung tâm (server URL, credentials, thresholds, profiles)
├── lib/
│   ├── auth.js                # Quản lý xác thực và làm mới token (JWT)
│   └── device-api.js          # Khai báo các REST API tương tác của màn hình và quản trị viên
├── tests/
│   └── scenarios/
│       ├── admin-user-simulation.js # 🎯 Kịch bản hỗn hợp chính (Màn hình + Quản trị viên)
│       ├── auth-test.js             # Kiểm thử tải độc lập cho endpoint xác thực (Auth/Refresh)
│       └── api-test.js              # Kiểm thử hiệu năng độc lập cho các REST API của hệ thống
├── scripts/
│   ├── generate-report.js     # Trình tạo báo cáo HTML giao diện tối (Dark Mode) tiếng Việt cực kỳ chi tiết
│   └── generate-doc.js        # Trình tạo tài liệu hướng dẫn bàn giao tự động (HTML/Word)
├── docs/                      # Thư mục lưu trữ tài liệu hướng dẫn sử dụng kết quả
├── reports/                   # Thư mục chứa các tệp báo cáo JSON/TXT/HTML (được sinh ra sau khi test)
├── .env.example               # Mẫu tệp cấu hình môi trường
├── .env                       # Tệp chứa cấu hình thực tế (được bảo mật, không đưa lên git)
├── package.json               # Các kịch bản chạy nhanh (npm scripts) và thông tin dự án
└── README.md                  # Hướng dẫn sử dụng dự án
```

---

## ⚙️ Cài đặt & Cấu hình

### 1. Cài đặt K6
Để chạy được kịch bản kiểm thử, máy tính của bạn cần cài đặt Grafana K6:

```powershell
# Cài đặt qua Chocolatey (Windows)
choco install k6

# Cài đặt qua Winget (Windows)
winget install k6

# Cài đặt qua Scoop (Windows)
scoop install k6
```
*(Đối với macOS sử dụng `brew install k6`, đối với Linux sử dụng các trình quản lý gói tương ứng)*

### 2. Cấu hình môi trường (`.env`)
Tạo một tệp tin `.env` từ tệp mẫu `.env.example` trong thư mục gốc và cấu hình các thông số phù hợp với máy chủ MagicInfo cần kiểm thử:

```env
# Địa chỉ máy chủ MagicInfo
MAGICINFO_BASE_URL=http://localhost:7001

# Tài khoản quản trị để thực hiện kiểm thử
MAGICINFO_USERNAME=admin
MAGICINFO_PASSWORD=your_secure_password
```

Các tham số cấu hình chính:

| Biến môi trường | Mô tả | Giá trị mặc định |
| :--- | :--- | :--- |
| `MAGICINFO_BASE_URL` | URL cơ sở kết nối tới MagicInfo Server | `http://localhost:7001` |
| `MAGICINFO_USERNAME` | Tên tài khoản thực thi kiểm thử | `admin` |
| `MAGICINFO_PASSWORD` | Mật khẩu tài khoản kiểm thử | `admin` |
| `VIRTUAL_USERS` | Số lượng VUs màn hình (nếu chạy riêng lẻ) | `200` |

---

## 🚀 Chạy Suite Kiểm thử

Dự án cung cấp các lệnh chạy nhanh thông qua `npm scripts` được định nghĩa sẵn trong `package.json`, giúp đơn giản hóa việc thực thi.

### 1. Sử dụng NPM Scripts (Khuyên dùng)
Hãy cài đặt các thư viện Node.js cần thiết trước:
```powershell
npm install
```

Sau đó, thực thi các câu lệnh sau tùy thuộc vào kịch bản mong muốn:

*   **Chạy Smoke Test (Kịch bản kiểm tra nhanh):** Giả lập **200 màn hình** + **5 quản trị viên** song song trong thời gian ngắn (~7 phút).
    ```powershell
    npm run test:smoke
    ```
*   **Chạy Enterprise Test (Kịch bản tải cao quy mô lớn):** Giả lập **1.200 màn hình** + **20 quản trị viên** hoạt động đồng thời (~14 phút).
    ```powershell
    npm run test:enterprise
    ```
*   **Tạo Báo cáo HTML tự động:** Đọc kết quả JSON mới nhất trong thư mục `reports/` để kết xuất trang báo cáo đồ họa chuyên nghiệp.
    ```powershell
    npm run report
    ```
*   **Tạo Tài liệu bàn giao:** Sinh tài liệu hướng dẫn kỹ thuật chi tiết dưới dạng HTML/Word trong thư mục `docs/`.
    ```powershell
    npm run doc
    ```

---

### 2. Sử dụng câu lệnh K6 trực tiếp
Nếu muốn tùy biến nâng cao hoặc chạy các kịch bản kiểm thử độc lập, bạn có thể gọi trực tiếp công cụ `k6`:

> 💡 **Mẹo chạy trên Windows PowerShell**: Nếu mật khẩu tài khoản có các ký tự đặc biệt như `!`, `@`, `#`, hãy sử dụng cú pháp `"--env=MAGICINFO_PASSWORD=your_password"` (bao bọc toàn bộ bằng dấu ngoặc kép) để tránh lỗi cú pháp PowerShell.

#### Chạy kịch bản kiểm thử hỗn hợp (chính)
```powershell
# Chạy ở chế độ Smoke (200 screens + 5 admins)
k6 run --env ENV=smoke --env MAGICINFO_BASE_URL=http://localhost:7001 --env MAGICINFO_USERNAME=admin --env MAGICINFO_PASSWORD="your_password" tests/scenarios/admin-user-simulation.js

# Chạy ở chế độ Enterprise (1,200 screens + 20 admins)
k6 run --env ENV=enterprise --env MAGICINFO_BASE_URL=http://localhost:7001 --env MAGICINFO_USERNAME=admin --env MAGICINFO_PASSWORD="your_password" tests/scenarios/admin-user-simulation.js
```

#### Chạy kiểm thử độc lập hiệu năng Endpoint Xác thực
Dùng để đo lường giới hạn chịu tải riêng của luồng Login & Refresh Token:
```powershell
k6 run --env MAGICINFO_BASE_URL=http://localhost:7001 --env MAGICINFO_USERNAME=admin --env MAGICINFO_PASSWORD="your_password" tests/scenarios/auth-test.js
```

#### Chạy kiểm thử độc lập hiệu năng các REST API
Dùng để kiểm tra khả năng đáp ứng của hệ thống quản lý thiết bị, danh sách phát, nội dung:
```powershell
k6 run --env MAGICINFO_BASE_URL=http://localhost:7001 --env MAGICINFO_USERNAME=admin --env MAGICINFO_PASSWORD="your_password" tests/scenarios/api-test.js
```

---

## 📊 Phân tích Chi tiết Kịch bản Hỗn hợp (`admin-user-simulation.js`)

Kịch bản này là kiểm thử cốt lõi mô phỏng sát nhất với tải thực tế của hệ thống MagicInfo bằng cách thiết lập **2 nhóm Virtual Users (VUs) hoạt động song song**:

```
                                 [ BẮT ĐẦU CHẠY KIỂM THỬ ]
                                             │
                      ┌──────────────────────┴──────────────────────┐
                      ▼                                             ▼
        [ Nhóm 1: Màn hình (Screen VU) ]             [ Nhóm 2: Quản trị viên (Admin VU) ]
                      │                                             │
             (Bắt đầu từ 0 -> Max)                       (Bắt đầu sau màn hình 30s)
                      │                                             │
             ┌────────┴────────┐                          ┌─────────┴─────────┐
             ▼                 ▼                          ▼                   ▼
       [ Đăng nhập ]     [ Refresh Token ]          [ Đăng nhập ]       [ Đăng nhập lỗi ]
             │           (Mỗi 30 phút)                    │             (Dừng kịch bản)
             ▼                                            ▼
      [ Vòng lặp chính ]                          [ Duyệt danh sách thiết bị ]
      (Mỗi ~5 - 7 giây)                                   │
             │                                            ▼
             ├─ Gửi Heartbeat                     [ Xem Dashboard trạng thái ]
             │  (POST /ems/...status)                     │
             │                                            ▼
             └─ [Mỗi 5 chu kỳ]                    [ Duyệt kho nội dung (CMS) ]
                Kiểm tra cập nhật nội dung                │
                └─ Lấy danh sách playlist                 ▼
                └─ Lấy chi tiết playlist          [ Duyệt danh sách Playlist ]
                └─ Tải metadata nội dung                  │
                                                          ▼
                                                   [ THOÁT PHIÊN LÀM VIỆC ]
                                                (Mỗi Admin chạy duy nhất 1 lần)
```

### Các thông số cấu hình của 2 chế độ (`ENV`):

| Chế độ (`ENV`) | Số màn hình | Số admin | Thời gian tăng tải (Ramp-up) | Thời gian duy trì (Sustain) | Tổng thời gian ước tính |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **`smoke`** | `200 VUs` | `5 VUs` | `1 phút` | `5 phút` | ~ 7 phút |
| **`enterprise`** | `1,200 VUs` | `20 VUs` | `3 phút` | `10 phút` | ~ 14 phút |

*   **Tính năng Tránh nghẽn đột ngột (Staggering)**: Dự án tự động phân tán thời gian gửi truy vấn bằng thuật toán `sleep` ngẫu nhiên để tránh hiện tượng dồn nén lưu lượng đồng thời không thực tế (thundering herd).
*   **Quản lý vòng đời**: Các màn hình chạy liên tục lặp lại suốt phiên test, trong khi mỗi admin chỉ thực hiện đúng 1 quy trình làm việc từ đăng nhập đến duyệt tài nguyên và thoát hoàn toàn để giả lập hành vi người dùng thật.

---

## 📈 Chỉ số Đo lường & Ngưỡng chấp nhận (Thresholds)

Hệ thống tự động chấm điểm Đạt (PASS) hay Không Đạt (FAIL) dựa trên các ràng buộc nghiêm ngặt về SLA sau:

### Ngưỡng hiệu năng chung
*   **`http_req_failed`**: Tỷ lệ request lỗi < 5% (`rate < 0.05`).
*   **`http_req_duration`**: Thời gian phản hồi trung bình 95% số request < 3.000ms (`p(95) < 3000`) và 99% số request < 8.000ms (`p(99) < 8000`).
*   **`magicinfo_api_availability`**: Tỷ lệ khả dụng của API hệ thống > 95% (`rate > 0.95`).

### Chỉ số riêng của Màn hình giả lập
*   **Xác thực (`magicinfo_auth_duration`)**: p(95) < 1.000ms.
*   **Heartbeat (`magicinfo_heartbeat_duration`)**: p(95) < 2.000ms.
*   **Kiểm tra nội dung (`magicinfo_content_check_duration`)**: p(95) < 3.000ms.
*   **Tải danh mục phát (`magicinfo_schedule_check_duration`)**: p(95) < 3.000ms.
*   **Tải thông tin tệp tin (`magicinfo_content_download_duration`)**: p(95) < 10.000ms.

### Chỉ số riêng của Quản trị viên
*   **Đăng nhập admin (`admin_login_duration`)**: p(95) < 2.000ms.
*   **Xem danh sách thiết bị (`admin_device_list_duration`)**: p(95) < 2.000ms.
*   **Xem Dashboard (`admin_dashboard_duration`)**: p(95) < 2.000ms.
*   **Xem danh sách nội dung (`admin_content_list_duration`)**: p(95) < 3.000ms.
*   **Xem danh sách playlist (`admin_playlist_duration`)**: p(95) < 3.000ms.

---

## 🔧 Danh sách Custom Metrics thu thập

Dự án phân tách rõ ràng và thu thập một loạt chỉ số hiệu năng cụ thể để đưa vào báo cáo cuối cùng:

### 🖥️ Chỉ số Màn hình giả lập (Screens)
*   `magicinfo_auth_success` / `magicinfo_auth_fail` (Counter): Số phiên đăng nhập màn hình thành công / thất bại.
*   `magicinfo_auth_duration` (Trend): Thời gian xử lý yêu cầu đăng nhập màn hình.
*   `magicinfo_heartbeat_success` / `magicinfo_heartbeat_fail` (Counter): Số lượng gửi trạng thái màn hình thành công / thất bại.
*   `magicinfo_heartbeat_duration` (Trend): Thời gian gửi heartbeat.
*   `magicinfo_schedule_check_duration` (Trend): Thời gian truy vấn lịch phát và playlist được phân bổ.
*   `magicinfo_content_download_success` / `magicinfo_content_download_fail` (Counter): Thống kê tải siêu dữ liệu nội dung.
*   `magicinfo_content_download_duration` (Trend): Thời gian tải siêu dữ liệu nội dung cần chiếu.
*   `magicinfo_content_check_duration` (Trend): Tổng thời gian của cả chu trình kiểm tra/cập nhật thông tin trình chiếu.

### 👤 Chỉ số Quản trị viên (Admins)
*   `admin_login_success` / `admin_login_fail` (Counter): Thống kê kết quả đăng nhập admin.
*   `admin_login_duration` (Trend): Thời gian phản hồi đăng nhập của admin.
*   `admin_device_list_duration` (Trend): Thời gian tải trang danh sách thiết bị.
*   `admin_dashboard_duration` (Trend): Thời gian phản hồi dữ liệu tổng quan thiết bị trên Dashboard.
*   `admin_content_list_duration` (Trend): Thời gian tải kho quản lý nội dung.
*   `admin_playlist_duration` (Trend): Thời gian phản hồi của danh sách phát.
*   `admin_page_success` / `admin_page_fail` (Counter): Tổng số lượng tác vụ trang quản trị thành công / thất bại.

---

## 📈 Xuất Báo cáo & Lưu trữ kết quả

Mỗi lần chạy thành công, kịch bản kiểm thử sẽ tự động tạo ra ba tệp tin lưu trong thư mục `reports/`:
1.  **Tệp JSON (`summary-{env}-{timestamp}.json`)**: Chứa toàn bộ dữ liệu chỉ số thô được xuất từ k6.
2.  **Tệp Văn bản (`summary-{env}-{timestamp}.txt`)**: Tóm tắt nhanh kết quả, so khớp ngưỡng chấp nhận hiển thị ngay tại terminal.
3.  **Tệp HTML Báo cáo đồ họa (`summary-{env}-{timestamp}.html`)**: Được tạo ra khi chạy lệnh `npm run report`. Tệp này tích hợp sẵn Chart.js tạo biểu đồ trực quan, hỗ trợ giao diện tối hiện đại, hiển thị trực quan tỷ lệ Đạt/Không Đạt của các SLA, phân bố số lượng request và biểu đồ xu hướng thời gian phản hồi. Báo cáo HTML sẽ **tự động mở trên trình duyệt mặc định** của bạn ngay khi tạo xong.
