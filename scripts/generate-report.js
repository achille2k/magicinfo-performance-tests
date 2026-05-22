/**
 * MagicInfo Performance Test - Trình tạo báo cáo HTML (Tiếng Việt)
 * Cách dùng: node scripts/generate-report.js [reports/summary-*.json]
 */

const fs   = require("fs");
const path = require("path");

// ─── Tìm file JSON report mới nhất ───────────────────────────────────────
const reportsDir = path.join(__dirname, "..", "reports");
const args       = process.argv.slice(2);

let jsonFile;
if (args[0]) {
  jsonFile = path.resolve(args[0]);
} else {
  const files = fs
    .readdirSync(reportsDir)
    .filter((f) => f.startsWith("summary-") && f.endsWith(".json"))
    .sort()
    .reverse();
  if (!files.length) {
    console.error("Không tìm thấy file JSON trong reports/. Hãy chạy test trước.");
    process.exit(1);
  }
  jsonFile = path.join(reportsDir, files[0]);
}

console.log("Đang đọc:", jsonFile);
const raw  = fs.readFileSync(jsonFile, "utf8");
const data = JSON.parse(raw);

// ─── Hàm trích xuất metrics ───────────────────────────────────────────────
const m = (name) => data.metrics[name];
const avg   = (name) => (m(name)?.values?.avg        || 0).toFixed(1);
const p95   = (name) => (m(name)?.values?.["p(95)"]  || 0).toFixed(1);
const p99   = (name) => (m(name)?.values?.["p(99)"]  || 0).toFixed(1);
const mx    = (name) => (m(name)?.values?.max        || 0).toFixed(1);
const p90   = (name) => (m(name)?.values?.["p(90)"]  || 0).toFixed(1);
const count = (name) => (m(name)?.values?.count      || 0).toLocaleString("vi-VN");
const rate  = (name) => ((m(name)?.values?.rate      || 0) * 100).toFixed(2);

// ─── Lấy danh sách threshold ──────────────────────────────────────────────
function thresholds() {
  const rows = [];
  for (const [name, metric] of Object.entries(data.metrics)) {
    if (!metric.thresholds) continue;
    for (const [expr, res] of Object.entries(metric.thresholds)) {
      rows.push({ name, expr, ok: res.ok });
    }
  }
  return rows;
}

// ─── Tên kịch bản dịch sang tiếng Việt ───────────────────────────────────
const scenarioMap = {
  smoke:  "Kiểm Tra Nhanh (Smoke)",
  load:   "Kiểm Tra Tải (Load) — 200 Màn Hình",
  stress: "Kiểm Tra Căng Thẳng (Stress)",
  soak:   "Kiểm Tra Bền Vững (Soak)",
};
const scenarioKey  = jsonFile.match(/summary-([^-]+)-/)?.[1] || "load";
const scenarioName = scenarioMap[scenarioKey] || scenarioKey.toUpperCase();
const finishedAt   = new Date().toLocaleString("vi-VN", {
  dateStyle: "full", timeStyle: "medium",
});
const totalReqs  = count("http_reqs");
const totalIters = count("iterations");
const failedRate = rate("http_req_failed");
const avail      = rate("magicinfo_api_availability");
const thresh     = thresholds();
const allPass    = thresh.every((t) => t.ok);

// ─── Dữ liệu biểu đồ ─────────────────────────────────────────────────────
const chartDurations = {
  labels: ["Xác thực", "Heartbeat", "Kiểm tra nội dung", "Đăng ký thiết bị", "HTTP tổng"],
  p50: [
    (m("magicinfo_auth_duration")?.values?.med           || 0).toFixed(1),
    (m("magicinfo_heartbeat_duration")?.values?.med      || 0).toFixed(1),
    (m("magicinfo_content_check_duration")?.values?.med  || 0).toFixed(1),
    (m("magicinfo_device_reg_duration")?.values?.med     || 0).toFixed(1),
    (m("http_req_duration")?.values?.med                 || 0).toFixed(1),
  ],
  p95: [
    p95("magicinfo_auth_duration"),
    p95("magicinfo_heartbeat_duration"),
    p95("magicinfo_content_check_duration"),
    p95("magicinfo_device_reg_duration"),
    p95("http_req_duration"),
  ],
  max: [
    mx("magicinfo_auth_duration"),
    mx("magicinfo_heartbeat_duration"),
    mx("magicinfo_content_check_duration"),
    mx("magicinfo_device_reg_duration"),
    mx("http_req_duration"),
  ],
};

