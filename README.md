# DailyPulse · 每日脉搏

AI 驱动的每日新闻与论文聚合静态站。  
站点部署在 GitHub Pages，数据以 JSON 持久化在仓库中，并通过 GitHub Actions 每日自动更新。

## 1. 项目能力概览

- 每日热点新闻（5 大栏目）：
  - 科技、财经、国际、AI、社会热点
  - 每栏目标 5 条，不足时保留空位并在页面中展示实际数量
- 每日精选 AI 论文/博客：
  - 目标 3-5 条
  - 自动生成中文摘要与亮点解读
- 全自动链路：
  - 每天北京时间 08:00 定时抓取
  - 生成 `data/daily/YYYY-MM-DD.json` 与 `data/index.json`
  - 自动提交到 `main`
  - 自动构建并发布到 GitHub Pages

## 2. 面向新用户的快速上手

### 2.1 环境要求

- Node.js 22+
- GitHub 仓库（建议默认分支为 `main`）

### 2.2 本地启动（开发预览）

```bash
npm install
npm run fetch:daily
npm run dev
```

启动后访问终端输出的本地地址（通常是 `http://localhost:4321`）。

### 2.3 本地构建（可选）

```bash
npm run build
```

说明：在部分 Windows 受限环境可能出现 `spawn EPERM`（系统策略限制子进程）。  
这不影响 GitHub Actions 在 Linux Runner 上正常构建部署。

## 3. 一键部署到 GitHub Pages（推荐）

按以下步骤执行，新仓库可直接上线：

1. 创建 GitHub 仓库并推送本项目代码到 `main` 分支。
2. 打开仓库 `Settings -> Pages`。
3. 在 `Build and deployment` 中选择 `Source: GitHub Actions`。
4. 打开仓库 `Settings -> Actions -> General`，确认：
   - `Workflow permissions` 设为 `Read and write permissions`（用于定时任务写回数据）
5. 首次手动发布：
   - 进入 `Actions -> Daily Data Update -> Run workflow` 执行一次数据生成
   - 数据提交后会自动触发 `Deploy Site` 工作流
6. 发布完成后，访问：
   - 用户主页仓库：`https://<username>.github.io/`
   - 项目仓库：`https://<username>.github.io/<repo>/`

## 4. 日常使用与运维

### 4.1 常用命令

```bash
# 抓取并生成当日数据
npm run fetch:daily

# 本地开发预览
npm run dev

# 构建静态站
npm run build
```

### 4.2 工作流说明

- `/.github/workflows/daily-update.yml`
  - 触发：每天 UTC `0 0 * * *`（北京时间 08:00）+ 手动触发
  - 作用：抓取数据 -> 生成 JSON -> 自动提交到 `main`
- `/.github/workflows/deploy.yml`
  - 触发：`main` 分支 push + 手动触发
  - 作用：构建 Astro 静态产物并部署到 GitHub Pages

### 4.3 数据文件说明

- `data/schema.json`
  - 每日报告 JSON 契约（字段结构定义）
- `data/daily/YYYY-MM-DD.json`
  - 每日完整内容（新闻、论文、摘要、评分、来源等）
- `data/index.json`
  - 可用日期索引与统计（用于归档导航）

## 5. 可配置项（定制内容源和策略）

主要配置文件：`scripts/config/sources.mjs`

- 可修改：
  - 新闻源/论文源 RSS 地址
  - 栏目归类
  - 来源权重
  - 目标条数（每栏 5 条、论文 3-5 条）
- 推荐做法：
  - 优先保留 RSS/API 稳定源
  - 每次新增来源后，先本地执行 `npm run fetch:daily` 验证

## 6. 常见问题（FAQ）

### Q1：为什么某个栏目今天没有凑满 5 条？

A：这是设计行为。系统默认“保留空位而不是用旧内容补齐”，确保当天数据真实可追溯。

### Q2：为什么日志里有 `source failed`？

A：代表该来源在本轮请求超时或 DNS 不可达。脚本会自动跳过失败源，不影响整轮产出。

### Q3：我需要手动提交 `data/` 吗？

A：不需要。每日定时任务会自动提交 `data/` 变更；你只需要维护代码和配置。

### Q4：部署后路径错乱（资源 404）怎么办？

A：`deploy.yml` 已自动根据仓库名设置 `BASE_PATH`。若你改了部署策略，请确保：

- 用户主页仓库使用 `/`
- 项目仓库使用 `/<repo>/`

## 7. 目录结构

```text
.
├─ .github/workflows/         # 定时更新与部署
├─ data/
│  ├─ daily/                  # 每日 JSON 归档
│  ├─ index.json              # 日期索引
│  └─ schema.json             # 数据契约
├─ scripts/
│  ├─ build-daily-data.mjs    # 抓取与生成主脚本
│  └─ config/sources.mjs      # 内容源与权重配置
└─ src/                       # Astro 站点页面与组件
```

## 8. 首次上线检查清单

- `Settings -> Pages -> Source` 已设置为 `GitHub Actions`
- `Settings -> Actions -> Workflow permissions` 已允许写权限
- 手动运行过一次 `Daily Data Update`
- `data/daily/` 下已生成当天 JSON
- `Deploy Site` 任务成功，公网页面可访问
