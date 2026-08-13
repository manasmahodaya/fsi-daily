const Parser = require("rss-parser");
const parser = new Parser({timeout:12000});

const FEEDS = [
  {name:"RBI", url:"https://www.rbi.org.in/Scripts/rss.aspx"},
  {name:"SEBI", url:"https://www.sebi.gov.in/sebirss.xml"},
  {name:"Finextra", url:"https://www.finextra.com/rss/headlines.aspx"}
];

exports.handler = async () => {
  const results = await Promise.allSettled(FEEDS.map(async source => {
    const feed = await parser.parseURL(source.url);
    return (feed.items || []).slice(0,10).map(item => ({
      title:item.title || "Untitled",
      link:item.link || item.guid || "#",
      date:item.isoDate || item.pubDate || "",
      source:source.name
    }));
  }));

  const items = results.flatMap(r => r.status === "fulfilled" ? r.value : []);
  const unique = Array.from(new Map(items.map(x => [x.link,x])).values())
    .sort((a,b) => new Date(b.date||0)-new Date(a.date||0))
    .slice(0,40);

  const esc = s => String(s ?? "").replace(/[<>&'"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"}[c]));
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>FSI Daily</title><link>https://fsidaily.netlify.app/</link><description>Financial Services Intelligence</description>${unique.map(x=>`<item><title>${esc(x.title)}</title><link>${esc(x.link)}</link><pubDate>${esc(x.date)}</pubDate><description>${esc(x.source)}</description></item>`).join("")}</channel></rss>`;

  return {statusCode:200,headers:{"content-type":"application/rss+xml; charset=utf-8"},body:xml};
};