const countersData = {
  labels: ["Xác thực OK", "Xác thực Lỗi", "Heartbeat OK", "Heartbeat Lỗi", "Nội dung OK", "Tải file OK", "Tải file lỗi"],
  values: [
    m("magicinfo_auth_success")?.values?.count             || 0,
    m("magicinfo_auth_fail")?.values?.count                || 0,
    m("magicinfo_heartbeat_success")?.values?.count        || 0,
    m("magicinfo_heartbeat_fail")?.values?.count           || 0,
    m("magicinfo_content_check_success")?.values?.count    || 0,
    m("magicinfo_content_download_success")?.values?.count || 0,
    m("magicinfo_content_download_fail")?.values?.count    || 0,
  ],
};

// ─── Bảng metrics chi tiết ────────────────────────────────────────────────
const metricRows = [
  ["http_req_duration",                    "Thời gian HTTP tổng"],
  ["magicinfo_auth_duration",              "Thời gian Xác thực"],
  ["magicinfo_heartbeat_duration",         "Thời gian Heartbeat"],
  ["magicinfo_schedule_check_duration",    "Thời gian Lấy lịch phát (CMS)"],
  ["magicinfo_content_download_duration",  "Thời gian Tải file nội dung"],
  ["magicinfo_content_check_duration",     "Thời gian Kiểm tra nội dung"],
  ["magicinfo_device_reg_duration",        "Thời gian Đăng ký thiết bị"],
].map(([key, label]) => {
  const vals = data.metrics[key]?.values || {};
  const fmt  = (v) => (v || 0).toFixed(1);
  const cls  = (v) => v < 100 ? "good" : v < 500 ? "" : v < 1000 ? "warn" : "bad";
  return `
    <tr>
      <td>
        <div style="font-weight:600;font-size:13px">${label}</div>
        <div class="metric-name">${key}</div>
      </td>
      <td class="val ${cls(vals.avg||0)}">${fmt(vals.avg)}ms</td>
      <td class="val">${fmt(vals.med)}ms</td>
      <td class="val">${fmt(vals["p(90)"])}ms</td>
      <td class="val ${cls(vals["p(95)"]||0)}">${fmt(vals["p(95)"])}ms</td>
      <td class="val">${fmt(vals["p(99)"])}ms</td>
      <td class="val">${fmt(vals.max)}ms</td>
    </tr>`;
}).join("");

// ─── Thẻ bộ đếm ──────────────────────────────────────────────────────────
const counterCards = [
  ["magicinfo_auth_success",             "Xác thực thành công",        "var(--green)"],
  ["magicinfo_auth_fail",                "Xác thực thất bại",         "var(--red)"],
  ["magicinfo_heartbeat_success",        "Heartbeat thành công",       "var(--accent2)"],
  ["magicinfo_heartbeat_fail",           "Heartbeat thất bại",         "var(--red)"],
  ["magicinfo_content_check_success",    "Lấy lịch nội dung OK",       "var(--accent)"],
  ["magicinfo_content_download_success", "Tải file thành công",        "var(--yellow)"],

  ["magicinfo_device_reg_success",       "Đăng ký thiết bị OK",       "#a78bfa"],
].map(([key, label, color]) => {
  const cnt = count(key);
  if (cnt === 0) return ""; // hide zero count KPI
  return `
    <div class="kpi-card" style="--accent-line:${color}">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value" style="color:${color};font-size:28px">${cnt.toLocaleString("vi-VN")}</div>
    </div>`;
}).filter(Boolean).join("");

// ─── Hàng threshold ───────────────────────────────────────────────────────
const threshNameMap = {
  "http_req_duration":               "Thời gian HTTP",
  "http_req_failed":                 "Tỷ lệ lỗi HTTP",
  "magicinfo_auth_duration":         "Thời gian xác thực",
  "magicinfo_device_reg_duration":   "Thời gian đăng ký thiết bị",
  "magicinfo_heartbeat_duration":    "Thời gian heartbeat",
  "magicinfo_content_check_duration":"Thời gian kiểm tra nội dung",
  "magicinfo_api_availability":      "Tính khả dụng của API",
};

