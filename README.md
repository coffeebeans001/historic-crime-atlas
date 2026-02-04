🗺️ Roadmap

📍 Geospatial queries (historic crimes near user location)

🧭 Time-aware mapping (crime scenes layered by century)

🗃️ Expanded datasets (non-violent crimes, sentencing outcomes)

🌍 Public demo deployment

⚠️ Notes

# Historic Crime Atlas 🗺️📊

An interactive web application for exploring historic criminal trial data through time-series visualisation and geospatial search.

## ✨ Features
- Time-series chart of conviction rates with confidence intervals
- Interactive Leaflet map with radius-based search
- Clustered markers for dense locations
- Fully synced map ↔ list interactions
- Smooth UX with hover, click, and focus states
- Built to scale from demo data to real historical datasets

## 🧠 Tech Stack
- Vanilla JavaScript
- Chart.js
- Leaflet + MarkerCluster
- Node.js / Express
- HTML / CSS

## 🔍 How It Works
1. Select a date range and offence group
2. View conviction trends over time
3. Search for nearby trials using the map radius
4. Click list items or map markers to inspect individual cases

## 🚀 Getting Started (Local)
```bash
npm install
npm start
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

Historical data is partially seeded for development and visual validation purposes.
Early periods show sparse female data, resulting in wider confidence intervals.
This accurately reflects historical court record imbalance rather than a charting error.

![Chart overview](screenshots/chart-overview.png)

## 📊 Interactive Data Visualisation

### Guilty Rate Trends (Robbery, 1740–1800)

**Confidence Intervals Enabled (Wilson score)**
![Chart with confidence intervals](screenshots/chart-ci-on.png)

**Confidence Intervals Disabled**
![Chart without confidence intervals](screenshots/chart-ci-off.png)

**Hover Tooltips**
![Hover tooltip showing CI and sample size](screenshots/chart-hover-tooltip.png)

Nearby Historic Crimes API

GET /api/trials/nearby?lat=51.509865&lng=-0.118092&from=1740-01-01&to=1800-12-31&radius=2000&limit=5
Returns the nearest historic trials within a given radius using Haversine distance.
