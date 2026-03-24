const axios = require("axios");

async function post(text) {
  if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_CHANNEL_ID) return;
  await axios.post(
    "https://slack.com/api/chat.postMessage",
    { channel: process.env.SLACK_CHANNEL_ID, text },
    { headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` } }
  );
}

function formatCVR(cvr) {
  return cvr != null ? `${(cvr * 100).toFixed(1)}%` : "pending";
}

async function postCycleSummary({ active, winners, killed, launched, baselineCVR }) {
  const lines = [
    `*🤖 Stage AutoResearch — Cycle Complete*`,
    `Baseline CVR: *${formatCVR(baselineCVR)}*`,
    "",
  ];

  if (winners.length) {
    lines.push(`*🏆 Winners this cycle (${winners.length}):*`);
    winners.forEach((w) =>
      lines.push(`  • ${w.variant_id}: ${formatCVR(w.cvr)} — "${w.config?.headline}"`)
    );
    lines.push("");
  }

  if (killed.length) {
    lines.push(`*💀 Killed (underperforming):*`);
    killed.forEach((k) =>
      lines.push(`  • ${k.variant_id}: ${formatCVR(k.cvr)}`)
    );
    lines.push("");
  }

  if (launched.length) {
    lines.push(`*🚀 New experiments launched (${launched.length}):*`);
    launched.forEach((l) =>
      lines.push(`  • ${l.variant_id}: "${l.headline}" — _${l.hypothesis}_`)
    );
    lines.push("");
  }

  if (active.length) {
    lines.push(`*📊 Active experiments (${active.length}/${process.env.MAX_ACTIVE_EXPERIMENTS || 5}):*`);
    active.forEach((e) =>
      lines.push(`  • ${e.name} — views: ${e.views || "?"}, CVR: ${formatCVR(e.cvr)}`)
    );
  }

  await post(lines.join("\n"));
}

module.exports = { post, postCycleSummary };
