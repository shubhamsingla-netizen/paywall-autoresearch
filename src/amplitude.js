const axios = require("axios");

const BASE = "https://amplitude.com/api/2";

function authHeader() {
  const token = Buffer.from(
    `${process.env.AMPLITUDE_API_KEY}:${process.env.AMPLITUDE_SECRET_KEY}`
  ).toString("base64");
  return { Authorization: `Basic ${token}` };
}

function dateStr(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

// Query unique user count for an event filtered by ar_variant_id
async function getEventCount(eventType, variantId, startDaysAgo = 7) {
  const eventFilter = JSON.stringify({
    event_type: eventType,
    filters: [
      {
        subprop_type: "event",
        subprop_key: "ar_variant_id",
        subprop_op: "is",
        subprop_value: [variantId],
      },
    ],
  });

  const params = {
    e: eventFilter,
    m: "uniques",
    start: dateStr(startDaysAgo),
    end: dateStr(0),
  };

  const res = await axios.get(`${BASE}/events/segmentation`, {
    headers: authHeader(),
    params,
  });

  // Sum all daily values
  const series = res.data?.data?.series?.[0] || [];
  return series.reduce((sum, v) => sum + (v || 0), 0);
}

// Get CVR for a specific variant_id
// CVR = trial_initiated_web / trial_paywall_viewed_web (filtered by ar_variant_id)
async function getVariantMetrics(variantId, startDaysAgo = 7) {
  const [views, conversions] = await Promise.all([
    getEventCount("trial_paywall_viewed_web", variantId, startDaysAgo),
    getEventCount("trial_initiated_web", variantId, startDaysAgo),
  ]);

  const cvr = views > 0 ? conversions / views : 0;
  return { variantId, views, conversions, cvr };
}



// Get baseline CVR (web events use _web suffix in Mobile App - Prod project)
async function getBaselineCVR(startDaysAgo = 7) {
  const paywallEvent = JSON.stringify({ event_type: "trial_paywall_viewed_web" });
  const trialEvent = JSON.stringify({ event_type: "trial_initiated_web" });

  const params = (e) => ({
    e,
    m: "uniques",
    start: dateStr(startDaysAgo),
    end: dateStr(0),
  });

  const [viewsRes, convRes] = await Promise.all([
    axios.get(`${BASE}/events/segmentation`, { headers: authHeader(), params: params(paywallEvent) }),
    axios.get(`${BASE}/events/segmentation`, { headers: authHeader(), params: params(trialEvent) }),
  ]);

  const views = (viewsRes.data?.data?.series?.[0] || []).reduce((s, v) => s + (v || 0), 0);
  const conversions = (convRes.data?.data?.series?.[0] || []).reduce((s, v) => s + (v || 0), 0);
  return views > 0 ? conversions / views : 0.27; // fallback to 27%
}

module.exports = { getVariantMetrics, getBaselineCVR };
