let chart; // single chart reference
const LOW_SAMPLE_THRESHOLD = 5;
const DEFAULT_CI_ALPHA = 0.18;
const LINE_TENSION = 0.2;

function isCiDataset(ds) {
  return ds.label.includes("CI band") || ds.label.includes("upper CI");
}

function setCiAlpha(alpha) {
  if (!chart) return;

  chart.data.datasets.forEach((ds) => {
    if (!isCiDataset(ds)) return;

    if (ds.label.includes("CI band")) {
      const bg = ds.backgroundColor;

      if (typeof bg === "string" && bg.startsWith("rgba(")) {
        ds.backgroundColor = bg.replace(
          /rgba\((\s*\d+\s*,\s*\d+\s*,\s*\d+\s*),\s*([0-9.]+)\s*\)/,
          `rgba($1, ${alpha})`,
        );
      } else if (typeof bg === "string" && bg.startsWith("rgb(")) {
        ds.backgroundColor = bg
          .replace("rgb(", "rgba(")
          .replace(")", `, ${alpha})`);
      }
    }

    ds.borderColor = "transparent"; // keep CI datasets invisible lines
  });
}

function animateCi(show, durationMs = 250) {
  if (!chart) return;

  const band = chart.data.datasets.find((ds) => ds.label.includes("CI band"));

  let startAlpha = show ? 0 : DEFAULT_CI_ALPHA;
  if (
    band &&
    typeof band.backgroundColor === "string" &&
    band.backgroundColor.startsWith("rgba(")
  ) {
    const m = band.backgroundColor.match(
      /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)/,
    );
    if (m) startAlpha = Number(m[1]);
  }

  const endAlpha = show ? DEFAULT_CI_ALPHA : 0;
  const start = performance.now();

  function tick(now) {
    const t = Math.min((now - start) / durationMs, 1);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const alpha = startAlpha + (endAlpha - startAlpha) * eased;

    chart.data.datasets.forEach((ds) => {
      if (isCiDataset(ds)) ds.hidden = false;
    });
    setCiAlpha(alpha);

    if (t === 1) {
      chart.data.datasets.forEach((ds) => {
        if (isCiDataset(ds)) ds.hidden = !show;
      });
    }

    chart.update("none");
    if (t < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

function getValidatedGroup() {
  const groupInput = document.getElementById("group");
  const groupList = document.getElementById("groupOptions");

  const group = groupInput?.value?.trim() || "";
  const validGroups = groupList
    ? Array.from(groupList.options).map((o) => o.value)
    : [];

  return validGroups.includes(group) ? group : "";
}

function getBestMatchingGroup(query) {
  const value = (query || "").trim().toLowerCase();
  const groupList = document.getElementById("groupOptions");

  if (!value || !groupList) return "";

  const options = Array.from(groupList.options).map((o) => o.value);

  // Exact match first
  const exact = options.find((opt) => opt.toLowerCase() === value);
  if (exact) return exact;

  // Starts-with match next
  const startsWith = options.find((opt) => opt.toLowerCase().startsWith(value));
  if (startsWith) return startsWith;

  // Includes match last
  const includes = options.find((opt) => opt.toLowerCase().includes(value));
  return includes || "";
}

function populateGroupOptions(groups) {
  const list = document.getElementById("groupOptions");
  if (!list) return;

  list.innerHTML = "";

  groups.forEach((g) => {
    const opt = document.createElement("option");
    opt.value = g;
    list.appendChild(opt);
  });
}

function applyBestGroupMatchAndRender(groupInput) {
  const raw = groupInput.value.trim();
  const best = getBestMatchingGroup(raw);

  if (best) {
    groupInput.value = best;
  } else if (raw !== "") {
    groupInput.value = "";
  }

  render().catch(console.error);
}

function previewBestGroupMatch(groupInput) {
  const raw = groupInput.value.trim();
  if (!raw) return;

  const best = getBestMatchingGroup(raw);
  if (!best) return;

  // Only preview when the user typed a partial match
  if (best.toLowerCase() !== raw.toLowerCase()) {
    groupInput.value = best;
    groupInput.setSelectionRange(raw.length, best.length);
  }
}

function buildUrl() {
  const from = document.getElementById("from").value;
  const to = document.getElementById("to").value;
  const bucket = document.getElementById("bucket").value;

  const z = String(Number(document.getElementById("confidence").value || 1.96));
  const params = new URLSearchParams({ bucket, from, to, format: "series", z });
  const gender = document.getElementById("gender")?.value || "all";
  params.set("gender", gender);

  const group = getValidatedGroup();

  if (group) {
    params.set("group", group);
  } else {
    params.delete("group");
  }

  return `/api/stats/gender-party/over-time?${params.toString()}`;
}

async function loadSeries() {
  const url = buildUrl();
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Request failed (${res.status}): ${txt}`);
  }

  const payload = await res.json();

  return payload;
}

function hashString(str) {
  // simple stable hash
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function colorForLabel(label) {
  // Use HSL so colours are nicely spaced and readable
  const h = hashString(label) % 360; // hue 0-359
  const s = 70; // saturation
  const l = 45; // lightness
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  // s/l in [0..100]
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function rgbaForLabel(label, alpha = 1) {
  const { h, s, l } = colorForLabel(label);
  const { r, g, b } = hslToRgb(h, s, l);
  return {
    rgb: `rgb(${r}, ${g}, ${b})`,
    rgba: `rgba(${r}, ${g}, ${b}, ${alpha})`,
  };
}

function buildDatasets(seriesArr) {
  const datasets = [];

  (seriesArr || [])
    .filter((series) => series && Array.isArray(series.data))
    .forEach((series) => {
      const { rgb, rgba } = rgbaForLabel(series.label, DEFAULT_CI_ALPHA);

      const cleanPoints = series.data.filter((p) => p && p.x != null);

      // 1) upper CI (invisible line)
      datasets.push({
        label: `${series.label} (upper CI)`,
        data: cleanPoints.map((p) => ({
          x: p.x,
          y: p.high,
        })),
        borderColor: "transparent",
        backgroundColor: "transparent",
        borderWidth: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
        hitRadius: 0,
        tension: LINE_TENSION,
        spanGaps: true,
      });

      // 2) lower CI band (fills to previous dataset)
      datasets.push({
        label: `${series.label} (CI band)`,
        data: cleanPoints.map((p) => ({
          x: p.x,
          y: p.low,
        })),
        fill: "-1",
        backgroundColor: rgba,
        borderColor: "transparent",
        borderWidth: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
        hitRadius: 0,
        tension: LINE_TENSION,
        spanGaps: true,
      });

      // 3) main raw line
      datasets.push({
        label: series.label,
        data: cleanPoints.map((p) => ({
          x: p.x,
          y: p.y,
          n: p.n,
          low: p.low,
          high: p.high,
        })),
        borderColor: rgb,
        backgroundColor: rgb,
        tension: 0,
        spanGaps: true,
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 7,
      });

      // 4) smoothed trend overlay
      const smoothedPoints = movingAveragePoints(
        cleanPoints.map((p) => ({
          x: p.x,
          y: p.y,
        })),
        5,
      );

      datasets.push({
        label: `${series.label} (trend)`,
        data: smoothedPoints,
        borderColor: rgb,
        backgroundColor: "transparent",
        tension: 0.4,
        spanGaps: true,
        borderWidth: 3,
        pointRadius: 0,
        pointHoverRadius: 0,
        borderDash: [6, 4],
      });
    });

  return datasets;
}

function baseLabel(label) {
  return label
    .replace(/\s*\(upper CI\)\s*$/i, "")
    .replace(/\s*\(CI band\)\s*$/i, "")
    .trim();
}

function isMainLineDataset(ds) {
  return !ds.label.includes("(upper CI)") && !ds.label.includes("(CI band)");
}

function setGroupHidden(chart, clickedLabel, hidden) {
  const base = baseLabel(clickedLabel);

  chart.data.datasets.forEach((ds) => {
    if (baseLabel(ds.label) !== base) return;
    ds.hidden = hidden;

    // If hiding the group, hide all.
    // If showing the group, keep CI visibility controlled by your checkbox:
    if (!hidden) {
      if (isCiDataset(ds)) {
        ds.hidden = !document.getElementById("toggle-ci").checked;
      }
    }
  });
}

// ---- Chart loading overlay (register ONCE) ----
const loadingOverlayPlugin = {
  id: "loadingOverlay",
  beforeDraw(chart, _args, opts) {
    if (!chart.$loading) return;

    const { ctx, chartArea } = chart;
    if (!chartArea) return;

    const {
      text = "Loading…",
      font = "14px system-ui, -apple-system, Segoe UI, Roboto, Arial",
      backdrop = "rgba(255,255,255,0.65)",
    } = opts || {};

    const { left, top, right, bottom } = chartArea;

    ctx.save();
    // backdrop
    ctx.fillStyle = backdrop;
    ctx.fillRect(left, top, right - left, bottom - top);

    // text
    ctx.fillStyle = "#111";
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, (left + right) / 2, (top + bottom) / 2);
    ctx.restore();
  },
};

Chart.register(loadingOverlayPlugin);

function setChartLoading(on) {
  if (!chart) return;
  chart.$loading = !!on;
  chart.update("none");
}

function ensureChart() {
  if (chart) return;

  const canvas = document.getElementById("chart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  chart = new Chart(ctx, {
    type: "line",
    data: { datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      layout: { padding: { top: 12, bottom: 12 } },
      animation: { duration: 400, easing: "easeOutQuart" },
      transitions: { active: { animation: { duration: 0 } } },

      scales: {
        x: {
          type: "linear",
          title: {
            display: true,
            text: "Year",
          },
        },
        y: {
          min: 0,
          max: 100,
          title: {
            display: true,
            text: "Guilty rate (%)",
          },
        },
      },

      plugins: {
        // 🔥 this is where your title/legend/tooltip live
        title: { display: true, text: "Loading…" },

        legend: {
          labels: {
            filter: (item) => {
              const t = item.text || "";
              return (
                !t.includes("(upper CI)") &&
                !t.includes("(CI band)") &&
                !t.includes("(trend)")
              );
            },
          },
        },

        tooltip: {
          callbacks: {
            title: (ctx) => {
              const year = ctx[0]?.parsed?.x;
              return `Year: ${year}`;
            },

            label: (ctx) => {
              const dsLabel = ctx.dataset?.label || "";

              // Hide CI helper datasets
              if (dsLabel.includes("CI")) return null;

              const raw = ctx.raw || {};

              const rate = raw.y != null ? Number(raw.y).toFixed(1) : null;
              const n = raw.n;
              const low = raw.low;
              const high = raw.high;

              const lines = [];

              // Group name (Male / Female)
              if (dsLabel) {
                const group = dsLabel.split("-")[0].trim();
                lines.push(`${group} defendants`);
              }

              if (rate !== null) {
                lines.push(`Conviction rate: ${rate}%`);
              }

              if (low != null && high != null) {
                lines.push(`95% CI: ${low}–${high}`);
              }

              if (n != null) {
                lines.push(`n = ${n} trials`);
              }

              return lines;
            },
          },
        },

        // 👇 plugin options live under its id
        loadingOverlay: {
          text: "Loading…",
          backdrop: "rgba(255,255,255,0.55)",
        },
      },
    },
  });

  setChartLoading(true); // starts in loading state
}

function getGenderLabel() {
  const val = document.getElementById("gender")?.value || "all";

  if (val === "male") return "Male Defendants";
  if (val === "female") return "Female Defendants";
  return "All Defendants";
}

function readUrlState() {
  const p = new URLSearchParams(location.search);

  const state = {
    from: p.get("from"),
    to: p.get("to"),
    group: p.get("group"),
    bucket: p.get("bucket"),
    confidence: p.get("confidence"),
    ci: p.get("ci"), // "1" or "0"
    gender: p.get("gender"),

    lat: p.get("lat"),
    lng: p.get("lng"),
    radius: p.get("radius"),
    limit: p.get("limit"),

    nearby: p.get("nearby"), // "1" to auto-run
  };

  return state;
}

function writeUrlState({ push = false } = {}) {
  const p = new URLSearchParams(location.search);

  // Read current UI values safely
  const fromEl = document.getElementById("from");
  const toEl = document.getElementById("to");
  const groupEl = document.getElementById("group");
  const bucketEl = document.getElementById("bucket");
  const confEl = document.getElementById("confidence");
  const ciEl = document.getElementById("toggle-ci");
  const genderEl = document.getElementById("gender");

  const radiusEl = document.getElementById("radius");
  const limitEl = document.getElementById("nearby-limit");

  // Chart params
  if (fromEl?.value) p.set("from", fromEl.value);
  else p.delete("from");
  if (toEl?.value) p.set("to", toEl.value);
  else p.delete("to");
  const groupVal = groupEl?.value?.trim() || "";
  const validGroups = Array.from(
    document.getElementById("groupOptions")?.options || [],
  ).map((o) => o.value);

  if (groupVal && validGroups.includes(groupVal)) {
    p.set("group", groupVal);
  } else {
    p.delete("group");
  }
  if (bucketEl?.value) p.set("bucket", bucketEl.value);
  else p.delete("bucket");
  if (confEl?.value) p.set("confidence", confEl.value);
  else p.delete("confidence");
  if (genderEl?.value) p.set("gender", genderEl.value);
  else p.delete("gender");
  if (ciEl) p.set("ci", ciEl.checked ? "1" : "0");

  // Map params
  if (Number.isFinite(currentCenter?.lat))
    p.set("lat", String(currentCenter.lat));
  if (Number.isFinite(currentCenter?.lng))
    p.set("lng", String(currentCenter.lng));
  if (radiusEl?.value) p.set("radius", String(radiusEl.value));
  if (limitEl?.value) p.set("limit", String(limitEl.value));

  const qs = p.toString();
  const url = qs ? `?${qs}` : location.pathname;

  if (push) history.pushState(null, "", url);
  else history.replaceState(null, "", url);
}

function applyStateToUI(state) {
  // Chart controls
  const fromEl = document.getElementById("from");
  const toEl = document.getElementById("to");
  const groupEl = document.getElementById("group");
  const bucketEl = document.getElementById("bucket");
  const confEl = document.getElementById("confidence");
  const ciEl = document.getElementById("toggle-ci");
  const genderEl = document.getElementById("gender");

  if (fromEl && state.from) fromEl.value = state.from;
  if (toEl && state.to) toEl.value = state.to;
  if (groupEl && state.group) groupEl.value = state.group;
  if (bucketEl && state.bucket) bucketEl.value = state.bucket;
  if (confEl && state.confidence) confEl.value = state.confidence;
  if (genderEl && state.gender) genderEl.value = state.gender;

  if (ciEl && (state.ci === "0" || state.ci === "1")) {
    ciEl.checked = state.ci === "1";
  }

  // Map controls
  const radiusEl = document.getElementById("radius");
  const limitEl = document.getElementById("nearby-limit");

  if (radiusEl && state.radius) radiusEl.value = state.radius;
  if (limitEl && state.limit) limitEl.value = state.limit;

  // Center
  const lat = state.lat != null ? Number(state.lat) : null;
  const lng = state.lng != null ? Number(state.lng) : null;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    currentCenter = { lat, lng };
  }
}

const groupInput = document.getElementById("group");

if (groupInput) {
  const best = getBestMatchingGroup(groupInput.value.trim());

  if (best) {
    groupInput.value = best;
  } else if (groupInput.value.trim() !== "") {
    groupInput.value = "";
  }
}

let _urlSyncTimer = null;
function scheduleUrlSync({ push = false } = {}) {
  if (_urlSyncTimer) clearTimeout(_urlSyncTimer);
  _urlSyncTimer = setTimeout(() => writeUrlState({ push }), 120);
}

function writeUrlState() {
  const params = new URLSearchParams();

  const from = document.getElementById("from")?.value?.trim() || "";
  const to = document.getElementById("to")?.value?.trim() || "";
  const bucket = document.getElementById("bucket")?.value || "";
  const gender = document.getElementById("gender")?.value || "all";
  const confidence = document.getElementById("confidence")?.value || "";
  const group = getValidatedGroup();

  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (bucket) params.set("bucket", bucket);
  if (gender && gender !== "all") params.set("gender", gender);
  if (confidence) params.set("confidence", confidence);
  if (group) params.set("group", group);

  const lat = currentCenter?.lat;
  const lng = currentCenter?.lng;
  const radius = document.getElementById("radius")?.value || "";
  const limit = document.getElementById("nearby-limit")?.value || "";

  if (lat != null) params.set("lat", String(lat));
  if (lng != null) params.set("lng", String(lng));
  if (radius) params.set("radius", radius);
  if (limit) params.set("limit", limit);

  const ciToggle = document.getElementById("toggle-ci");
  if (ciToggle) params.set("ci", ciToggle.checked ? "1" : "0");

  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", newUrl);
}

function updateSampleWarning(seriesArr) {
  const el = document.getElementById("sampleWarning");
  if (!el) return;

  let lowSampleFound = false;
  let smallestN = Infinity;

  seriesArr.forEach((series) => {
    (series.data || []).forEach((p) => {
      if (p.n != null && p.n < LOW_SAMPLE_THRESHOLD) {
        lowSampleFound = true;
        if (p.n < smallestN) smallestN = p.n;
      }
    });
  });

  if (!lowSampleFound) {
    el.hidden = true;
    el.textContent = "";
    return;
  }

  el.hidden = false;
  el.textContent = `This view includes years with very small sample sizes (minimum n = ${smallestN}). Confidence intervals and trend values in these periods should be interpreted cautiously.`;
}

async function loadGroupOptions() {
  const res = await fetch("/api/offence-groups");

  if (!res.ok) {
    throw new Error("Failed to load offence groups");
  }

  const groups = await res.json();
  populateGroupOptions(groups);
}

function showNoDataOverlay(show) {
  const el = document.getElementById("chart-no-data");
  if (!el) return;

  if (show) {
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}

function movingAveragePoints(points, windowSize = 3) {
  const clean = (points || []).filter(
    (p) => p && typeof p.x === "number" && typeof p.y === "number",
  );

  if (clean.length === 0) return [];

  const half = Math.floor(windowSize / 2);

  return clean.map((point, index) => {
    const start = Math.max(0, index - half);
    const end = Math.min(clean.length - 1, index + half);

    const slice = clean.slice(start, end + 1);
    const avgY = slice.reduce((sum, p) => sum + p.y, 0) / slice.length;

    return {
      x: point.x,
      y: avgY,
    };
  });
}

function generateInsight(seriesArr) {
  const points = (seriesArr || [])
    .flatMap((s) => s.data || [])
    .filter((p) => p && typeof p.y === "number" && typeof p.x !== "undefined");

  if (!points.length) {
    return "No data available for the selected filters.";
  }

  const values = points.map((p) => p.y);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  const minPoint = points.reduce((a, b) => (a.y < b.y ? a : b));
  const maxPoint = points.reduce((a, b) => (a.y > b.y ? a : b));

  const first = points[0].y;
  const last = points[points.length - 1].y;

  let trend = "stable";
  if (last > first + 2) trend = "increasing";
  else if (last < first - 2) trend = "decreasing";

  const ns = points
    .map((p) => p.n)
    .filter((n) => typeof n === "number" && !Number.isNaN(n));

  const minN = ns.length ? Math.min(...ns) : null;

  let confidenceLabel = "Confidence level: unavailable.";
  let warning = "";

  if (minN !== null) {
    if (minN < 5) {
      confidenceLabel = `Confidence level: low (minimum n = ${minN}).`;
      warning =
        " Caution: these results include very small sample sizes, so individual years should be interpreted carefully.";
    } else if (minN < 20) {
      confidenceLabel = `Confidence level: moderate (minimum n = ${minN}).`;
      warning =
        " These results should be interpreted with some caution, as sample sizes remain limited in at least some years.";
    } else {
      confidenceLabel = `Confidence level: stronger (minimum n = ${minN}).`;
    }
  }

  return `
Interpretive summary:

Across the selected period, the average conviction rate is ${avg.toFixed(1)}%.

The highest observed rate is ${maxPoint.y.toFixed(1)}% in ${maxPoint.x}, and the lowest observed rate is ${minPoint.y.toFixed(1)}% in ${minPoint.x}.

Taken as a whole, the pattern appears ${trend}.

${confidenceLabel}${warning}
`;
}

async function render() {
  ensureChart();

  showNoDataOverlay(false);
  setChartLoading(true);

  try {
    const payload = await loadSeries();
    const noData = !payload?.series || payload.series.length === 0;
    showNoDataOverlay(noData);

    if (noData) {
      chart.data.datasets = [];
      chart.update();

      const insightEl = document.getElementById("insight-text");
      if (insightEl) {
        insightEl.textContent = "No data available for the selected filters.";
        insightEl.style.borderLeft = "4px solid #d63333";
        insightEl.style.borderRadius = "4px";
      }

      return;
    }

    updateSampleWarning(payload.series);
    const bucket = document.getElementById("bucket").value;

    chart.data.datasets = buildDatasets(payload.series);

    const insightEl = document.getElementById("insight-text");
    if (insightEl) {
      const text = generateInsight(payload.series);
      insightEl.textContent = text;

      const points = (payload.series || [])
        .flatMap((s) => s.data || [])
        .filter((p) => p && typeof p.n === "number");

      const minN = points.length ? Math.min(...points.map((p) => p.n)) : null;

      if (minN !== null && minN < 5) {
        insightEl.style.borderLeft = "4px solid #d63333"; // red
      } else if (minN !== null && minN < 20) {
        insightEl.style.borderLeft = "4px solid #fd7e14"; // amber
      } else {
        insightEl.style.borderLeft = "4px solid #198754"; // green
      }

      insightEl.style.borderRadius = "4px";
    }

    const showCi = document.getElementById("toggle-ci").checked;

    if (!showCi) {
      chart.data.datasets.forEach((ds) => {
        if (isCiDataset(ds)) ds.hidden = true;
      });
      setCiAlpha(0);
    } else {
      chart.data.datasets.forEach((ds) => {
        if (isCiDataset(ds)) ds.hidden = false;
      });
      setCiAlpha(DEFAULT_CI_ALPHA);
    }

    chart.options.scales.x.title.text = bucket === "decade" ? "Decade" : "Year";

    const groupLabel = getValidatedGroup() || "All offences";
    const genderLabel =
      document.getElementById("gender")?.selectedOptions?.[0]?.text ||
      "All Defendants";

    chart.options.plugins.title.text = `${groupLabel} — Conviction Rate Over Time (${genderLabel})`;

    chart.update();
    writeUrlState();
  } finally {
    setChartLoading(false);
  }
}

function updateSampleWarning(seriesArr) {
  const el = document.getElementById("sample-warning");
  if (!el) return;

  const points = (seriesArr || [])
    .filter((series) => series && Array.isArray(series.data))
    .flatMap((series) => series.data)
    .filter((p) => p && typeof p.n === "number");

  if (points.length === 0) {
    el.textContent = "";
    el.style.display = "none";
    return;
  }

  const minN = Math.min(...points.map((p) => p.n));
  const show = minN < LOW_SAMPLE_THRESHOLD;

  if (show) {
    el.textContent = `This view includes years with very small sample sizes (minimum n = ${minN}). Confidence intervals and trend values in these periods should be interpreted cautiously.`;
    el.style.display = "";
  } else {
    el.textContent = "";
    el.style.display = "none";
  }
}

// --------------------
// Leaflet: Nearby crimes
// --------------------

// Default: central London (your earlier example)
let map;
let markersLayer; // shared variable
let centerMarker;
let radiusCircle; // shows the search radius
let markerById = new Map();
let baseTiles;
let mapHandlersBound = false; // ✅ ADD THIS
let popupFadeTimer = null;

if (!window.__nearbyUI) {
  window.__nearbyUI = {
    pinnedMarker: null,
    pinnedId: null,
    activeMarker: null,
    activeListBtn: null,
    markerById: new Map(), // optional place to store it
    btnById: new Map(), // optional map: id -> button
  };
}

function safePanToMarker(marker, zoomToShow = true) {
  if (!marker || typeof marker.getLatLng !== "function") return;

  const ll = marker.getLatLng();
  if (!ll) return;

  const doPan = () => {
    // pan without forcing a new zoom / without Leaflet auto-pan fighting popups
    map.panTo(ll, { animate: true });
  };

  if (
    zoomToShow &&
    markersLayer &&
    typeof markersLayer.zoomToShowLayer === "function"
  ) {
    markersLayer.zoomToShowLayer(marker, doPan);
  } else {
    doPan();
  }
}

function setActive(marker, btn) {
  const ui = window.__nearbyUI;

  // close previous active marker popup if switching
  if (ui.activeMarker && ui.activeMarker !== marker) {
    ui.activeMarker.closePopup?.();
  }

  // remove previous button highlight if switching
  if (ui.activeListBtn && ui.activeListBtn !== btn) {
    ui.activeListBtn.classList.remove("is-active");
  }

  ui.activeMarker = marker || null;
  ui.activeListBtn = btn || null;

  if (ui.activeListBtn) ui.activeListBtn.classList.add("is-active");
}

function pinMarker(marker) {
  const ui = window.__nearbyUI;
  ui.pinnedMarker = marker || null;
}

function setHover(marker) {
  if (hoverMarker && hoverMarker !== marker && hoverMarker !== activeMarker) {
    hoverMarker.closePopup?.();
  }
  hoverMarker = marker || null;

  if (hoverMarker && hoverMarker !== activeMarker) {
    hoverMarker.openPopup?.();
  }
}

function clearHover() {
  if (hoverMarker && hoverMarker !== activeMarker) {
    hoverMarker.closePopup?.();
  }
  hoverMarker = null;
}

// --- Marker hover/highlight helpers ---
const markerState = new WeakMap();

function setMarkerHighlight(marker, on) {
  if (!marker) return;

  // store defaults once
  if (!markerState.has(marker)) {
    markerState.set(marker, {
      opacity: 1,
      z: 0,
    });
  }

  if (on) {
    marker.setOpacity(1);
    marker.setZIndexOffset(1000);

    // optional tiny visual lift if DOM element exists
    const el = marker.getElement && marker.getElement();
    if (el) el.classList.add("marker-hover");
  } else {
    const st = markerState.get(marker) || { opacity: 1, z: 0 };
    marker.setOpacity(st.opacity);
    marker.setZIndexOffset(st.z);

    const el = marker.getElement && marker.getElement();
    if (el) el.classList.remove("marker-hover");
  }
}

let currentCenter = { lat: 51.509865, lng: -0.118092 };

let mapClickBound = false;

function onMapClick(e) {
  currentCenter = { lat: e.latlng.lat, lng: e.latlng.lng };
  centerMarker.setLatLng(e.latlng).openPopup();
  updateRadiusCircle();
  // fetchNearby().catch(console.error); // optional
}

function ensureMap() {
  if (!map) {
    map = L.map("map").setView([currentCenter.lat, currentCenter.lng], 13);
  }

  if (!baseTiles) {
    baseTiles = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      },
    ).addTo(map);
  }

  if (!markersLayer) {
    markersLayer = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: 18,
      maxClusterRadius: 60,
    });
    map.addLayer(markersLayer);
  }

  if (!centerMarker) {
    centerMarker = L.marker([currentCenter.lat, currentCenter.lng], {
      draggable: true,
    })
      .addTo(map)
      .bindPopup("Search center (drag me)")
      .openPopup();

    centerMarker.on("dragend", () => {
      const pos = centerMarker.getLatLng();
      currentCenter = { lat: pos.lat, lng: pos.lng };
      updateRadiusCircle();
      // optional auto-refresh:
      // fetchNearby().catch(console.error);
    });
  }

  if (!mapHandlersBound) {
    mapHandlersBound = true;

    map.on("movestart", () => {
      document
        .querySelectorAll(".leaflet-popup.crime-popup")
        .forEach((p) => (p.style.opacity = "0.25"));
    });

    map.on("moveend", () => {
      clearTimeout(popupFadeTimer);
      popupFadeTimer = setTimeout(() => {
        document
          .querySelectorAll(".leaflet-popup.crime-popup")
          .forEach((p) => (p.style.opacity = "1"));
      }, 120);
    });

    map.on("click", (e) => {
      currentCenter = { lat: e.latlng.lat, lng: e.latlng.lng };
      centerMarker.setLatLng(e.latlng).openPopup();
      updateRadiusCircle();

      // Clear list/marker "active" state on map click
      if (activeListBtn) activeListBtn.classList.remove("is-active");
      activeListBtn = null;

      if (window.__nearbyUI?.pinnedMarker)
        window.__nearbyUI.pinnedMarker.closePopup?.();
      window.__nearbyUI.pinnedMarker = null;

      if (window.__nearbyUI?.hoverMarker)
        window.__nearbyUI.hoverMarker.closePopup?.();
      window.__nearbyUI.hoverMarker = null;

      if (window.__nearbyUI?.activeListBtn)
        window.__nearbyUI.activeListBtn.classList.remove("is-active");
      window.__nearbyUI.activeListBtn = null;
    });
  }

  window.map = map;
  window.markersLayer = markersLayer;
  window.centerMarker = centerMarker;
  window.radiusCircle = radiusCircle;

  // Keep radius circle synced even on first load
  updateRadiusCircle();

  // Optional: expose for DevTools
  // window.__markersLayer = markersLayer;
  // window.__centerMarker = centerMarker;
}

function updateRadiusCircle() {
  if (!map) return;

  const radiusEl = document.getElementById("radius");
  const r = Number(radiusEl && radiusEl.value ? radiusEl.value : 2000);

  if (!radiusCircle) {
    radiusCircle = L.circle([currentCenter.lat, currentCenter.lng], {
      radius: r,
    }).addTo(map);
  } else {
    radiusCircle.setLatLng([currentCenter.lat, currentCenter.lng]);
    radiusCircle.setRadius(r);
  }
}

function buildNearbyUrl() {
  const from = document.getElementById("from").value;
  const to = document.getElementById("to").value;

  const radius = Number(document.getElementById("radius").value || 2000);
  const limit = Number(document.getElementById("nearby-limit").value || 5);

  const params = new URLSearchParams({
    lat: String(currentCenter.lat),
    lng: String(currentCenter.lng),
    from,
    to,
    radius: String(radius),
    limit: String(limit),
  });

  return `/api/trials/nearby?${params.toString()}`;
}

function updateRadiusCircle() {
  if (!map) return;

  const radiusEl = document.getElementById("radius");
  const r = Number(radiusEl && radiusEl.value ? radiusEl.value : 2000);

  if (!radiusCircle) {
    radiusCircle = L.circle([currentCenter.lat, currentCenter.lng], {
      radius: r,
    }).addTo(map);
  } else {
    radiusCircle.setLatLng([currentCenter.lat, currentCenter.lng]);
    radiusCircle.setRadius(r);
  }
  window.markersLayer = markersLayer;
  window.radiusCircle = radiusCircle;
  window.centerMarker = centerMarker;
  window.map = map;
}

function selectListItemById(id) {
  const el = document.getElementById("nearby-results");
  if (!el) return;

  const btn = el.querySelector(`button[data-id="${CSS.escape(id)}"]`);
  if (!btn) return;

  // triggers your existing list-click logic (sticky highlight + popup + pan)
  btn.click();

  // optional: keep it in view even if click handler already scrolls
  btn.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderNearbyList(rows, markerById) {
  const ui = window.__nearbyUI;

  const el = document.getElementById("nearby-results");
  if (!el) return;

  if (!rows || !rows.length) {
    el.innerHTML = "<p>No results in this radius.</p>";
    return;
  }

  // ---------- Build list HTML ----------
  const items = rows
    .map((r) => {
      const id = r.id != null ? String(r.id) : "";
      const offence = r.offence_name || "(unknown offence)";
      const who = r.defendant_name || "(unknown defendant)";
      const verdict = r.verdict || "(unknown verdict)";
      const date = r.trial_date ? String(r.trial_date).slice(0, 10) : "";
      const where = r.trial_location || "";
      const d = r.distance_m != null ? `${Math.round(r.distance_m)} m` : "";

      return `
      <li>
        <button
          type="button"
          class="nearby-item"
          data-id="${id}"
        >
          <strong>${offence}</strong> — ${who} (${verdict})<br/>
          <span style="opacity:.8;">${date} • ${where} • ${d}</span>
        </button>
      </li>
    `;
    })
    .join("");

  el.innerHTML = `<ol>${items}</ol>`;

  // ---------- Wire interactions ----------
  el.querySelectorAll("button[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      if (!id) return;

      const marker = markerById.get(id);
      if (!marker) return;

      setActive(marker, btn);
      pinMarker(marker);

      markersLayer.zoomToShowLayer(marker, () => {
        map.panTo(marker.getLatLng(), { animate: true });
        marker.openPopup();
      });

      btn.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });
}

async function fetchNearby() {
  ensureMap();
  updateRadiusCircle();

  const btn = document.getElementById("nearby");
  const prevText = btn ? btn.textContent : "Find nearby";
  const resultsEl = document.getElementById("nearby-results");

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Searching…";
  }
  if (resultsEl) {
    resultsEl.innerHTML = `<p style="opacity:.8;">Searching nearby crimes…</p>`;
  }

  try {
    // Clear old markers
    markersLayer.clearLayers();

    const url = buildNearbyUrl();
    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Nearby request failed (${res.status}): ${txt}`);
    }

    const payload = await res.json();
    const rows = payload.data || [];

    // Reset marker lookup
    markerById = new Map();

    // Drop markers ONCE
    rows.forEach((r, i) => {
      const baseLat = Number(r.latitude);
      const baseLng = Number(r.longitude);
      if (!Number.isFinite(baseLat) || !Number.isFinite(baseLng)) return;

      const jitter = (i + 1) * 0.00015;
      const lat = baseLat + jitter;
      const lng = baseLng + jitter;

      const date = r.trial_date
        ? String(r.trial_date).slice(0, 10)
        : "Unknown date";
      const offence = r.offence_name || r.offence_group || "Offence";
      const who = r.defendant_name || "Unknown defendant";
      const verdict = r.verdict || "Unknown verdict";
      const dist =
        r.distance_m != null ? `${Math.round(Number(r.distance_m))} m` : "—";

      const popupHTML = `
        <div style="min-width:220px;">
          <div style="font-weight:700; margin-bottom:6px;">${offence}</div>
          <div><b>Date:</b> ${date}</div>
          <div><b>Defendant:</b> ${who} (${verdict})</div>
          <div><b>Distance:</b> ${dist}</div>
        </div>
      `;

      // Create marker
      const marker = L.marker([lat, lng]);

      // Popup for click/pin
      marker.bindPopup(popupHTML, {
        className: "crime-popup",
        autoPan: false,
        offset: L.point(-8, -4),
      });

      // Tooltip for hover preview (lightweight, non-blocking)
      marker.bindTooltip(`${offence}`, {
        direction: "top",
        offset: [0, -8],
        opacity: 0.9,
        sticky: true,
      });

      // Hover marker = show tooltip ONLY (no popup, no pan)
      marker.on("mouseover", () => {
        const ui = window.__nearbyUI;
        if (ui.pinnedMarker === marker) return; // already selected
        marker.openTooltip();
      });

      marker.on("mouseout", () => {
        const ui = window.__nearbyUI;
        if (ui.pinnedMarker === marker) return;
        marker.closePopup?.();
      });

      /* ---------------------------
  Click = PIN popup
---------------------------- */
      marker.on("click", () => {
        if (!window.__nearbyUI) return;
        const ui = window.__nearbyUI;

        // Close previously pinned marker
        if (ui.pinnedMarker && ui.pinnedMarker !== marker) {
          ui.pinnedMarker.closePopup?.();
        }

        // Set new pinned marker
        ui.pinnedMarker = marker;

        // Open + pan (cluster-safe)
        markersLayer.zoomToShowLayer(marker, () => {
          marker.openPopup();
          map.panTo(marker.getLatLng(), { animate: true });
        });
      });

      // CLICK = sticky select
      marker.on("click", () => {
        setActive(marker, null);
        markersLayer.zoomToShowLayer(marker, () => {
          marker.openPopup();
          map.panTo(marker.getLatLng(), { animate: true });
        });
      });

      marker.bindPopup(popupHTML);

      if (r.id != null) {
        const id = String(r.id);
        markerById.set(id, marker);

        // marker click pins + sync list
        marker.on("click", () => {
          const btn = document.querySelector(
            `#nearby-results button[data-id="${id}"]`,
          );
          setActive(marker, btn);
          pinMarker(marker);

          markersLayer.zoomToShowLayer(marker, () => {
            map.panTo(marker.getLatLng(), { animate: true });
            marker.openPopup();
          });

          btn?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      }

      // MarkerClusterGroup uses addLayer
      markersLayer.addLayer(marker);
    });

    // Render list AFTER markers exist
    renderNearbyList(rows, markerById);

    // Auto-zoom (keep center in view too)
    if (rows.length) {
      const latLngs = rows
        .map((r) => [Number(r.latitude), Number(r.longitude)])
        .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));

      latLngs.push([currentCenter.lat, currentCenter.lng]);
      if (latLngs.length) map.fitBounds(L.latLngBounds(latLngs).pad(0.25));
    }

    // Optional debug (safe)
    // console.log("cluster after add:", markersLayer.getLayers().length);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prevText;
    }
  }
}

