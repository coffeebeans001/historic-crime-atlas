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

  const raw = groupInput?.value?.trim() || "";

  if (raw === "") return null;

  const validGroups = groupList
    ? Array.from(groupList.options).map((o) => o.value)
    : [];

  return validGroups.includes(raw) ? raw : "__INVALID__";
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
  }

  updateGroupInputState();
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
  const bucket = document.getElementById("bucket")?.value || "year";
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
  const group = getValidatedGroup();
  const gender = document.getElementById("gender")?.value || "all";
  const from = document.getElementById("from")?.value || "";
  const to = document.getElementById("to")?.value || "";
  const radius = Number(document.getElementById("radius")?.value) || 2000;

  const params = new URLSearchParams({
    gender,
    from,
    to,
    lat: String(currentCenter.lat),
    lng: String(currentCenter.lng),
    radius: String(radius),
  });

  // ✅ only include group if valid
  if (group && group !== "__INVALID__") {
    params.set("group", group);
  }

  const res = await fetch(`/api/trials/series?${params.toString()}`);

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Series request failed (${res.status}): ${txt}`);
  }

  return res.json();
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

const LOW_N_THRESHOLD = 5;

function buildDatasets(seriesArr, bucket) {
  const datasets = [];

  const getBucketX = (x) => {
    const year = Number(x);
    return bucket === "decade" ? Math.floor(year / 10) * 10 : year;
  };

  (seriesArr || [])
    .filter((series) => series && Array.isArray(series.data))
    .forEach((series) => {
      const label = (series.label || "").toLowerCase();

      let rgb = "#6b21a8";
      let rgba = "rgba(107, 33, 168, 0.10)";

      if (label.includes("female")) {
        rgb = "#c0392b";
        rgba = "rgba(192, 57, 43, 0.10)";
      } else if (label.includes("male")) {
        rgb = "#1d4ed8";
        rgba = "rgba(29, 78, 216, 0.10)";
      }

      const cleanPoints = series.data.filter((p) => p && p.x != null);

      // 1) upper CI (invisible line)
      datasets.push({
        label: `${series.label} (upper CI)`,
        data: cleanPoints.map((p) => ({
          x: getBucketX(p.x),
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
          x: getBucketX(p.x),
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
          x: getBucketX(p.x),
          y: p.y,
          n: p.n,
          low: p.low,
          high: p.high,
        })),
        borderColor: rgb,
        backgroundColor: rgb,
        tension: 0,
        spanGaps: true,
        borderWidth: 3,

        segment: {
          borderDash: (ctx) => {
            const y0 = ctx.p0?.raw?.n;
            const y1 = ctx.p1?.raw?.n;
            return y0 < LOW_N_THRESHOLD || y1 < LOW_N_THRESHOLD ? [6, 4] : [];
          },
          borderColor: (ctx) => {
            const y0 = ctx.p0?.raw?.n;
            const y1 = ctx.p1?.raw?.n;
            return y0 < LOW_N_THRESHOLD || y1 < LOW_N_THRESHOLD
              ? "rgba(0,0,0,0.55)"
              : rgb;
          },
        },

        pointRadius: (ctx) => {
          const n = ctx.raw?.n ?? 0;
          return n < LOW_N_THRESHOLD ? 5 : 4;
        },

        pointHoverRadius: 7,

        pointBackgroundColor: (ctx) => {
          const n = ctx.raw?.n ?? 0;
          return n < LOW_N_THRESHOLD ? "#ffffff" : rgb;
        },

        pointBorderColor: rgb,

        pointBorderWidth: (ctx) => {
          const n = ctx.raw?.n ?? 0;
          return n < LOW_N_THRESHOLD ? 2 : 1;
        },
      });

      // 4) smoothed trend overlay
      const smoothedPoints = movingAveragePoints(
        cleanPoints.map((p) => ({
          x: getBucketX(p.x),
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
        borderWidth: 2,
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
    ctx.fillStyle = "#fff";
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
      onHover: (_event, elements) => {
        if (!elements.length) {
          resetMarkerHighlight();
          return;
        }

        const point = elements[0];
        const data = point.element?.$context?.raw;
        const year = data?.x;

        if (year != null) {
          highlightMarkersByYear(year);
        }
      },

      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      layout: { padding: { top: 12, bottom: 12 } },
      animation: {
        duration: 600,
        easing: "easeInOutCubic",
      },

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
          ticks: {
            callback: (value) => `${value}%`,
          },
        },
      },

      plugins: {
        // 🔥 this is where your title/legend/tooltip live
        title: { display: true, text: "Loading…" },
        subtitle: {
          display: true,
          text: "",
        },
        legend: {
          labels: {
            filter: (item) => {
              const t = item.text || "";

              return !t.includes("(upper CI)") && !t.includes("(CI band)");
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
                lines.push(
                  `95% CI: ${Number(low).toFixed(1)}–${Number(high).toFixed(1)}%`,
                );
              }

              if (n != null) {
                const isLow = n < LOW_N_THRESHOLD;
                const suffix = isLow ? " ⚠ low sample" : "";
                lines.push(`n = ${n} trials${suffix}`);
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
  chart.canvas.addEventListener("mouseleave", () => {
    resetMarkerHighlight();
  });
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

function analyseTrend(points, label = "The data") {
  const clean = (points || []).filter(
    (p) => p && typeof p.x === "number" && typeof p.y === "number",
  );

  if (clean.length < 2) {
    return {
      direction: "insufficient data",
      volatility: "unknown",
      summary: `${label} does not include enough observations to assess the overall pattern reliably.`,
    };
  }

  const first = clean[0].y;
  const last = clean[clean.length - 1].y;
  const change = last - first;

  let direction = "stable";
  if (change > 10) direction = "clear increase";
  else if (change > 3) direction = "gradual increase";
  else if (change < -10) direction = "clear decrease";
  else if (change < -3) direction = "gradual decrease";

  const stepChanges = [];
  for (let i = 1; i < clean.length; i++) {
    stepChanges.push(Math.abs(clean[i].y - clean[i - 1].y));
  }

  const avgStep =
    stepChanges.reduce((sum, v) => sum + v, 0) / stepChanges.length;

  let volatility = "low";
  if (avgStep > 25) volatility = "high";
  else if (avgStep > 10) volatility = "moderate";

  let summary = "";

  if (direction === "stable") {
    summary = `${label} remain broadly stable across the selected period.`;
  } else if (direction === "gradual increase") {
    summary = `${label} show a gradual increase across the selected period.`;
  } else if (direction === "clear increase") {
    summary = `${label} show a clear upward movement across the selected period.`;
  } else if (direction === "gradual decrease") {
    summary = `${label} show a gradual decline across the selected period.`;
  } else if (direction === "clear decrease") {
    summary = `${label} show a clear downward movement across the selected period.`;
  }

  if (volatility === "moderate") {
    summary += " There is also moderate year-to-year variation.";
  } else if (volatility === "high") {
    summary +=
      " Year-to-year variation is high, so the pattern should be interpreted with caution.";
  }

  return { direction, volatility, summary };
}

function detectMidPeriodSpike(points) {
  const clean = (points || []).filter(
    (p) => p && typeof p.x === "number" && typeof p.y === "number",
  );

  if (clean.length < 5) {
    return {
      hasSpike: false,
      summary:
        "There is not enough data to assess whether a mid-period spike is present.",
    };
  }

  const midStart = Math.floor(clean.length * 0.3);
  const midEnd = Math.ceil(clean.length * 0.7);

  const early = clean.slice(0, midStart);
  const middle = clean.slice(midStart, midEnd);
  const late = clean.slice(midEnd);

  if (!early.length || !middle.length || !late.length) {
    return {
      hasSpike: false,
      summary:
        "There is not enough data to assess whether a mid-period spike is present.",
    };
  }

  const avg = (arr) => arr.reduce((sum, p) => sum + p.y, 0) / arr.length;

  const earlyAvg = avg(early);
  const middleAvg = avg(middle);
  const lateAvg = avg(late);

  const sideAvg = (earlyAvg + lateAvg) / 2;
  const diff = middleAvg - sideAvg;

  if (diff > 10) {
    const peakPoint = middle.reduce((a, b) => (a.y > b.y ? a : b));
    return {
      hasSpike: true,
      type: "spike",
      year: peakPoint.x,
      summary: `A notable mid-period spike appears around ${peakPoint.x}.`,
    };
  }

  if (diff < -10) {
    const dipPoint = middle.reduce((a, b) => (a.y < b.y ? a : b));
    return {
      hasSpike: true,
      type: "dip",
      year: dipPoint.x,
      summary: `A noticeable mid-period dip appears around ${dipPoint.x}.`,
    };
  }

  return {
    hasSpike: false,
    summary: "No strong mid-period spike is evident.",
  };
}

function compareSeries(seriesArr) {
  const cleanSeries = (seriesArr || []).filter(
    (s) => s && typeof s.label === "string" && Array.isArray(s.data),
  );

  if (cleanSeries.length < 2) {
    return {
      available: false,
      summary: "",
    };
  }

  const [a, b] = cleanSeries;

  const mapA = new Map(
    a.data
      .filter((p) => p && typeof p.x === "number" && typeof p.y === "number")
      .map((p) => [p.x, p.y]),
  );

  const mapB = new Map(
    b.data
      .filter((p) => p && typeof p.x === "number" && typeof p.y === "number")
      .map((p) => [p.x, p.y]),
  );

  const sharedYears = [...mapA.keys()]
    .filter((x) => mapB.has(x))
    .sort((x, y) => x - y);

  if (sharedYears.length < 2) {
    return {
      available: false,
      summary: "",
    };
  }

  const gaps = sharedYears.map((x) => Math.abs(mapA.get(x) - mapB.get(x)));
  const avgGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;

  const firstGap = Math.abs(
    mapA.get(sharedYears[0]) - mapB.get(sharedYears[0]),
  );
  const lastGap = Math.abs(
    mapA.get(sharedYears[sharedYears.length - 1]) -
      mapB.get(sharedYears[sharedYears.length - 1]),
  );
  const gapChange = lastGap - firstGap;

  const nameA = a.label.replace(/\s*-\s*Individual/i, "").trim();
  const nameB = b.label.replace(/\s*-\s*Individual/i, "").trim();

  let gapSummary = "";
  if (avgGap > 25) {
    gapSummary = `${nameA} and ${nameB} conviction rates differ substantially across the selected period.`;
  } else if (avgGap > 10) {
    gapSummary = `${nameA} and ${nameB} conviction rates show a noticeable gap across the selected period.`;
  } else {
    gapSummary = `${nameA} and ${nameB} conviction rates remain relatively close across the selected period.`;
  }

  let divergenceSummary = "";
  if (gapChange > 10) {
    divergenceSummary = `The gap between ${nameA.toLowerCase()} and ${nameB.toLowerCase()} appears to widen over time.`;
  } else if (gapChange < -10) {
    divergenceSummary = `The gap between ${nameA.toLowerCase()} and ${nameB.toLowerCase()} appears to narrow over time.`;
  } else {
    divergenceSummary = `The gap between ${nameA.toLowerCase()} and ${nameB.toLowerCase()} remains broadly stable over time.`;
  }

  return {
    available: true,
    summary: `${gapSummary} ${divergenceSummary}`,
  };
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

  const trendLabel =
    seriesArr && seriesArr.length === 1
      ? `${seriesArr[0].label.replace(/\s*-\s*Individual/i, "").trim()} conviction rates`
      : "Conviction rates";

  const trendInfo = analyseTrend(points, trendLabel);
  const spikeInfo = detectMidPeriodSpike(points);
  const comparisonInfo = compareSeries(seriesArr);

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

${trendInfo.summary}
${spikeInfo.summary}
${comparisonInfo.available ? comparisonInfo.summary : ""}

${confidenceLabel}${warning}
`;
}