const threshRows = thresh.map((t) => `
  <div class="thresh-row ${t.ok ? "pass" : "fail"}">
    <div class="thresh-icon ${t.ok ? "pass" : "fail"}">${t.ok ? "✓" : "✗"}</div>
    <div class="thresh-info">
      <div class="thresh-name">${threshNameMap[t.name] || t.name}</div>
      <div class="thresh-expr">${t.expr}</div>
    </div>
    <div class="thresh-badge ${t.ok ? "pass" : "fail"}">${t.ok ? "ĐẠT" : "KHÔNG ĐẠT"}</div>
  </div>`).join("");

// ─── HTML template (Tiếng Việt) ───────────────────────────────────────────
const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta name="description" content="Báo cáo kiểm thử hiệu năng MagicInfo Server — ${scenarioName}"/>
<title>Báo cáo Kiểm thử Hiệu năng MagicInfo — ${scenarioName}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"><\/script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0f1117;--surface:#1a1d27;--surface2:#222535;--border:#2d3050;--accent:#6c63ff;--accent2:#00d4aa;--green:#22c55e;--red:#ef4444;--yellow:#f59e0b;--text:#e2e8f0;--muted:#64748b;--radius:12px}
body{font-family:"Inter",sans-serif;background:var(--bg);color:var(--text);min-height:100vh;padding:0 0 60px}

/* Header */
.header{background:linear-gradient(135deg,#1a1d27 0%,#0f1117 50%,#1a1427 100%);border-bottom:1px solid var(--border);padding:40px 48px 36px;position:relative;overflow:hidden}
.header::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 70% 50%,rgba(108,99,255,.15) 0%,transparent 60%),radial-gradient(ellipse at 20% 80%,rgba(0,212,170,.08) 0%,transparent 50%)}
.header-inner{position:relative;max-width:1400px;margin:0 auto}
.badge{display:inline-flex;align-items:center;gap:8px;background:rgba(108,99,255,.15);border:1px solid rgba(108,99,255,.4);border-radius:20px;padding:6px 16px;font-size:12px;font-weight:600;letter-spacing:.06em;color:#a5b4fc;text-transform:uppercase;margin-bottom:16px}
.badge-dot{width:8px;height:8px;border-radius:50%;background:${allPass ? "var(--green)" : "var(--red)"};box-shadow:0 0 8px ${allPass ? "var(--green)" : "var(--red)"};animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
h1{font-size:34px;font-weight:800;letter-spacing:-.02em;margin-bottom:6px;background:linear-gradient(135deg,#fff 0%,#a5b4fc 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.subtitle{color:var(--muted);font-size:14px;line-height:1.8}
.subtitle span{color:var(--text);font-weight:500}
.verdict{display:inline-flex;align-items:center;gap:10px;margin-top:20px;padding:12px 24px;border-radius:var(--radius);font-size:16px;font-weight:700;${allPass ? "background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.4);color:var(--green)" : "background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.4);color:var(--red)"}}

/* Layout */
.container{max-width:1400px;margin:0 auto;padding:36px 48px 0}

/* KPI Cards */
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(195px,1fr));gap:16px;margin-bottom:36px}
.kpi-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:22px 20px;position:relative;overflow:hidden;transition:border-color .2s,transform .2s}
.kpi-card:hover{border-color:var(--accent);transform:translateY(-2px)}
.kpi-card::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:var(--accent-line,var(--accent))}
.kpi-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:10px}
.kpi-value{font-size:34px;font-weight:800;letter-spacing:-.02em;line-height:1;color:var(--kpi-color,var(--text))}
.kpi-unit{font-size:13px;color:var(--muted);margin-top:5px}

/* Sections */
.section-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:18px;padding-bottom:12px;border-bottom:1px solid var(--border)}
.section{margin-bottom:40px}

/* Thresholds */
.thresh-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:10px}
.thresh-row{display:flex;align-items:center;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 16px;transition:border-color .2s}
.thresh-row.pass{border-left:3px solid var(--green)}.thresh-row.fail{border-left:3px solid var(--red)}
.thresh-icon{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0}
.thresh-icon.pass{background:rgba(34,197,94,.15);color:var(--green)}.thresh-icon.fail{background:rgba(239,68,68,.15);color:var(--red)}
.thresh-info{flex:1;min-width:0}
.thresh-name{font-size:13px;font-weight:500;color:var(--text);margin-bottom:2px}
.thresh-expr{font-size:11px;color:var(--muted);font-family:monospace}
.thresh-badge{font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;letter-spacing:.06em;flex-shrink:0}
.thresh-badge.pass{background:rgba(34,197,94,.15);color:var(--green)}.thresh-badge.fail{background:rgba(239,68,68,.15);color:var(--red)}

