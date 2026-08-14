const feed = require("./feed");

const BRIEF_TITLE = "5 things financial-services leaders should know today";
const BRIEF_LIMIT = 5;

const EXECUTIVE_WHY = {
  "Banking": "The development could influence bank strategy, risk management, compliance or customer economics.",
  "Payments": "The development could affect payment infrastructure, transaction economics, competition or customer adoption.",
  "Fintech": "The development could reshape competition or financial infrastructure.",
  "Insurance": "The development could influence insurance distribution, pricing, compliance or policyholder experience.",
  "Regulation": "Financial institutions may need to assess compliance, product design and operational implications.",
  "AI + Finance": "The development could influence how financial institutions deploy AI across operations, risk and customer experience."
};

const INDIA_IMPACT = {
  "Banking": "Indian banks and financial institutions should watch for potential strategic, compliance or operating implications.",
  "Payments": "Indian banks, fintechs and payment providers should watch for potential infrastructure, adoption or competitive implications.",
  "Fintech": "Indian fintechs and digital-finance operators should watch for competitive or infrastructure implications.",
  "Insurance": "Indian insurers and distributors should watch for possible pricing, compliance or policyholder implications.",
  "Regulation": "Indian financial institutions should assess possible compliance, product and market implications.",
  "AI + Finance": "Indian financial institutions should watch for possible operational, risk and technology implications."
};

function scoreBriefCandidate(item, used, preference = {}) {
  const publishedAt = item.date ? new Date(item.date).getTime() : 0;
  let score = (item.impactScore || 0) * 1000 + publishedAt / 10000000;

  if (preference.region && item.region === preference.region) score += 350;
  if (preference.categories && preference.categories.includes(item.category)) score += 300;
  if (!used.sources.has(item.source)) score += 140;
  if (!used.categories.has(item.category)) score += 100;
  if (!used.regions.has(item.region)) score += 80;

  return score;
}

function pickStory(items, selectedLinks, used, preference = {}) {
  const candidates = items.filter(item => !selectedLinks.has(item.link));
  if (!candidates.length) return null;

  const ranked = candidates
    .map(item => ({ item, score: scoreBriefCandidate(item, used, preference) }))
    .sort((a, b) => b.score - a.score);

  const chosen = ranked[0]?.item || null;
  if (!chosen) return null;

  selectedLinks.add(chosen.link);
  used.sources.add(chosen.source);
  used.categories.add(chosen.category);
  used.regions.add(chosen.region);
  return chosen;
}

function selectBriefStories(items) {
  const selectedLinks = new Set();
  const used = {
    sources: new Set(),
    categories: new Set(),
    regions: new Set()
  };
  const selected = [];

  const sequence = [
    {},
    { region: "India" },
    { region: "Global" },
    { categories: ["Payments", "Fintech", "AI + Finance"] },
    { categories: ["Regulation", "Banking", "Insurance"] }
  ];

  for (const preference of sequence) {
    if (selected.length >= BRIEF_LIMIT) break;
    const story = pickStory(items, selectedLinks, used, preference);
    if (story) selected.push(story);
  }

  while (selected.length < BRIEF_LIMIT) {
    const story = pickStory(items, selectedLinks, used);
    if (!story) break;
    selected.push(story);
  }

  return selected;
}

function truncate(text, maxLength) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function whatHappenedFor(item) {
  const title = truncate(item.title, 140);
  const description = truncate(item.description, 180);
  if (description) {
    return `According to the original publisher, ${title}. ${description}`;
  }
  return `According to the original publisher, ${title}.`;
}

function whyItMattersForBrief(item) {
  return EXECUTIVE_WHY[item.category] || EXECUTIVE_WHY.Banking;
}

function audienceFor(item) {
  const text = `${item.title || ""} ${item.description || ""}`.toLowerCase();
  if (item.category === "Regulation") {
    return /\b(risk|fraud|penalty|cyber|outage)\b/.test(text) ? "Risk leaders" : "Compliance leaders";
  }
  if (item.category === "Payments") return "Payments leaders";
  if (item.category === "AI + Finance") return "CIO / CTO";
  if (item.category === "Insurance") return "Insurance executives";
  if (item.category === "Fintech") {
    return /\b(funding|acquisition|merger|capital|invest)\b/.test(text) ? "Financial-services investors" : "Fintech founders";
  }
  return "Bank executives";
}

function indiaImpactFor(item) {
  if (item.region === "India") {
    return INDIA_IMPACT[item.category] || INDIA_IMPACT.Banking;
  }

  const text = `${item.title || ""} ${item.description || ""}`.toLowerCase();
  if (/\bindia|indian|upi|rupay|rbi|nbfc\b/.test(text)) {
    return "Indian financial institutions should assess whether the development has local competitive, regulatory or operating implications.";
  }

  return null;
}

exports.handler = async () => {
  try {
    const response = await feed.handler();
    if (response.statusCode !== 200) {
      return {
        statusCode: response.statusCode || 502,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store"
        },
        body: JSON.stringify({ error: "Executive brief could not be generated from the current feed." })
      };
    }

    const payload = JSON.parse(response.body || "{}");
    const items = Array.isArray(payload.items) ? payload.items : [];
    const selected = selectBriefStories(items);

    const stories = selected.map(item => ({
      title: item.title,
      source: item.source,
      category: item.category,
      region: item.region,
      date: item.date || null,
      impactScore: item.impactScore,
      whatHappened: whatHappenedFor(item),
      whyItMatters: whyItMattersForBrief(item),
      audience: audienceFor(item),
      indiaImpact: indiaImpactFor(item),
      link: item.link
    }));

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public,max-age=900"
      },
      body: JSON.stringify({
        generatedAt: new Date().toISOString(),
        title: BRIEF_TITLE,
        stories
      })
    };
  } catch {
    return {
      statusCode: 502,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      },
      body: JSON.stringify({ error: "Executive brief could not be generated." })
    };
  }
};

module.exports = {
  handler: exports.handler,
  selectBriefStories,
  whatHappenedFor,
  whyItMattersForBrief,
  audienceFor,
  indiaImpactFor
};
