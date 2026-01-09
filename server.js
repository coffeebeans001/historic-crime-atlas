import express from "express";
import dotenv from "dotenv";
import { pool } from "./db.js";

dotenv.config();

const app = express();
app.use(express.static("public"));
app.use(express.json());

function wilsonInterval(guilty, n, z = 1.96) {
  if (!n || n <= 0) return { low: null, high: null };
  const p = guilty / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { low: 100 * (center - margin), high: 100 * (center + margin) };
}

/* -----------------------
   Health check
------------------------ */
app.get("/health", (req, res) => res.json({ ok: true }));

/* -----------------------
   GET /api/trials
   Query-based filtering
------------------------ */
app.get("/api/trials", async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page ?? "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? "20", 10), 1), 100);
    const offset = (page - 1) * limit;

    const defendant = (req.query.defendant ?? "").toString().trim();
    const category = (req.query.category ?? "").toString().trim();
    const verdict = (req.query.verdict ?? "").toString().trim();
    const from = (req.query.from ?? "").toString().trim();
    const to = (req.query.to ?? "").toString().trim();
    const judge = (req.query.judge ?? "").toString().trim();
    const gender = (req.query.gender ?? "").toString().trim();
    const partyType = (req.query.party_type ?? "").toString().trim();
    const where = [];
    const params = [];

    if (defendant) {
      where.push("defendant_name LIKE ?");
      params.push(`%${defendant}%`);
    }
    if (category) {
      where.push("offence_category = ?");
      params.push(category);
    }
    if (verdict) {
      where.push("verdict = ?");
      params.push(verdict);
    }
    if (from && to) {
      where.push("trial_date BETWEEN ? AND ?");
      params.push(from, to);
    }
    if (judge) {
      where.push("judge_name = ?");
      params.push(judge);
    }
    if (gender) {
      where.push("gender = ? AND gender IS NOT NULL");
      params.push(gender);
    }

if (partyType) {
  where.push("party_type = ?");
  params.push(partyType);
}



    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM trial_summary
       ${whereSql}`,
      params
    );
    const total = countRows[0].total;

    const [rows] = await pool.query(
      `SELECT *
       FROM trial_summary
       ${whereSql}
       ORDER BY trial_date DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* -----------------------
   GET /api/trials/:id
   Single trial detail
------------------------ */
app.get("/api/trials/nearby", async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radius = Math.min(Math.max(Number(req.query.radius ?? 1000), 50), 20000); // meters
    const limit = Math.min(Math.max(Number(req.query.limit ?? 5), 1), 50);

    const from = (req.query.from ?? "").toString().trim().slice(0, 10);
    const to = (req.query.to ?? "").toString().trim().slice(0, 10);
    const group = (req.query.group ?? "").toString().trim();

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: "lat and lng are required numbers" });
    }
    if (from.length !== 10 || to.length !== 10) {
      return res.status(400).json({ error: "from and to must be YYYY-MM-DD" });
    }


    // Haversine distance in meters
    const sql = `
      SELECT
        t.id,
        t.trial_date,
        t.verdict,
        t.trial_location,
        o.offence_name,
        o.offence_group,
        d.defendant_name,
        d.gender,
        d.party_type,
        t.latitude,
        t.longitude,
        (6371000 * 2 * ASIN(SQRT(
          POW(SIN(RADIANS(t.latitude - ?) / 2), 2) +
          COS(RADIANS(?)) * COS(RADIANS(t.latitude)) *
          POW(SIN(RADIANS(t.longitude - ?) / 2), 2)
        ))) AS distance_m
      FROM trials t
      JOIN defendants d ON d.defendant_id = t.defendant_id
      JOIN offences o ON o.offence_id = t.offence_id
      WHERE
        t.latitude IS NOT NULL
        AND t.longitude IS NOT NULL
        AND t.trial_date BETWEEN ? AND ?
        ${group ? "AND o.offence_group = ?" : ""}
      HAVING distance_m <= ?
      ORDER BY distance_m ASC
      LIMIT ?;
    `;

    const params = [
      lat, lat, lng,
      from, to,
      ...(group ? [group] : []),
      radius,
      limit
    ];

    const [rows] = await pool.query(sql, params);

    res.json({
      from,
      to,
      group: group || null,
      center: { lat, lng },
      radius_m: radius,
      count: rows.length,
      data: rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});