/* Charts */
.charts-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.chart-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px}
.chart-card h3{font-size:13px;font-weight:600;margin-bottom:20px;color:var(--text)}
.chart-wrap{position:relative;height:270px}

/* Metrics Table */
.metrics-table{width:100%;border-collapse:collapse}
.metrics-table th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:600;padding:10px 16px;background:rgba(255,255,255,.03);border-bottom:1px solid var(--border)}
.metrics-table td{padding:13px 16px;font-size:13px;border-bottom:1px solid rgba(45,48,80,.5)}
.metrics-table tr:last-child td{border-bottom:none}
.metrics-table tr:hover td{background:rgba(255,255,255,.02)}
.metric-name{font-family:monospace;color:var(--accent2);font-size:11px;margin-top:2px}
.val{font-variant-numeric:tabular-nums;font-weight:600}
.good{color:var(--green)}.warn{color:var(--yellow)}.bad{color:var(--red)}

/* Footer */
.footer{text-align:center;color:var(--muted);font-size:12px;padding-top:24px;border-top:1px solid var(--border);margin-top:8px}

@media(max-width:900px){
  .container,.header{padding-left:20px;padding-right:20px}
  .charts-grid{grid-template-columns:1fr}
  .kpi-grid{grid-template-columns:repeat(2,1fr)}
  h1{font-size:26px}
}
</style>
</head>
<body>

<!-- HEADER -->
<div class="header">
  <div class="header-inner">
    <div class="badge"><span class="badge-dot"></span>Kiểm thử Hiệu năng MagicInfo</div>
    <h1>Báo Cáo Kiểm Thử Hiệu Năng</h1>
    <p class="subtitle">
      Kịch bản: <span>${scenarioName}</span><br/>
      Hoàn thành: <span>${finishedAt}</span> &nbsp;·&nbsp;
      Máy chủ: <span>http://localhost:7001</span>
    </p>
    <div class="verdict">
      ${allPass
        ? "✓ TẤT CẢ NGƯỠng ĐẠT — Kiểm thử THÀNH CÔNG"
        : "✗ MỘT SỐ NGƯỠNG KHÔNG ĐẠT — Kiểm thử THẤT BẠI"}
    </div>
  </div>
</div>

