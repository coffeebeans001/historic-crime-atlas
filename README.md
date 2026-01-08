# Historic Crime Atlas

A small API + frontend charting prototype exploring historic crime trial data (Old Bailey-inspired),
including filters and over-time guilty-rate trends with Wilson confidence intervals.

## Features

- REST API (Node/Express + MySQL)
- Trial search with filters (date range, category, verdict, defendant, judge, gender, party type)
- Stats endpoints:
  - over-time guilty-rate trends
  - Wilson confidence intervals
  - series format output for Chart.js / D3
- Simple Chart.js UI with:
  - line series
  - shaded confidence bands
  - toggle CI on/off
  - bucket year/decade
  - confidence (z) selector

## Tech

- Node.js + Express
- MySQL
- Chart.js (frontend)

## Run locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env` file (see below)

3. Start the server:
   node server.js

4. Open:
   - API: http://localhost:3000
   - UI: http://localhost:3000

## Notes

This project is actively evolving (next steps include geospatial crime queries and mapping).

![Chart overview](screenshots/chart-overview.png)

## 📊 Interactive Data Visualisation

### Guilty Rate Trends (Robbery, 1740–1800)

**Confidence Intervals Enabled (Wilson score)**
![Chart with confidence intervals](screenshots/chart-ci-on.png)

**Confidence Intervals Disabled**
![Chart without confidence intervals](screenshots/chart-ci-off.png)

**Hover Tooltips**
![Hover tooltip showing CI and sample size](screenshots/chart-hover-tooltip.png)
