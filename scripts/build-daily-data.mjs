import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import Parser from "rss-parser";
import {
  NEWS_SOURCES,
  PAPER_SOURCES,
  CATEGORY_LABELS,
  CATEGORY_TARGETS,
  PAPER_TARGET_MAX,
  PAPER_TARGET_MIN,
  AI_SUPPLEMENTAL_SOURCES
} from "./config/sources.mjs";

const DATA_DIR = path.join(process.cwd(), "data");
const DAILY_DIR = path.join(DATA_DIR, "daily");
const INDEX_FILE = path.join(DATA_DIR, "index.json");

const SOURCE_TIMEOUT_MS = Number(process.env.DAILYPULSE_SOURCE_TIMEOUT_MS ?? 15000);
const JOB_TIMEOUT_MS = Number(process.env.DAILYPULSE_JOB_TIMEOUT_MS ?? 180000);
const UA = "DailyPulseBot/2.0 (+https://github.com)";

const parser = new Parser({
  customFields: {
    item: [["content:encoded", "contentEncoded"]]
  }
});

const CLASSIFIER_TARGETS = ["technology", "finance", "world", "ai", "society"];
const TIER_SCORE = {
  mainstream: 7,
  tech_media: 3
};
const CATEGORY_BASE_THRESHOLD = {
  technology: 84,
  finance: 75,
  world: 75,
  ai: 78,
  society: 75
};

const classifierKeywords = {
  technology: [
    "芯片",
    "半导体",
    "软件",
    "系统",
    "开源",
    "云计算",
    "算力",
    "平台",
    "机器人",
    "火箭",
    "卫星",
    "航天",
    "空间站",
    "服务器",
    "数据库",
    "操作系统",
    "编程",
    "代码",
    "网络安全",
    "漏洞",
    "终端",
    "硬件",
    "智算",
    "无人机",
    "通信",
    "电池",
    "新材料",
    "研发",
    "技术"
  ],
  finance: [
    "IPO",
    "融资",
    "净利润",
    "财报",
    "证券",
    "股",
    "港股",
    "A股",
    "银行",
    "基金",
    "债",
    "收评"
  ],
  world: [
    "国际",
    "美国",
    "日本",
    "欧洲",
    "中东",
    "联合国",
    "外交",
    "冲突",
    "停火",
    "战火"
  ],
  ai: [
    "AI",
    "人工智能",
    "大模型",
    "模型",
    "智能体",
    "机器学习",
    "推理",
    "训练",
    "生成式",
    "AIGC",
    "AGI",
    "LLM",
    "多模态"
  ],
  society: [
    "社会",
    "民生",
    "教育",
    "交通",
    "医疗",
    "天气",
    "暴雨",
    "春假",
    "铁路",
    "城市",
    "公共",
    "应急"
  ]
};

const negativeKeywords = {
  technology: [
    "净利润",
    "收评",
    "A股",
    "港股",
    "IPO",
    "证券",
    "基金",
    "楼市",
    "买房",
    "商务部",
    "协定",
    "部长",
    "宣言",
    "实施",
    "银行",
    "保险",
    "投资",
    "贸易",
    "关税",
    "外贸",
    "就业",
    "教育活动",
    "部长级会议",
    "联合部长宣言",
    "贷款",
    "收购",
    "控股权",
    "并购",
    "交易",
    "公告",
    "协议"
  ],
  finance: ["暴雨", "春假", "铁路检修", "校园", "体育"],
  world: ["A股", "港股", "净利润", "融资"],
  ai: ["买房", "楼市", "交通管制", "暴雨"],
  society: ["IPO", "净利润", "港股", "A股", "融资"]
};

