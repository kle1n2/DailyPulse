export const CATEGORY_LABELS = {
  technology: "科技",
  finance: "财经",
  world: "国际",
  ai: "AI",
  society: "社会热点"
};

export const CATEGORY_TARGETS = {
  technology: 5,
  finance: 5,
  world: 5,
  ai: 5,
  society: 5
};

export const PAPER_TARGET_MIN = 3;
export const PAPER_TARGET_MAX = 5;

export const NEWS_SOURCES = [
  { name: "TechCrunch", url: "https://techcrunch.com/feed/", category: "technology", weight: 1.08 },
  { name: "The Verge", url: "https://www.theverge.com/rss/index.xml", category: "technology", weight: 1.02 },
  { name: "Ars Technica", url: "http://feeds.arstechnica.com/arstechnica/index", category: "technology", weight: 0.98 },
  { name: "CNBC Top News", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", category: "finance", weight: 1.06 },
  { name: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", category: "finance", weight: 1.0 },
  { name: "Reuters World", url: "https://feeds.reuters.com/Reuters/worldNews", category: "world", weight: 1.09 },
  { name: "BBC World", url: "http://feeds.bbci.co.uk/news/world/rss.xml", category: "world", weight: 1.03 },
  { name: "VentureBeat AI", url: "https://venturebeat.com/category/ai/feed/", category: "ai", weight: 1.04 },
  {
    name: "MIT Technology Review AI",
    url: "https://www.technologyreview.com/topic/artificial-intelligence/feed",
    category: "ai",
    weight: 1.06
  },
  { name: "NPR News", url: "https://feeds.npr.org/1001/rss.xml", category: "society", weight: 1.0 },
  { name: "AP Top News", url: "https://feeds.apnews.com/apf-topnews", category: "society", weight: 1.02 }
];

export const PAPER_SOURCES = [
  { name: "arXiv cs.AI", url: "https://rss.arxiv.org/rss/cs.AI", type: "paper", weight: 1.1 },
  { name: "arXiv cs.LG", url: "https://rss.arxiv.org/rss/cs.LG", type: "paper", weight: 1.08 },
  { name: "OpenAI News", url: "https://openai.com/news/rss.xml", type: "blog", weight: 1.04 },
  { name: "Hugging Face Blog", url: "https://huggingface.co/blog/feed.xml", type: "blog", weight: 1.01 },
  { name: "BAIR Blog", url: "http://bair.berkeley.edu/blog/feed.xml", type: "blog", weight: 1.0 }
];
