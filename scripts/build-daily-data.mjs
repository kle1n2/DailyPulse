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
const UA = "DailyPulseBot/1.3 (+https://github.com)";

const parser = new Parser({
  customFields: {
    item: [["content:encoded", "contentEncoded"]]
  }
});

const categoryKeywords = {
  technology: ["芯片", "半导体", "软件", "系统", "平台", "开发", "开源", "机器人", "智算", "数字化", "云计算", "算力", "终端", "硬件", "传感", "火箭", "卫星", "MAUI", ".NET", "技术实践", "科技公司", "人形机器人"],
  finance: ["银行", "金融", "股", "IPO", "融资", "基金", "证券", "债", "财报", "营收", "利润", "外贸", "贷款", "投资", "资本", "保险", "港股", "A股", "证监会", "经济", "收评", "收跌", "收涨", "净利润", "停牌"],
  world: ["美国", "伊朗", "日本", "乌克兰", "俄罗斯", "中东", "国际", "外交", "总统", "冲突", "制裁", "盟友", "联合国", "以色列", "欧洲", "增兵", "战火", "停火"],
  ai: ["AI", "人工智能", "大模型", "模型", "智能体", "OpenAI", "机器学习", "推理", "训练", "AIGC", "多模态", "LLM", "AGI", "生成式", "Prompt"],
  society: ["教育", "交通", "天气", "环保", "民生", "春假", "铁路", "应急", "治安", "乡村", "医疗", "高考", "节假日", "文旅", "城市管理", "买房", "定金", "开发商", "暴雨", "交通管制"]
};

const categoryNegativeKeywords = {
  technology: ["收跌", "收涨", "收评", "港股", "A股", "IPO", "净利润", "停牌", "证监会", "买房", "定金", "开发商", "外贸", "银行", "贷款"],
  finance: ["暴雨", "春假", "高考", "铁路检修", "交通管制"],
  world: ["A股", "港股", "净利润"],
  ai: ["买房", "定金", "开发商"],
  society: ["IPO", "净利润", "证监会"]
};

const broadSources = new Set(["36氪", "中新网财经", "中新网国际", "中新网社会"]);

function nowInChinaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function compactWhitespace(text) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function stripHtml(text) {
  return compactWhitespace((text ?? "").replace(/<[^>]*>/g, " "));
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

function looksChinese(text) {
  return /[\u3400-\u9fff]/.test(text ?? "");
}

function looksMixedLanguage(text) {
  return looksChinese(text) && /[A-Za-z]{4,}/.test(text ?? "");
}

function sentenceSplit(text) {
  return compactWhitespace(text).split(/(?<=[.!?。！？])\s+/).filter(Boolean);
}

function toISODate(raw) {
  const parsed = new Date(raw ?? "");
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

function calculateFreshnessScore(publishedAt) {
  const hours = Math.max(0, (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60));
  return Math.max(0, 40 - hours * 1.25);
}

function keywordScore(title, keywords = [], weight = 8) {
  const lowered = (title ?? "").toLowerCase();
  return keywords.reduce((score, keyword) => score + (lowered.includes(keyword.toLowerCase()) ? weight : 0), 0);
}

function categoryBonus(title, category) {
  return keywordScore(title, categoryKeywords[category], 8) - keywordScore(title, categoryNegativeKeywords[category], 7);
}

function inferCategory(title, fallbackCategory, sourceName) {
  const scores = Object.keys(categoryKeywords).map((category) => ({
    category,
    score: categoryBonus(title, category)
  }));

  if (!broadSources.has(sourceName) && fallbackCategory) {
    const hit = scores.find((entry) => entry.category === fallbackCategory);
    if (hit) {
      hit.score += 4;
    }
  }

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  const financeScore = scores.find((entry) => entry.category === "finance")?.score ?? 0;
  const societyScore = scores.find((entry) => entry.category === "society")?.score ?? 0;

  if (!best) {
    return fallbackCategory;
  }

  if (best.category === "technology" && best.score < 8) {
    if (financeScore >= societyScore && financeScore > 0) {
      return "finance";
    }
    if (societyScore > 0) {
      return "society";
    }
    return fallbackCategory;
  }

  if (best.score <= 0) {
    return fallbackCategory;
  }

  return best.category;
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

function dedupeItems(items) {
  const byUrl = new Map();
  for (const item of items) {
    if (!byUrl.has(item.source_url)) {
      byUrl.set(item.source_url, item);
    }
  }

  const kept = [];
  for (const item of byUrl.values()) {
    const duplicate = kept.some((candidate) => {
      if (candidate.source_name === item.source_name && jaccardSimilarity(candidate.title_en, item.title_en) > 0.82) {
        return true;
      }
      return jaccardSimilarity(candidate.title_en, item.title_en) > 0.9;
    });
    if (!duplicate) {
      kept.push(item);
    }
  }
  return kept;
}

function selectDisplayTitle(titleEn) {
  const normalized = compactWhitespace(titleEn);
  return normalized || "Untitled";
}

function buildChineseDigest(snippet, fallbackTitle) {
  const plain = stripHtml(snippet);
  const pieces = sentenceSplit(plain).slice(0, 2).join(" ");
  const subject = compactWhitespace(fallbackTitle) || "该条目";
  if (!pieces) {
    return `该条目来自 ${subject}，建议阅读原文了解完整背景。`;
  }
  return `该条目围绕“${subject}”展开，原文要点如下：${pieces.slice(0, 170)}`;
}

function selectTitleZh(titleEn, candidateZh) {
  const normalizedZh = compactWhitespace(candidateZh);
  if (!normalizedZh || looksMixedLanguage(normalizedZh)) {
    return compactWhitespace(titleEn);
  }
  return normalizedZh;
}

function selectSummaryZh(summaryRaw, titleEn, fallbackZh) {
  const normalized = compactWhitespace(fallbackZh);
  if (normalized && !looksMixedLanguage(normalized)) {
    return normalized.slice(0, 220);
  }
  return buildChineseDigest(summaryRaw, titleEn).slice(0, 220);
}

function inferImpact(category) {
  switch (category) {
    case "technology":
      return "可能影响技术产品路线与开发者生态。";
    case "finance":
      return "可能影响资本市场预期与资产定价。";
    case "world":
      return "可能影响国际政策与区域协作。";
    case "ai":
      return "可能影响模型能力演进与落地节奏。";
    default:
      return "可能影响公共议题关注度与社会讨论。";
  }
}

function buildHighlights(item) {
  return [
    `核心主题：${item.title_display.slice(0, 90)}`,
    `信息来源：${item.source_name}（${new Date(item.published_at).toLocaleDateString("zh-CN")}）`,
    inferImpact(item.category)
  ];
}

function clampHours(rawIso, maxHours) {
  const age = (Date.now() - new Date(rawIso).getTime()) / (1000 * 60 * 60);
  return age <= maxHours;
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

async function fetchFeed(source, fallbackCategory = null, targetType = "news", quality = { sourceFailures: [] }) {
  try {
    const xml = await fetchXmlWithTimeout(source.url);
    const feed = await parser.parseString(xml);
    return (feed.items ?? [])
      .filter((entry) => entry?.title && entry?.link)
      .map((entry) => {
        const titleEn = compactWhitespace(entry.title);
        const sourceUrl = normalizeUrl(entry.link);
        const publishedAt = toISODate(entry.isoDate ?? entry.pubDate ?? feed.lastBuildDate);
        const summaryRaw = entry.contentSnippet ?? entry.contentEncoded ?? entry.content ?? "";
        const category = targetType === "news" ? inferCategory(titleEn, fallbackCategory ?? "society", source.name) : (fallbackCategory ?? "paper");
        const sourceWeight = source.weight ?? 1;
        const score = sourceWeight * 45 + calculateFreshnessScore(publishedAt) + categoryBonus(titleEn, category);
        const titleDisplay = selectDisplayTitle(titleEn);
        const titleZh = selectTitleZh(titleEn, titleEn);
        const summaryZh = selectSummaryZh(summaryRaw, titleEn, "");

        return {
          id: `${targetType}-${hashId(`${source.name}-${sourceUrl || titleEn}`)}`,
          type: targetType,
          category,
          title_en: titleEn,
          title_zh: titleZh,
          title_display: titleDisplay,
          summary_zh: summaryZh,
          summary_display: summaryZh,
          highlights_zh: [],
          source_name: source.name,
          source_url: sourceUrl,
          published_at: publishedAt,
          score: Math.round(score * 100) / 100,
          tags: (entry.categories ?? []).slice(0, 6).map((tag) => compactWhitespace(String(tag))),
          quality_flags: []
        };
      })
      .filter((item) => item.source_url);
  } catch (error) {
    quality.sourceFailures.push({
      source: source.name,
      category: fallbackCategory ?? targetType,
      reason: error.message
    });
    console.warn(`[warn] source failed: ${source.name} -> ${error.message}`);
    return [];
  }
}

function fillNewsHighlights(item) {
  return { ...item, highlights_zh: buildHighlights(item) };
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
    return JSON.parse(text);
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
  const paperStatus =
    paperAvailable >= PAPER_TARGET_MIN ? "healthy" : paperAvailable > 0 ? "limited" : "empty";

  return {
    overall_status: completeCategories === categoryIds.length && paperStatus === "healthy" ? "healthy" : "degraded",
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

async function main() {
  const hardStop = setTimeout(() => {
    console.error(`[fatal] job timeout (${JOB_TIMEOUT_MS}ms)`);
    process.exit(1);
  }, JOB_TIMEOUT_MS);
  hardStop.unref();

  const quality = {
    sourceFailures: [],
    generatedBy: "pipeline-v1.3-readable-first-reclassified"
  };

  const date = nowInChinaDate();
  await fs.mkdir(DAILY_DIR, { recursive: true });

  const newsResults = await Promise.all(
    NEWS_SOURCES.map((source) => fetchFeed(source, source.category, "news", quality))
  );

  const newsBuckets = {};
  for (const category of Object.keys(CATEGORY_TARGETS)) {
    newsBuckets[category] = [];
  }

  for (const items of newsResults) {
    for (const item of items.filter((entry) => clampHours(entry.published_at, 72))) {
      if (!newsBuckets[item.category]) {
        newsBuckets[item.category] = [];
      }
      newsBuckets[item.category].push(item);
    }
  }

  const selectedNews = {};
  for (const category of Object.keys(CATEGORY_TARGETS)) {
    const deduped = dedupeItems(newsBuckets[category] ?? [])
      .map(fillNewsHighlights)
      .sort((a, b) => b.score - a.score || b.published_at.localeCompare(a.published_at));
    selectedNews[category] = deduped.slice(0, CATEGORY_TARGETS[category]);
  }

  const aiMissing = Math.max(0, CATEGORY_TARGETS.ai - (selectedNews.ai?.length ?? 0));
  if (aiMissing > 0 && AI_SUPPLEMENTAL_SOURCES.length > 0) {
    const supplemental = await Promise.all(
      AI_SUPPLEMENTAL_SOURCES.map((source) => fetchFeed(source, "ai", "news", quality))
    );
    const candidates = dedupeItems(supplemental.flat())
      .filter((item) => clampHours(item.published_at, 120) && item.category === "ai")
      .map((item) => ({ ...fillNewsHighlights(item), quality_flags: [...(item.quality_flags ?? []), "ai_supplemental"] }))
      .sort((a, b) => b.score - a.score || b.published_at.localeCompare(a.published_at));

    const existingIds = new Set((selectedNews.ai ?? []).map((item) => item.id));
    for (const item of candidates) {
      if (!existingIds.has(item.id)) {
        selectedNews.ai.push(item);
        existingIds.add(item.id);
      }
      if (selectedNews.ai.length >= CATEGORY_TARGETS.ai) {
        break;
      }
    }
  }

  const paperResults = await Promise.all(PAPER_SOURCES.map((source) => fetchFeed(source, "paper", "paper", quality)));
  const paperCandidates = paperResults.flat().filter((item) => clampHours(item.published_at, 168));

  const papers = dedupeItems(paperCandidates)
    .map(fillPaperHighlights)
    .sort((a, b) => b.score - a.score || b.published_at.localeCompare(a.published_at))
    .slice(0, PAPER_TARGET_MAX);

  const selectedPapers = papers.length < PAPER_TARGET_MIN ? papers : papers.slice(0, PAPER_TARGET_MAX);
  const normalizedNews = ensureTargets(selectedNews);
  const coverage = buildCoverageStatus(normalizedNews, selectedPapers);
  const stats = buildDailyStats(normalizedNews, selectedPapers, quality.sourceFailures);

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
      available: normalizedNews[id].length
    })),
    news: normalizedNews,
    papers: selectedPapers,
    coverage,
    quality: {
      ...quality,
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
    source_failure_count: quality.sourceFailures.length
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