function updateConfidenceBadge(minN) {
  const badge = document.getElementById("confidence-badge");
  if (!badge) return;

  if (minN === null || typeof minN !== "number") {
    badge.textContent = "Confidence: unavailable";
    badge.style.background = "#e9ecef";
    badge.style.color = "#333";
    return;
  }

  if (minN < 5) {
    badge.textContent = `Low confidence (min n = ${minN})`;
    badge.style.background = "#f8d7da";
    badge.style.color = "#842029";
  } else if (minN < 20) {
    badge.textContent = `Moderate confidence (min n = ${minN})`;
    badge.style.background = "#fff3cd";
    badge.style.color = "#664d03";
  } else {
    badge.textContent = `Stronger confidence (min n = ${minN})`;
    badge.style.background = "#d1e7dd";
    badge.style.color = "#0f5132";
  }
}

function buildInsightHeading({ groupLabel, genderLabel, seriesArr }) {
  const cleanGroup = groupLabel || "All offences";
  const cleanGender = genderLabel || "All";

  const isComparison = (seriesArr || []).length > 1;

  const groupText =
    cleanGroup.toLowerCase() === "all offences" ? "All-offence" : cleanGroup;

  if (isComparison) {
    return `${groupText} comparison summary`;
  }

  if (cleanGender.toLowerCase() === "all") {
    return `${groupText} conviction summary`;
  }

  return `${cleanGender} ${groupText.toLowerCase()} summary`;
}

