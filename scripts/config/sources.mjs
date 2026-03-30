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
  { name: "36氪", url: "https://36kr.com/feed", category: "technology", weight: 1.08 },
  { name: "爱范儿", url: "https://www.ifanr.com/feed", category: "technology", weight: 1.02 },
  { name: "InfoQ 中文", url: "https://www.infoq.cn/feed.xml", category: "technology", weight: 0.98 },
  { name: "中新网财经", url: "https://www.chinanews.com.cn/rss/finance.xml", category: "finance", weight: 1.08 },
  { name: "36氪", url: "https://36kr.com/feed", category: "finance", weight: 0.96 },
  { name: "InfoQ 中文", url: "https://www.infoq.cn/feed.xml", category: "finance", weight: 0.92 },
  { name: "中新网国际", url: "https://www.chinanews.com.cn/rss/world.xml", category: "world", weight: 1.08 },
  { name: "36氪", url: "https://36kr.com/feed", category: "world", weight: 0.9 },
  { name: "量子位", url: "https://www.qbitai.com/feed", category: "ai", weight: 1.08 },
  { name: "InfoQ 中文", url: "https://www.infoq.cn/feed.xml", category: "ai", weight: 1.02 },
  { name: "36氪", url: "https://36kr.com/feed", category: "ai", weight: 0.94 },
  { name: "中新网社会", url: "https://www.chinanews.com.cn/rss/society.xml", category: "society", weight: 1.06 },
  { name: "36氪", url: "https://36kr.com/feed", category: "society", weight: 0.88 }
];

export const AI_SUPPLEMENTAL_SOURCES = [
  { name: "量子位", url: "https://www.qbitai.com/feed", category: "ai", weight: 0.96 },
  { name: "InfoQ 中文", url: "https://www.infoq.cn/feed.xml", category: "ai", weight: 0.92 },
  { name: "36氪", url: "https://36kr.com/feed", category: "ai", weight: 0.88 }
];

export const PAPER_SOURCES = [
  { name: "量子位", url: "https://www.qbitai.com/feed", type: "blog", weight: 1.08 },
  { name: "InfoQ 中文", url: "https://www.infoq.cn/feed.xml", type: "blog", weight: 1.02 },
  { name: "36氪", url: "https://36kr.com/feed", type: "blog", weight: 0.96 },
  { name: "爱范儿", url: "https://www.ifanr.com/feed", type: "blog", weight: 0.92 },
  { name: "中新网财经", url: "https://www.chinanews.com.cn/rss/finance.xml", type: "blog", weight: 0.88 }
];
