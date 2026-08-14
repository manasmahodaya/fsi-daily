const Parser = require("rss-parser");
const parser = new Parser({ timeout: 12000 });

const FEEDS = [
  { name: "RBI", url: "https://www.rbi.org.in/Scripts/rss.aspx" },
  { name: "Finextra", url: "https://www.finextra.com/rss/headlines.aspx" },
  { name: "Finextra · Payments", url: "https://www.finextra.com/rss/channel.aspx?channel=payments" },
  { name: "Finextra · AI", url: "https://www.finextra.com/rss/channel.aspx?channel=ai" },
  { name: "Finextra · Retail Banking", url: "https://www.finextra.com/rss/channel.aspx?channel=retail" },
  { name: "Finextra · Regulation", url: "https://www.finextra.com/rss/channel.aspx?channel=risk" }
];

const LIMIT_PER_SOURCE = 6;
const TOTAL_LIMIT = 30;
const TOP_STORIES_LIMIT = 4;

const IMPACT_KEYWORDS = [
  { pattern: /\b(regulation|regulatory|central bank|interest rates?|rate cut|rate hike|bank licence|bank license)\b/g, score: 4 },
  { pattern: /\b(acquisition|acquire|merger|sanction|fine|penalty|fraud|cyberattack|cyber attack|outage)\b/g, score: 4 },
  { pattern: /\b(default|bankruptcy|capital|stablecoin|digital currency)\b/g, score: 4 },
  { pattern: /\b(artificial intelligence|agentic ai|payments?|upi|open banking)\b/g, score: 3 }
];

const CATEGORY_BOOSTS = {
  "Regulation": 3,
  "Payments": 2,
  "AI + Finance": 2
};

const WHY_IT_MATTERS = {
  "Payments": "Payments infrastructure, customer journeys or transaction economics could be affected.",
  "AI + Finance": "AI adoption could change financial-services operations, risk controls or customer experience.",
  "Regulation": "Regulatory or policy changes can affect compliance, product design and market strategy.",
  "Insurance": "The development could influence insurance distribution, pricing, risk or customer experience.",
  "Fintech": "The move could reshape competition, financial infrastructure or how customers access financial products.",
  "Banking": "The development could influence banking strategy, operations, risk or customer economics."
};

function cleanTitle(title = "") {
  return title.toLowerCase()
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\b(completion of|recovery certificate|no\.?|order|circular|press release|dated|certificate|appeal|reference|ref\.?)\b/g, "")
    .replace(/\b\d{2,}\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function repetitiveNoticeKey(title = "") {
  const normalized = cleanTitle(title);
  if (!normalized) return "";
  if (/completion of recovery/.test(title.toLowerCase())) return "recovery-certificate-notice";
  if (/\b(recovery certificate|auction notice|compliance certificate|certificate issued)\b/.test(title.toLowerCase())) {
    return normalized.split(" ").slice(0, 4).join(" ");
  }
  return "";
}

function parseDate(item) {
  const raw = item.isoDate || item.pubDate || item.published || item.date;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function categoryFor(item, source) {
  const text = `${item.title || ""} ${item.description || ""} ${source}`.toLowerCase();
  if (/insurance|irdai|insurer|policyholder|premium/.test(text)) return "Insurance";
  if (/payment|upi|rupay|card|wallet|merchant|remittance/.test(text)) return "Payments";
  if (/fintech|digital bank|neobank|financial technology|startup/.test(text)) return "Fintech";
  if (/artificial intelligence|\bai\b|machine learning|generative|copilot|automation/.test(text)) return "AI + Finance";
  if (/regulat|sebi|rbi|circular|compliance|order|policy|notification|consultation|risk/.test(text)) return "Regulation";
  return "Banking";
}

function impactScoreFor(item) {
  const text = `${item.title || ""} ${item.description || ""} ${item.source || ""} ${item.category || ""}`.toLowerCase();
  let score = 0;

  for (const signal of IMPACT_KEYWORDS) {
    const matches = text.match(signal.pattern);
    if (matches) score += matches.length * signal.score;
  }

  score += CATEGORY_BOOSTS[item.category] || 0;

  if (item.source === "RBI") score += 2;

  if (item.date) {
    const ageMs = Date.now() - new Date(item.date).getTime();
    if (ageMs <= 24 * 60 * 60 * 1000) {
      score += 4;
    } else if (ageMs <= 72 * 60 * 60 * 1000) {
      score += 2;
    }
  }

  return score;
}

function compareStories(a, b) {
  if (b.impactScore !== a.impactScore) return b.impactScore - a.impactScore;
  return new Date(b.date || 0) - new Date(a.date || 0);
}

function buildTopStories(items) {
  const top = [];
  const remainder = [];
  const usedSources = new Set();
  const usedCategories = new Set();

  for (const item of items) {
    if (top.length >= TOP_STORIES_LIMIT) {
      remainder.push(item);
      continue;
    }

    if (!usedSources.has(item.source) && !usedCategories.has(item.category)) {
      top.push(item);
      usedSources.add(item.source);
      usedCategories.add(item.category);
    } else {
      remainder.push(item);
    }
  }

  for (const item of remainder) {
    if (top.length >= TOP_STORIES_LIMIT) break;
    if (!usedSources.has(item.source)) {
      top.push(item);
      usedSources.add(item.source);
      usedCategories.add(item.category);
    }
  }

  const topIds = new Set(top.map(item => item.link));
  const rest = items.filter(item => !topIds.has(item.link));

  return [...top, ...rest];
}

exports.handler = async () => {
  const results = await Promise.allSettled(
    FEEDS.map(async source => {
      const feed = await parser.parseURL(source.url);
      return (feed.items || []).slice(0, 20).map(item => ({
        title: item.title || "Untitled",
        link: item.link || item.guid || "#",
        date: parseDate(item),
        description: (item.contentSnippet || item.content || "").replace(/\s+/g, " ").slice(0, 220),
        source: source.name,
        category: categoryFor(
          { title: item.title, description: item.contentSnippet || item.content },
          source.name
        )
      }));
    })
  );

  const fulfilled = results.filter(result => result.status === "fulfilled");
  if (!fulfilled.length) {
    return {
      statusCode: 502,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      },
      body: JSON.stringify({ error: "All RSS sources failed.", items: [] })
    };
  }

  const candidates = results.flatMap(r => r.status === "fulfilled" ? r.value : []);
  candidates.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const seenLinks = new Set();
  const seenTitles = new Set();
  const seenNotices = new Set();
  const sourceCounts = new Map();
  const unique = [];

  for (const item of candidates) {
    const key = cleanTitle(item.title);
    const noticeKey = repetitiveNoticeKey(item.title);
    const sourceCount = sourceCounts.get(item.source) || 0;
    if (
      seenLinks.has(item.link) ||
      (key && seenTitles.has(key)) ||
      (noticeKey && seenNotices.has(noticeKey)) ||
      sourceCount >= LIMIT_PER_SOURCE
    ) continue;

    const enriched = {
      ...item,
      impactScore: impactScoreFor(item),
      whyItMatters: WHY_IT_MATTERS[item.category] || WHY_IT_MATTERS.Banking
    };

    seenLinks.add(item.link);
    if (key) seenTitles.add(key);
    if (noticeKey) seenNotices.add(noticeKey);
    sourceCounts.set(item.source, sourceCount + 1);
    unique.push(enriched);
    if (unique.length >= TOTAL_LIMIT) break;
  }

  unique.sort(compareStories);
  const ranked = buildTopStories(unique);

  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public,max-age=300"
    },
    body: JSON.stringify({ items: ranked })
  };
};
