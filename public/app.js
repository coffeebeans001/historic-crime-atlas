let chart; // single chart reference
const LOW_SAMPLE_THRESHOLD = 5;
const DEFAULT_CI_ALPHA = 0.18;
const LINE_TENSION = 0.2;
const APP_VERSION = "Old Bailey Analytics v0.1";

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

  lockedChartYear = null;
  resetMarkerHighlight();
  updateLockButton();
  updateChartLockStatus();

  Promise.all([render(), fetchNearby()])
    .then(() => {
      updateLastUpdatedLabel();
    })
    .catch(console.error);
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
  const largestGapYear = getLargestGenderGapYear(seriesArr);
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
          const x = Number(ctx.raw?.x);
          return largestGapYear != null && x === Number(largestGapYear) ? 7 : 4;
        },

        pointHoverRadius: (ctx) => {
          const x = Number(ctx.raw?.x);
          return largestGapYear != null && x === Number(largestGapYear)
            ? 10
            : 7;
        },
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

function getMainChartElement(elements) {
  return elements.find((el) => {
    const label = el.element?.$context?.dataset?.label || "";
    return !label.includes("CI") && !label.includes("(trend)");
  });
}

function clearChartYearLock() {
  stopTimelinePlayback();
  lockedChartYear = null;
  resetMarkerHighlight();
  updateLockButton();
  updateChartLockStatus();
  updateSessionStatus();
  fetchNearby().catch(console.error);
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
        if (lockedChartYear != null) return;

        if (!elements.length) {
          clearTimeout(chartHoverTimer);
          lastHoveredChartYear = null;
          resetMarkerHighlight();
          return;
        }

        const point = getMainChartElement(elements);
        if (!point) return;
        const data = point.element?.$context?.raw;
        const year = data?.x;

        if (year == null) return;

        const targetYear = Number(year);
        if (targetYear === lastHoveredChartYear) return;

        clearTimeout(chartHoverTimer);

        chartHoverTimer = setTimeout(() => {
          lastHoveredChartYear = targetYear;
          highlightMarkersByYear(targetYear);
        }, 120);
      },

      onClick: (_event, elements) => {
        if (!elements.length) return;

        const point = getMainChartElement(elements);
        if (!point) return;

        const data = point.element?.$context?.raw;
        const year = data?.x;

        if (year == null) return;

        const clickedYear = Number(year);

        if (lockedChartYear === clickedYear) {
          clearChartYearLock();
          updateLastUpdatedLabel();
          writeUrlState();
          
          return;
        }

        lockedChartYear = clickedYear;
        updateLockButton();
        updateSessionStatus();
        highlightMarkersByYear(clickedYear);
        fetchNearby().catch(console.error);
        updateLastUpdatedLabel();
        writeUrlState();
        updateChartLockStatus();
      },

      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      layout: {
        padding: {
          top: 40,
          right: 24,
          bottom: 40,
          left: 70,
        },
      },
      animation: {
        duration: 600,
        easing: "easeInOutCubic",
      },

      // ✅ KEEP THESE INSIDE options
      scales: {
        x: {
          type: "linear",
          ticks: {
            padding: 8,
          },
        },
        y: {
          min: 0,
          max: 100,

          afterFit: (scale) => {
            scale.width += 30;
          },
          title: {
            display: true,
            text: "Rate (%)",
          },
          ticks: {
            callback: (value) => `${value}%`,
          },
        },
      },

      plugins: {
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

              if (dsLabel.includes("CI") || dsLabel.includes("(trend)"))
                return null;

              const raw = ctx.raw || {};

              const largestGapYear = getLargestGenderGapYear(
                chart?.data?.datasets
                  ?.filter((ds) => ds.label === "Male" || ds.label === "Female")
                  .map((ds) => ({
                    label: ds.label,
                    data: ds.data || [],
                  })) || [],
              );

              const rate = raw.y != null ? Number(raw.y).toFixed(1) : null;
              const n = raw.n;
              const low = raw.low;
              const high = raw.high;

              const lines = [];

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

              if (
                largestGapYear != null &&
                Number(raw.x) === Number(largestGapYear)
              ) {
                lines.push("Largest Male/Female gap year");
              }

              return lines;
            },
          },
        },

        loadingOverlay: {
          text: "Loading…",
          backdrop: "rgba(255,255,255,0.55)",
        },
      },
    },
  });

  setChartLoading(true); // starts in loading state
  chart.canvas.addEventListener("mouseleave", () => {
    clearTimeout(chartHoverTimer);
    lastHoveredChartYear = null;
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
  if (lockedChartYear != null) {
    p.set("lockedYear", String(lockedChartYear));
  } else {
    p.delete("lockedYear");
  }

  if (timelineTimer != null) {
    p.set("playback", "1");
  } else {
    p.delete("playback");
  }

  const exportTheme = document.getElementById("export-theme")?.value || "light";

  if (exportTheme) {
    p.set("exportTheme", exportTheme);
  } else {
    p.delete("exportTheme");
  }

  cleanDeprecatedUrlParams(p);

  const qs = p.toString();
  const url = qs ? `?${qs}` : location.pathname;

  if (push) history.pushState(null, "", url);
  else history.replaceState(null, "", url);

  const researchNote =
    document.getElementById("research-note")?.value?.trim() || "";

  if (researchNote) {
    p.set("note", researchNote);
  } else {
    p.delete("note");
  }
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
  const exportThemeEl = document.getElementById("export-theme");

  if (fromEl && state.from) fromEl.value = state.from;
  if (toEl && state.to) toEl.value = state.to;
  if (groupEl && state.group) groupEl.value = state.group;
  if (bucketEl && state.bucket) bucketEl.value = state.bucket;
  if (confEl && state.confidence) confEl.value = state.confidence;
  if (genderEl && state.gender) genderEl.value = state.gender;
  if (exportThemeEl && state.exportTheme) {
    exportThemeEl.value = state.exportTheme;
  }

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
  const groupInput = document.getElementById("group");

  if (groupInput) {
    const best = getBestMatchingGroup(groupInput.value.trim());

    if (best) {
      groupInput.value = best;
    } else if (groupInput.value.trim() !== "") {
      groupInput.value = "";
    }
  }

  const lockedYear = state.lockedYear != null ? Number(state.lockedYear) : null;

  if (Number.isFinite(lockedYear)) {
    lockedChartYear = lockedYear;
  }

  const playbackEnabled = state.playback === "1";
  return { playbackEnabled };

  const researchNoteEl = document.getElementById("research-note");

  if (researchNoteEl && state.note) {
    researchNoteEl.value = state.note;
  }
  researchNoteEl?.dispatchEvent(new Event("input"));


}

let _urlSyncTimer = null;
function scheduleUrlSync({ push = false } = {}) {
  if (_urlSyncTimer) clearTimeout(_urlSyncTimer);
  _urlSyncTimer = setTimeout(() => writeUrlState({ push }), 120);
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

  const exportTheme = document.getElementById("export-theme")?.value || "light";

  const bg = exportTheme === "dark" ? "#111827" : "#ffffff";

  const sourceCanvas = chart.canvas;
  const extraLeftSpace = 70;
  const extraBottomSpace = 50;

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = sourceCanvas.width + extraLeftSpace;
  exportCanvas.height = sourceCanvas.height + extraBottomSpace;

  const ctx = exportCanvas.getContext("2d");

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

  ctx.drawImage(sourceCanvas, extraLeftSpace, 0);
  const link = document.createElement("a");

  const safeTitle = (chart.options?.plugins?.title?.text || "conviction-chart")
    .toString()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .toLowerCase();

  link.href = exportCanvas.toDataURL("image/png", 1);
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
  writeUrlState();
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

  const sectionHeadingFont = "bold 18px Arial";
  const subHeadingFont = "bold 15px Arial";
  const bodyFont = "14px Arial";
  const smallMetaFont = "11px Arial";      

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

  const lockedYearChip  =
  lockedChartYear != null
    ? {
        text: `Locked year ${lockedChartYear}`,
        bg: exportTheme === "dark" ? "#1e293b" : "#dbeafe",
        color: exportTheme === "dark" ? "#bfdbfe" : "#1d4ed8",
      }
    : null;

  const playbackChip =
  timelineTimer != null
    ? {
        text: "Playback active",
        bg: exportTheme === "dark" ? "#1e293b" : "#dbeafe",
        color: exportTheme === "dark" ? "#bfdbfe" : "#1d4ed8",
      }
    : null;

  const mapQualityChip = hasSharedMarkerLocations()
    ? {
        text: "Shared map locations",
        bg: exportTheme === "dark" ? "#422006" : "#ffedd5",
        color: exportTheme === "dark" ? "#fed7aa" : "#9a3412",
      }
    : null;

  const selectedConfidence =
    document.getElementById("confidence")?.selectedOptions?.[0]?.text || "95%";
  const ciVisible = document.getElementById("toggle-ci")?.checked ?? true;

  const confidenceChip = {
    text: ciVisible ? `CI ${selectedConfidence} visible` : "CI hidden",
    bg: exportTheme === "dark" ? "#0f172a" : "#ecfeff",
    color: exportTheme === "dark" ? "#67e8f9" : "#155e75",
  };
  

  const noteLength =
  document.getElementById("research-note")?.value?.trim().length || 0;

  const noteChip =
    noteLength > 0
      ? {
          text: `Research note (${noteLength} chars)`,
          bg: exportTheme === "dark" ? "#3f1d0b" : "#fff7ed",
          color: exportTheme === "dark" ? "#fdba74" : "#9a3412",
        }
      : null;

  const snapshotTypeChip = {
    text: "Research snapshot",
    bg: exportTheme === "dark" ? "#1f2937" : "#eef2ff",
    color: exportTheme === "dark" ? "#c7d2fe" : "#3730a3",
  };

  const layoutChip = {
    text: exportTheme === "dark"
      ? "Export theme: Dark"
      : "Export theme: Light",
    bg: exportTheme === "dark" ? "#111827" : "#f3f4f6",
    color: exportTheme === "dark" ? "#e5e7eb" : "#374151",
  };

 const hasSessionState =
  lockedChartYear != null ||
  timelineTimer != null ||
  document.getElementById("research-note")?.value?.trim() ||
  Number(localStorage.getItem("snapshotExportCount") || 0) > 0;

const sessionChip =
  hasSessionState
    ? {
        text: "Session state captured",
        bg: exportTheme === "dark" ? "#022c22" : "#dcfce7",
        color: exportTheme === "dark" ? "#bbf7d0" : "#166534",
      }
    : null;

  const exportCount =
  localStorage.getItem("snapshotExportCount") || "0";

  const exportCountChip =
  exportCount && Number(exportCount) > 0
    ? {
        text: `Export #${exportCount}`,
        bg: exportTheme === "dark" ? "#172554" : "#dbeafe",
        color: exportTheme === "dark" ? "#bfdbfe" : "#1d4ed8",
      }
    : null;

    const exportCountForChips =
     Number(localStorage.getItem("snapshotExportCount") || 0);

    const lastExport =
      exportCountForChips > 0
    ? localStorage.getItem("lastSnapshotExportTime")
    : null;

    const lastExportChip =
      lastExport
    ? {
        text: `Last export ${lastExport}`,
        bg: exportTheme === "dark" ? "#1e1b4b" : "#ede9fe",
        color: exportTheme === "dark" ? "#ddd6fe" : "#5b21b6",
      }
    : null;

    const noDataVisible =
  !document
    .getElementById("chart-no-data")
    ?.classList.contains("hidden");

  const noDataChip = noDataVisible
    ? {
        text: "No chart data",
        bg: exportTheme === "dark" ? "#451a03" : "#fef3c7",
        color: exportTheme === "dark" ? "#fde68a" : "#92400e",
      }
    : null;

     const chartBucket =
  document.getElementById("bucket")?.value || "year";

const chartPeriodCount =
  chart.data?.datasets?.[0]?.data?.length || 0;

const bucketLabel =
  chartBucket === "decade"
    ? "decades"
    : chartBucket === "month"
    ? "months"
    : "years";

const chartPeriodChip =
  chartPeriodCount > 0
    ? {
        text: `${chartPeriodCount} ${bucketLabel}`,
        bg: exportTheme === "dark" ? "#1f2937" : "#f3f4f6",
        color: exportTheme === "dark" ? "#d1d5db" : "#374151",
      }
    : null;

    const datasetChip = {
  text: "Old Bailey Dataset",
  bg: exportTheme === "dark" ? "#312e81" : "#e0e7ff",
  color: exportTheme === "dark" ? "#c7d2fe" : "#3730a3",
};

  const largestGapChip = (() => {
    const genderValue = document.getElementById("gender")?.value || "all";

    if (genderValue !== "all") return null;

    const seriesArr = ["Male", "Female"].map((label) => ({
      label,
      data: chart.data.datasets.find((ds) => ds.label === label)?.data || [],
    }));

    const gap = findLargestGenderGap(seriesArr);

    if (!gap) return null;

    const lowSample =
      (gap.maleN ?? 0) < LOW_N_THRESHOLD ||
      (gap.femaleN ?? 0) < LOW_N_THRESHOLD;

    return {
      text: lowSample
        ? `Largest gap: ${gap.year} ⚠`
        : `Largest gap: ${gap.year}`,

      bg: lowSample
        ? exportTheme === "dark"
          ? "#78350f"
          : "#fef3c7"
        : exportTheme === "dark"
          ? "#312e81"
          : "#e0e7ff",

      color: lowSample
        ? exportTheme === "dark"
          ? "#fef3c7"
          : "#92400e"
        : exportTheme === "dark"
          ? "#c7d2fe"
          : "#3730a3",
    };
  })();

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
          snapshotTypeChip,
          datasetChip,
          layoutChip,
          sessionChip,
          exportCountChip,
          lastExportChip,
          lockedYearChip,
          playbackChip,
          
          confidenceChip,
          noteChip,
          chartPeriodChip,
          noDataChip,
          ...(largestGapChip ? [largestGapChip] : []),
          ...(mapQualityChip ? [mapQualityChip] : []),
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
          snapshotTypeChip,
          datasetChip,
          layoutChip,
          sessionChip,
          exportCountChip,
          lastExportChip,
          lockedYearChip,
          playbackChip,
          
          confidenceChip,
          noteChip,
          chartPeriodChip,
          noDataChip,
          ...(largestGapChip ? [largestGapChip] : []),
          ...(mapQualityChip ? [mapQualityChip] : []),
        ];

  const visibleChips = filterChips.filter(Boolean);

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
  const headerHeight = 185;

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

  const estimatedUrlLines = wrapText(currentUrl, 65);
  const urlHeight = estimatedUrlLines.length * 18 + 50;
  const summaryHeight = 1050;

  const height =
    padding +
    headerHeight +
    textHeight +
    sectionGap +
    chartCanvas.height +
    sectionGap +
    summaryHeight +
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

 // title
ctx.fillStyle = theme.textPrimary;
ctx.font = "bold 26px Arial";
const snapshotTitle = noDataVisible
  ? "Old Bailey Research Snapshot — No Chart Data"
  : "Old Bailey Research Snapshot";

ctx.fillText(snapshotTitle, padding + 50, y + 28);

ctx.fillStyle = theme.textSecondary;
ctx.font = bodyFont;
ctx.fillText(
  "Historic criminal case insight export",
  padding + 50,
  y + 52,
);

y += 10;

  let chipX = padding;
  let chipY = y + 72;
  const chipGap = 10;
  const chipRowHeight = 34;

  for (const chip of visibleChips) {
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

    if (y > headerHeight + 180) {
    console.warn("Snapshot chip area is getting tall", {
      chipCount: visibleChips.length,
      y,
    });
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

  y += 26;

  ctx.fillStyle = theme.textSecondary;
  ctx.font = bodyFont;
  ctx.fillText(
  "Historical criminal justice analytics • Old Bailey research workspace",
  padding,
  y,
 );

 

    y += 18;

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
  y += 24;

  const sessionStatus =
   document.getElementById("session-status")?.textContent?.trim() || "";
  
  
  // summary
  const {
  analysisSummary,
  evidenceSummary,
  trackingSummary,
} = buildSnapshotSummary();

function drawSnapshotSummaryGroup(title, lines, showDivider = true) {
  if (!lines || lines.length === 0) return;

  ctx.fillStyle = theme.textSecondary;
  ctx.font = subHeadingFont;
  ctx.fillText(title, padding + 8, y);

  y += 22;

  ctx.fillStyle = theme.textSecondary;
  ctx.font = bodyFont;

  for (const line of lines) {
    ctx.fillText(`• ${line}`, padding + 24, y);
    y += 20;
  }

  if (showDivider) {
    ctx.strokeStyle = theme.divider || theme.border || "#d1d5db";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding + 24, y - 4);
    ctx.lineTo(width - padding - 24, y - 4);
    ctx.stroke();
  }

  y += 14;
}


ctx.fillStyle = theme.textPrimary;
ctx.font = sectionHeadingFont;
ctx.fillText("1. Summary", padding, y);

y += 28;

drawSnapshotSummaryGroup("Analysis", analysisSummary);
drawSnapshotSummaryGroup("Evidence", evidenceSummary);
drawSnapshotSummaryGroup("Tracking", trackingSummary, false);

y+= 5;

const insightText =
  document.getElementById("insight-text")?.textContent?.trim() ||
  "No insight available.";

const firstSentence =
  insightText.match(/.*?[.!?](?:\s|$)/)?.[0]?.trim() ||
  insightText;

const keyFinding = noDataVisible
  ? "No chart data is available for the selected filters."
  : firstSentence.replace(/^Interpretive summary:\s*/i, "");

  ctx.fillStyle = theme.textPrimary;
ctx.font = "bold 16px Arial";
ctx.fillText("Key finding", padding, y);

//y += 15;

ctx.fillStyle = theme.textSecondary;
ctx.font = bodyFont;
//ctx.fillText(`• ${keyFinding}`, padding + 24, y);

y += 30;

const wrappedFinding = wrapText(
  `• ${keyFinding}`,
  90
);

for (const line of wrappedFinding) {
  ctx.fillText(line, padding + 24, y);
  y += 20;
}  

y += 10;

  const notes = buildResearchNotes();

  drawSnapshotDivider(ctx, exportCanvas, padding, y - 10, theme);
  y += 8;

 
y += 26;

ctx.fillStyle = theme.textSecondary;
ctx.font = bodyFont;

y += 12;

  ctx.fillStyle = theme.textPrimary;
  ctx.font = sectionHeadingFont;
  ctx.fillText("2. Research notes", padding, y);

  y += 26;

  ctx.fillStyle = theme.textSecondary;
  ctx.font = subHeadingFont;
  ctx.fillText("Methodology", padding + 8, y);

  y += 22;

  ctx.fillStyle = theme.textSecondary;
  ctx.font = bodyFont;

 for (const note of notes) {
  const wrappedNote = wrapText(`• ${note}`, 95);

  for (const line of wrappedNote) {
    ctx.fillText(line, padding + 8, y);
    y += 20;
  }

  y += 8;
}

  y += sectionGap;

  // footer separator
  y += 10;

  const footerSafetySpace = 160;

if (y + footerSafetySpace > exportCanvas.height) {
  console.warn("Snapshot content may overflow footer area", {
    y,
    canvasHeight: exportCanvas.height,
  });
}

  ctx.strokeStyle = theme.divider;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, y);
  ctx.lineTo(width - padding, y);
  ctx.stroke();

  y += 20;

const stateId = btoa(currentUrl)
  .replace(/[^a-zA-Z0-9]/g, "")
  .slice(0, 8);

const generationTime =
  localStorage.getItem("lastSnapshotGenerationTime");  

const snapshotSize =
  `${exportCanvas.width} × ${exportCanvas.height}px`;  

const researchId = `${stateId}-${exportCount}`;

// timestamp
ctx.fillStyle = theme.footerText;
ctx.font = "italic 13px Arial";
ctx.fillStyle = theme.textPrimary;
ctx.font = subHeadingFont;
ctx.fillText("Export metadata and provenance", padding, y);

y += 18;
ctx.fillText(`Exported: ${exportDateTime}`, padding, y);

const releaseLabel =
  `Snapshot revision: ${APP_VERSION}`;

const footerMetaX = width - padding - 220;

const footerMetaLines = [
  releaseLabel,
  `State ID: ${stateId}`,
  `Research ID: ${researchId}`,
  `Export #${exportCount}`,
  ...(generationTime
    ? [`Generation time: ${generationTime}s`]
    : []),
  `Snapshot size: ${snapshotSize}`,
];

ctx.font = smallMetaFont;
footerMetaLines.forEach((line, index) => {
  ctx.fillText(line, footerMetaX, y + index * 16);
});

y += 64;

y += 48;

  ctx.fillStyle = theme.footerText;
  ctx.font = smallMetaFont;
  ctx.fillText(
    "Generated from Old Bailey Analytics research workspace",
    padding,
    y,
  );

  y += 16;

  ctx.fillText(
    "Dataset: Old Bailey trial records",
    padding,
    y,
  );

  y += 10;

    y+= 18;

  // URL section
  ctx.fillStyle = theme.urlText;
  ctx.fillText("Shareable URL:", padding, y);
  drawSnapshotDivider(ctx, exportCanvas, padding, y - 10, theme);

  y += 20;

  ctx.fillStyle = theme.urlText;
  ctx.font = "13px Arial";

  
  const maxUrlWidth = width - padding * 2;
  const urlLines = wrapCanvasText(ctx, currentUrl, maxUrlWidth);

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

function wrapCanvasText(ctx, text, maxWidth) {
  const chars = String(text || "").split("");
  const lines = [];
  let line = "";

  for (const char of chars) {
    const testLine = line + char;

    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = char;
    } else {
      line = testLine;
    }
  }

  if (line) lines.push(line);

  return lines;
}

