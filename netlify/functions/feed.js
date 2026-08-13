const Parser = require("rss-parser");
const parser = new Parser({timeout: 12000});

const FEEDS = [
  {name:"RBI", url:"https://www.rbi.org.in/Scripts/rss.aspx"},
  {name:"SEBI", url:"https://www.sebi.gov.in/sebirss.xml"},
  {name:"Finextra", url:"https://www.finextra.com/rss/headlines.aspx"}
];

exports.handler = async () => {
  const results = await Promise.allSettled(FEEDS.map(async source => {
    const feed = await parser.parseURL(source.url);
    return (feed.items || []).slice(0,15).map(item => ({
      title: item.title || "Untitled",
      link: item.link || item.guid || "#",
      date: item.isoDate || item.pubDate || "",
      description: (item.contentSnippet || "").replace(/\s+/g," ").slice(0,220),
      source: source.name
    }));
  }));

  const items = results.flatMap(r => r.status === "fulfilled" ? r.value : []);
  const unique = Array.from(new Map(items.map(x => [x.link,x])).values())
    .sort((a,b) => new Date(b.date||0) - new Date(a.date||0))
    .slice(0,40);

  return {
    statusCode:200,
    headers:{"content-type":"application/json; charset=utf-8","cache-control":"public,max-age=300"},
    body:JSON.stringify({items:unique})
  };
};
