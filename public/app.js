let chart; // single chart reference
const DEFAULT_CI_ALPHA = 0.2;
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
          `rgba($1, ${alpha})`
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
      /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)/
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

function buildUrl() {
  const from = document.getElementById("from").value;
  const to = document.getElementById("to").value;
  const bucket = document.getElementById("bucket").value;
  const group = document.getElementById("group").value.trim();
  const z = String(Number(document.getElementById("confidence").value || 1.96));
  const params = new URLSearchParams({ bucket, from, to, format: "series", z });

  if (group) params.set("group", group);

  return `/api/stats/gender-party/over-time?${params.toString()}`;
}

async function loadSeries() {
  const url = buildUrl();
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Request failed (${res.status}): ${txt}`);
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

function buildDatasets(seriesArr) {
  const datasets = [];

  seriesArr.forEach((series) => {
    const { rgb, rgba } = rgbaForLabel(series.label, DEFAULT_CI_ALPHA);

    // upper (invisible line)
    datasets.push({
      label: `${series.label} (upper CI)`,
      data: series.data.map((p) => ({ x: p.x, y: p.high })),
      borderColor: "transparent",
      backgroundColor: "transparent",
      borderWidth: 0,
      pointRadius: 0,
      pointHoverRadius: 0,
      hitRadius: 0,
    });

    // band (filled to previous dataset)
    datasets.push({
      label: `${series.label} (CI band)`,
      data: series.data.map((p) => ({ x: p.x, y: p.low })),
      fill: "-1",
      backgroundColor: rgba,
      borderColor: "transparent",
      borderWidth: 0,
      pointRadius: 0,
      pointHoverRadius: 0,
      hitRadius: 0,
    });

    // main line
    datasets.push({
      label: series.label,
      data: series.data.map((p) => ({
        x: p.x,
        y: p.y,
        n: p.n,
        low: p.low,
        high: p.high,
      })),
      borderColor: rgb,
      backgroundColor: rgb,
      tension: LINE_TENSION,
      spanGaps: true,
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 6,
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

function ensureChart() {
  if (chart) return;

  const ctx = document.getElementById("crimeChart").getContext("2d");

  chart = new Chart(ctx, {
    type: "line",
    data: { datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      scales: {
        x: { type: "linear", title: { display: true, text: "Year" } },
        y: { min: 0, max: 100, title: { display: true, text: "Guilty rate (%)" } }
      },
      plugins: {
        legend: {
          labels: {
            // Only show the "main line" datasets in the legend (hide CI helpers)
            filter: (item, chartData) => {
              const ds = chartData.datasets[item.datasetIndex];
              return (
                !ds.label.includes("(upper CI)") &&
                !ds.label.includes("(CI band)")
              );
            },

            // Nicer legend look
            usePointStyle: true,
            pointStyle: "line",
            boxWidth: 32,
            padding: 16
          },

          // Click legend item => toggle whole group (line + CI band + upper CI)
          onClick: (e, item, legend) => {
            const c = legend.chart;
            const ds = c.data.datasets[item.datasetIndex];
            const base = (ds.label || "").replace(/\s*\(.*?\)\s*$/, "");

            const main = c.data.datasets.find(d => (d.label || "") === base);
            const nextHidden = main ? !main.hidden : true;

            c.data.datasets.forEach(d => {
              const lbl = d.label || "";
              if (lbl.startsWith(base)) {
                d.hidden = nextHidden;

                // if we're showing again, CI visibility should still obey your checkbox
                if (!nextHidden && lbl.includes("CI")) {
                  d.hidden = !document.getElementById("toggle-ci").checked;
                }
              }
            });

            c.update();
          }
        },

        tooltip: {
          callbacks: {
            label: (ctx) => {
              const dsLabel = ctx.dataset.label || "";

              // Hide CI helper datasets completely
              if (dsLabel.includes("(CI")) return null;

              const raw = ctx.raw || {};
              if (raw.y == null) return null;

              const y = Number(raw.y).toFixed(1);
              const n = raw.n;
              const low = raw.low;
              const high = raw.high;

              const ci =
                low != null && high != null
                  ? ` (CI ${low}%–${high}%)`
                  : "";

              return `${dsLabel}: ${y}%${ci}${n ? ` (n=${n})` : ""}`;
            }
          }
        }
      }
    }
  });
}




async function render() {
  ensureChart();

  const payload = await loadSeries();
  const bucket = document.getElementById("bucket").value;

  chart.data.datasets = buildDatasets(payload.series);
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

  chart.update("none");
}

// --------------------
// Leaflet: Nearby crimes
// --------------------

// Default: central London (your earlier example)
let map;
let markersLayer; // shared variable
let centerMarker;

let currentCenter = { lat: 51.509865, lng: -0.118092 };

function ensureMap() {
  if (map) return;

  map = L.map("map").setView([currentCenter.lat, currentCenter.lng], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  // Create once
  markersLayer = L.markerClusterGroup({
    chunkedLoading: true,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    disableClusteringAtZoom: 18,
  });

  map.addLayer(markersLayer);

  // Draggable center marker
  centerMarker = L.marker([currentCenter.lat, currentCenter.lng], {
    draggable: true,
  })
    .addTo(map)
    .bindPopup("Search center (drag me)")
    .openPopup();

  // Drag to move search center
  centerMarker.on("dragend", () => {
    const pos = centerMarker.getLatLng();
    currentCenter = { lat: pos.lat, lng: pos.lng };
  });

  // Click map to move search center
  map.on("click", (e) => {
    currentCenter = { lat: e.latlng.lat, lng: e.latlng.lng };
    centerMarker.setLatLng(e.latlng).openPopup();
  });
}

try {
  fetchNearby(); // auto-refresh nearby crimes
} catch (e) {
  console.error(e);
}

function buildNearbyUrl() {
  const from = document.getElementById("from").value;
  const to = document.getElementById("to").value;
  const group = document.getElementById("group").value.trim();
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

  if (group) params.set("group", group);

  return `/api/trials/nearby?${params.toString()}`;
}

function renderNearbyList(rows) {
  const el = document.getElementById("nearby-results");
  if (!rows.length) {
    el.innerHTML = "<p>No results in this radius for the selected filters.</p>";
    return;
  }

  const items = rows
    .map((r) => {
      const d = r.distance_m == null ? "" : `${Math.round(r.distance_m)} m`;
      const date = r.trial_date ? String(r.trial_date).slice(0, 10) : "";
      const offence = r.offence_name || "(unknown offence)";
      const who = r.defendant_name || "(unknown defendant)";
      const verdict = r.verdict || "(unknown verdict)";
      const where = r.trial_location || "";

      return `
      <li style="margin:8px 0;">
        <strong>${offence}</strong> — ${who} (${verdict})<br/>
        <span style="opacity:.8;">${date} • ${where} • ${d}</span>
      </li>
    `;
    })
    .join("");

  el.innerHTML = `<ol style="padding-left:18px;">${items}</ol>`;
}

async function fetchNearby() {
  ensureMap();

  const btn = document.getElementById("nearby");
  const prevText = btn?.textContent;

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Searching…";
  }

  try {
    // 🔽 EVERYTHING that used to be in fetchNearby stays here

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

    // Drop markers
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
  const dist =
    r.distance_m != null
      ? `${Math.round(Number(r.distance_m))} m`
      : "—";

  const marker = L.marker([lat, lng]);

  marker.bindPopup(`
    <div style="min-width:220px;">
      <div style="font-weight:700; margin-bottom:6px;">
        ${offence}
      </div>
      <div><b>Date:</b> ${date}</div>
      <div><b>Defendant:</b> ${who}</div>
      <div><b>Distance:</b> ${dist}</div>
    </div>
  `);

  markersLayer.addLayer(marker);
});


    renderNearbyList(rows);

    // Auto-zoom
    if (rows.length) {
      const latLngs = rows
        .map((r) => [Number(r.latitude), Number(r.longitude)])
        .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));

      latLngs.push([currentCenter.lat, currentCenter.lng]);
      map.fitBounds(L.latLngBounds(latLngs).pad(0.25));
    }
  } finally {
    // 🔽 ALWAYS runs, even if fetch fails
    if (btn) {
      btn.disabled = false;
      btn.textContent = prevText || "Find nearby";
    }
  }
}

// Buttons
document.getElementById("nearby")?.addEventListener("click", () => {
  fetchNearby().catch((err) => {
    console.error(err);
    alert(err.message);
  });
});

document.getElementById("use-gps")?.addEventListener("click", () => {
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
      alert("Could not get your location (permission denied or unavailable).");
    },
    { enableHighAccuracy: true, timeout: 10000 }
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
  render().catch((err) => {
    console.error(err);
    alert(err.message);
  });
});

document.getElementById("confidence").addEventListener("change", () => {
  render().catch((err) => {
    console.error(err);
    alert(err.message);
  });
});

// CI visibility toggle — NO refetch
document.getElementById("toggle-ci").addEventListener("change", () => {
  if (!chart) return;
  const show = document.getElementById("toggle-ci").checked;
  animateCi(show, 250);
});

// initial load
render().catch((err) => {
  console.error(err);
  alert(err.message);
});
