const axios = require("axios");

const BASE = "https://statsigapi.net/console/v1";
const headers = () => ({
  "STATSIG-API-KEY": process.env.STATSIG_CONSOLE_API_KEY,
  "Content-Type": "application/json",
});

async function listExperiments() {
  const res = await axios.get(`${BASE}/experiments`, { headers: headers() });
  const all = res.data?.data || [];
  return all.filter((e) =>
    e.name?.startsWith("paywall_ar_") && e.status !== "abandoned"
  );
}

async function getActiveExperiments() {
  const all = await listExperiments();
  return all.filter((e) => e.status === "active");
}

async function createExperiment({ name, description, hypothesis, config, allocationPercent = 20 }) {
  const body = {
    name,
    description,
    hypothesis,
    idType: "userID",
    status: "setup",
    layerID: process.env.STATSIG_LAYER_NAME || "paywall_autoresearch_layer",
    groups: [
      {
        name: "Control",
        size: 50,
        parameterValues: {},
      },
      {
        name: "Treatment",
        size: 50,
        parameterValues: {
          ar_config: JSON.stringify(config),
        },
      },
    ],
    allocation: allocationPercent,
  };

  const res = await axios.post(`${BASE}/experiments`, body, { headers: headers() });
  const expName = res.data?.data?.name || name;

  // Start the experiment immediately
  await axios.post(`${BASE}/experiments/${encodeURIComponent(expName)}/start`, {}, { headers: headers() });

  console.log(`[Statsig] Created + started experiment: ${expName}`);
  return res.data?.data;
}

async function archiveExperiment(experimentName) {
  await axios.post(
    `${BASE}/experiments/${encodeURIComponent(experimentName)}/abandon`,
    {},
    { headers: headers() }
  );
  console.log(`[Statsig] Archived experiment: ${experimentName}`);
}

async function getExperimentDetails(experimentName) {
  const res = await axios.get(
    `${BASE}/experiments/${encodeURIComponent(experimentName)}`,
    { headers: headers() }
  );
  return res.data?.data;
}

module.exports = {
  listExperiments,
  getActiveExperiments,
  createExperiment,
  archiveExperiment,
  getExperimentDetails,
};
