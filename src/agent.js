require("dotenv").config();

const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const statsig = require("./statsig");
const amplitude = require("./amplitude");
const claude = require("./claude");
const slack = require("./slack");

const RESULTS_PATH = path.join(__dirname, "..", "results.json");
const MAX_EXPERIMENTS = parseInt(process.env.MAX_ACTIVE_EXPERIMENTS || "5");
const MIN_SAMPLE_SIZE = parseInt(process.env.MIN_SAMPLE_SIZE || "500");
const MIN_CVR_LIFT = parseFloat(process.env.MIN_CVR_LIFT || "0.10");
const CYCLE_HOURS = parseInt(process.env.CYCLE_HOURS || "4");

function loadResults() {
  return JSON.parse(fs.readFileSync(RESULTS_PATH, "utf-8"));
}

function saveResults(results) {
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
}

function getVariantIdFromExperiment(exp) {
  const treatmentGroup = exp.groups?.find((g) => g.name === "Treatment");
  if (!treatmentGroup?.parameterValues?.ar_config) return null;
  try {
    return JSON.parse(treatmentGroup.parameterValues.ar_config)?.variant_id || null;
  } catch {
    return null;
  }
}

async function runCycle() {
  console.log(`\n[Agent] ===== Cycle starting at ${new Date().toISOString()} =====`);

  const results = loadResults();
  const winners = [];
  const killed = [];
  const launched = [];

  // 1. Get all active experiments
  let activeExperiments;
  try {
    activeExperiments = await statsig.getActiveExperiments();
    console.log(`[Agent] Active experiments: ${activeExperiments.length}`);
  } catch (err) {
    console.error("[Agent] Failed to fetch experiments:", err.message);
    await slack.post(`⚠️ AutoResearch: Failed to fetch Statsig experiments — ${err.message}`);
    return;
  }

  // 2. Get baseline CVR
  let baselineCVR;
  try {
    baselineCVR = await amplitude.getBaselineCVR(7);
    console.log(`[Agent] Baseline CVR (7d): ${(baselineCVR * 100).toFixed(1)}%`);
  } catch (err) {
    console.error("[Agent] Failed to get baseline CVR:", err.message);
    baselineCVR = results.baseline?.cvr || 0.27;
  }

  // Update baseline in results
  results.baseline.cvr = baselineCVR;

  // 3. Measure each active experiment and decide
  const activeWithMetrics = [];
  for (const exp of activeExperiments) {
    const variantId = getVariantIdFromExperiment(exp);
    if (!variantId) continue;

    let metrics;
    try {
      metrics = await amplitude.getVariantMetrics(variantId, 7);
    } catch (err) {
      console.error(`[Agent] Failed to get metrics for ${variantId}:`, err.message);
      activeWithMetrics.push({ name: exp.name, variantId, views: null, cvr: null });
      continue;
    }

    console.log(
      `[Agent] ${variantId}: views=${metrics.views}, conversions=${metrics.conversions}, CVR=${(metrics.cvr * 100).toFixed(1)}%`
    );
    activeWithMetrics.push({ ...exp, ...metrics });

    // Not enough data yet
    if (metrics.views < MIN_SAMPLE_SIZE) {
      console.log(`[Agent] ${variantId}: insufficient data (${metrics.views}/${MIN_SAMPLE_SIZE} views)`);
      continue;
    }

    const isWinner = metrics.cvr >= baselineCVR * (1 + MIN_CVR_LIFT);
    const isLoser = metrics.cvr < baselineCVR * (1 - MIN_CVR_LIFT);

    if (isWinner) {
      console.log(`[Agent] 🏆 WINNER: ${variantId} (${(metrics.cvr * 100).toFixed(1)}% vs baseline ${(baselineCVR * 100).toFixed(1)}%)`);
      // Promote: update baseline
      const expDetails = await statsig.getExperimentDetails(exp.name);
      const treatmentConfig = expDetails?.groups?.find((g) => g.name === "Treatment")?.parameterValues?.ar_config;
      const config = treatmentConfig ? JSON.parse(treatmentConfig) : null;

      results.winners.push({
        variant_id: variantId,
        experiment_name: exp.name,
        cvr: metrics.cvr,
        baseline_cvr_at_time: baselineCVR,
        lift: ((metrics.cvr - baselineCVR) / baselineCVR * 100).toFixed(1) + "%",
        config,
        promoted_at: new Date().toISOString(),
      });

      // New baseline is the winner
      if (config) {
        results.baseline = { ...config, cvr: metrics.cvr, note: `Promoted from ${exp.name}` };
        baselineCVR = metrics.cvr;
      }

      await statsig.archiveExperiment(exp.name);
      winners.push({ variant_id: variantId, cvr: metrics.cvr, config });

    } else if (isLoser) {
      console.log(`[Agent] 💀 KILLED: ${variantId} (${(metrics.cvr * 100).toFixed(1)}% vs baseline ${(baselineCVR * 100).toFixed(1)}%)`);
      results.killed.push({
        variant_id: variantId,
        experiment_name: exp.name,
        cvr: metrics.cvr,
        baseline_cvr_at_time: baselineCVR,
        killed_at: new Date().toISOString(),
      });

      await statsig.archiveExperiment(exp.name);
      killed.push({ variant_id: variantId, cvr: metrics.cvr });
    }

    // Update experiment record in results
    const expRecord = results.experiments.find((e) => e.variant_id === variantId);
    if (expRecord) {
      expRecord.cvr = metrics.cvr;
      expRecord.views = metrics.views;
      expRecord.status = isWinner ? "winner" : isLoser ? "killed" : "active";
    }
  }

  // 4. Refresh active list after promotions/kills
  const stillActive = await statsig.getActiveExperiments();
  const slotsAvailable = MAX_EXPERIMENTS - stillActive.length;
  console.log(`[Agent] Slots available: ${slotsAvailable}/${MAX_EXPERIMENTS}`);

  // 5. Launch new experiments to fill slots
  const triedVariantIds = [
    ...results.experiments.map((e) => e.variant_id),
    ...results.winners.map((w) => w.variant_id),
    ...results.killed.map((k) => k.variant_id),
  ];

  for (let i = 0; i < slotsAvailable; i++) {
    try {
      const { hypothesis, config } = await claude.generateHypothesis(triedVariantIds);
      console.log(`[Agent] 🚀 Launching: ${config.variant_id} — ${hypothesis}`);

      const expName = `paywall_ar_${config.variant_id}`;
      await statsig.createExperiment({
        name: expName,
        description: hypothesis,
        hypothesis,
        config,
        allocationPercent: 20,
      });

      results.experiments.push({
        variant_id: config.variant_id,
        experiment_name: expName,
        config,
        hypothesis,
        status: "active",
        cvr: null,
        views: null,
        launched_at: new Date().toISOString(),
      });

      launched.push({ variant_id: config.variant_id, headline: config.headline, hypothesis });
      triedVariantIds.push(config.variant_id);

    } catch (err) {
      console.error(`[Agent] Failed to launch new experiment:`, err.message);
    }
  }

  saveResults(results);
  console.log(`[Agent] Results saved.`);

  // 6. Post Slack summary
  await slack.postCycleSummary({
    active: activeWithMetrics,
    winners,
    killed,
    launched,
    baselineCVR,
  });

  console.log(`[Agent] ===== Cycle complete =====\n`);
}

async function main() {
  const runOnce = process.argv.includes("--once");

  console.log("🤖 Stage AutoResearch Agent starting...");
  console.log(`Max experiments: ${MAX_EXPERIMENTS}`);
  console.log(`Min sample size: ${MIN_SAMPLE_SIZE} views`);
  console.log(`Min CVR lift for winner: ${(MIN_CVR_LIFT * 100).toFixed(0)}%`);
  console.log(`Cycle: every ${CYCLE_HOURS} hours`);

  if (runOnce) {
    await runCycle();
    process.exit(0);
  }

  // Run immediately on start, then on schedule
  await runCycle();

  const cronExpr = `0 */${CYCLE_HOURS} * * *`;
  cron.schedule(cronExpr, runCycle);
  console.log(`[Agent] Scheduled: ${cronExpr}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
