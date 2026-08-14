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

function cleanTitle(title = "") {
  return title.toLowerCase()
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\b(no\.?|order|circular|press release|dated|certificate|appeal)\b/g, "")
    .replace(/\b\d{2,}\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

  const candidates = results.flatMap(r => r.status === "fulfilled" ? r.value : []);
  candidates.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const seenLinks = new Set();
  const seenTitles = new Set();
  const sourceCounts = new Map();
  const unique = [];

  for (const item of candidates) {
    const key = cleanTitle(item.title);
    const sourceCount = sourceCounts.get(item.source) || 0;
    if (seenLinks.has(item.link) || (key && seenTitles.has(key)) || sourceCount >= LIMIT_PER_SOURCE) continue;
    seenLinks.add(item.link);
    if (key) seenTitles.add(key);
    sourceCounts.set(item.source, sourceCount + 1);
    unique.push(item);
    if (unique.length >= TOTAL_LIMIT) break;
  }

  const balanced = [];
  const remainder = [];
  const topSourceCounts = new Map();

  for (const item of unique) {
    const count = topSourceCounts.get(item.source) || 0;
    if (balanced.length < 4 && count < 1) {
      balanced.push(item);
      topSourceCounts.set(item.source, count + 1);
    } else {
      remainder.push(item);
    }
  }

  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public,max-age=300"
    },
    body: JSON.stringify({ items: [...balanced, ...remainder] })
  };
};
