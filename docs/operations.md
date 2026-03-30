# DailyPulse 运维与排障

## 日常命令

- 生成日报：`npm.cmd run fetch:daily`
- 校验数据和 Astro：`npm.cmd run check`
- 本地开发：`npm.cmd run dev`
- 本地构建：`npm.cmd run build`

在 Windows PowerShell 下，优先使用 `npm.cmd`，避免脚本执行策略拦截 `npm.ps1`。

## Workflow 职责

- `daily-update.yml`
  - 安装依赖
  - 生成当日日报
  - 执行 `npm run check`
  - 输出质量摘要到 `GITHUB_STEP_SUMMARY`
  - 只有在数据变化且质量通过时才自动提交
- `deploy.yml`
  - 安装依赖
  - 执行 `npm run check`
  - 构建 Astro
  - 上传并部署 Pages

## 常见问题

### `npm` 在 PowerShell 下无法运行

- 现象：提示执行策略阻止 `npm.ps1`
- 处理：改用 `npm.cmd run <script>`

### `fetch:daily` 报 `fetch failed`

- 原因通常是本机无外网、DNS 不可达或源站超时。
- 处理：
  - 先确认网络环境
  - 再单独重跑 `npm.cmd run fetch:daily`
  - 查看生成结果里的 `quality.sourceFailures`

### `npm run check` 失败

- 先看 `validate:data` 是否报日报结构问题。
- 若是 Astro 检查失败，优先检查页面引用字段是否仍兼容当前 `data/` 结构。

### GitHub Pages 构建通过但页面资源 404

- 检查 `deploy.yml` 中的 `BASE_PATH` 推导是否与仓库类型一致。
- 用户主页仓库应为 `/`
- 项目仓库应为 `/<repo>/`

## 发布前检查

- `npm.cmd run fetch:daily`
- `npm.cmd run check`
- `npm.cmd run build`
- 抽查首页、归档页、详情页和 404 页
- 抽查最新一份 `data/daily/*.json`
