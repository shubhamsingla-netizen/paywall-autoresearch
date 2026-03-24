# Stage Paywall AutoResearch Program

## Goal
Maximize `trial_initiated` rate on the Stage web paywall.
Metric: trial_initiated / trial_paywall_viewed (higher is better).
Current baseline CVR: ~27%.

## Platform
- Stage is a regional OTT platform for India (Tier 2/3 cities)
- Content: Haryanvi, Bhojpuri, Rajasthani, Gujarati web series & movies
- Brand ambassador: Randeep Hooda
- Trial offer: ₹1 for 7 days, then ₹199/month
- Users are price-sensitive. Many think "₹1 = scam with hidden charges"

## What the agent CAN change
- `headline` — Main heading above the video (Hindi text, max 10 words)
- `cta_text` — Button text (Hindi, max 4 words, action-oriented)
- `trust_bullets` — Array of 2-3 trust/benefit lines (Hindi, start with ✓)
- `urgency_text` — Optional urgency/scarcity line (can be empty string)
- `show_timer` — Boolean, whether to show countdown timer
- `plan_id` — Optional plan ID override (leave empty to use default)

## What the agent CANNOT change
- Video (stays the same)
- Pricing (always ₹1 trial)
- Layout structure

## Hypothesis space to explore

### Trust & Safety (P0 — most impactful)
Users fear hidden charges. Test explicit guarantees:
- "कोई छुपा चार्ज नहीं, 100% गारंटी"
- Trust bullets with explicit cancel-anytime messaging
- "7 दिन में पसंद न आए तो पूरे पैसे वापस"

### Urgency & Scarcity (P1)
Create genuine urgency without feeling fake:
- Limited-time framing: "आज का स्पेशल ऑफर"
- Social proof: "1 करोड़ से ज़्यादा लोग देख रहे हैं"

### Benefit Framing (P1)
Focus on content value, not just price:
- "रानदीप हुड्डा की सभी फिल्में सिर्फ ₹1 में"
- "7 दिन बिना रोक-टोक देखें"

### Loss Aversion (P2)
Frame trial as "missing out" without it:
- "₹1 में 50+ वेब सीरीज़ — मत चूको"

## Rules
- All text must be in Hindi (Devanagari script)
- Keep ₹1 price mention prominent
- CTA must be action-oriented (start with verb: देखें, शुरू करें, जोड़ें)
- Never make false claims
- Test one hypothesis at a time (don't combine multiple changes in one variant)
- Build on winners: if trust bullets won, test different trust bullet wording next

## Baseline (current best)
variant_id: "baseline"
headline: "₹1 में 7 दिन का ट्रायल"
cta_text: "ट्रायल शुरू करें"
trust_bullets: ["✓ कभी भी कैंसिल करें", "✓ कोई छुपा चार्ज नहीं"]
urgency_text: ""