const dualUseSources = new Set(["中新网财经", "中新网国际", "中新网社会"]);
const STRONG_TECH_TERMS = [
  "芯片",
  "半导体",
  "算力",
  "服务器",
  "数据库",
  "操作系统",
  "机器人",
  "火箭",
  "卫星",
  "航天",
  "软件",
  "系统",
  "开源",
  "模型",
  "大模型",
  "人工智能",
  "AI",
  "智能体",
  "网络安全",
  "漏洞",
  "云计算",
  "智算",
  "无人机",
  "通信"
];
const TECH_POLICY_NEGATIVES = [
  "商务部",
  "协定",
  "联合部长宣言",
  "部长宣言",
  "投资便利化",
  "外贸",
  "经贸",
  "银行",
  "基金",
  "证券",
  "保险",
  "净利润",
  "收评",
  "A股",
  "港股",
  "IPO",
  "贸易",
  "关税",
  "贷款",
  "收购",
  "控股权",
  "并购",
  "框架协议",
  "公告",
  "交易"
];
const SOFT_TECH_TERMS = ["系统", "平台", "研发", "技术", "通信", "新材料", "电池", "硬件"];

function nowInChinaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function compactWhitespace(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function stripHtml(text) {
  return compactWhitespace(String(text ?? "").replace(/<[^>]*>/g, " "));
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    const keepParams = new Set(["id", "p", "article"]);
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.startsWith("utm_") || key === "fbclid" || key === "gclid" || !keepParams.has(key)) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function hashId(seed) {
  return crypto.createHash("sha1").update(seed).digest("hex").slice(0, 12);
}

function sentenceSplit(text) {
  return compactWhitespace(text)
    .split(/(?<=[.!?。！？])\s+/)
    .filter(Boolean);
}

function toISODate(raw) {
  const parsed = new Date(raw ?? "");
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

function keywordMatches(text, keywords = []) {
  const lowered = String(text ?? "").toLowerCase();
  return keywords.filter((keyword) => lowered.includes(keyword.toLowerCase()));
}

function keywordScore(text, keywords = [], weight = 7) {
  return keywordMatches(text, keywords).length * weight;
}

function buildItemText(item) {
  return `${item.title_en ?? ""} ${item.summary_zh ?? ""} ${(item.tags ?? []).join(" ")}`;
}

function classifyLevel(score) {
  if (score >= 85) {
    return "high";
  }
  if (score >= 70) {
    return "medium";
  }
  return "low";
}

function calculateFreshnessScore(publishedAt) {
  const hours = Math.max(0, (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60));
  return Math.max(0, 24 - hours * 0.6);
}

function buildExtractiveSummary(rawSnippet, title) {
  const plain = stripHtml(rawSnippet);
  const sentences = sentenceSplit(plain);
  const picked = sentences.find((line) => line.length >= 40) ?? sentences[0] ?? "";
  if (!picked) {
    return {
      summary: `暂无可提炼摘要，请阅读原文了解「${compactWhitespace(title)}」。`,
      weak: true
    };
  }
  const normalized = compactWhitespace(picked).slice(0, 140);
  return {
    summary: normalized.length >= 36 ? normalized : `摘要信息较少，建议阅读原文：${compactWhitespace(title)}`.slice(0, 140),
    weak: normalized.length < 36
  };
}

function computeCategoryScore(item, category) {
  const text = buildItemText(item);
  const positive =
    category === "technology"
      ? keywordScore(text, STRONG_TECH_TERMS, 12) + keywordScore(text, ["研发", "技术"], 4) + keywordScore(text, classifierKeywords.ai, 5)
      : keywordScore(text, classifierKeywords[category], 8);
  const negative =
    category === "technology"
      ? keywordScore(text, negativeKeywords[category], 10) + keywordScore(text, classifierKeywords.finance, 7)
      : keywordScore(text, negativeKeywords[category], 9);
  const freshness = calculateFreshnessScore(item.published_at);
  const sourceBias =
    category === "technology"
      ? item.source_tier === "tech_media"
        ? 8
        : 1
      : TIER_SCORE[item.source_tier] ?? 0;
  const sourceCategoryBoost = item.allowed_categories?.includes(category) ? 7 : -14;
  const dualSourcePenalty =
    dualUseSources.has(item.source_name) && category === "technology" && keywordScore(text, classifierKeywords.finance, 8) > 0
      ? 14
      : 0;
  const technologyPolicyPenalty = category === "technology" ? keywordMatches(text, TECH_POLICY_NEGATIVES).length * 14 : 0;

  return positive - negative + freshness + sourceBias + sourceCategoryBoost - dualSourcePenalty - technologyPolicyPenalty;
}

function hasStrongTechnologySignal(item) {
  const text = buildItemText(item);
  const strongHits = keywordMatches(text, STRONG_TECH_TERMS).length;
  const softHits = keywordMatches(text, SOFT_TECH_TERMS).length;

  if (item.source_tier === "mainstream") {
    return strongHits > 0;
  }
  return strongHits > 0 || softHits >= 2;
}

function getStrongTechnologySignalCount(item) {
  const text = buildItemText(item);
  return keywordMatches(text, STRONG_TECH_TERMS).length;
}

function hasTechnologyPolicyNegative(item) {
  const text = buildItemText(item);
  return keywordMatches(text, TECH_POLICY_NEGATIVES).length > 0;
}

function pickCategory(item) {
  const scores = CLASSIFIER_TARGETS.map((category) => ({
    category,
    score: computeCategoryScore(item, category)
  })).sort((a, b) => b.score - a.score);

  return scores[0] ?? { category: "society", score: 0 };
}

function mapConfidence(score) {
  const normalized = Math.max(0, Math.min(100, Math.round(score + 55)));
  return {
    confidence_score: normalized,
    confidence_level: classifyLevel(normalized)
  };
}

function jaccardSimilarity(a, b) {
  const left = new Set((a.toLowerCase().match(/[a-z0-9\u4e00-\u9fff]+/g) ?? []).filter(Boolean));
  const right = new Set((b.toLowerCase().match(/[a-z0-9\u4e00-\u9fff]+/g) ?? []).filter(Boolean));
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let inter = 0;
  for (const token of left) {
    if (right.has(token)) {
      inter += 1;
    }
  }
  const union = left.size + right.size - inter;
  return inter / union;
}

function dedupeByUrl(items) {
  const byUrl = new Map();
  for (const item of items) {
    if (!item.source_url) {
      continue;
    }
    const existing = byUrl.get(item.source_url);
    if (!existing || item.confidence_score > existing.confidence_score) {
      byUrl.set(item.source_url, item);
    }
  }
  return [...byUrl.values()];
}

function dedupeBySimilarity(items) {
  const kept = [];
  for (const item of items) {
    const dup = kept.find((candidate) => jaccardSimilarity(candidate.title_en, item.title_en) > 0.9);
    if (dup) {
      dup.quality_flags = [...new Set([...(dup.quality_flags ?? []), "duplicate_cluster"])];
      continue;
    }
    kept.push(item);
  }
  return kept;
}

function buildSelectionReason(item) {
  const matches = keywordMatches(`${item.title_en} ${item.summary_zh}`, classifierKeywords[item.category] ?? []);
  if (matches.length > 0) {
    return `命中栏目关键词：${matches.slice(0, 3).join("、")}。`;
  }
  return "来源与内容均满足栏目过滤规则。";
}

function filterByPolicy(item) {
  if (!item.allowed_categories?.includes(item.category)) {
    return false;
  }
  if (["finance", "world", "society"].includes(item.category) && item.source_tier !== "mainstream") {
    return false;
  }
  if (item.category === "technology") {
    const text = buildItemText(item);
    const financeHits = keywordMatches(text, classifierKeywords.finance).length;
    const aiHits = keywordMatches(text, classifierKeywords.ai).length;
    if (!hasStrongTechnologySignal(item)) {
      return false;
    }
    if (item.source_tier === "mainstream" && hasTechnologyPolicyNegative(item) && aiHits < 2) {
      return false;
    }
    if (financeHits > 0 && getStrongTechnologySignalCount(item) < 2 && aiHits === 0) {
      return false;
    }
    if (hasTechnologyPolicyNegative(item) && getStrongTechnologySignalCount(item) < 2 && aiHits === 0) {
      return false;
    }
  }
  const threshold = CATEGORY_BASE_THRESHOLD[item.category] ?? 75;
  return item.confidence_score >= threshold;
}

function fillNewsHighlights(item) {
  return {
    ...item,
    highlights_zh: [
      `核心主题：${item.title_display.slice(0, 90)}`,
      `信息来源：${item.source_name}（${new Date(item.published_at).toLocaleDateString("zh-CN")}）`,
      `入选说明：${item.selection_reason}`
    ]
  };
}

function fillPaperHighlights(item) {
  const summarySentences = sentenceSplit(item.summary_display ?? item.summary_zh).slice(0, 2);
  return {
    ...item,
    category: "paper",
    highlights_zh: [
      `研究主题：${item.title_display.slice(0, 90)}`,
      `关键内容：${summarySentences[0] ?? "文中给出方法与实验结论。"}`,
      "阅读建议：优先关注方法创新点、实验设置与可复现性。"
    ]
  };
}

function ensureTargets(groupedNews) {
  const normalized = {};
  for (const category of Object.keys(CATEGORY_TARGETS)) {
    normalized[category] = (groupedNews[category] ?? []).slice(0, CATEGORY_TARGETS[category]);
  }
  return normalized;
}

async function loadIndex() {
  try {
    const text = await fs.readFile(INDEX_FILE, "utf8");
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return { version: "1.0", updated_at: null, dates: [] };
  }
}

function buildCoverageStatus(news, papers) {
  const categoryCoverage = {};
  let completeCategories = 0;
  const categoryIds = Object.keys(CATEGORY_TARGETS);

  for (const id of categoryIds) {
    const available = (news[id] ?? []).length;
    const target = CATEGORY_TARGETS[id];
    const ratio = target > 0 ? Number((available / target).toFixed(2)) : 1;
    const status = available >= target ? "full" : available >= Math.ceil(target * 0.6) ? "partial" : "low";
    if (status === "full") {
      completeCategories += 1;
    }
    categoryCoverage[id] = { available, target, ratio, status };
  }

  const paperAvailable = papers.length;
  const paperStatus = paperAvailable >= PAPER_TARGET_MIN ? "healthy" : paperAvailable > 0 ? "limited" : "empty";

  return {
    overall_status: completeCategories >= 3 && paperStatus !== "empty" ? "healthy" : "degraded",
    category_coverage: categoryCoverage,
    papers: {
      available: paperAvailable,
      min_target: PAPER_TARGET_MIN,
      max_target: PAPER_TARGET_MAX,
      status: paperStatus
    }
  };
}

function buildDailyStats(news, papers, sourceFailures) {
  const newsCounts = {};
  let totalNews = 0;
  for (const [category, entries] of Object.entries(news)) {
    newsCounts[category] = entries.length;
    totalNews += entries.length;
  }
  return {
    news_total: totalNews,
    paper_total: papers.length,
    news_counts: newsCounts,
    source_failure_count: sourceFailures.length
  };
}

function countWeakSummary(items) {
  return items.filter((item) => item.quality_flags?.includes("weak_summary")).length;
}

function countMediumConfidence(items) {
  return items.filter((item) => item.confidence_level === "medium").length;
}

function countFlag(items, flag) {
  return items.filter((item) => item.quality_flags?.includes(flag)).length;
}

function summarizeItemsQuality(items) {
  return {
    item_count: items.length,
    medium_confidence_count: countMediumConfidence(items),
    weak_summary_count: countWeakSummary(items),
    borderline_count: countFlag(items, "borderline"),
    duplicate_cluster_count: countFlag(items, "duplicate_cluster"),
    supplemental_count: countFlag(items, "supplemental_source") + countFlag(items, "ai_supplemental")
  };
}

function buildQualitySummary(news, papers) {
  const allNewsItems = Object.values(news).flat();
  const allItems = [...allNewsItems, ...papers];
  const category_quality = Object.fromEntries(
    Object.entries(news).map(([category, items]) => [category, summarizeItemsQuality(items)])
  );
  const paper_quality = summarizeItemsQuality(papers);
  const boundary_item_count = countMediumConfidence(allItems);
  const weak_summary_count = countWeakSummary(allItems);
  return {
    boundary_item_count,
    weak_summary_count,
    medium_confidence_count: boundary_item_count,
    category_quality,
    paper_quality
  };
}

async function fetchXmlWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml" },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFeed(source, targetType = "news", quality = { sourceFailures: [] }) {
  try {
    const xml = await fetchXmlWithTimeout(source.url);
    const feed = await parser.parseString(xml);
    return (feed.items ?? [])
      .filter((entry) => entry?.title && entry?.link)
      .map((entry) => {
        const titleEn = compactWhitespace(entry.title);
        const sourceUrl = normalizeUrl(entry.link);
        const publishedAt = toISODate(entry.isoDate ?? entry.pubDate ?? feed.lastBuildDate);
        const rawSnippet = entry.contentSnippet ?? entry.contentEncoded ?? entry.content ?? "";
        const extractive = buildExtractiveSummary(rawSnippet, titleEn);
        const tags = (entry.categories ?? []).slice(0, 6).map((tag) => compactWhitespace(String(tag)));

        return {
          id: `${targetType}-${hashId(`${source.name}-${sourceUrl || titleEn}`)}`,
          type: targetType,
          source_name: source.name,
          source_url: sourceUrl,
          source_tier: source.tier,
          source_group: source.group,
          allowed_categories: source.allowed_categories ?? [],
          published_at: publishedAt,
          title_en: titleEn,
          title_zh: titleEn,
          title_display: titleEn,
          summary_zh: extractive.summary,
          summary_display: extractive.summary,
          tags,
          score: 0,
          category: targetType === "paper" ? "paper" : "society",
          confidence_score: 0,
          confidence_level: "low",
          selection_reason: "",
          highlights_zh: [],
          quality_flags: extractive.weak ? ["weak_summary"] : []
        };
      })
      .filter((item) => item.source_url);
  } catch (error) {
    quality.sourceFailures.push({
      source: source.name,
      category: targetType,
      reason: error.message
    });
    console.warn(`[warn] source failed: ${source.name} -> ${error.message}`);
    return [];
  }
}

function classifyNewsItems(items) {
  const reclassified = [];
  for (const item of items) {
    const guessed = pickCategory(item);
    const confidence = mapConfidence(guessed.score);
    const decorated = {
      ...item,
      category: guessed.category,
      score: Number((guessed.score + (item.source_tier === "mainstream" ? 50 : 46)).toFixed(2)),
      ...confidence
    };
    decorated.selection_reason = buildSelectionReason(decorated);
    if (confidence.confidence_level !== "high") {
      decorated.quality_flags = [...new Set([...(decorated.quality_flags ?? []), "borderline"])];
    }
    if (filterByPolicy(decorated)) {
      reclassified.push(decorated);
    }
  }
  return reclassified;
}

function selectNewsByCategory(items) {
  const buckets = Object.fromEntries(CLASSIFIER_TARGETS.map((category) => [category, []]));
  for (const item of items) {
    if (buckets[item.category]) {
      buckets[item.category].push(item);
    }
  }

  const selected = {};
  for (const category of CLASSIFIER_TARGETS) {
    const picked = dedupeBySimilarity(
      dedupeByUrl(buckets[category]).sort(
        (a, b) => b.confidence_score - a.confidence_score || b.score - a.score || b.published_at.localeCompare(a.published_at)
      )
    )
      .map(fillNewsHighlights)
      .slice(0, CATEGORY_TARGETS[category]);
    selected[category] = picked;
  }
  return selected;
}

function clampHours(rawIso, maxHours) {
  const age = (Date.now() - new Date(rawIso).getTime()) / (1000 * 60 * 60);
  return age <= maxHours;
}

async function main() {
  const hardStop = setTimeout(() => {
    console.error(`[fatal] job timeout (${JOB_TIMEOUT_MS}ms)`);
    process.exit(1);
  }, JOB_TIMEOUT_MS);
  hardStop.unref();

  const quality = {
    sourceFailures: [],
    generatedBy: "pipeline-v2.0-tiered-quality",
    quality_version: "2.0"
  };

  const date = nowInChinaDate();
  await fs.mkdir(DAILY_DIR, { recursive: true });

  const rawNews = (
    await Promise.all(NEWS_SOURCES.map((source) => fetchFeed(source, "news", quality)))
  )
    .flat()
    .filter((item) => clampHours(item.published_at, 72));
  const classifiedNews = classifyNewsItems(rawNews);

  const aiMissingBase = Math.max(0, CATEGORY_TARGETS.ai - classifiedNews.filter((item) => item.category === "ai").length);
  let supplementalNews = [];
  if (aiMissingBase > 0) {
    supplementalNews = (
      await Promise.all(AI_SUPPLEMENTAL_SOURCES.map((source) => fetchFeed(source, "news", quality)))
    )
      .flat()
      .filter((item) => clampHours(item.published_at, 120))
      .map((item) => ({ ...item, quality_flags: [...new Set([...(item.quality_flags ?? []), "supplemental_source"])] }));
  }

  const selectedNews = ensureTargets(selectNewsByCategory([...classifiedNews, ...classifyNewsItems(supplementalNews)]));

  const paperCandidates = (
    await Promise.all(PAPER_SOURCES.map((source) => fetchFeed(source, "paper", quality)))
  )
    .flat()
    .filter((item) => clampHours(item.published_at, 168))
    .map((item) => ({
      ...item,
      category: "paper",
      selection_reason: "来自中文技术资讯源，按时效与可读性入选。",
      confidence_score: 86,
      confidence_level: "high",
      source_tier: item.source_tier ?? "tech_media",
      score: Number((72 + calculateFreshnessScore(item.published_at)).toFixed(2))
    }));

  const selectedPapers = dedupeBySimilarity(dedupeByUrl(paperCandidates))
    .map(fillPaperHighlights)
    .sort((a, b) => b.score - a.score || b.published_at.localeCompare(a.published_at))
    .slice(0, PAPER_TARGET_MAX);

  const coverage = buildCoverageStatus(selectedNews, selectedPapers);
  const qualitySummary = buildQualitySummary(selectedNews, selectedPapers);
  const stats = buildDailyStats(selectedNews, selectedPapers, quality.sourceFailures);

  const report = {
    version: "1.0",
    date,
    generated_at: new Date().toISOString(),
    constraints: {
      category_targets: CATEGORY_TARGETS,
      paper_target_min: PAPER_TARGET_MIN,
      paper_target_max: PAPER_TARGET_MAX
    },
    categories: Object.keys(CATEGORY_TARGETS).map((id) => ({
      id,
      label: CATEGORY_LABELS[id],
      target: CATEGORY_TARGETS[id],
      available: selectedNews[id].length
    })),
    news: selectedNews,
    papers: selectedPapers,
    coverage,
    quality: {
      ...quality,
      ...qualitySummary,
      sourceFailures: quality.sourceFailures
    },
    stats
  };

  const dailyFile = path.join(DAILY_DIR, `${date}.json`);
  await fs.writeFile(dailyFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const currentIndex = await loadIndex();
  const nextDates = (currentIndex.dates ?? []).filter((entry) => entry.date !== date);
  nextDates.push({
    date,
    path: `daily/${date}.json`,
    ...stats,
    coverage_status: coverage.overall_status,
    source_failure_count: quality.sourceFailures.length,
    boundary_item_count: qualitySummary.boundary_item_count,
    medium_confidence_count: qualitySummary.medium_confidence_count,
    weak_summary_count: qualitySummary.weak_summary_count,
    paper_medium_confidence_count: qualitySummary.paper_quality.medium_confidence_count,
    paper_weak_summary_count: qualitySummary.paper_quality.weak_summary_count
  });
  nextDates.sort((a, b) => b.date.localeCompare(a.date));

  const indexPayload = {
    version: "1.0",
    updated_at: new Date().toISOString(),
    dates: nextDates
  };
  await fs.writeFile(INDEX_FILE, `${JSON.stringify(indexPayload, null, 2)}\n`, "utf8");

  const categorySummary = Object.entries(stats.news_counts)
    .map(([category, count]) => `${category}:${count}`)
    .join(", ");

  clearTimeout(hardStop);
  console.log(
    `[done] ${date} generated. news(${categorySummary}), papers:${stats.paper_total}, coverage:${coverage.overall_status}, source_failures:${quality.sourceFailures.length}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