const useGpsBtn = document.getElementById("use-gps");
if (useGpsBtn)
  useGpsBtn.addEventListener("click", () => {
    ensureMap();

    if (!navigator.geolocation) {
      alert("Geolocation not supported in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        currentCenter = { lat: pos.coords.latitude, lng: pos.coords.longitude };

        map.setView([currentCenter.lat, currentCenter.lng], 15);
        centerMarker
          .setLatLng([currentCenter.lat, currentCenter.lng])
          .openPopup();

        updateRadiusCircle();

        // Auto-run nearby after locating
        try {
          await fetchNearby();
        } catch (e) {
          console.error(e);
          alert("Nearby lookup failed. Check console.");
        }
      },
      (err) => {
        console.error(err);
        alert(
          "Could not get your location (permission denied or unavailable).",
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });

// Initialise map immediately (optional)
ensureMap();

document.getElementById("reload").addEventListener("click", () => {
  render().catch((err) => {
    console.error(err);
    alert(err.message);
  });
});

document.getElementById("bucket").addEventListener("change", () => {
  scheduleUrlSync();
  render().catch(console.error);
});

document.getElementById("confidence").addEventListener("change", () => {
  scheduleUrlSync();
  render().catch(console.error);
});

document.getElementById("toggle-ci").addEventListener("change", () => {
  scheduleUrlSync();
  if (!chart) return;
  animateCi(document.getElementById("toggle-ci").checked, 250);
});

document.getElementById("gender")?.addEventListener("change", () => {
  scheduleUrlSync();
  render().catch(console.error);
});

document.getElementById("radius")?.addEventListener("change", () => {
  ensureMap();
  updateRadiusCircle();
  scheduleUrlSync();
});

document.getElementById("group")?.addEventListener("change", () => {
  scheduleUrlSync();
  render().catch(console.error);
});

// Buttons: Nearby
const nearbyBtn = document.getElementById("nearby");
if (nearbyBtn) {
  nearbyBtn.addEventListener("click", () => {
    // push=true so the back button feels natural for “actions”
    scheduleUrlSync({ push: true });

    // also mark that this view includes nearby results (optional)
    const p = new URLSearchParams(location.search);
    p.set("nearby", "1");
    history.replaceState(null, "", `?${p.toString()}`);

    fetchNearby().catch((err) => {
      console.error(err);
      alert(err.message);
    });
  });
}

const radiusEl = document.getElementById("radius");
if (radiusEl) {
  radiusEl.addEventListener("change", () => {
    ensureMap();
    updateRadiusCircle();
  });
}

async function init() {
  // Chart
  await loadGroupOptions().catch(console.error);

  if (groupInput) {
    groupInput.addEventListener("input", () => {
      previewBestGroupMatch(groupInput);
    });

    groupInput.addEventListener("change", () => {
      applyBestGroupMatchAndRender(groupInput);
    });

    groupInput.addEventListener("blur", () => {
      applyBestGroupMatchAndRender(groupInput);
    });
  }

  initFromUrl();

  // Map base + center + radius
  ensureMap();
  updateRadiusCircle();

  // Populate markers + list on page load
  fetchNearby().catch(console.error);

  // DevTools helpers (optional but useful)
  window.__markersLayer = markersLayer;
  window.__centerMarker = centerMarker;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

function initFromUrl() {
  const state = readUrlState();
  applyStateToUI(state);

  const groupInput = document.getElementById("group");
  if (groupInput) {
    const best = getBestMatchingGroup(groupInput.value.trim());
    if (best) {
      groupInput.value = best;
    } else if (groupInput.value.trim() !== "") {
      groupInput.value = "";
    }
  }

  ensureMap();
  updateRadiusCircle();
  render().catch(console.error);

  if (state.nearby === "1") {
    fetchNearby().catch(console.error);
  }
}
