import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const DAILY_DIR = path.join(DATA_DIR, "daily");

async function readJson(filePath, fallback = null) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

function sortByDateDesc(items) {
  return [...items].sort((a, b) => b.date.localeCompare(a.date));
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

    const reports = (
      await Promise.all(files.map((date) => loadDailyReport(date)))
    ).filter(Boolean);

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
  technology: "科技",
  finance: "财经",
  world: "国际",
  ai: "AI",
  society: "社会热点"
};