function updateInsightPanel({
  groupLabel,
  genderLabel,
  seriesArr,
  insightText,
  minN,
}) {
  const headingEl = document.getElementById("insight-heading");
  const badgeEl = document.getElementById("confidence-badge");
  const insightEl = document.getElementById("insight-text");

  if (headingEl) {
    headingEl.textContent = buildInsightHeading({
      groupLabel,
      genderLabel,
      seriesArr,
    });
  }

  if (badgeEl) {
    if (minN === null || typeof minN !== "number") {
      badgeEl.textContent = "Confidence: unavailable";
      badgeEl.style.background = "#e9ecef";
      badgeEl.style.color = "#333";
    } else if (minN < 5) {
      badgeEl.textContent = `Low confidence (min n = ${minN})`;
      badgeEl.style.background = "#f8d7da";
      badgeEl.style.color = "#842029";
    } else if (minN < 20) {
      badgeEl.textContent = `Moderate confidence (min n = ${minN})`;
      badgeEl.style.background = "#fff3cd";
      badgeEl.style.color = "#664d03";
    } else {
      badgeEl.textContent = `Stronger confidence (min n = ${minN})`;
      badgeEl.style.background = "#d1e7dd";
      badgeEl.style.color = "#0f5132";
    }
  }

  if (insightEl) {
    insightEl.textContent =
      insightText || "No data available for the selected filters.";

    if (minN === null || typeof minN !== "number" || minN < 5) {
      insightEl.style.borderLeft = "4px solid #d63333";
    } else if (minN < 20) {
      insightEl.style.borderLeft = "4px solid #fd7e14";
    } else {
      insightEl.style.borderLeft = "4px solid #198754";
    }

    insightEl.style.borderRadius = "4px";
  }
}