function buildResearchNotes() {
  const notes = [];
  const customNote = document.getElementById("research-note")?.value?.trim();

  if (customNote) {
    notes.push(customNote);
  }

  const genderValue = document.getElementById("gender")?.value?.trim() || "all";

  if (genderValue !== "all") {
    notes.push(
      `Results reflect the selected gender filter (${genderValue}).`,
    );
  }

  if (genderValue === "all" && chart?.data?.datasets) {
    const seriesArr = ["Male", "Female"].map((label) => ({
      label,
      data: chart.data.datasets.find((ds) => ds.label === label)?.data || [],
    }));

    const gap = findLargestGenderGap(seriesArr);

    const markerCoords = markersLayer
      ?.getLayers?.()
      .map((marker) => {
        const ll = marker.getLatLng?.();
        return ll ? `${ll.lat.toFixed(6)},${ll.lng.toFixed(6)}` : null;
      })
      .filter(Boolean);


    const sharedLocationCount =
      markerCoords?.length - new Set(markerCoords || []).size;

    if (sharedLocationCount > 0) {
      notes.push(
        "Multiple nearby trials share the same mapped location; clustered markers may represent overlapping records.",
      );
    }

    if (gap) {
      notes.push(
        `The largest Male/Female conviction-rate gap appears in ${gap.year}, with a difference of ${gap.gap.toFixed(1)} percentage points.`,
      );
    }
  }

  if (lockedChartYear != null) {
    notes.push(
      `This snapshot is focused on the locked year ${lockedChartYear}.`,
    );
  }

  notes.push(
    "Low sample sizes mean individual years should be interpreted cautiously.",
  );
  notes.push(
    "Spatial results are limited to the selected radius and map centre.",
  );
  notes.push(
    `Map centre used: ${currentCenter.lat.toFixed(4)}, ${currentCenter.lng.toFixed(4)}.`,
  );

  notes.push(
    "Filters, date range, map radius, and locked-year state are recorded in the snapshot URL for reproducibility.",
  );

  notes.push(
    "Interpretations are based on the currently filtered sample and should not be treated as the full historical population.",
  );


  const noDataVisible =
    !document
      .getElementById("chart-no-data")
      ?.classList.contains("hidden");

  if (noDataVisible) {
    notes.push(
      "No chart data is available for the selected filter combination; adjust offence group, gender, or date range.",
    );
  }

  return notes;

}

