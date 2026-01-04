let chart; // single chart reference
const DEFAULT_CI_ALPHA = 0.2;
const LINE_TENSION = 0.2;

function isCiDataset(ds) {
  return ds.label.includes("CI band") || ds.label.includes("upper CI");
}

function setCiAlpha(alpha) {
  if (!chart) return;

  chart.data.datasets.forEach(ds => {
    if (!isCiDataset(ds)) return;

    if (ds.label.includes("CI band")) {
      const bg = ds.backgroundColor;

      if (typeof bg === "string" && bg.startsWith("rgba(")) {
        ds.backgroundColor = bg.replace(
          /rgba\((\s*\d+\s*,\s*\d+\s*,\s*\d+\s*),\s*([0-9.]+)\s*\)/,
          `rgba($1, ${alpha})`
        );
      } else if (typeof bg === "string" && bg.startsWith("rgb(")) {
        ds.backgroundColor = bg.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
      }
    }

    ds.borderColor = "transparent"; // keep CI datasets invisible lines
  });
}

function animateCi(show, durationMs = 250) {
  if (!chart) return;

  const band = chart.data.datasets.find(ds => ds.label.includes("CI band"));
  

  let startAlpha = show ? 0 : DEFAULT_CI_ALPHA;
  if (band && typeof band.backgroundColor === "string" && band.backgroundColor.startsWith("rgba(")) {
    const m = band.backgroundColor.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)/);
    if (m) startAlpha = Number(m[1]);
  }

  const endAlpha = show ? DEFAULT_CI_ALPHA : 0;
  const start = performance.now();

  function tick(now) {
    const t = Math.min((now - start) / durationMs, 1);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const alpha = startAlpha + (endAlpha - startAlpha) * eased;

    chart.data.datasets.forEach(ds => { if (isCiDataset(ds)) ds.hidden = false; });
    setCiAlpha(alpha);

    if (t === 1) {
      chart.data.datasets.forEach(ds => { if (isCiDataset(ds)) ds.hidden = !show; });
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
  const h = hashString(label) % 360;     // hue 0-359
  const s = 70;                          // saturation
  const l = 45;                          // lightness
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  // s/l in [0..100]
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  };
}

function rgbaForLabel(label, alpha = 1) {
  const { h, s, l } = colorForLabel(label);
  const { r, g, b } = hslToRgb(h, s, l);
  return { rgb: `rgb(${r}, ${g}, ${b})`, rgba: `rgba(${r}, ${g}, ${b}, ${alpha})` };
}


function buildDatasets(seriesArr) {
  const datasets = [];
  

  seriesArr.forEach((series) => {
  const { rgb, rgba } = rgbaForLabel(series.label, DEFAULT_CI_ALPHA);


    // upper (invisible line)
    datasets.push({
      label: `${series.label} (upper CI)`,
      data: series.data.map(p => ({ x: p.x, y: p.high })),
      borderColor: "transparent",
      pointRadius: 0
    });

    // band (filled to previous dataset)
    datasets.push({
      label: `${series.label} (CI band)`,
      data: series.data.map(p => ({ x: p.x, y: p.low })),
      fill: "-1",
      backgroundColor: rgba,
      borderColor: "transparent",
      pointRadius: 0
    });

    // main line
    datasets.push({
      label: series.label,
      data: series.data.map(p => ({ x: p.x, y: p.y, n: p.n, low: p.low, high: p.high })),
      borderColor: rgb,
      backgroundColor: rgb,
      tension: LINE_TENSION,
      pointRadius: 4,
      spanGaps: true
    });
  });

  return datasets;
}



  

function ensureChart() {
  if (chart) return;

  const ctx = document.getElementById("chart").getContext("2d");

  chart = new Chart(ctx, {
    type: "line",
    data: { datasets: [] },
    options: {
      responsive: true,
      interaction: { mode: "nearest", intersect: false },
      scales: {
        x: { type: "linear", title: { display: true, text: "Year" } },
        y: { min: 0, max: 100, title: { display: true, text: "Guilty rate (%)" } }
      },
      plugins: {
        legend: {
          labels: {
            filter: item =>
              !item.text.includes("upper CI") &&
              !item.text.includes("CI band")
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.label.includes("CI")) return null;
              const raw = ctx.raw || {};
              const y = raw.y;
              const n = raw.n;
              const low = raw.low;
              const high = raw.high;
              const ciPart =
                (low == null || high == null) ? "" : ` (CI ${low}%–${high}%)`;
              return `${ctx.dataset.label}: ${Number(y).toFixed(1)}%${ciPart} (n=${n})`;
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
    chart.data.datasets.forEach(ds => { if (isCiDataset(ds)) ds.hidden = true; });
    setCiAlpha(0);
  } else {
    chart.data.datasets.forEach(ds => { if (isCiDataset(ds)) ds.hidden = false; });
    setCiAlpha(DEFAULT_CI_ALPHA);
  }

  chart.options.scales.x.title.text = bucket === "decade" ? "Decade" : "Year";

  
  chart.update("none");
}

document.getElementById("reload").addEventListener("click", () => {
  render().catch(err => {
    console.error(err);
    alert(err.message);
  });
});

document.getElementById("bucket").addEventListener("change", () => {
  render().catch(err => {
    console.error(err);
    alert(err.message);
  });
});

document.getElementById("confidence").addEventListener("change", () => {
  render().catch(err => {
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
render().catch(err => {
  console.error(err);
  alert(err.message);
});