function updateGroupInputState() {
  const groupInput = document.getElementById("group");
  const feedbackEl = document.getElementById("group-feedback");
  if (!groupInput) return;

  const validatedGroup = getValidatedGroup();

  groupInput.style.borderColor = "";
  groupInput.style.backgroundColor = "";
  groupInput.style.outline = "";
  groupInput.style.boxShadow = "";

  if (feedbackEl) {
    feedbackEl.textContent = "";
  }

  // empty = neutral
  if (validatedGroup === null) {
    return;
  }

  // invalid = red + feedback
  if (validatedGroup === "__INVALID__") {
    groupInput.style.borderColor = "#d63333";
    groupInput.style.backgroundColor = "#fff5f5";
    groupInput.style.outline = "2px solid rgba(214, 51, 51, 0.15)";
    groupInput.style.boxShadow = "0 0 0 2px rgba(214, 51, 51, 0.12)";

    const raw = groupInput.value.trim();
    const suggestion = getClosestGroupSuggestion(raw);

    if (feedbackEl) {
      feedbackEl.textContent = suggestion
        ? `No matching offence found. Try ${suggestion}.`
        : "No matching offence found.";
    }
    return;
  }

  // valid = neutral
}

function getClosestGroupSuggestion(raw) {
  const list = document.getElementById("groupOptions");
  if (!list) return null;

  const options = Array.from(list.options).map((o) => o.value);

  if (!raw) return null;

  const lower = raw.toLowerCase();

  // simple match: startsWith first
  let match = options.find((o) => o.toLowerCase().startsWith(lower));

  if (match) return match;

  // fallback: includes
  match = options.find((o) => o.toLowerCase().includes(lower));

  return match || null;
}

function downloadChartAsPng() {
  if (!chart) return;

  const link = document.createElement("a");
  const safeTitle = (chart.options?.plugins?.title?.text || "conviction-chart")
    .toString()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .toLowerCase();

  link.href = chart.toBase64Image("image/png", 1);
  link.download = `${safeTitle || "conviction-chart"}.png`;
  link.click();
}

async function copyInsightText() {
  const heading =
    document.getElementById("insight-heading")?.textContent?.trim() || "";
  const badge =
    document.getElementById("confidence-badge")?.textContent?.trim() || "";
  const insight =
    document.getElementById("insight-text")?.textContent?.trim() || "";

  const text = [heading, badge, insight].filter(Boolean).join("\n\n");

  if (!text) return;

  await navigator.clipboard.writeText(text);
}

async function copyShareableLink() {
  await navigator.clipboard.writeText(window.location.href);
}

function formatDisplayDate(dateString) {
  if (!dateString) return "";
  const [year, month, day] = dateString.split("-");
  return `${day}/${month}/${year}`;
}

function getExportDateTime() {
  const now = new Date();

  const display = now.toLocaleString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const pad = (n) => n.toString().padStart(2, "0");

  const file = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("-");

  return { display, file };
}

const { display: exportDateTime, file: exportFileTime } = getExportDateTime();

function drawChip(ctx, text, x, y, options = {}) {
  const paddingX = options.paddingX ?? 10;
  const paddingY = options.paddingY ?? 6;
  const radius = options.radius ?? 12;
  const bg = options.bg ?? "#f3f4f6";
  const color = options.color ?? "#333";
  const font = options.font ?? "13px Arial";

  ctx.save();
  ctx.font = font;

  const textWidth = ctx.measureText(text).width;
  const chipWidth = textWidth + paddingX * 2;
  const chipHeight = 26;

  roundRect(ctx, x, y, chipWidth, chipHeight, radius, bg);

  ctx.fillStyle = color;
  ctx.font = font;
  ctx.fillText(text, x + paddingX, y + 17);

  ctx.restore();

  return { chipWidth, chipHeight };
}

