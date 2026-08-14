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

const key = t => String(t || "").toLowerCase()
  .replace(/\[[^\]]*\]/g, "")
  .replace(/\b(completion of|recovery certificate|no\.?|order|circular|press release|dated|certificate|appeal|reference|ref\.?)\b/g, "")
  .replace(/\b\d{2,}\b/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const repetitiveNoticeKey = title => {
  const normalized = key(title);
  const raw = String(title || "").toLowerCase();
  if (!normalized) return "";
  if (/completion of recovery/.test(raw)) return "recovery-certificate-notice";
  if (/\b(recovery certificate|auction notice|compliance certificate|certificate issued)\b/.test(raw)) {
    return normalized.split(" ").slice(0, 4).join(" ");
  }
  return "";
};

const safeDate = item => {
  const raw = item.isoDate || item.pubDate || item.published || item.date;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

exports.handler = async () => {
  const results = await Promise.allSettled(
    FEEDS.map(async source => {
      const feed = await parser.parseURL(source.url);
      return (feed.items || []).slice(0, 20).map(i => ({
        title: i.title || "Untitled",
        link: i.link || i.guid || "#",
        date: safeDate(i),
        source: source.name
      }));
    })
  );

  const fulfilled = results.filter(result => result.status === "fulfilled");
  if (!fulfilled.length) {
    return {
      statusCode: 502,
      headers: { "content-type": "application/rss+xml; charset=utf-8" },
      body: `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>FSI Daily</title><link>https://fsidaily.netlify.app/</link><description>All RSS sources failed.</description></channel></rss>`
    };
  }

  const seen = new Set();
  const seenLinks = new Set();
  const seenNotices = new Set();
  const sourceCounts = new Map();
  const items = [];

  for (const x of results.flatMap(r => r.status === "fulfilled" ? r.value : [])
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))) {
    const k = key(x.title);
    const noticeKey = repetitiveNoticeKey(x.title);
    const count = sourceCounts.get(x.source) || 0;
    if (!k || seen.has(k) || seenLinks.has(x.link) || (noticeKey && seenNotices.has(noticeKey)) || count >= LIMIT_PER_SOURCE) continue;
    seen.add(k);
    seenLinks.add(x.link);
    if (noticeKey) seenNotices.add(noticeKey);
    sourceCounts.set(x.source, count + 1);
    items.push(x);
    if (items.length >= TOTAL_LIMIT) break;
  }

  const esc = s => String(s ?? "").replace(/[<>&'"]/g, c => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;"
  }[c]));

  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>FSI Daily</title><link>https://fsidaily.netlify.app/</link><description>Financial Services Intelligence</description>${items.map(x => `<item><title>${esc(x.title)}</title><link>${esc(x.link)}</link>${x.date ? `<pubDate>${esc(x.date)}</pubDate>` : ""}<description>${esc(x.source)}</description></item>`).join("")}</channel></rss>`;

  return {
    statusCode: 200,
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
    body: xml
  };
};
