const Parser = require("rss-parser");
const parser = new Parser({ timeout: 12000 });

const FEEDS = [
  { name: "RBI", url: "https://rbi.org.in/pressreleases_rss.xml" },
  { name: "RBI", url: "https://rbi.org.in/notifications_rss.xml" },
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

const SOURCE_BOOSTS = {
  "RBI": 2,
  "NPCI": 2,
  "IRDAI": 2
};

const INDIA_SIGNALS = /\b(india|indian|rbi|reserve bank of india|npci|national payments corporation of india|irdai|rupay|upi|nbfc|mumbai|delhi|bengaluru|hyderabad|chennai|aadhaar|bharat|ifsc|psb|scheduled banks in india)\b/;

const WHY_IT_MATTERS = {
  India: {
    "Banking": "Indian banks and financial institutions may need to adjust operations, compliance or product strategy.",
    "Payments": "The development could affect India's payments infrastructure, transaction economics or digital-payment adoption.",
    "Fintech": "The move could reshape competition, infrastructure or access to financial products in India's financial system.",
    "Insurance": "The development could influence insurance distribution, pricing, compliance or policyholder experience in India.",
    "Regulation": "The change could affect compliance requirements, product design or market strategy for Indian financial institutions.",
    "AI + Finance": "The development could change how Indian financial institutions deploy AI across operations, risk and customer experience."
  },
  Global: {
    "Banking": "The development could influence banking strategy, competition, risk or customer economics.",
    "Payments": "The development could affect payments infrastructure, cross-border transactions or fintech competition.",
    "Fintech": "The move could reshape competition, financial infrastructure or access to financial products.",
    "Insurance": "The development could influence insurance distribution, pricing, risk or customer experience.",
    "Regulation": "Regulatory or policy changes can affect compliance, product design and market strategy.",
    "AI + Finance": "The development could change how financial institutions deploy AI across operations, risk and customer experience."
  }
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

function shortDescription(item) {
  return (item.contentSnippet || item.content || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
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

function regionFor(item) {
  const source = item.source || "";
  const text = `${item.title || ""} ${item.description || ""} ${source}`.toLowerCase();
  if (/^(RBI|NPCI|IRDAI)$/.test(source)) return "India";
  if (INDIA_SIGNALS.test(text)) return "India";
  return "Global";
}

function whyItMattersFor(item) {
  const region = item.region === "India" ? "India" : "Global";
  return WHY_IT_MATTERS[region][item.category] || WHY_IT_MATTERS[region].Banking;
}

function impactScoreFor(item) {
  const text = `${item.title || ""} ${item.description || ""} ${item.source || ""} ${item.category || ""}`.toLowerCase();
  let score = 0;

  for (const signal of IMPACT_KEYWORDS) {
    const matches = text.match(signal.pattern);
    if (matches) score += matches.length * signal.score;
  }

  score += CATEGORY_BOOSTS[item.category] || 0;

  score += SOURCE_BOOSTS[item.source] || 0;
  if (item.region === "India" && /\b(india|indian|upi|rupay|rbi|npci|irdai)\b/.test(text)) score += 1;

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
  const usedRegions = new Set();

  for (const item of items) {
    if (top.length >= TOP_STORIES_LIMIT) {
      remainder.push(item);
      continue;
    }

    const needsRegionDiversity = usedRegions.size < 2 && items.some(candidate => !usedRegions.has(candidate.region));
    const regionEligible = !needsRegionDiversity || !usedRegions.has(item.region);

    if (!usedSources.has(item.source) && !usedCategories.has(item.category) && regionEligible) {
      top.push(item);
      usedSources.add(item.source);
      usedCategories.add(item.category);
      usedRegions.add(item.region);
    } else {
      remainder.push(item);
    }
  }

  for (const item of remainder) {
    if (top.length >= TOP_STORIES_LIMIT) break;
    if (!usedSources.has(item.source) && !usedRegions.has(item.region)) {
      top.push(item);
      usedSources.add(item.source);
      usedCategories.add(item.category);
      usedRegions.add(item.region);
    }
  }

  for (const item of remainder) {
    if (top.length >= TOP_STORIES_LIMIT) break;
    if (!usedSources.has(item.source)) {
      top.push(item);
      usedSources.add(item.source);
      usedCategories.add(item.category);
      usedRegions.add(item.region);
    }
  }

  for (const item of remainder) {
    if (top.length >= TOP_STORIES_LIMIT) break;
    if (!top.includes(item)) top.push(item);
  }

  const topIds = new Set(top.map(item => item.link));
  const rest = items.filter(item => !topIds.has(item.link));

  return [...top, ...rest];
}

exports.handler = async () => {
  const results = await Promise.allSettled(
    FEEDS.map(async source => {
      const feed = await parser.parseURL(source.url);
      return (feed.items || []).slice(0, 20).map(item => {
        const description = shortDescription(item);
        const story = {
        title: item.title || "Untitled",
        link: item.link || item.guid || "#",
        date: parseDate(item),
        description,
        source: source.name,
        category: categoryFor({ title: item.title, description }, source.name)
      };
        return {
          ...story,
          region: regionFor(story)
        };
      });
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
      whyItMatters: whyItMattersFor(item)
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

module.exports = {
  handler: exports.handler,
  FEEDS,
  cleanTitle,
  repetitiveNoticeKey,
  parseDate
};