async function buildResearchSnapshotCanvas() {
  if (!chart) return;

  const heading =
    document.getElementById("insight-heading")?.textContent?.trim() || "";
  const badge =
    document.getElementById("confidence-badge")?.textContent?.trim() || "";
  const insight =
    document.getElementById("insight-text")?.textContent?.trim() || "";
  const chartTitle =
    chart.options?.plugins?.title?.text?.toString().trim() ||
    "Conviction chart";
  const currentUrl = window.location.href;
  const { display: exportDateTime, file: exportFileTime } = getExportDateTime();
  const chartCanvas = document.getElementById("chart");
  if (!chartCanvas) return;

  const exportTheme = document.getElementById("export-theme")?.value || "light";
  const theme =
    exportTheme === "dark"
      ? {
          background: "#111827",
          panel: "#1f2937",
          textPrimary: "#f9fafb",
          textSecondary: "#d1d5db",
          textMuted: "#9ca3af",
          divider: "#374151",
          badgeBg: "#374151",
          badgeText: "#f9fafb",
          footerText: "#9ca3af",
          urlText: "#d1d5db",
        }
      : {
          background: "#ffffff",
          panel: "#f9fafb",
          textPrimary: "#111111",
          textSecondary: "#666666",
          textMuted: "#555555",
          divider: "#dddddd",
          badgeBg: "#eef2ff",
          badgeText: "#1f2937",
          footerText: "#777777",
          urlText: "#666666",
        };

  const offenceFilter =
    document.getElementById("group")?.value?.trim() || "All offences";

  const genderRaw = document.getElementById("gender")?.value?.trim() || "all";

  const genderFilter =
    genderRaw === "all"
      ? "All genders"
      : genderRaw.charAt(0).toUpperCase() + genderRaw.slice(1);

  const dateFrom = document.getElementById("from")?.value?.trim() || "";

  const dateTo = document.getElementById("to")?.value?.trim() || "";

  let rangeText = "Full dataset";

  if (dateFrom && dateTo) {
    rangeText = `${formatDisplayDate(dateFrom)} to ${formatDisplayDate(dateTo)}`;
  } else if (dateFrom) {
    rangeText = `From ${formatDisplayDate(dateFrom)}`;
  } else if (dateTo) {
    rangeText = `Up to ${formatDisplayDate(dateTo)}`;
  }

  const filterChips =
    exportTheme === "dark"
      ? [
          {
            text: `Offence: ${offenceFilter}`,
            bg: "#4c1d24",
            color: "#fecdd3",
          },
          {
            text: `Gender: ${genderFilter}`,
            bg: "#1e3a5f",
            color: "#bfdbfe",
          },
          {
            text: `Range: ${rangeText}`,
            bg: "#163826",
            color: "#bbf7d0",
          },
        ]
      : [
          {
            text: `Offence: ${offenceFilter}`,
            bg: "#f8d7da",
            color: "#842029",
          },
          {
            text: `Gender: ${genderFilter}`,
            bg: "#dbeafe",
            color: "#1d4ed8",
          },
          {
            text: `Range: ${rangeText}`,
            bg: "#dcfce7",
            color: "#166534",
          },
        ];

  const chartImage = new Image();
  chartImage.src = chart.toBase64Image("image/png", 1);
  await new Promise((resolve, reject) => {
    chartImage.onload = () => {
      resolve();
    };
    chartImage.onerror = (error) => {
      console.error("chart image failed to load", error);
      reject(error);
    };
  });

  const padding = 24;
  const lineHeight = 24;
  const sectionGap = 16;
  const headerHeight = 150;

  const textLines = [
    chartTitle,
    "",
    heading,
    badge,
    "",
    ...wrapText(insight, 90),
    "",
  ];

  const textHeight = textLines.length * lineHeight;
  const width = Math.max(chartCanvas.width + padding * 2, 1200);
  const urlLines = wrapText(currentUrl, 110);
  const urlHeight = urlLines.length * 18 + 20;

  const height =
    padding +
    headerHeight +
    textHeight +
    sectionGap +
    chartCanvas.height +
    sectionGap +
    urlHeight +
    padding;

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = width;
  exportCanvas.height = height;

  const ctx = exportCanvas.getContext("2d");
  if (!ctx) return;

  // background
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);

  // header
  let y = padding;

  ctx.fillStyle = theme.textPrimary;
  ctx.font = "bold 26px Arial";
  // app mark (OB)
  const markSize = 36;
  const markX = padding;
  const markY = y + 6;

  roundRect(ctx, markX, markY, markSize, markSize, 8, theme.textPrimary);
  ctx.fillStyle = theme.background;
  ctx.font = "bold 16px Arial";
  ctx.textAlign = "center";
  ctx.fillText("OB", markX + markSize / 2, markY + 24);

  ctx.textAlign = "left";

  // title (shifted right)
  ctx.fillStyle = theme.textPrimary;
  ctx.font = "bold 26px Arial";
  ctx.fillText("Old Bailey Research Snapshot", padding + 50, y + 28);

  ctx.fillStyle = theme.textSecondary;
  ctx.font = "14px Arial";
  ctx.fillText("Historic criminal case insight export", padding + 50, y + 52);

  let chipX = padding;
  let chipY = y + 72;
  const chipGap = 10;
  const chipRowHeight = 34;

  for (const chip of filterChips) {
    ctx.font = "13px Arial";
    const estimatedWidth = ctx.measureText(chip.text).width + 20;

    if (chipX + estimatedWidth > width - padding) {
      chipX = padding;
      chipY += chipRowHeight;
    }

    const { chipWidth } = drawChip(ctx, chip.text, chipX, chipY, {
      bg: chip.bg,
      color: chip.color,
      font: "13px Arial",
      paddingX: 10,
      paddingY: 6,
      radius: 13,
    });

    chipX += chipWidth + chipGap;
  }

  ctx.strokeStyle = theme.divider;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, y + headerHeight);
  ctx.lineTo(width - padding, y + headerHeight);
  ctx.stroke();

  // title + text
  y += headerHeight + 24;

  ctx.fillStyle = theme.textPrimary;
  ctx.font = "bold 28px Arial";
  ctx.fillText(chartTitle, padding, y);

  y += lineHeight * 2;

  ctx.font = "bold 24px Arial";
  ctx.fillText(heading, padding, y);

  y += lineHeight;

  // badge
  const badgeText = badge || "Confidence: unavailable";
  const badgePaddingX = 12;

  ctx.font = "bold 18px Arial";
  const badgeWidth = ctx.measureText(badgeText).width + badgePaddingX * 2;

  let badgeBg = theme.badgeBg;
  let badgeFg = theme.badgeText;

  if (badgeText.toLowerCase().includes("low confidence")) {
    badgeBg = "#f8d7da";
    badgeFg = "#842029";
  } else if (badgeText.toLowerCase().includes("moderate confidence")) {
    badgeBg = "#fff3cd";
    badgeFg = "#664d03";
  } else if (badgeText.toLowerCase().includes("stronger confidence")) {
    badgeBg = "#d1e7dd";
    badgeFg = "#0f5132";
  }

  roundRect(ctx, padding, y - 18, badgeWidth, 32, 16, badgeBg);
  ctx.fillStyle = badgeFg;
  ctx.fillText(badgeText, padding + badgePaddingX, y + 4);

  y += lineHeight * 2;

  // insight box
  const insightLines = wrapText(insight, 95);
  const insightBoxHeight = Math.max(56, insightLines.length * 22 + 20);

  let borderColor = "#d63333";
  if (badgeText.toLowerCase().includes("moderate confidence")) {
    borderColor = "#fd7e14";
  } else if (badgeText.toLowerCase().includes("stronger confidence")) {
    borderColor = "#198754";
  }

  ctx.fillStyle = theme.panel;
  ctx.fillRect(padding, y - 18, width - padding * 2, insightBoxHeight);
  ctx.fillStyle = borderColor;
  ctx.fillRect(padding, y - 18, 6, insightBoxHeight);

  ctx.fillStyle = theme.textPrimary;
  ctx.font = "18px Arial";

  let insightY = y + 8;
  for (const line of insightLines) {
    ctx.fillText(line, padding + 18, insightY);
    insightY += 22;
  }

  y += insightBoxHeight + sectionGap;

  // chart image
  ctx.drawImage(chartImage, padding, y, chartCanvas.width, chartCanvas.height);
  y += chartCanvas.height + sectionGap;

  // footer separator
  y += 10;

  ctx.strokeStyle = theme.divider;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, y);
  ctx.lineTo(width - padding, y);
  ctx.stroke();

  y += 20;

  // set font ONCE here
  ctx.font = "14px Arial";

  // timestamp
  ctx.fillStyle = theme.footerText;
  ctx.font = "italic 13px Arial";
  ctx.fillText(`Exported: ${exportDateTime}`, padding, y);

  y += 18;

  // URL section
  ctx.fillStyle = theme.urlText;
  ctx.fillText("Shareable URL:", padding, y);

  y += 20;

  for (const line of urlLines) {
    ctx.fillText(line, padding, y);
    y += 18;
  }

  const safeTitle = (chartTitle || "research-snapshot")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .toLowerCase();

  return exportCanvas;
}

