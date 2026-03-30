export const CATEGORY_LABELS = {
  technology: "技术前沿",
  finance: "产业财经",
  world: "国际要闻",
  ai: "AI 焦点",
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

export const SOURCE_TIERS = {
  mainstream: "mainstream",
  tech_media: "tech_media"
};

export const NEWS_SOURCES = [
  {
    name: "中新网财经",
    url: "https://www.chinanews.com.cn/rss/finance.xml",
    tier: SOURCE_TIERS.mainstream,
    group: "chinanews",
    allowed_categories: ["finance"],
    weight: 1.08
  },
  {
    name: "中新网国际",
    url: "https://www.chinanews.com.cn/rss/world.xml",
    tier: SOURCE_TIERS.mainstream,
    group: "chinanews",
    allowed_categories: ["world"],
    weight: 1.08
  },
  {
    name: "中新网社会",
    url: "https://www.chinanews.com.cn/rss/society.xml",
    tier: SOURCE_TIERS.mainstream,
    group: "chinanews",
    allowed_categories: ["society"],
    weight: 1.06
  },
  {
    name: "36氪",
    url: "https://36kr.com/feed",
    tier: SOURCE_TIERS.tech_media,
    group: "36kr",
    allowed_categories: ["technology", "ai"],
    weight: 1.02
  },
  {
    name: "爱范儿",
    url: "https://www.ifanr.com/feed",
    tier: SOURCE_TIERS.tech_media,
    group: "ifanr",
    allowed_categories: ["technology", "ai"],
    weight: 0.98
  },
  {
    name: "InfoQ 中文",
    url: "https://www.infoq.cn/feed.xml",
    tier: SOURCE_TIERS.tech_media,
    group: "infoq",
    allowed_categories: ["technology", "ai"],
    weight: 1
  },
  {
    name: "量子位",
    url: "https://www.qbitai.com/feed",
    tier: SOURCE_TIERS.tech_media,
    group: "qbitai",
    allowed_categories: ["ai", "technology"],
    weight: 1.04
  }
];

export const AI_SUPPLEMENTAL_SOURCES = [
  {
    name: "量子位",
    url: "https://www.qbitai.com/feed",
    tier: SOURCE_TIERS.tech_media,
    group: "qbitai",
    allowed_categories: ["ai"],
    weight: 0.98
  },
  {
    name: "InfoQ 中文",
    url: "https://www.infoq.cn/feed.xml",
    tier: SOURCE_TIERS.tech_media,
    group: "infoq",
    allowed_categories: ["ai"],
    weight: 0.92
  }
];

export const PAPER_SOURCES = [
  {
    name: "量子位",
    url: "https://www.qbitai.com/feed",
    tier: SOURCE_TIERS.tech_media,
    group: "qbitai",
    type: "blog",
    weight: 1.08
  },
  {
    name: "InfoQ 中文",
    url: "https://www.infoq.cn/feed.xml",
    tier: SOURCE_TIERS.tech_media,
    group: "infoq",
    type: "blog",
    weight: 1.02
  },
  {
    name: "36氪",
    url: "https://36kr.com/feed",
    tier: SOURCE_TIERS.tech_media,
    group: "36kr",
    type: "blog",
    weight: 0.96
  },
  {
    name: "爱范儿",
    url: "https://www.ifanr.com/feed",
    tier: SOURCE_TIERS.tech_media,
    group: "ifanr",
    type: "blog",
    weight: 0.92
  }
];
