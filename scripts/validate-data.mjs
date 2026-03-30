import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const DAILY_DIR = path.join(DATA_DIR, "daily");
const INDEX_FILE = path.join(DATA_DIR, "index.json");
const SCHEMA_FILE = path.join(DATA_DIR, "schema.json");

async function readJson(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""));
}

function validateItem(item, label) {
  const required = [
    "id",
    "type",
    "category",
    "title_zh",
    "title_en",
    "summary_zh",
    "highlights_zh",
    "source_name",
    "source_url",
    "published_at",
    "score",
    "tags"
  ];

  for (const key of required) {
    assert(item && key in item, `${label} 缺少字段 ${key}`);
  }

  assert(typeof item.id === "string" && item.id.length > 0, `${label} id 非法`);
  assert(["news", "paper"].includes(item.type), `${label} type 非法`);
  assert(typeof item.source_url === "string" && /^https?:\/\//.test(item.source_url), `${label} source_url 非法`);
  assert(Array.isArray(item.highlights_zh), `${label} highlights_zh 必须为数组`);
  assert(Array.isArray(item.tags), `${label} tags 必须为数组`);
}

async function main() {
  const schema = await readJson(SCHEMA_FILE);
  assert(schema?.$schema, "schema.json 缺少 $schema");

  const index = await readJson(INDEX_FILE);
  const indexDates = index?.dates ?? [];
  assert(Array.isArray(indexDates), "data/index.json 中 dates 必须为数组");

  const entries = await fs.readdir(DAILY_DIR, { withFileTypes: true });
  const dailyFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
  assert(dailyFiles.length > 0, "data/daily/ 下没有日报 JSON");

  const availableDates = new Set();

  for (const entry of dailyFiles) {
    const reportPath = path.join(DAILY_DIR, entry.name);
    const report = await readJson(reportPath);
    const date = entry.name.replace(/\.json$/, "");

    assert(isIsoDate(date), `日报文件名非法: ${entry.name}`);
    assert(report.date === date, `${entry.name} 中 date 与文件名不一致`);
    assert(report.version, `${entry.name} 缺少 version`);
    assert(report.generated_at, `${entry.name} 缺少 generated_at`);
    assert(report.news && typeof report.news === "object", `${entry.name} 缺少 news`);
    assert(Array.isArray(report.papers), `${entry.name} 中 papers 必须为数组`);
    assert(report.stats && typeof report.stats === "object", `${entry.name} 缺少 stats`);

    for (const category of ["technology", "finance", "world", "ai", "society"]) {
      const items = report.news?.[category];
      assert(Array.isArray(items), `${entry.name} 中栏目 ${category} 必须为数组`);
      items.forEach((item, index) => validateItem(item, `${entry.name}:${category}[${index}]`));
    }

    report.papers.forEach((item, index) => validateItem(item, `${entry.name}:papers[${index}]`));
    availableDates.add(date);
  }

  for (const entry of indexDates) {
    assert(isIsoDate(entry.date), `index.json 中存在非法日期 ${entry.date}`);
    assert(availableDates.has(entry.date), `index.json 引用了缺失的日报 ${entry.date}`);
    assert(entry.path === `daily/${entry.date}.json`, `index.json 中 ${entry.date} 的 path 非法`);
  }

  console.log(`[validate:data] ok. reports:${dailyFiles.length}, indexed:${indexDates.length}`);
}

main().catch((error) => {
  console.error(`[validate:data] ${error.message}`);
  process.exit(1);
});
