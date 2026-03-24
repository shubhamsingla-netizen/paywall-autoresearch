const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const path = require("path");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function loadContext() {
  const program = fs.readFileSync(
    path.join(__dirname, "..", "program.md"),
    "utf-8"
  );
  const results = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "results.json"), "utf-8")
  );
  return { program, results };
}

async function generateHypothesis(triedVariantIds = []) {
  const { program, results } = loadContext();

  const experimentHistory = results.experiments
    .slice(-20) // last 20 experiments
    .map(
      (e) =>
        `- variant_id: ${e.variant_id}, CVR: ${e.cvr ? (e.cvr * 100).toFixed(1) + "%" : "pending"}, status: ${e.status}, headline: "${e.config?.headline}", note: ${e.note || ""}`
    )
    .join("\n");

  const winners = results.winners
    .map((w) => `- ${w.variant_id}: ${(w.cvr * 100).toFixed(1)}% CVR — "${w.config?.headline}"`)
    .join("\n");

  const prompt = `You are a conversion rate optimization expert for Stage, a regional OTT platform in India.

${program}

## Experiment History (last 20)
${experimentHistory || "No experiments yet."}

## Winners so far
${winners || "None yet."}

## Already tried variant IDs (do not reuse)
${triedVariantIds.join(", ") || "none"}

## Task
Generate ONE new paywall variant to test. It must be meaningfully different from what has been tried before. Build on patterns that worked (if any winners exist).

Return ONLY valid JSON in this exact format:
{
  "hypothesis": "One sentence explaining why this change should improve CVR",
  "config": {
    "headline": "Hindi headline text (max 10 words)",
    "cta_text": "Hindi CTA (max 4 words, starts with verb)",
    "trust_bullets": ["✓ bullet 1", "✓ bullet 2"],
    "urgency_text": "Hindi urgency text or empty string",
    "show_timer": false,
    "variant_id": "ar_UNIQUE_ID",
    "plan_id": ""
  }
}

Rules:
- variant_id must be unique, format: ar_YYYYMMDD_NNN (use today's date)
- All text in Hindi (Devanagari)
- Trust bullets: 2-3 items max
- Never make false claims`;

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content[0].text.trim();

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude did not return valid JSON");

  return JSON.parse(jsonMatch[0]);
}

module.exports = { generateHypothesis };
