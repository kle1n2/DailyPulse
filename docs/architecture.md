# DailyPulse 架构与数据流

## 1. 架构概览

DailyPulse 采用离线生成 + 静态分发架构：

- 生成层：`scripts/build-daily-data.mjs`
- 存储层：仓库内 `data/` JSON 文件
- 展示层：Astro 静态页面（`src/`）
- 自动化层：GitHub Actions（每日更新与部署）

本项目没有在线 API 服务，也没有数据库。页面在构建时直接读取本地 JSON。

## 2. 关键模块

- `scripts/build-daily-data.mjs`
- 抓取 RSS、做清洗去重评分、输出日报和索引。
- `scripts/config/sources.mjs`
- 新闻源/论文源、权重、栏目目标配置。
- `src/lib/content.js`
- 前端读取 `data/` 的统一入口。
- `src/pages/*`
- 首页、归档页、详情页、404 等静态路由。
- `data/schema.json`
- 日报数据契约定义。

## 3. 每日数据流

1. 定时任务触发或手动执行 `npm run fetch:daily`。
2. 脚本并发抓取配置中的 RSS 源。
3. 标准化条目字段，过滤异常 URL，按规则去重与排序。
4. 生成 `data/daily/YYYY-MM-DD.json`。
5. 更新 `data/index.json`（日期、统计和路径）。
6. 提交 `data/` 变更并触发站点构建部署。

## 4. 数据文件职责

- `data/daily/YYYY-MM-DD.json`
- 当天完整内容：栏目、条目、论文、统计。
- `data/index.json`
- 归档入口：日期列表与快速统计。
- `data/schema.json`
- 结构约束：用于验证日报基本字段。

## 5. 工作流职责

- `.github/workflows/daily-update.yml`
- Node 22 环境，安装依赖后运行数据生成。
- 检测 `data/` 变化并自动提交。
- `.github/workflows/deploy.yml`
- 推送到 `main` 后构建 Astro 并部署到 GitHub Pages。
- 依据仓库名计算 `BASE_PATH` 与 `SITE_URL`。

## 6. 已知边界

- 内容质量受 RSS 源稳定性影响。
- 栏目不做历史补齐，可能少于目标条数。
- 本地 Windows 环境可能出现执行策略或子进程权限限制，CI 以 Linux 结果为准。
- 当前“后端”不是在线服务，而是离线 ETL 脚本与 GitHub Actions。
- 最新日报已增加 `coverage` 和 `quality` 字段，用于前端展示与自动化门禁。
