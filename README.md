# Historic Crime Atlas

Historic Crime Atlas is an interactive data-visualisation project exploring historical crime trends using structured court records.
It allows users to analyse verdict patterns over time, segmented by gender and party type, with statistically meaningful confidence intervals.

The project is inspired by historical court archives (e.g. Old Bailey records) and aims to make centuries-old crime data accessible, explorable, and visually intuitive.

## Features

📈 Interactive line charts showing guilty rate (%) over time

📊 Wilson confidence intervals with smooth fade-in/out animation

🎛️ Dynamic controls for:

Date range

Time bucket (year / decade)

Confidence level (e.g. 95%)

Crime category (e.g. Robbery)

🧠 Hover tooltips showing:

Guilty rate

Confidence interval bounds

Sample size (n)

🎨 Automatic colour scaling per group (stable & readable)

⚡ Fast API responses backed by MySQL

## 🧪 Methodology

### Aggregation

For each time bucket (year or decade) and group (e.g. `Male - Individual`), the API computes:

- **Known verdicts (n):** trials where verdict ∈ {`Guilty`, `Not Guilty`}
- **Guilty count (g):** trials where verdict = `Guilty`
- **Guilty rate (%):** `100 * (g / n)` (when `n > 0`)

Buckets are calculated from `trial_date` (e.g. `YEAR(trial_date)` or floor-to-decade).

### Confidence intervals (Wilson score)

To avoid misleading intervals with small sample sizes (common in historical datasets), the project uses the **Wilson score interval** for a binomial proportion.

Given:

- `p = g / n`
- `z` = z-score for the chosen confidence level (e.g. **1.96** for 95%)

Wilson interval:

- `denom = 1 + z²/n`
- `center = (p + z²/(2n)) / denom`
- `margin = (z / denom) * sqrt( (p(1-p))/n + z²/(4n²) )`

Confidence bounds are:

- `low = 100 * (center - margin)`
- `high = 100 * (center + margin)`

These bounds are returned per bucket and visualised as a shaded band around the guilty-rate line.

## Architecture

BACKEND

Node.js

Express

MySQL

REST API (/api/stats/gender-party/over-time)

FRONTEND

Vanilla HTML/CSS

Chart.js

Dynamic dataset construction

Animated dataset visibility toggling (no refetch)

🔬 Statistical Approach

Guilty rates are calculated as percentages per time bucket

Confidence intervals use the Wilson score interval, which is:

More reliable for small sample sizes

Commonly used in historical and social data analysis

Confidence level is user-selectable (e.g. 90%, 95%)

## Run locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env` file (see below)
   DB_HOST=localhost
   DB_USER=your_user
   DB_PASSWORD=your_password
   DB_NAME=your_database
   PORT=3000

3. Start the server:
   node server.js

4. Open:
   API: http://localhost:3000/api/stats/gender-party/over-time

   UI: http://localhost:3000

🗺️ Roadmap

📍 Geospatial queries (historic crimes near user location)

🧭 Time-aware mapping (crime scenes layered by century)

🗃️ Expanded datasets (non-violent crimes, sentencing outcomes)

🌍 Public demo deployment

⚠️ Notes

This project is actively evolving.
Historical data is partially seeded for development and visual validation purposes.

![Chart overview](screenshots/chart-overview.png)

## 📊 Interactive Data Visualisation

### Guilty Rate Trends (Robbery, 1740–1800)

**Confidence Intervals Enabled (Wilson score)**
![Chart with confidence intervals](screenshots/chart-ci-on.png)

**Confidence Intervals Disabled**
![Chart without confidence intervals](screenshots/chart-ci-off.png)

**Hover Tooltips**
![Hover tooltip showing CI and sample size](screenshots/chart-hover-tooltip.png)

> Early periods show sparse female data, resulting in wider confidence intervals.
> This accurately reflects historical court record imbalance rather than a charting error.
