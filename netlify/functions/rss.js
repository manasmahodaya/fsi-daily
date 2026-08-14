const Parser = require("rss-parser");
const parser = new Parser({ timeout: 12000 });
const {
  FEEDS,
  cleanTitle,
  repetitiveNoticeKey,
  parseDate
} = require("./feed");

const LIMIT_PER_SOURCE = 6;
const TOTAL_LIMIT = 30;

exports.handler = async () => {
  const results = await Promise.allSettled(
    FEEDS.map(async source => {
      const feed = await parser.parseURL(source.url);
      return (feed.items || []).slice(0, 20).map(i => ({
        title: i.title || "Untitled",
        link: i.link || i.guid || "#",
        date: parseDate(i),
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
    const k = cleanTitle(x.title);
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
