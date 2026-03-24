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
  PAPER_TARGET_MIN
} from "./config/sources.mjs";

const DATA_DIR = path.join(process.cwd(), "data");
const DAILY_DIR = path.join(DATA_DIR, "daily");
const INDEX_FILE = path.join(DATA_DIR, "index.json");

const SOURCE_TIMEOUT_MS = Number(process.env.DAILYPULSE_SOURCE_TIMEOUT_MS ?? 15000);
const JOB_TIMEOUT_MS = Number(process.env.DAILYPULSE_JOB_TIMEOUT_MS ?? 180000);
const UA = "DailyPulseBot/1.0 (+https://github.com)";

const parser = new Parser({
  customFields: {
    item: [["content:encoded", "contentEncoded"]]
  }
});

const zhLexicon = new Map([
  ["ai", "人工智能"],
  ["artificial intelligence", "人工智能"],
  ["model", "模型"],
  ["models", "模型"],
  ["research", "研究"],
  ["paper", "论文"],
  ["finance", "金融"],
  ["market", "市场"],
  ["global", "全球"],
  ["open source", "开源"],
  ["startup", "创业公司"],
  ["policy", "政策"],
  ["cloud", "云计算"],
  ["chip", "芯片"],
  ["chips", "芯片"],
  ["earnings", "财报"],
  ["economy", "经济"],
  ["security", "安全"],
  ["agent", "智能体"],
  ["robot", "机器人"]
]);

const categoryKeywords = {
  technology: ["chip", "software", "platform", "cloud", "developer"],
  finance: ["market", "stock", "fed", "economy", "earnings", "bank"],
  world: ["global", "country", "election", "war", "trade", "policy"],
  ai: ["ai", "model", "llm", "agent", "inference", "training", "paper"],
  society: ["health", "education", "city", "public", "crime", "law"]
};

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

function escapeRegExp(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lexicalTranslate(text) {
  const source = compactWhitespace(text);
  if (!source) {
    return "";
  }
  if (looksChinese(source)) {
    return source;
  }

  let translated = source;
  for (const [en, zh] of zhLexicon.entries()) {
    const escaped = escapeRegExp(en);
    const pattern = /[a-z]/i.test(en)
      ? new RegExp(`\\b${escaped}\\b`, "ig")
      : new RegExp(escaped, "ig");
    translated = translated.replace(pattern, zh);
  }
  if (translated === source) {
    return `今日快讯：${source}`;
  }
  return translated;
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

function categoryBonus(title, category) {
  const lowered = (title ?? "").toLowerCase();
  return (categoryKeywords[category] ?? []).reduce((score, keyword) => {
    return lowered.includes(keyword) ? score + 6 : score;
  }, 0);
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
    const duplicate = kept.some((candidate) => jaccardSimilarity(candidate.title_en, item.title_en) > 0.9);
    if (!duplicate) {
      kept.push(item);
    }
  }
  return kept;
}

function buildSummary(snippet, fallbackTitle) {
  const plain = stripHtml(snippet);
  if (!plain) {
    return `这条内容聚焦于 ${lexicalTranslate(fallbackTitle)}，建议查看原文获取完整信息。`;
  }
  const lines = sentenceSplit(plain).slice(0, 2);
  return lexicalTranslate(lines.join(" ")).slice(0, 220);
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
    `核心主题：${lexicalTranslate(item.title_en).slice(0, 80)}`,
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

async function fetchFeed(source, fallbackCategory = null, targetType = "news") {
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
        const category = fallbackCategory ?? "paper";
        const sourceWeight = source.weight ?? 1;
        const score =
          sourceWeight * 45 + calculateFreshnessScore(publishedAt) + categoryBonus(titleEn, category);

        return {
          id: `${targetType}-${hashId(`${source.name}-${sourceUrl || titleEn}`)}`,
          type: targetType,
          category,
          title_en: titleEn,
          title_zh: lexicalTranslate(titleEn),
          summary_zh: buildSummary(summaryRaw, titleEn),
          highlights_zh: [],
          source_name: source.name,
          source_url: sourceUrl,
          published_at: publishedAt,
          score: Math.round(score * 100) / 100,
          tags: (entry.categories ?? []).slice(0, 6).map((tag) => compactWhitespace(String(tag)))
        };
      })
      .filter((item) => item.source_url);
  } catch (error) {
    console.warn(`[warn] source failed: ${source.name} -> ${error.message}`);
    return [];
  }
}

function fillNewsHighlights(item) {
  return { ...item, highlights_zh: buildHighlights(item) };
}

function fillPaperHighlights(item) {
  const summarySentences = sentenceSplit(item.summary_zh).slice(0, 2);
  return {
    ...item,
    category: "paper",
    highlights_zh: [
      `研究主题：${lexicalTranslate(item.title_en).slice(0, 90)}`,
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

function buildDailyStats(news, papers) {
  const newsCounts = {};
  let totalNews = 0;
  for (const [category, entries] of Object.entries(news)) {
    newsCounts[category] = entries.length;
    totalNews += entries.length;
  }
  return {
    news_total: totalNews,
    paper_total: papers.length,
    news_counts: newsCounts
  };
}

async function main() {
  const hardStop = setTimeout(() => {
    console.error(`[fatal] job timeout (${JOB_TIMEOUT_MS}ms)`);
    process.exit(1);
  }, JOB_TIMEOUT_MS);
  hardStop.unref();

  const date = nowInChinaDate();
  await fs.mkdir(DAILY_DIR, { recursive: true });

  const newsResults = await Promise.all(
    NEWS_SOURCES.map((source) => fetchFeed(source, source.category, "news"))
  );

  const newsBuckets = {};
  for (let i = 0; i < NEWS_SOURCES.length; i += 1) {
    const source = NEWS_SOURCES[i];
    const fresh = newsResults[i].filter((item) => clampHours(item.published_at, 72));
    if (!newsBuckets[source.category]) {
      newsBuckets[source.category] = [];
    }
    newsBuckets[source.category].push(...fresh);
  }

  const selectedNews = {};
  for (const category of Object.keys(CATEGORY_TARGETS)) {
    const deduped = dedupeItems(newsBuckets[category] ?? [])
      .map(fillNewsHighlights)
      .sort((a, b) => b.score - a.score || b.published_at.localeCompare(a.published_at));
    selectedNews[category] = deduped.slice(0, CATEGORY_TARGETS[category]);
  }

  const paperResults = await Promise.all(PAPER_SOURCES.map((source) => fetchFeed(source, "paper", "paper")));
  const paperCandidates = paperResults
    .flat()
    .filter((item) => clampHours(item.published_at, 168));

  const papers = dedupeItems(paperCandidates)
    .map(fillPaperHighlights)
    .sort((a, b) => b.score - a.score || b.published_at.localeCompare(a.published_at))
    .slice(0, PAPER_TARGET_MAX);

  const selectedPapers = papers.length < PAPER_TARGET_MIN ? papers : papers.slice(0, PAPER_TARGET_MAX);
  const normalizedNews = ensureTargets(selectedNews);
  const stats = buildDailyStats(normalizedNews, selectedPapers);

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
    stats
  };

  const dailyFile = path.join(DAILY_DIR, `${date}.json`);
  await fs.writeFile(dailyFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const currentIndex = await loadIndex();
  const nextDates = (currentIndex.dates ?? []).filter((entry) => entry.date !== date);
  nextDates.push({ date, path: `daily/${date}.json`, ...stats });
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
  console.log(`[done] ${date} generated. news(${categorySummary}), papers:${stats.paper_total}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