async function downloadResearchSnapshot() {
  const start = performance.now();

  const chartTitle =
    chart.options?.plugins?.title?.text?.toString().trim() ||
    "research-snapshot";

  const {
    display: exportDisplayTime,
    file: exportFileTime,
  } = getExportDateTime();

    localStorage.setItem(
    "lastSnapshotExportTime",
    exportDisplayTime,
  );

  updateLastExportStatus();
  updateSessionStatus();
  updateResearchIdStatus();

  const versionSlug = APP_VERSION.replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();

  const offence =
    document.getElementById("group")?.value?.trim() || "all-offences";

  const gender = document.getElementById("gender")?.value?.trim() || "all";

  const bucket = document.getElementById("bucket")?.value || "year";

  const noDataVisible =
  !document
    .getElementById("chart-no-data")
    ?.classList.contains("hidden");

  const dataPart = noDataVisible
  ? "no-chart-data"
  : "chart-data";

  const lockPart =
    lockedChartYear != null ? `locked-${lockedChartYear}` : "unlocked";

  const safeTitle = ["research-snapshot", offence, gender, bucket, lockPart, dataPart]
    .join("-")
    .replace(/[^\w-]/g, "")
    .replace(/-+/g, "-")
    .toLowerCase();

     writeUrlState();
     updateResearchIdStatus();

    const currentUrl = window.location.href;

    const stateId = btoa(currentUrl)
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 8);


  const exportCount =
     Number(localStorage.getItem("snapshotExportCount") || 0) + 1;

  localStorage.setItem(
    "snapshotExportCount",
    exportCount, 
  );
  updateExportCountStatus();
  updateSessionStatus();
  updateResearchIdStatus();
  updateLastExportStatus();

  const researchId = `${stateId}-${exportCount}`;  

  const exportTime = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  localStorage.setItem(
  "lastSnapshotExportTime",
  exportDisplayTime,
);

  updateLastExportStatus();
  updateSessionStatus();

  const exportCanvas =
  await buildResearchSnapshotCanvas();
  
  if (!exportCanvas) return;
 

  exportCanvas.toBlob((blob) => {
    if (!blob) {
      console.error("Failed to create export blob");
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
   
    link.download =
      `${safeTitle}-${researchId}-${versionSlug}-${exportFileTime}.png`;    
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

function drawSnapshotDivider(ctx, exportCanvas, padding, y, theme) {
  ctx.strokeStyle = theme.border || theme.divider || "#303840";
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(padding, y);
  ctx.lineTo(exportCanvas.width - padding, y);
  ctx.stroke();
}

function buildSnapshotSummary() {
  const offence =
    document.getElementById("group")?.value?.trim() || "All offences";

  const gender = document.getElementById("gender")?.value?.trim() || "all";

  const bucket = document.getElementById("bucket")?.value || "year";

  const nearbyCount = markersLayer?.getLayers?.().length || 0;

  const genderValue = document.getElementById("gender")?.value?.trim() || "all";

  const from =
  document.getElementById("from")?.value || "";

  const confidenceValue =
  document.getElementById("confidence")?.selectedOptions?.[0]?.text ||
  "95%";

  const exportCount =
  localStorage.getItem("snapshotExportCount") || "0";

  const noDataVisible =
  !document
    .getElementById("chart-no-data")
    ?.classList.contains("hidden");

  const dateFrom = document.getElementById("from")?.value;
  const dateTo = document.getElementById("to")?.value;

  const analysisScope =
  lockedChartYear != null
    ? "Focused year analysis"
    : "Multi-period trend analysis";

  const researchId = getCurrentResearchId();

  const chartPeriodCount = chart.data?.datasets?.[0]?.data?.length || 0;

  const densityLabel = chartPeriodCount >= 20
      ? "High"
      : chartPeriodCount >= 10
      ? "Moderate"
      : "Low";

  let activeFilters = 0;

  if (offence !== "all") activeFilters++;
  if (gender !== "all") activeFilters++;
  if (lockedChartYear != null) activeFilters++;
  if (dateFrom || dateTo) activeFilters++;

  let rangeText = "Full dataset";

  if (dateFrom && dateTo) {
    rangeText =
      `${formatDisplayDate(dateFrom)} to ${formatDisplayDate(dateTo)}`;
  } else if (dateFrom) {
    rangeText = `From ${formatDisplayDate(dateFrom)}`;
  } else if (dateTo) {
    rangeText = `Up to ${formatDisplayDate(dateTo)}`;
  }

  let genderGapLine = null;

  if (genderValue === "all" && chart?.data?.datasets) {
    const seriesArr = ["Male", "Female"].map((label) => ({
      label,
      data: chart.data.datasets.find((ds) => ds.label === label)?.data || [],
    }));

    const gap = findLargestGenderGap(seriesArr);

    if (gap) {
      genderGapLine = `Largest gender gap: ${gap.year} — Male ${gap.male.toFixed(1)}%, Female ${gap.female.toFixed(1)}%, gap ${gap.gap.toFixed(1)}pp`;
    }
  }

  const reliabilityLabel =
  noDataVisible
    ? "Unavailable"
    : chartPeriodCount >= 20
    ? "Stronger trend signal"
    : chartPeriodCount >= 10
    ? "Moderate trend signal"
    : "Limited trend signal";

  const analysisSummary = [
  `Offence: ${offence}`,
  `Gender: ${gender}`,
  `Range: ${rangeText}`,
  `Bucket: ${bucket}`,
  `Analysis scope: ${analysisScope}`,
];  

const radiusValue =
  document.getElementById("radius")?.value || "2000";

const evidenceSummary = [
  `Nearby records: ${nearbyCount}`,
  `Radius: ${radiusValue}m`,
  `Data density: ${densityLabel} (${chartPeriodCount} chart periods)`,
  `Confidence level: ${confidenceValue}`,
  document.getElementById("toggle-ci")?.checked
    ? "Confidence interval visible"
    : "Confidence interval hidden",
];

const trackingSummary = [
  `Active filters applied: ${activeFilters}`,
  `Export reference: #${exportCount}`,
  `Research ID: ${researchId}`,
];

  return {
  analysisSummary,
  evidenceSummary,
  trackingSummary,
};
}

function updateLockButton() {
  const btn = document.getElementById("clear-lock-btn");
  if (!btn) return;

  btn.hidden = lockedChartYear == null;
  btn.textContent =
    lockedChartYear != null ? `Clear lock: ${lockedChartYear}` : "Clear lock";
}

function getChartYears() {
  if (!chart) return [];

  const years = chart.data.datasets
    .filter((ds) => {
      const label = ds.label || "";
      const gender = document.getElementById("gender")?.value?.trim() || "all";

      if (label.includes("CI")) return false;
      if (label.includes("(trend)")) return false;

      if (gender === "male") {
        return label === "Male";
      }

      if (gender === "female") {
        return label === "Female";
      }

      return true;
    })
    .flatMap((ds) => ds.data || [])
    .map((p) => Number(p.x))
    .filter((x) => Number.isFinite(x));

  return [...new Set(years)].sort((a, b) => a - b);
}

function updateTimelineButtons(isPlaying) {
  const playBtn = document.getElementById("play-timeline-btn");
  const stopBtn = document.getElementById("stop-timeline-btn");

  if (playBtn) playBtn.hidden = isPlaying;
  if (stopBtn) stopBtn.hidden = !isPlaying;
}

function stopTimelinePlayback() {
  clearInterval(timelineTimer);
  timelineTimer = null;
  timelineIndex = 0;
  updateTimelineButtons(false);
}

function startTimelinePlayback() {
  timelineYears = getChartYears();

  if (!timelineYears.length) return;

  stopTimelinePlayback();
  updateTimelineButtons(true);

  timelineIndex = 0;

  timelineTimer = setInterval(() => {
    const year = timelineYears[timelineIndex];

    lockedChartYear = year;
    chart.options.plugins.subtitle.text = `Playback year: ${year}`;

    chart.update("none");
    updateLockButton();
    highlightMarkersByYear(year);
    fetchNearby().catch(console.error);

    timelineIndex += 1;

    if (timelineIndex >= timelineYears.length) {
      stopTimelinePlayback();
    }
  }, 1000);
}

function findLargestGenderGap(seriesArr) {
  const male = seriesArr.find((s) => s.label === "Male");
  const female = seriesArr.find((s) => s.label === "Female");

  if (!male || !female) return null;

  const femaleByYear = new Map(female.data.map((p) => [p.x, p]));

  let best = null;

  for (const m of male.data) {
    const f = femaleByYear.get(m.x);
    if (!f || m.y == null || f.y == null) continue;

    const gap = Math.abs(m.y - f.y);

    if (!best || gap > best.gap) {
      best = {
        year: m.x,
        male: m.y,
        female: f.y,
        maleN: m.n,
        femaleN: f.n,
        gap,
      };
    }
  }

  return best;
}

function getLargestGenderGapYear(seriesArr) {
  const genderValue = document.getElementById("gender")?.value || "all";
  if (genderValue !== "all") return null;

  const gap = findLargestGenderGap(seriesArr);
  return gap?.year ?? null;
}

function updateGenderGapNote(seriesArr) {
  const el = document.getElementById("gender-gap-note");
  if (!el) return;

  const genderValue = document.getElementById("gender")?.value || "all";

  if (genderValue !== "all") {
    el.textContent = "";
    return;
  }

  const gap = findLargestGenderGap(seriesArr);

  const lowSample =
    (gap.maleN ?? 0) < LOW_N_THRESHOLD || (gap.femaleN ?? 0) < LOW_N_THRESHOLD;

  genderGapLine = `Largest gender gap: ${gap.year} — Male ${gap.male.toFixed(
    1,
  )}% (n=${gap.maleN}), Female ${gap.female.toFixed(
    1,
  )}% (n=${gap.femaleN}), gap ${gap.gap.toFixed(1)}pp${
    lowSample ? " ⚠ low sample" : ""
  }`;
}

function updateGenderGapBadge(seriesArr) {
  const badge = document.getElementById("gender-gap-badge");
  if (!badge) return;
  const genderValue = document.getElementById("gender")?.value || "all";

  if (genderValue !== "all") {
    badge.hidden = true;
    badge.textContent = "";
    return;
  }

  const gap = findLargestGenderGap(seriesArr);

  if (!gap) {
    badge.hidden = true;
    badge.textContent = "";
    return;
  }
  const lowSample =
    (gap.maleN ?? 0) < LOW_N_THRESHOLD || (gap.femaleN ?? 0) < LOW_N_THRESHOLD;

  badge.hidden = false;

  badge.textContent = lowSample
    ? `Largest gap: ${gap.year} ⚠`
    : `Largest gap: ${gap.year}`;

  badge.style.background = lowSample ? "#fef3c7" : "#dbeafe";
  badge.style.color = lowSample ? "#92400e" : "#1d4ed8";
  badge.style.padding = "4px 10px";
  badge.style.borderRadius = "999px";
  badge.style.fontSize = "13px";
  badge.style.fontWeight = "600";
  badge.style.display = "inline-block";
}

function hasSharedMarkerLocations() {
  const markerCoords = markersLayer
    ?.getLayers?.()
    .map((marker) => {
      const ll = marker.getLatLng?.();
      return ll ? `${ll.lat.toFixed(6)},${ll.lng.toFixed(6)}` : null;
    })
    .filter(Boolean);

  if (!markerCoords?.length) return false;

  return new Set(markerCoords).size < markerCoords.length;
}

function updateLastUpdatedLabel() {
  const el = document.getElementById("last-updated");
  if (!el) return;

  const now = new Date();

  el.textContent = `Last updated: ${now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function updateExportThemeStatus() {
  const theme = document.getElementById("export-theme")?.value || "light";
  const el = document.getElementById("export-theme-status");
  if (!el) return;

  el.textContent = `Export theme: ${theme}`;
}

function updateCiStatus() {
  const el = document.getElementById("ci-status");
  if (!el) return;

  const ciVisible = document.getElementById("toggle-ci")?.checked ?? true;
  const selectedConfidence =
    document.getElementById("confidence")?.selectedOptions?.[0]?.text || "95%";

  el.textContent = ciVisible ? `CI ${selectedConfidence} visible` : "CI hidden";
}

function showConfidenceStatus() {
  const el = document.getElementById("confidence-status");
  if (!el) return;

  const label =
    document.getElementById("confidence")?.selectedOptions?.[0]?.text || "95%";

  el.textContent = `Confidence set to ${label}`;

  setTimeout(() => {
    el.textContent = "";
  }, 1200);
}

function updateChartLockStatus() {
  const el = document.getElementById("chart-lock-status");
  if (!el) return;

  el.textContent =
    lockedChartYear != null
      ? `Locked year: ${lockedChartYear}`
      : "No year locked";
}



function showResearchNoteSaved() {
  const el = document.getElementById(
    "research-note-save-status",
  );

  if (!el) return;

  el.textContent = "Saved ✓";

  setTimeout(() => {
    el.textContent = "";
  }, 1000);
}

function updateExportCountStatus() {
  const el = document.getElementById("export-count-status");
  if (!el) return;

  const count = localStorage.getItem("snapshotExportCount") || "0";
  el.textContent = `Exports created: ${count}`;
}

function updateLastExportStatus() {
  const el = document.getElementById("last-export-status");
  if (!el) return;

  const lastExport =
    localStorage.getItem("lastSnapshotExportTime");

  el.textContent = lastExport
    ? `Last export: ${lastExport}`
    : "No exports yet";
}

function cleanDeprecatedUrlParams(p) {
  const deprecatedParams = ["exports"];

  deprecatedParams.forEach((param) => {
    if (p.has(param)) {
      console.info(`Removed deprecated URL param: ${param}`);
      p.delete(param);
    }
  });
}

function buildSessionStatusParts() {
  const parts = [];

  if (lockedChartYear != null) {
    parts.push(`Locked year ${lockedChartYear}`);
  } else {
    parts.push("No lock");
  }

  const ciEnabled =
    document.getElementById("toggle-ci")?.checked ?? true;

  parts.push(ciEnabled ? "CI on" : "CI off");

  const noDataVisible =
  !document
    .getElementById("chart-no-data")
    ?.classList.contains("hidden");

  if (noDataVisible) {
  parts.push("No chart data");
}

  const researchNoteEl = document.getElementById("research-note");

  parts.push(
    researchNoteEl?.value?.trim()
      ? "Note added"
      : "No note",
  );

  const exportCount =
    localStorage.getItem("snapshotExportCount") || "0";

  parts.push(`Exports ${exportCount}`);

  const lastExport =
    localStorage.getItem("lastSnapshotExportTime");

  if (lastExport) {
    parts.push(`Last export ${lastExport}`);
  }

  return parts;
}

function updateSessionStatus() {
  const el = document.getElementById("session-status");
  if (!el) return;

  const parts = buildSessionStatusParts();

  //const updated =
    //document
      //.getElementById("last-updated")
      //?.textContent?.replace("Last updated: ", "") || "";

  //if (updated) {
    //parts.push(updated);
  //}

  el.textContent = parts.join(" • ");
}

function getCurrentResearchId() {
  writeUrlState();
 

  const currentUrl = window.location.href;

  const stateId = btoa(currentUrl)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8);

  const exportCount =
    localStorage.getItem("snapshotExportCount") || "0";

  return `${stateId}-${exportCount}`;
}

function updateResearchIdStatus() {
  const el = document.getElementById("research-id-status");
  if (!el) return;

  const refreshedAt = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  el.textContent =
    `Research ID: ${getCurrentResearchId()} • refreshed ${refreshedAt}`;
}

function updateChartDataStatus() {
  const el = document.getElementById("chart-data-status");
  if (!el) return;

  const noDataVisible =
    !document
      .getElementById("chart-no-data")
      ?.classList.contains("hidden");

  el.textContent = noDataVisible
    ? "No chart data for current filters"
    : "";
}

async function render() {
  ensureChart();

  showNoDataOverlay(false);
  setChartLoading(true);
  updateCiStatus();
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

    updateChartDataStatus();

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

      updateGenderGapNote([]);
      updateGenderGapBadge([]);

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

    chart.options.scales.x.title = {
      display: false,
    };

    chart.options.layout.padding.bottom = 40;
    chart.options.layout.padding.left = 70;

    chart.update();

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

    chart.options.plugins.title.text = `${groupLabel} — Conviction Rate by ${bucket === "decade" ? "Decade" : "Year"} (${genderLabel}) • Radius ${radius}m`;
    chart.options.plugins.subtitle.text = `Map center: ${currentCenter.lat.toFixed(4)}, ${currentCenter.lng.toFixed(4)}`;
    // 🔥 NEW unified panel logic (REPLACE old heading block with this)
    let insightText = generateInsight(payload.series);

    const genderValue = document.getElementById("gender")?.value || "all";

    if (genderValue === "all") {
      const gap = findLargestGenderGap(payload.series);

      if (gap) {
        insightText += ` Largest gender gap appears in ${gap.year}: Male ${gap.male.toFixed(
          1,
        )}%, Female ${gap.female.toFixed(1)}%, gap ${gap.gap.toFixed(1)} percentage points.`;
      }
    }

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

    updateGenderGapNote(payload.series);
    updateGenderGapBadge(payload.series);

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
let lastHoveredChartYear = null;
let chartHoverTimer = null;
let lockedChartYear = null;
let timelineTimer = null;
let timelineYears = [];
let timelineIndex = 0;

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

  const doPan = () => {};
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
      zoomToBoundsOnClick: true,
      maxClusterRadius: 120,
    });
    map.addLayer(markersLayer);
  }

  if (!centerMarker) {
    centerMarker = L.marker([currentCenter.lat, currentCenter.lng], {
      draggable: true,
    })
      .addTo(map)
      .bindPopup("Search center (drag me)");

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

    const el = layer.getElement?.();
    if (!el) return;

    if (markerYear === targetYear) {
      el.classList.remove("marker-faded");
      el.classList.add("marker-highlight");
      layer.setZIndexOffset?.(1000);
    } else {
      el.classList.remove("marker-highlight");
      el.classList.add("marker-faded");
      layer.setZIndexOffset?.(0);
    }
  });
}

function resetMarkerHighlight() {
  if (!markersLayer) return;

  markersLayer.eachLayer((layer) => {
    const el = layer.getElement?.();
    if (!el) return;

    el.classList.remove("marker-faded");
    el.classList.remove("marker-highlight");
    layer.setZIndexOffset?.(0);
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
  const gender = document.getElementById("gender")?.value || "all";

  const params = new URLSearchParams({
    lat: String(currentCenter.lat),
    lng: String(currentCenter.lng),
    from,
    to,
    radius: String(radius),
    limit: String(limit),
    gender,
  });

  if (lockedChartYear != null) {
    params.set("year", String(lockedChartYear));
  }

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
        //map.panTo(marker.getLatLng(), { animate: true });
        marker.openPopup();
      });

      btn.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });
}

async function fetchNearby() {
  ensureMap();
  updateRadiusCircle();

  resetMarkerHighlight();

  if (window.__nearbyUI) {
    window.__nearbyUI.pinnedMarker?.closePopup?.();
    window.__nearbyUI.hoverMarker?.closePopup?.();
    window.__nearbyUI.activeMarker?.closePopup?.();

    window.__nearbyUI.pinnedMarker = null;
    window.__nearbyUI.hoverMarker = null;
    window.__nearbyUI.activeMarker = null;

    if (window.__nearbyUI.activeListBtn) {
      window.__nearbyUI.activeListBtn.classList.remove("is-active");
    }

    window.__nearbyUI.activeListBtn = null;
  }

  markersLayer.clearLayers();

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

    const mapQualityNote = document.getElementById("map-quality-note");

    if (mapQualityNote) {
      const coordCounts = {};

      rows.forEach((r) => {
        const key = `${r.latitude},${r.longitude}`;
        coordCounts[key] = (coordCounts[key] || 0) + 1;
      });

      const hasSharedLocations = Object.values(coordCounts).some(
        (count) => count > 1,
      );

      mapQualityNote.textContent = hasSharedLocations
        ? "Note: Multiple trials may share the same mapped location."
        : "";
    }

    // Reset marker lookup
    markerById = new Map();

    // Drop markers ONCE
    rows.forEach((r, i) => {
      const baseLat = Number(r.latitude);
      const baseLng = Number(r.longitude);
      if (!Number.isFinite(baseLat) || !Number.isFinite(baseLng)) return;

      const lat = Number(r.latitude);
      const lng = Number(r.longitude);

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

          marker.openPopup();

          btn?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      }

      // MarkerClusterGroup uses addLayer
      markersLayer.addLayer(marker);
    });
    markersLayer.refreshClusters?.();
    // Render list AFTER markers exist
    renderNearbyList(rows, markerById);

    if (lockedChartYear != null) {
      const firstMarker = markersLayer.getLayers()[0];

      if (firstMarker) {
        firstMarker.openPopup();
      }
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

  map.once("layeradd", () => {
    map.invalidateSize();
  });

  map.whenReady(() => {
    map.invalidateSize();
  });
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
        centerMarker.setLatLng([currentCenter.lat, currentCenter.lng]);

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

document.getElementById("bucket").addEventListener("change", () => {
  scheduleUrlSync();

  render().then(updateLastUpdatedLabel).catch(console.error);
});

document.getElementById("confidence")?.addEventListener("change", () => {
  scheduleUrlSync();
  updateCiStatus();

  render()
    .then(() => {
      updateLastUpdatedLabel();
      showConfidenceStatus();
    })
    .catch(console.error);
});

document.getElementById("toggle-ci")?.addEventListener("change", () => {
  scheduleUrlSync();
  updateCiStatus();
  updateSessionStatus();

  render().then(updateLastUpdatedLabel).catch(console.error);
});

document.getElementById("gender")?.addEventListener("change", () => {
  scheduleUrlSync();

  render().then(updateLastUpdatedLabel).catch(console.error);
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

  // offence search input: live preview + apply on blur/enter

  const groupInput = document.getElementById("group");

  groupInput.addEventListener("change", () => {
    applyBestGroupMatchAndRender(groupInput);
  });

  groupInput.addEventListener("blur", () => {
    applyBestGroupMatchAndRender(groupInput);
  });

  groupInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;

    e.preventDefault();

    setTimeout(() => {
      const best = getBestMatchingGroup(groupInput.value.trim());

      if (best) {
        groupInput.value = best;
        groupInput.setSelectionRange(best.length, best.length);
        applyBestGroupMatchAndRender(groupInput);
      }
    }, 0);
  });

  groupInput.addEventListener("input", (e) => {
    const isDeleting = e.inputType && e.inputType.startsWith("delete");

    if (!isDeleting) {
      previewBestGroupMatch(groupInput);
    }

    updateGroupInputState();

    const value = groupInput.value.trim();

    const exactMatch = Array.from(
      document.getElementById("groupOptions")?.options || [],
    ).some((option) => option.value === value);

    if (!isDeleting && exactMatch) {
      applyBestGroupMatchAndRender(groupInput);
    }
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

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && lockedChartYear != null) {
      clearChartYearLock();
    }
  });

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

      const researchNoteEl = document.getElementById("research-note");
      const researchNoteStatus = document.getElementById(
        "research-note-status",
      );

      const maxNoteChars = 240;
      const researchNoteCount = document.getElementById("research-note-count");

      researchNoteEl?.addEventListener("input", () => {
        if (!researchNoteStatus) return;

        const value = researchNoteEl.value;

        if (value.length > maxNoteChars) {
          researchNoteEl.value = value.slice(0, maxNoteChars);
        }

        const length = researchNoteEl.value.length;

        researchNoteStatus.textContent = researchNoteEl.value.trim()
          ? "Custom note will be included in exports."
          : "";

        if (researchNoteCount) {
          researchNoteCount.textContent = `${length}/${maxNoteChars}`;
        }
        writeUrlState();
        showResearchNoteSaved();
        updateSessionStatus();
      });

      const copySessionStatusBtn = document.getElementById(
  "copy-session-status-btn",
);

copySessionStatusBtn?.addEventListener("click", async () => {
  const previousText = copySessionStatusBtn.textContent;
  const status =
    document.getElementById("session-status")?.textContent || "";

  copySessionStatusBtn.disabled = true;
  copySessionStatusBtn.textContent = "Copying…";

  try {
    await navigator.clipboard.writeText(status);

    copySessionStatusBtn.textContent = "Copied ✓";
  } catch (err) {
    console.error(err);
    copySessionStatusBtn.textContent = "Copy failed";
  } finally {
    setTimeout(() => {
      copySessionStatusBtn.disabled = false;
      copySessionStatusBtn.textContent =
        previousText || "Copy status";
    }, 900);
  }
});

const copyResearchNoteBtn = document.getElementById("copy-research-note-btn");

copyResearchNoteBtn?.addEventListener("click", async () => {
  const note = document.getElementById("research-note")?.value?.trim() || "";
  const previousText = copyResearchNoteBtn.textContent;

  copyResearchNoteBtn.disabled = true;
  copyResearchNoteBtn.textContent = "Copying…";

  try {
    await navigator.clipboard.writeText(note);
    copyResearchNoteBtn.textContent = note ? "Copied ✓" : "No note";
  } catch (err) {
    console.error(err);
    copyResearchNoteBtn.textContent = "Copy failed";
  } finally {
    setTimeout(() => {
      copyResearchNoteBtn.disabled = false;
      copyResearchNoteBtn.textContent = previousText || "Copy note";
    }, 900);
  }
});

const resetExportCountBtn =
  document.getElementById("reset-export-count-btn");

resetExportCountBtn?.addEventListener("click", () => {
  localStorage.setItem("snapshotExportCount", "0");
  localStorage.removeItem("lastSnapshotExportTime");

  updateExportCountStatus();
  updateLastExportStatus();
  updateSessionStatus();
  writeUrlState();
  updateResearchIdStatus();

  const exportCountStatus =
    document.getElementById("export-count-status");

  if (exportCountStatus) {
    exportCountStatus.textContent =
      "Exports reset. Next export will be #1.";
  }

  resetExportCountBtn.textContent = "Reset ✓";

  setTimeout(() => {
    resetExportCountBtn.textContent = "Reset export count";
  }, 900);
});

const copyResearchIdBtn =
  document.getElementById("copy-research-id-btn");

copyResearchIdBtn?.addEventListener("click", async () => {
  const previousText = copyResearchIdBtn.textContent;

  copyResearchIdBtn.disabled = true;
  copyResearchIdBtn.textContent = "Copying…";

  try {
const researchIdText =
  document.getElementById("research-id-status")?.textContent ||
  `Research ID: ${getCurrentResearchId()}`;

 await navigator.clipboard.writeText(researchIdText);    

copyResearchIdBtn.textContent = "Copied ✓";
  } catch (err) {
    console.error(err);
    copyResearchIdBtn.textContent = "Copy failed";
  } finally {
    setTimeout(() => {
      copyResearchIdBtn.disabled = false;
      copyResearchIdBtn.textContent =
        previousText || "Copy research ID";
    }, 900);
  }
});

const refreshResearchIdBtn =
  document.getElementById("refresh-research-id-btn");

refreshResearchIdBtn?.addEventListener("click", () => {
  writeUrlState();
  updateResearchIdStatus();

  refreshResearchIdBtn.textContent = "Refreshed ✓";

  setTimeout(() => {
    refreshResearchIdBtn.textContent = "Refresh research ID";
  }, 900);
});

      document
        .getElementById("clear-lock-btn")
        ?.addEventListener("click", () => {
          clearChartYearLock();
        });

      document
        .getElementById("play-timeline-btn")
        ?.addEventListener("click", () => {
          startTimelinePlayback();
        });

      document
        .getElementById("stop-timeline-btn")
        ?.addEventListener("click", () => {
          stopTimelinePlayback();
        });

      const copySnapshotUrlBtn = document.getElementById(
        "copy-snapshot-url-btn",
      );

      copySnapshotUrlBtn?.addEventListener("click", async () => {
        const previousText = copySnapshotUrlBtn.textContent;

        copySnapshotUrlBtn.disabled = true;
        copySnapshotUrlBtn.textContent = "Copying…";

        try {
          writeUrlState();

          await navigator.clipboard.writeText(window.location.href);

          copySnapshotUrlBtn.textContent = "Copied ✓";
        } catch (err) {
          console.error(err);
          copySnapshotUrlBtn.textContent = "Copy failed";
        } finally {
          setTimeout(() => {
            copySnapshotUrlBtn.disabled = false;
            copySnapshotUrlBtn.textContent =
              previousText || "Copy snapshot URL";
          }, 900);
        }
      });

      document
        .getElementById("clear-research-note-btn")
        ?.addEventListener("click", () => {
          const note = document.getElementById("research-note");
          const status = document.getElementById("research-note-status");

          if (!note) return;

          note.value = "";
          note.dispatchEvent(new Event("input"));

          if (status) {
            status.textContent = "Note cleared ✓";

            setTimeout(() => {
              status.textContent = "";
            }, 900);
          }

          writeUrlState();
          updateSessionStatus();
        });

      const exportThemeEl = document.getElementById("export-theme");

      exportThemeEl?.addEventListener("change", () => {
        writeUrlState();
        updateExportThemeStatus();
      });

      const reloadBtn = document.getElementById("reload");

      if (reloadBtn) {
        reloadBtn.addEventListener("click", async () => {
          const previousText = reloadBtn.textContent;

          reloadBtn.disabled = true;
          reloadBtn.textContent = "Reloading…";

          try {
            stopTimelinePlayback();

            lockedChartYear = null;
            resetMarkerHighlight();
            updateLockButton();
            updateSessionStatus();

            await render();
            await fetchNearby();
            updateLastUpdatedLabel();
            updateExportCountStatus();

            writeUrlState();
          } catch (err) {
            console.error(err);
          } finally {
            reloadBtn.textContent = "Updated ✓";

            setTimeout(() => {
              reloadBtn.disabled = false;
              reloadBtn.textContent = previousText || "Reload";
            }, 900);
          }
        });
      }

      ["from", "to"].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;

        const refreshDateFilters = () => {
          clearChartYearLock();
          Promise.all([render(), fetchNearby()])
            .then(updateLastUpdatedLabel)
            .catch(console.error);
        };

        el.addEventListener("change", refreshDateFilters);

        el.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            el.blur(); // forces the browser to commit the date value
            refreshDateFilters();
          }
        });
      });
    }
  }

  const downloadSnapshotBtn = document.getElementById("download-snapshot-btn");

  if (downloadSnapshotBtn) {
    downloadSnapshotBtn.addEventListener("click", async () => {
      const previousText = downloadSnapshotBtn.textContent;

      downloadSnapshotBtn.disabled = true;
      downloadSnapshotBtn.textContent = "Exporting…";

      try {
        const start = performance.now();

        await downloadResearchSnapshot();

        const duration = ((performance.now() - start) / 1000).toFixed(1);
        localStorage.setItem("lastSnapshotGenerationTime", duration);

        const exportTime =
          new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });

downloadSnapshotBtn.textContent =
  `Exported ✓ ${exportTime} (${duration}s)`;
      } catch (err) {
        console.error(err);
        downloadSnapshotBtn.textContent = "Export failed";
      } finally {
        setTimeout(() => {
          downloadSnapshotBtn.disabled = false;
          downloadSnapshotBtn.textContent =
            previousText || "Download research snapshot";
        }, 900);
      }
    });
  }

  const state = readUrlState();
  const { playbackEnabled } = applyStateToUI(state);
  updateCiStatus();

  updateExportThemeStatus();

  ensureMap();
  updateRadiusCircle();

  await render().catch(console.error);
  await fetchNearby().catch(console.error);
  updateLastUpdatedLabel();

  if (lockedChartYear != null) {
    highlightMarkersByYear(lockedChartYear);
    updateLockButton();
    updateChartLockStatus();
  }

  if (playbackEnabled) {
    startTimelinePlayback();
  }
}

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
  updateExportThemeStatus(); // <-- HERE
  updateResearchIdStatus(); // <-- HERE

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