async function downloadResearchSnapshot() {
  const exportCanvas = await buildResearchSnapshotCanvas();
  if (!exportCanvas) return;

  const chartTitle =
    chart.options?.plugins?.title?.text?.toString().trim() ||
    "research-snapshot";

  const { file: exportFileTime } = getExportDateTime();

  const safeTitle = (chartTitle || "research-snapshot")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .toLowerCase();

  exportCanvas.toBlob((blob) => {
    if (!blob) {
      console.error("Failed to create export blob");
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeTitle}-${exportFileTime}.png`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

function wrapText(text, maxChars = 90) {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (test.length <= maxChars) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function roundRect(ctx, x, y, width, height, radius, fillColor) {
  ctx.fillStyle = fillColor;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

async function downloadSnapshotAsPDF() {
  const exportCanvas = await buildResearchSnapshotCanvas();
  if (!exportCanvas) return;

  const imgData = exportCanvas.toDataURL("image/png");
  const { jsPDF } = window.jspdf;

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "px",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const margin = 24;
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2;

  const canvasWidth = exportCanvas.width;
  const canvasHeight = exportCanvas.height;

  const widthRatio = availableWidth / canvasWidth;
  const heightRatio = availableHeight / canvasHeight;
  const scale = Math.min(widthRatio, heightRatio);

  const imgWidth = canvasWidth * scale;
  const imgHeight = canvasHeight * scale;

  const x = (pageWidth - imgWidth) / 2;
  const y = margin;

  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, pageWidth, pageHeight, "F");
  pdf.addImage(imgData, "PNG", x, y, imgWidth, imgHeight);

  const chartTitle =
    chart.options?.plugins?.title?.text?.toString().trim() ||
    "research-snapshot";

  const { file: exportFileTime } = getExportDateTime();

  const safeTitle = (chartTitle || "research-snapshot")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .toLowerCase();

  pdf.save(`${safeTitle}-${exportFileTime}.pdf`);
}

function getYRangeFromSeries(seriesArr) {
  const values = (seriesArr || [])
    .flatMap((series) => series.data || [])
    .flatMap((p) => {
      const vals = [];
      if (typeof p?.y === "number") vals.push(p.y);
      if (typeof p?.low === "number") vals.push(p.low);
      if (typeof p?.high === "number") vals.push(p.high);
      return vals;
    });

  if (!values.length) {
    return { min: 0, max: 100 };
  }

  let min = Math.min(...values);
  let max = Math.max(...values);

  const range = max - min || 5;
  const padding = range * 0.15;

  min = Math.max(0, min - padding);
  max = Math.min(100, max + padding);

  if (max - min < 5) {
    const mid = (min + max) / 2;
    min = Math.max(0, mid - 2.5);
    max = Math.min(100, mid + 2.5);
  }

  return { min, max };
}

async function render() {
  ensureChart();

  showNoDataOverlay(false);
  setChartLoading(true);

  try {
    const validatedGroup = getValidatedGroup();
    updateGroupInputState();

    const invalidGroup = validatedGroup === "__INVALID__";

    let payload = { series: [] };

    if (!invalidGroup) {
      payload = await loadSeries();
    }

    function fillMissingYears(seriesArr) {
      return seriesArr.map((series) => {
        const data = series.data;
        if (!data.length) return series;

        const years = data.map((d) => d.x);
        const min = Math.min(...years);
        const max = Math.max(...years);

        const map = new Map(data.map((d) => [d.x, d]));

        const filled = [];

        for (let y = min; y <= max; y++) {
          if (map.has(y)) {
            filled.push(map.get(y));
          } else {
            filled.push({
              x: y,
              y: null, // important → gap
              n: 0,
              low: null,
              high: null,
            });
          }
        }

        return { ...series, data: filled };
      });
    }

    const noData =
      invalidGroup ||
      !payload?.series ||
      payload.series.length === 0 ||
      payload.series.every(
        (s) => !Array.isArray(s.data) || s.data.length === 0,
      );

    showNoDataOverlay(noData);

    if (noData) {
      chart.data.datasets = [];

      const rawGroup = document.getElementById("group")?.value?.trim() || "";

      const groupLabel =
        validatedGroup === null
          ? "All offences"
          : validatedGroup === "__INVALID__"
            ? rawGroup
            : validatedGroup;

      const genderLabel =
        document.getElementById("gender")?.selectedOptions?.[0]?.text ||
        "All Defendants";

      updateInsightPanel({
        groupLabel,
        genderLabel,
        seriesArr: [],
        insightText: "No data available for the selected filters.",
        minN: null,
      });

      const genderValue = document.getElementById("gender")?.value || "all";

      if (genderValue === "all") {
        const yRange = getYRangeFromSeries(payload.series);
        chart.options.scales.y.min = yRange.min;
        chart.options.scales.y.max = yRange.max;
      } else {
        chart.options.scales.y.min = 0;
        chart.options.scales.y.max = 100;
      }

      chart.update();
      return;
    }

    updateSampleWarning(payload.series);
    const bucket = document.getElementById("bucket")?.value || "year";
    chart.data.datasets = buildDatasets(payload.series, bucket);

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

    const rawGroup = document.getElementById("group")?.value?.trim() || "";

    const groupLabel =
      validatedGroup === null
        ? "All offences"
        : validatedGroup === "__INVALID__"
          ? rawGroup
          : validatedGroup;

    const genderLabel =
      document.getElementById("gender")?.selectedOptions?.[0]?.text ||
      "All Defendants";

    // chart title (KEEP THIS)
    const radius = Number(document.getElementById("radius")?.value || 2000);

    chart.options.plugins.title.text = `${groupLabel} — Conviction Rate Over Time (${genderLabel}) • Radius ${radius}m`;

    chart.options.plugins.subtitle.text = `Map center: ${currentCenter.lat.toFixed(4)}, ${currentCenter.lng.toFixed(4)}`;
    // 🔥 NEW unified panel logic (REPLACE old heading block with this)
    const insightText = generateInsight(payload.series);

    const pointsForConfidence = (payload.series || [])
      .flatMap((s) => s.data || [])
      .filter((p) => p && typeof p.n === "number");

    const minN = pointsForConfidence.length
      ? Math.min(...pointsForConfidence.map((p) => p.n))
      : null;

    updateInsightPanel({
      groupLabel,
      genderLabel,
      seriesArr: payload.series,
      insightText,
      minN,
    });

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

let currentCenter = { lat: 51.509865, lng: -0.118092 };

let mapClickBound = false;

function onMapClick(e) {
  resetMarkerHighlight();
  currentCenter = { lat: e.latlng.lat, lng: e.latlng.lng };
  centerMarker.setLatLng(e.latlng).openPopup();
  updateRadiusCircle();

  // Clear list/marker active state

  if (window.__nearbyUI?.activeListBtn) {
    window.__nearbyUI.activeListBtn.classList.remove("is-active");
  }
  window.__nearbyUI.activeListBtn = null;

  if (window.__nearbyUI?.pinnedMarker) {
    window.__nearbyUI.pinnedMarker.closePopup?.();
  }
  window.__nearbyUI.pinnedMarker = null;

  if (window.__nearbyUI?.hoverMarker) {
    window.__nearbyUI.hoverMarker.closePopup?.();
  }
  window.__nearbyUI.hoverMarker = null;

  fetchNearby().catch(console.error);
  render().catch(console.error);
  scheduleUrlSync();
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
      fetchNearby().catch(console.error);
      render().catch(console.error);
    });
  }

  if (!mapHandlersBound) {
    mapHandlersBound = true;

    if (!mapClickBound) {
      map.on("click", onMapClick);
      mapClickBound = true;
    }

    map.on("movestart", () => {
      resetMarkerHighlight();
    });

    map.on("zoomstart", () => {
      resetMarkerHighlight();
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

function highlightMarkersByYear(year) {
  if (!markersLayer) return;

  const targetYear = Number(year);

  markersLayer.eachLayer((layer) => {
    const markerYear = Number(layer.year);
    if (!Number.isFinite(markerYear)) return;

    const isMatch = markerYear === targetYear;

    // 🔥 ALWAYS run logic (independent of DOM)
    if (isMatch) {
      layer.setZIndexOffset?.(1000);
      layer.openPopup?.();
    } else {
      layer.setZIndexOffset?.(0);
      layer.closePopup?.();
    }

    // 🎨 Only apply visual styles if element exists
    const el = layer.getElement?.();
    if (!el) return;

    if (isMatch) {
      el.classList.remove("marker-faded");
      el.classList.add("marker-highlight");
    } else {
      el.classList.remove("marker-highlight");
      el.classList.add("marker-faded");
    }
  });
}

function resetMarkerHighlight() {
  if (!markersLayer) return;

  markersLayer.eachLayer((layer) => {
    // 🔥 always reset popup
    layer.closePopup?.();
    layer.setZIndexOffset?.(0);

    // 🎨 reset visuals if element exists
    const el = layer.getElement?.();
    if (!el) return;

    el.classList.remove("marker-faded");
    el.classList.remove("marker-highlight");
  });
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
      //marker.year = new Date(r.trial_date).getFullYear(); // Popup for click/pin
      marker.year = r.trial_date
        ? Number(String(r.trial_date).slice(0, 4))
        : null;
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
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prevText;
    }
  }
  setTimeout(() => {
    markersLayer.eachLayer((layer) => {
      layer.getElement?.(); // forces render
    });
  }, 0);
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

const radiusEl = document.getElementById("radius");

if (radiusEl) {
  radiusEl.addEventListener("input", () => {
    ensureMap(); // keep this for safety
    updateRadiusCircle();

    fetchNearby().catch(console.error);
    render().catch(console.error);

    scheduleUrlSync(); // keep URL updated
  });
}

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

async function init() {
  // Chart
  await loadGroupOptions().catch(console.error);

  const groupInput = document.getElementById("group");

  groupInput.addEventListener("input", (e) => {
    if (!e.inputType || !e.inputType.startsWith("delete")) {
      previewBestGroupMatch(groupInput);
    }
    updateGroupInputState();
  });

  groupInput.addEventListener("change", () => {
    applyBestGroupMatchAndRender(groupInput);
  });

  groupInput.addEventListener("blur", () => {
    applyBestGroupMatchAndRender(groupInput);
  });

  const bucketEl = document.getElementById("bucket");

  if (bucketEl) {
    bucketEl.addEventListener("change", () => {
      render().catch(console.error);
    });
  }

  const info = document.getElementById("confidence-info");
  const tooltip = document.getElementById("confidence-tooltip");

  if (info && tooltip) {
    info.addEventListener("mouseenter", () => {
      tooltip.style.display = "block";
    });

    info.addEventListener("mouseleave", () => {
      tooltip.style.display = "none";
    });
  }
  const downloadChartBtn = document.getElementById("download-chart-btn");
  if (downloadChartBtn) {
    downloadChartBtn.addEventListener("click", () => {
      downloadChartAsPng();
    });
  }

  const copyInsightBtn = document.getElementById("copy-insight-btn");
  if (copyInsightBtn) {
    copyInsightBtn.addEventListener("click", async () => {
      try {
        await copyInsightText();
        copyInsightBtn.textContent = "Copied insight";
        setTimeout(() => {
          copyInsightBtn.textContent = "Copy insight text";
        }, 1200);
      } catch (err) {
        console.error(err);
      }
    });
  }
}
const copyLinkBtn = document.getElementById("copy-link-btn");
if (copyLinkBtn) {
  copyLinkBtn.addEventListener("click", async () => {
    try {
      await copyShareableLink();
      copyLinkBtn.textContent = "Copied link";
      setTimeout(() => {
        copyLinkBtn.textContent = "Copy shareable link";
      }, 1200);
    } catch (err) {
      console.error(err);
    }
  });
  const pdfBtn = document.getElementById("download-pdf-btn");

  if (pdfBtn) {
    pdfBtn.addEventListener("click", async () => {
      try {
        await downloadSnapshotAsPDF();
      } catch (err) {
        console.error("PDF download failed:", err);
      }
    });
  }

  const fromEl = document.getElementById("from");
  const toEl = document.getElementById("to");

  if (fromEl) {
    fromEl.addEventListener("input", () => {
      render().catch(console.error);
      fetchNearby().catch(console.error);
    });
  }

  if (toEl) {
    toEl.addEventListener("input", () => {
      render().catch(console.error);
      fetchNearby().catch(console.error);
    });
  }
}

const downloadSnapshotBtn = document.getElementById("download-snapshot-btn");
if (downloadSnapshotBtn) {
  downloadSnapshotBtn.addEventListener("click", async () => {
    try {
      await downloadResearchSnapshot();
    } catch (err) {
      console.error(err);
    }
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