<!-- MAIN -->
<div class="container">

  <!-- KPI CARDS -->
  <div class="kpi-grid">
    <div class="kpi-card" style="--accent-line:var(--green);--kpi-color:var(--green)">
      <div class="kpi-label">Tỷ lệ lỗi HTTP</div>
      <div class="kpi-value">${failedRate}%</div>
      <div class="kpi-unit">Ngưỡng &lt; 5%</div>
    </div>
    <div class="kpi-card" style="--accent-line:var(--accent2)">
      <div class="kpi-label">Khả dụng API</div>
      <div class="kpi-value" style="color:var(--accent2)">${avail}%</div>
      <div class="kpi-unit">Ngưỡng &gt; 95%</div>
    </div>
    <div class="kpi-card" style="--accent-line:var(--accent)">
      <div class="kpi-label">Thời gian HTTP p(95)</div>
      <div class="kpi-value">${p95("http_req_duration")}<span style="font-size:15px;color:var(--muted)">ms</span></div>
      <div class="kpi-unit">Ngưỡng &lt; 2.000ms</div>
    </div>
    <div class="kpi-card" style="--accent-line:#f472b6">
      <div class="kpi-label">Xác thực p(95)</div>
      <div class="kpi-value" style="color:#f472b6">${p95("magicinfo_auth_duration")}<span style="font-size:15px;color:var(--muted)">ms</span></div>
      <div class="kpi-unit">Ngưỡng &lt; 1.000ms</div>
    </div>
    <div class="kpi-card" style="--accent-line:var(--yellow)">
      <div class="kpi-label">Heartbeat p(95)</div>
      <div class="kpi-value" style="color:var(--yellow)">${p95("magicinfo_heartbeat_duration")}<span style="font-size:15px;color:var(--muted)">ms</span></div>
      <div class="kpi-unit">Ngưỡng &lt; 2.000ms</div>
    </div>
    <div class="kpi-card" style="--accent-line:var(--muted)">
      <div class="kpi-label">Tổng số yêu cầu</div>
      <div class="kpi-value">${totalReqs}</div>
      <div class="kpi-unit">${totalIters} vòng lặp</div>
    </div>
  </div>

  <!-- THRESHOLD CHECKS -->
  <div class="section">
    <div class="section-title">Kiểm tra Ngưỡng Hiệu năng</div>
    <div class="thresh-grid">${threshRows}</div>
  </div>

  <!-- CHARTS -->
  <div class="section">
    <div class="section-title">Phân tích Thời gian Phản hồi</div>
    <div class="charts-grid">
      <div class="chart-card">
        <h3>Thời gian phản hồi theo loại (ms)</h3>
        <div class="chart-wrap"><canvas id="durChart"></canvas></div>
      </div>
      <div class="chart-card">
        <h3>Phân bố số lượng yêu cầu</h3>
        <div class="chart-wrap"><canvas id="countChart"></canvas></div>
      </div>
    </div>
  </div>

  <!-- METRICS TABLE -->
  <div class="section">
    <div class="section-title">Bảng Chỉ số Chi tiết</div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">
      <table class="metrics-table">
        <thead>
          <tr>
            <th>Chỉ số</th>
            <th>Trung bình</th>
            <th>p(50) — Trung vị</th>
            <th>p(90)</th>
            <th>p(95)</th>
            <th>p(99)</th>
            <th>Tối đa</th>
          </tr>
        </thead>
        <tbody>${metricRows}</tbody>
      </table>
    </div>
  </div>

  <!-- COUNTERS -->
  <div class="section">
    <div class="section-title">Bộ đếm hoạt động</div>
    <div class="kpi-grid">${counterCards}</div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    Được tạo bởi MagicInfo K6 Performance Suite &nbsp;·&nbsp; ${finishedAt}
  </div>

</div>

<script>
// Biểu đồ cột: Thời gian phản hồi
const durCtx = document.getElementById("durChart").getContext("2d");
new Chart(durCtx, {
  type: "bar",
  data: {
    labels: ${JSON.stringify(chartDurations.labels)},
    datasets: [
      { label: "Trung vị p(50)", data: ${JSON.stringify(chartDurations.p50)}, backgroundColor: "rgba(108,99,255,.75)", borderRadius: 6 },
      { label: "p(95)",          data: ${JSON.stringify(chartDurations.p95)}, backgroundColor: "rgba(0,212,170,.75)",  borderRadius: 6 },
      { label: "Tối đa",         data: ${JSON.stringify(chartDurations.max)}, backgroundColor: "rgba(245,158,11,.45)", borderRadius: 6 }
    ]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: "#94a3b8", font: { size: 11 }, padding: 12 } } },
    scales: {
      x: { ticks: { color: "#64748b", font: { size: 10 } }, grid: { color: "rgba(45,48,80,.5)" } },
      y: { ticks: { color: "#64748b", callback: v => v + "ms" }, grid: { color: "rgba(45,48,80,.5)" } }
    }
  }
});

// Biểu đồ tròn: Phân bố yêu cầu
const countCtx = document.getElementById("countChart").getContext("2d");
new Chart(countCtx, {
  type: "doughnut",
  data: {
    labels: ${JSON.stringify(countersData.labels)},
    datasets: [{
      data: ${JSON.stringify(countersData.values)},
      backgroundColor: ["#22c55e","#ef4444","#00d4aa","#f87171","#6c63ff"],
      borderWidth: 2, borderColor: "#1a1d27", hoverOffset: 10
    }]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: "right", labels: { color: "#94a3b8", font: { size: 11 }, padding: 14 } }
    },
    cutout: "62%"
  }
});
<\/script>
</body>
</html>`;

// ─── Ghi file HTML ────────────────────────────────────────────────────────
const outHtml = jsonFile.replace(/\.json$/, ".html");
fs.writeFileSync(outHtml, html, "utf8");
console.log("\n✅ Báo cáo HTML đã tạo:", outHtml);
console.log("   Mở trong trình duyệt: file://" + outHtml.replace(/\\/g, "/"));
