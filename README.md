## ✨ Features

- Conviction rate trends with optional confidence intervals
- Interactive Leaflet map with radius-based search
- Clustered historic trial locations
- Fully synced map ↔ list interactions
- Smooth hover and click UX states
- Built to scale from demo data to real historical datasets

---

## 🧠 Tech Stack

- Vanilla JavaScript
- Chart.js
- Leaflet + MarkerCluster
- Node.js / Express
- HTML / CSS

---

## 🔍 How It Works

1. Select a date range and offence group
2. View conviction trends over time
3. Search for nearby trials using the map radius
4. Click list items or map markers to inspect individual cases

---

## 🚀 Getting Started (Local)

```bash
npm install
npm start

Open in your browser:
http://localhost:3000

Demo


🧠 Notes on Historical Data

Sample data is partially seeded for development and visual validation
Early periods show sparse female records, resulting in wider confidence intervals
This reflects historical court record imbalance rather than a charting error

Nearby Historic Crimes API
GET /api/trials/nearby?lat=51.509865&lng=-0.118092&from=1740-01-01&to=1800-12-31&radius=2000&limit=5

🗺️ Roadmap

📍 Geospatial queries near user location
🧭 Time-aware mapping (layered by century)
🗃️ Expanded datasets (non-violent crimes, sentencing outcomes)
🌍 Public demo deployment

```