app.get("/api/trials/:id", async (req, res) => {
  try {
    const trialId = parseInt(req.params.id, 10);
    if (Number.isNaN(trialId)) {
      return res.status(400).json({ error: "Invalid trial id" });
    }

    const [rows] = await pool.query(
      "SELECT * FROM trial_summary WHERE trial_id = ?",
      [trialId]
    );
    
    if (!rows.length) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* -----------------------
   GET /api/judges/:judgeId/trials
   Judge-focused endpoint
------------------------ */
app.get("/api/judges/:judgeId/trials", async (req, res) => {
  try {
    const judgeId = parseInt(req.params.judgeId, 10);
    if (Number.isNaN(judgeId)) {
      return res.status(400).json({ error: "Invalid judge id" });
    }

    const page = Math.max(parseInt(req.query.page ?? "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? "20", 10), 1), 100);
    const offset = (page - 1) * limit;

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM trial_summary ts
       JOIN trials t ON t.id = ts.trial_id
       WHERE t.judge_id = ?`,
      [judgeId]
    );
    const total = countRows[0].total;

    const [rows] = await pool.query(
      `SELECT ts.*
       FROM trial_summary ts
       JOIN trials t ON t.id = ts.trial_id
       WHERE t.judge_id = ?
       ORDER BY ts.trial_date DESC
       LIMIT ? OFFSET ?`,
      [judgeId, limit, offset]
    );

    res.json({
      judgeId,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/offences/search?name=robbery&limit=10
app.get("/api/offences/search", async (req, res) => {
  try {
    const name = (req.query.name ?? "").toString().trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? "10", 10), 1), 50);

    if (!name) {
      return res.status(400).json({ error: "Query param 'name' is required" });
    }

    const [rows] = await pool.query(
      `SELECT offence_id, offence_name, category
       FROM offences
       WHERE offence_name LIKE ?
       ORDER BY offence_name ASC
       LIMIT ?`,
      [`%${name}%`, limit]
    );

    res.json({ query: name, limit, total: rows.length, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/offences
app.get("/api/offences", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT offence_id, offence_name, category
       FROM offences
       ORDER BY offence_name ASC`
    );

    res.json({
      total: rows.length,
      data: rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/offences/:offenceId/trials?page=1&limit=20
app.get("/api/offences/:offenceId/trials", async (req, res) => {
  try {
    const offenceId = parseInt(req.params.offenceId, 10);
    if (Number.isNaN(offenceId)) {
      return res.status(400).json({ error: "Invalid offence id" });
    }

    const page = Math.max(parseInt(req.query.page ?? "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? "20", 10), 1), 100);
    const offset = (page - 1) * limit;

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM trials
       WHERE offence_id = ?`,
      [offenceId]
    );
    const total = countRows[0].total;

    const [rows] = await pool.query(
      `SELECT ts.*
       FROM trial_summary ts
       JOIN trials t ON t.id = ts.trial_id
       WHERE t.offence_id = ?
       ORDER BY ts.trial_date DESC
       LIMIT ? OFFSET ?`,
      [offenceId, limit, offset]
    );

    res.json({
      offenceId,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// GET /api/offences/:offenceId
app.get("/api/offences/:offenceId", async (req, res) => {
  try {
    const offenceId = parseInt(req.params.offenceId, 10);
    if (Number.isNaN(offenceId)) {
      return res.status(400).json({ error: "Invalid offence id" });
    }

    const [rows] = await pool.query(
      `SELECT offence_id, offence_name, category
       FROM offences
       WHERE offence_id = ?`,
      [offenceId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Offence not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/stats/offences?limit=10
app.get("/api/stats/offences", async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? "10", 10), 1), 50);

    const [rows] = await pool.query(
      `SELECT
         o.offence_id,
         o.offence_name,
         o.category,
         COUNT(*) AS total_trials,
         SUM(CASE WHEN t.verdict = 'Guilty' THEN 1 ELSE 0 END) AS guilty_trials,
         SUM(CASE WHEN t.verdict = 'Not Guilty' THEN 1 ELSE 0 END) AS not_guilty_trials
       FROM trials t
       JOIN offences o ON o.offence_id = t.offence_id
       GROUP BY o.offence_id, o.offence_name, o.category
       ORDER BY total_trials DESC, o.offence_name ASC
       LIMIT ?`,
      [limit]
    );

    res.json({ limit, total: rows.length, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/stats/offences/over-time?bucket=year|decade&from=1740-01-01&to=1800-12-31&offenceId=2
// OR  /api/stats/offences/over-time?bucket=year&from=1740-01-01&to=1800-12-31&offence=robbery
app.get("/api/stats/offences/over-time", async (req, res) => {
  try {
    const bucket = (req.query.bucket ?? "year").toString().trim().toLowerCase();
    const from = (req.query.from ?? "").toString().trim();
    const to = (req.query.to ?? "").toString().trim();

    const offenceIdRaw = (req.query.offenceId ?? "").toString().trim();
    const offenceText = (req.query.offence ?? "").toString().trim();

    if (!from || !to) {
      return res.status(400).json({ error: "Query params 'from' and 'to' are required (YYYY-MM-DD)" });
    }

    const bucketExpr =
      bucket === "decade"
        ? "FLOOR(YEAR(t.trial_date) / 10) * 10"
        : "YEAR(t.trial_date)";

    const where = ["t.trial_date BETWEEN ? AND ?"];
    const params = [from, to];

    // Optional filters (either offenceId or offence text)
    if (offenceIdRaw) {
      const offenceId = parseInt(offenceIdRaw, 10);
      if (Number.isNaN(offenceId)) {
        return res.status(400).json({ error: "Invalid offenceId (must be a number)" });
      }
      where.push("t.offence_id = ?");
      params.push(offenceId);
    } else if (offenceText) {
      // Match by offence name (case-insensitive-ish via LIKE)
      where.push("o.offence_name LIKE ?");
      params.push(`%${offenceText}%`);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [rows] = await pool.query(
      `SELECT
         ${bucketExpr} AS period,
         COUNT(*) AS total_trials,
         SUM(CASE WHEN t.verdict = 'Guilty' THEN 1 ELSE 0 END) AS guilty_trials,
         SUM(CASE WHEN t.verdict = 'Not Guilty' THEN 1 ELSE 0 END) AS not_guilty_trials
       FROM trials t
       JOIN offences o ON o.offence_id = t.offence_id
       ${whereSql}
       GROUP BY period
       ORDER BY period ASC`,
      params
    );

    res.json({
      bucket,
      from,
      to,
      offenceId: offenceIdRaw ? Number(offenceIdRaw) : null,
      offence: offenceText || null,
      total: rows.length,
      data: rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/stats/gender?from=1740-01-01&to=1800-12-31&group=Robbery
app.get("/api/stats/gender", async (req, res) => {
  try {
    const from = (req.query.from ?? "").toString().trim();
    const to = (req.query.to ?? "").toString().trim();
    const group = (req.query.group ?? "").toString().trim(); // e.g. Robbery, Murder

    const where = ["d.gender IS NOT NULL"];
    const params = [];

    if (from && to) {
      where.push("t.trial_date BETWEEN ? AND ?");
      params.push(from, to);
    }

    if (group) {
      where.push("o.offence_group = ?");
      params.push(group);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [rows] = await pool.query(
      `SELECT
         d.gender AS gender,
         COUNT(*) AS total_trials,
         SUM(CASE WHEN t.verdict = 'Guilty' THEN 1 ELSE 0 END) AS guilty_trials,
         SUM(CASE WHEN t.verdict = 'Not Guilty' THEN 1 ELSE 0 END) AS not_guilty_trials
       FROM trials t
       JOIN defendants d ON d.defendant_id = t.defendant_id
       JOIN offences o ON o.offence_id = t.offence_id
       ${whereSql}
       GROUP BY d.gender
       ORDER BY total_trials DESC, d.gender ASC`,
      params
    );

    res.json({
      from: from && to ? from : null,
      to: from && to ? to : null,
      group: group || null,
      total: rows.length,
      data: rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/stats/party-type?from=1740-01-01&to=1800-12-31&group=Robbery
app.get("/api/stats/party-type", async (req, res) => {
  try {
    const from = (req.query.from ?? "").toString().trim();
    const to = (req.query.to ?? "").toString().trim();
    const group = (req.query.group ?? "").toString().trim(); // e.g. Robbery, Murder

    const where = ["d.party_type IS NOT NULL"];
    const params = [];

    if (from && to) {
      where.push("t.trial_date BETWEEN ? AND ?");
      params.push(from, to);
    }

    if (group) {
      where.push("o.offence_group = ?");
      params.push(group);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

const [rows] = await pool.query(
  `SELECT
     ${bucketExpr} AS period,
     d.party_type AS party_type,
     COUNT(*) AS total_trials,
     SUM(CASE WHEN t.verdict IN ('Guilty','Not Guilty') THEN 1 ELSE 0 END) AS known_verdicts,
     SUM(CASE WHEN t.verdict = 'Guilty' THEN 1 ELSE 0 END) AS guilty_trials,
     SUM(CASE WHEN t.verdict = 'Not Guilty' THEN 1 ELSE 0 END) AS not_guilty_trials,
     ROUND(
       100 * SUM(CASE WHEN t.verdict = 'Guilty' THEN 1 ELSE 0 END)
       / NULLIF(SUM(CASE WHEN t.verdict IN ('Guilty','Not Guilty') THEN 1 ELSE 0 END), 0),
       2
     ) AS guilty_rate
   FROM trials t
   JOIN defendants d ON d.defendant_id = t.defendant_id
   LEFT JOIN offences o ON o.offence_id = t.offence_id
   ${whereSql}
   GROUP BY period, d.party_type
   ORDER BY period ASC, d.party_type ASC`,
  params
);


   
    const format = (req.query.format ?? "").toString().trim().toLowerCase();

if (format === "series") {
  // series keyed by party_type: [{ party_type, points: [{x,y,low,high,n}, ...] }]
  const seriesMap = new Map();

  for (const r of rows) {
    const key = r.party_type;
    if (!seriesMap.has(key)) seriesMap.set(key, []);

    seriesMap.get(key).push({
      x: Number(r.period),                    // year/decade
      y: r.guilty_rate === null ? null : Number(r.guilty_rate),
      low: r.guilty_rate_wilson_low === null ? null : Number(r.guilty_rate_wilson_low),
      high: r.guilty_rate_wilson_high === null ? null : Number(r.guilty_rate_wilson_high),
      n: Number(r.known_verdicts)             // confidence count
    });
  }

  return res.json({
    bucket,
    from,
    to,
    group: group || null,
    z,
    series: Array.from(seriesMap, ([party_type, points]) => ({ party_type, points }))
  });
}

    res.json({ bucket, from, to, group: group || null, z, total: rows.length, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/stats/gender-party?from=1740-01-01&to=1800-12-31&group=Robbery&z=1.96
app.get("/api/stats/gender-party", async (req, res) => {
  try {
    const from = (req.query.from ?? "").toString().trim();
    const to = (req.query.to ?? "").toString().trim();
    const group = (req.query.group ?? "").toString().trim();
    const z = Number(req.query.z ?? 1.96); // 95% default

    if (Number.isNaN(z) || z <= 0 || z > 10) {
      return res.status(400).json({ error: "Invalid z value" });
    }

    const where = ["d.gender IS NOT NULL", "d.party_type IS NOT NULL"];
    const params = [];

    if (from && to) {
      where.push("t.trial_date BETWEEN ? AND ?");
      params.push(from, to);
    }
    if (group) {
      where.push("o.offence_group = ?");
      params.push(group);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [rows] = await pool.query(
      `SELECT
         d.gender AS gender,
         d.party_type AS party_type,
         COUNT(*) AS total_trials,

         SUM(CASE WHEN t.verdict IN ('Guilty','Not Guilty') THEN 1 ELSE 0 END) AS known_verdicts,
         SUM(CASE WHEN t.verdict = 'Guilty' THEN 1 ELSE 0 END) AS guilty_trials,
         SUM(CASE WHEN t.verdict = 'Not Guilty' THEN 1 ELSE 0 END) AS not_guilty_trials,

         -- plain guilty rate (%), based on known verdicts
         ROUND(
           100 * SUM(CASE WHEN t.verdict = 'Guilty' THEN 1 ELSE 0 END)
           / NULLIF(SUM(CASE WHEN t.verdict IN ('Guilty','Not Guilty') THEN 1 ELSE 0 END), 0),
           2
         ) AS guilty_rate,

         -- Wilson 95% CI (or custom z) for p = guilty/known, returned as %
         ROUND(
           100 * (
             (
               (SUM(CASE WHEN t.verdict='Guilty' THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN t.verdict IN ('Guilty','Not Guilty') THEN 1 ELSE 0 END),0))
               + (POW(?,2) / (2 * NULLIF(SUM(CASE WHEN t.verdict IN ('Guilty','Not Guilty') THEN 1 ELSE 0 END),0)))
             )
             / (1 + (POW(?,2) / NULLIF(SUM(CASE WHEN t.verdict IN ('Guilty','Not Guilty') THEN 1 ELSE 0 END),0)))
             -
             (
               (? / (1 + (POW(?,2) / NULLIF(SUM(CASE WHEN t.verdict IN ('Guilty','Not Guilty') THEN 1 ELSE 0 END),0))))
               * SQRT(
                   (
                     (SUM(CASE WHEN t.verdict='Guilty' THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN t.verdict IN ('Guilty','Not Guilty') THEN 1 ELSE 0 END),0))
                     * (1 - (SUM(CASE WHEN t.verdict='Guilty' THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN t.verdict IN ('Guilty','Not Guilty') THEN 1 ELSE 0 END),0)))
                     / NULLIF(SUM(CASE WHEN t.verdict IN ('Guilty','Not Guilty') THEN 1 ELSE 0 END),0)
                   )
                   + (POW(?,2) / (4 * POW(NULLIF(SUM(CASE WHEN t.verdict IN ('Guilty','Not Guilty') THEN 1 ELSE 0 END),0),2)))
                 )
             )
           ),
           2
         ) AS guilty_rate_wilson_low,

         ROUND(
           100 * (
             (
               (SUM(CASE WHEN t.verdict='Guilty' THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN t.verdict IN ('Guilty','Not Guilty') THEN 1 ELSE 0 END),0))
               + (POW(?,2) / (2 * NULLIF(SUM(CASE WHEN t.verdict IN ('Guilty','Not Guilty') THEN 1 ELSE 0 END),0)))
             )
             / (1 + (POW(?,2) / NULLIF(SUM(CASE WHEN t.verdict IN ('Guilty','Not Guilty') THEN 1 ELSE 0 END),0)))
             +
             (
               (? / (1 + (POW(?,2) / NULLIF(SUM(CASE WHEN t.verdict IN ('Guilty','Not Guilty') THEN 1 ELSE 0 END),0))))
               * SQRT(
                   (
                     (SUM(CASE WHEN t.verdict='Guilty' THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN t.verdict IN ('Guilty','Not Guilty') THEN 1 ELSE 0 END),0))
                     * (1 - (SUM(CASE WHEN t.verdict='Guilty' THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN t.verdict IN ('Guilty','Not Guilty') THEN 1 ELSE 0 END),0)))
                     / NULLIF(SUM(CASE WHEN t.verdict IN ('Guilty','Not Guilty') THEN 1 ELSE 0 END),0)
                   )
                   + (POW(?,2) / (4 * POW(NULLIF(SUM(CASE WHEN t.verdict IN ('Guilty','Not Guilty') THEN 1 ELSE 0 END),0),2)))
                 )
             )
           ),
           2
         ) AS guilty_rate_wilson_high

       FROM trials t
       JOIN defendants d ON d.defendant_id = t.defendant_id
       JOIN offences o ON o.offence_id = t.offence_id
       ${whereSql}
       GROUP BY d.gender, d.party_type
       ORDER BY known_verdicts DESC, guilty_rate DESC, d.gender ASC, d.party_type ASC`,
      [
        ...params,
        // Wilson params (12 placeholders)
        z, z, z, z, z,
        z, z, z, z, z, z, z
      ]
    );

    res.json({
      from: from && to ? from : null,
      to: from && to ? to : null,
      group: group || null,
      z,
      total: rows.length,
      data: rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/stats/gender-party/over-time?bucket=year|decade&from=1740-01-01&to=1800-12-31&group=Robbery
app.get("/api/stats/gender-party/over-time", async (req, res) => {
  try {
    const bucket = (req.query.bucket ?? "year").toString().trim().toLowerCase();
    const from = (req.query.from ?? "").toString().trim();
    const to = (req.query.to ?? "").toString().trim();
    const group = (req.query.group ?? "").toString().trim();
    const z = Number(req.query.z ?? 1.96); // add this near other query params if not already there


    if (!from || !to) {
      return res.status(400).json({
        error: "Query params 'from' and 'to' are required (YYYY-MM-DD)"
      });
    }

    const bucketExpr =
      bucket === "decade"
        ? "FLOOR(YEAR(t.trial_date) / 10) * 10"
        : "YEAR(t.trial_date)";

    const where = [
      "d.gender IS NOT NULL",
      "d.party_type IS NOT NULL",
      "t.trial_date BETWEEN ? AND ?"
    ];
    const cleanFrom = from.slice(0, 10);
    const cleanTo = to.slice(0, 10);
    const params = [cleanFrom, cleanTo];


    if (group) {
      where.push("o.offence_group = ?");
      params.push(group);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [rows] = await pool.query(
      `SELECT
         ${bucketExpr} AS period,
         d.gender AS gender,
         d.party_type AS party_type,
         COUNT(*) AS total_trials,

         SUM(CASE WHEN t.verdict IN ('Guilty','Not Guilty') THEN 1 ELSE 0 END) AS known_verdicts,
         SUM(CASE WHEN t.verdict = 'Guilty' THEN 1 ELSE 0 END) AS guilty_trials,
         SUM(CASE WHEN t.verdict = 'Not Guilty' THEN 1 ELSE 0 END) AS not_guilty_trials,

         ROUND(
           100 * SUM(CASE WHEN t.verdict = 'Guilty' THEN 1 ELSE 0 END)
           / NULLIF(SUM(CASE WHEN t.verdict IN ('Guilty','Not Guilty') THEN 1 ELSE 0 END), 0),
           2
         ) AS guilty_rate
       FROM trials t
       JOIN defendants d ON d.defendant_id = t.defendant_id
       JOIN offences o ON o.offence_id = t.offence_id
       ${whereSql}
       GROUP BY period, d.gender, d.party_type
       ORDER BY period ASC, d.gender ASC, d.party_type ASC`,
      params
    );
   const format = (req.query.format ?? "").toString().trim().toLowerCase();

   if (format === "series") {
     const seriesMap = new Map();

     for (const r of rows) {
       const key = `${r.gender} - ${r.party_type}`;
       if (!seriesMap.has(key)) seriesMap.set(key, []);

       const n = Number(r.known_verdicts);
       const g = Number(r.guilty_trials);
       const ci = wilsonInterval(g, n, z);

       seriesMap.get(key).push({
         x: Number(r.period),
         y: r.guilty_rate === null ? null : Number(r.guilty_rate),
         low: ci.low === null ? null : Number(ci.low.toFixed(2)),
         high: ci.high === null ? null : Number(ci.high.toFixed(2)),
         n
       });
     }

  return res.json({
    bucket,
    from: cleanFrom,
    to: cleanTo,
    group: group || null,
    z,
    series: Array.from(seriesMap, ([label, data]) => ({ label, data }))
  });
}


    res.json({
      bucket,
      from,
      to,
      group: group || null,
      total: rows.length,
      data: rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/stats/party-type/over-time", async (req, res) => {
  try {
    const bucket = (req.query.bucket ?? "year").toString().trim().toLowerCase();
    const from = (req.query.from ?? "").toString().trim();
    const to = (req.query.to ?? "").toString().trim();
    const group = (req.query.group ?? "").toString().trim();

    if (!from || !to) {
      return res.status(400).json({
        error: "Query params 'from' and 'to' are required (YYYY-MM-DD)"
      });
    }

    const bucketExpr =
      bucket === "decade"
        ? "FLOOR(YEAR(t.trial_date) / 10) * 10"
        : "YEAR(t.trial_date)";

    const where = [
      "d.party_type IS NOT NULL",
      "t.trial_date BETWEEN ? AND ?"
    ];
    const cleanFrom = from.slice(0, 10);
    const cleanTo = to.slice(0, 10);
    const params = [cleanFrom, cleanTo];


    if (group) {
      where.push("o.offence_group = ?");
      params.push(group);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [rows] = await pool.query(
      `SELECT
         ${bucketExpr} AS period,
         d.party_type AS party_type,
         COUNT(*) AS total_trials,

         SUM(CASE WHEN t.verdict IN ('Guilty','Not Guilty') THEN 1 ELSE 0 END) AS known_verdicts,
         SUM(CASE WHEN t.verdict = 'Guilty' THEN 1 ELSE 0 END) AS guilty_trials,
         SUM(CASE WHEN t.verdict = 'Not Guilty' THEN 1 ELSE 0 END) AS not_guilty_trials,

         ROUND(
           100 * SUM(CASE WHEN t.verdict = 'Guilty' THEN 1 ELSE 0 END)
           / NULLIF(SUM(CASE WHEN t.verdict IN ('Guilty','Not Guilty') THEN 1 ELSE 0 END), 0),
           2
         ) AS guilty_rate
       FROM trials t
       JOIN defendants d ON d.defendant_id = t.defendant_id
       JOIN offences o ON o.offence_id = t.offence_id
       ${whereSql}
       GROUP BY period, d.party_type
       ORDER BY period ASC, d.party_type ASC`,
      params
    );
    const format = (req.query.format ?? "").toString().trim().toLowerCase();

    if (format === "series") {
      const seriesMap = new Map();

      for (const r of rows) {
        const key = r.party_type ?? "Unknown";
        if (!seriesMap.has(key)) seriesMap.set(key, []);

        seriesMap.get(key).push({
          x: Number(r.period),
          y: r.guilty_rate === null ? null : Number(r.guilty_rate),
          n: Number(r.known_verdicts) // sample size behind the rate
        });
      }

      return res.json({
        bucket,
        from: cleanFrom,
        to: cleanTo,
        group: group || null,
        series: Array.from(seriesMap, ([label, data]) => ({ label, data }))
      });
    }

   res.json({
    bucket,
    from: cleanFrom,
    to: cleanTo,
    group: group || null,
    total: rows.length,
    data: rows
  });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});





/* -----------------------
   Server start
------------------------ */
const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
