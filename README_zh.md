# Dongri-grigri

[한국어](README_ko.md) · [English](README.en.md) · [简体中文](README_zh.md)

Dongri-grigri 是一个本地优先的 AI 项目运行指挥中心。它直接投影 Control Plane 文档、代码仓库状态、任务、代理、审批和证据，不创建第二套事实来源。

> 当前源码候选版本为 `1.0.0-alpha.2`（尚未发布）。目前没有对应的 Git 标签或 GitHub Release，因此这不代表公开 Alpha、生产就绪，也不代表已完成 Soak、Pilot 或正式认证。

> 截至 2026-08-28，基于证据的准备度基线为 `771.1/1000`。`DAY 30/30` 仅表示 30 天计划台账已编制完成，并不表示产品已经完成；真实 provider dispatch、Docker 最终稳定性、外部 Windows 分发和外部采用仍是开放门槛。

## 项目存在的理由

Codex 与 Claude 拥有不同的会话、身份验证和订阅周期。仅仅因为执行提供方发生变化，项目目标、修改文件、验证证据、阻塞项和下一项安全操作就不应该丢失。Dongri-grigri 在保持代码仓库与 Control Plane 为事实来源的前提下，为本地工作区构建 provider-neutral 连续性层。

当前 V1 工作分支已实现 append-only checkpoint、Git drift 拦截、fail-closed 换乘 API、实时 checkpoint 投影和无需凭据的双向 mock demo。真实 Codex/Claude runner smoke、外部用户采用和公开发布仍是独立门槛。

## Codex 与 Claude 的连续协作

V1 MVP 的目标是让任务不绑定某一个模型提供方。Codex 可以开始任务，Claude 可以在验证 checkpoint 后接手，之后 Codex 也可以再次继续。该 durable transfer contract 仍在实现中。

Command Center 使用交通线路图表达运行状态：

- 项目是一条线路；
- 执行阶段是车站；
- Codex 和 Claude 使用不同的角色形象；
- 提供方切换是在同一任务线路上的换乘；
- 等待审批显示为闸门；
- 心跳过期显示为警告信号；
- 完成的任务到达终点站。

角色移动由现有 `task_update`、`agent_status`、`subtask_update` 和 `cli_output` WebSocket 事件驱动。只有在总量可知时才显示百分比；无法预测结束时间的模型执行只显示不确定进度、已用时间、心跳和最新输出。

## 环境要求

- Node.js 22 或更高版本
- Corepack 与 pnpm 10
- 主要运行环境为 Windows，同时保留 Linux CI 验证

Docker 是可选项。安装、静态检查、单元测试、构建和本地开发服务器均不依赖 Docker。

## 快速开始

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm run public:verify
corepack pnpm run dev:local
```

打开 `http://127.0.0.1:8800/`。本地 API 默认使用 `127.0.0.1:8790`，兼容界面保留在 `/old`。

如果默认工作区不可用，请将 `DONGGRI_CONTROL_ROOT` 设置为 Control Plane 的绝对路径。

## 验证

```bash
corepack pnpm exec tsc -p tsconfig.json --noEmit --pretty false
corepack pnpm run test:web
corepack pnpm run test:api
corepack pnpm run openapi:check
corepack pnpm run build
corepack pnpm run smoke:command-loop:self-test
```

## 贡献与安全

提交 Pull Request 前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请按照 [SECURITY.md](SECURITY.md) 的说明私下报告。

本项目采用 Apache-2.0 许可证，详见 [LICENSE](LICENSE)。

完整实施与提交门槛请参阅 [V1 MVP 30 天计划](docs/V1-MVP-30-DAY-PLAN.md)。该计划不允许空提交、回填日期或未经验证的提交。
