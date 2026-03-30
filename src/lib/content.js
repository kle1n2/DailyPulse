import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const DAILY_DIR = path.join(DATA_DIR, "daily");

async function readJson(filePath, fallback = null) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content.replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function sortByDateDesc(items) {
  return [...items].sort((a, b) => b.date.localeCompare(a.date));
}

function compactText(text) {
  return String(text ?? "").trim();
}

function looksMixedText(text) {
  return /[\u3400-\u9fff]/.test(text) && /[A-Za-z]{4,}/.test(text);
}

export async function loadIndex() {
  return readJson(path.join(DATA_DIR, "index.json"), { version: "1.0", dates: [] });
}

export async function loadDailyReport(date) {
  return readJson(path.join(DAILY_DIR, `${date}.json`), null);
}

export async function loadAllDailyReports() {
  try {
    const entries = await fs.readdir(DAILY_DIR, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name.replace(".json", ""));

    const reports = (await Promise.all(files.map((date) => loadDailyReport(date)))).filter(Boolean);

    return sortByDateDesc(reports);
  } catch {
    return [];
  }
}

export async function getLatestReport() {
  const reports = await loadAllDailyReports();
  return reports[0] ?? null;
}

function collectNews(report) {
  if (!report?.news) {
    return [];
  }
  return Object.values(report.news).flat();
}

export async function getAllItems() {
  const reports = await loadAllDailyReports();
  const items = [];
  for (const report of reports) {
    const newsItems = collectNews(report);
    const paperItems = report.papers ?? [];
    for (const item of [...newsItems, ...paperItems]) {
      items.push({
        ...item,
        report_date: report.date
      });
    }
  }
  return items;
}

export async function getItemById(id) {
  const items = await getAllItems();
  return items.find((item) => item.id === id) ?? null;
}

export const CATEGORY_ORDER = ["technology", "finance", "world", "ai", "society"];

export const CATEGORY_LABELS = {
  technology: "技术前沿",
  finance: "产业财经",
  world: "国际要闻",
  ai: "AI",
  society: "社会热点"
};

const CATEGORY_HEADLINES = {
  technology: "技术前沿",
  finance: "产业财经",
  world: "国际要闻",
  ai: "AI 焦点",
  society: "社会热点"
};

const CATEGORY_FALLBACK_LABELS = {
  technology: "科技",
  finance: "财经",
  world: "国际",
  ai: "AI",
  society: "社会热点"
};

const SOURCE_TIER_LABELS = {
  mainstream: "主流媒体",
  tech_media: "科技媒体"
};

const CONFIDENCE_LEVEL_LABELS = {
  high: "高置信",
  medium: "中置信",
  low: "低置信"
};

const QUALITY_FLAG_LABELS = {
  borderline: "边界分类",
  weak_summary: "摘要较弱",
  duplicate_cluster: "重复聚类",
  supplemental_source: "补充来源",
  ai_supplemental: "AI补充",
  mixed_topic: "主题混杂",
  source_mismatch: "来源不完全匹配"
};

export function getCategoryLabel(categoryId) {
  return CATEGORY_LABELS[categoryId] ?? CATEGORY_FALLBACK_LABELS[categoryId] ?? categoryId ?? "未分类";
}

export function getCategoryHeadline(categoryId) {
  return CATEGORY_HEADLINES[categoryId] ?? getCategoryLabel(categoryId);
}

export function getLegacyCategoryLabel(categoryId) {
  return CATEGORY_FALLBACK_LABELS[categoryId] ?? getCategoryLabel(categoryId);
}

export function getSourceTier(item) {
  return compactText(item?.source_tier) || "mainstream";
}

export function getSourceTierLabel(item) {
  return SOURCE_TIER_LABELS[getSourceTier(item)] ?? "来源";
}

export function getConfidenceScore(item) {
  const value = Number(item?.confidence_score ?? item?.score ?? 0);
  return Number.isFinite(value) ? Math.round(value) : 0;
}

export function getConfidenceLevel(item) {
  const explicit = compactText(item?.confidence_level).toLowerCase();
  if (explicit && CONFIDENCE_LEVEL_LABELS[explicit]) {
    return explicit;
  }

  const score = getConfidenceScore(item);
  if (score >= 85) return "high";
  if (score >= 70) return "medium";
  return "low";
}

export function getConfidenceLabel(item) {
  return CONFIDENCE_LEVEL_LABELS[getConfidenceLevel(item)] ?? "待评估";
}

export function getQualityFlags(item) {
  return Array.isArray(item?.quality_flags) ? item.quality_flags.filter(Boolean) : [];
}

export function getQualityFlagLabel(flag) {
  return QUALITY_FLAG_LABELS[flag] ?? flag ?? "质量提示";
}

export function getSelectionReason(item) {
  const reason = compactText(item?.selection_reason);
  if (reason) {
    return reason;
  }

  const confidence = getConfidenceLabel(item);
  return `${confidence}，按来源和主题相关性入选。`;
}

export function getCoverageStatusLabel(status) {
  const normalized = compactText(status).toLowerCase();
  if (normalized === "healthy" || normalized === "full") return "完整";
  if (normalized === "partial" || normalized === "limited") return "部分完成";
  if (normalized === "low" || normalized === "degraded") return "严格筛选后不足";
  if (normalized === "empty") return "暂无内容";
  return "待评估";
}

export function countItemsWithQualityFlag(items = [], flag) {
  return items.filter((item) => getQualityFlags(item).includes(flag)).length;
}

export function countMediumConfidenceItems(items = []) {
  return items.filter((item) => getConfidenceLevel(item) === "medium").length;
}

export function summarizeReportQuality(report) {
  const newsItems = collectNews(report);
  const paperItems = report?.papers ?? [];
  const allItems = [...newsItems, ...paperItems];

  return {
    mediumCount: countMediumConfidenceItems(allItems),
    weakSummaryCount: countItemsWithQualityFlag(allItems, "weak_summary"),
    borderlineCount: countItemsWithQualityFlag(allItems, "borderline"),
    sourceFailureCount:
      Number(report?.stats?.source_failure_count ?? report?.quality?.sourceFailures?.length ?? 0) || 0
  };
}

export function getDisplayTitle(item) {
  const display = compactText(item?.title_display);
  const titleZh = compactText(item?.title_zh);
  const titleEn = compactText(item?.title_en);

  if (display) {
    return display;
  }
  if (titleZh && !looksMixedText(titleZh)) {
    return titleZh;
  }
  if (titleEn) {
    return titleEn;
  }
  return titleZh || "Untitled";
}

export function getDisplaySummary(item) {
  const summaryDisplay = compactText(item?.summary_display);
  const summaryZh = compactText(item?.summary_zh);
  return summaryDisplay || summaryZh || "暂无摘要。";
}
