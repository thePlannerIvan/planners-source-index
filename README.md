# Planners Source Index

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-2563eb)](LICENSE)
[![Contract](https://img.shields.io/badge/contract-source--index%2F2.0.0-0f766e)](contracts/source-index.schema.json)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933)](https://nodejs.org)

**全系列 Skill 的“防幻觉与来源记账本”：说清每条结论出自哪份原始文件、定位到哪一行，并老实交代哪些部分根本没读到。**

> 作者：阿祖不看 TVC（小红书同名）· [demyth.info](https://demyth.info) · [Lawyif@163.com](mailto:Lawyif@163.com)

---

## 一句话看懂：大多数用户不用单独操心我

如果你只是来写方案、做数据分析、做 PPT 或审视频，**通常不需要自己手动使用本仓库**——当你用到上层 Skill（定性/定量分析、提案、逐页稿、方法库、事实核查或短视频选题）时，它们会自动按需加载并使用这套统一契约。

**它解决的核心问题很简单**：

很多工作一交出去就出事，往往是因为资料夹里有 20 个 PDF/Excel，AI 只读了前 3 个或者某页扫描件根本没识别出来，却照样把报告写得头头是道。**Planners Source Index** 强迫上层工作流统一记好两本账：

1. **来源定位账**：文件在哪（SHA-256 绑定）、用什么方式拆解的（原文、机器审计副本、规范化表或语料）、引用锚点在哪；
2. **诚实盲区账（`blind_spots[]`）**：哪一段、因为什么工具缺失没读到、这会让哪些结论失效——**没读全却不登记盲区，脚本直接拦截不放行**。

```text
上层 Skill（Quali / Quanti / Proposal / Bypage / Method-Wiki / Fact-Check / Video-Idea）
  └─ 统一产出 source-index.json
       ├─ 已完整读取 → 记录 SHA-256 + 位置锚点（可交付核查）
       └─ 部分读/读不到 → 强制写入 blind_spots[]（明确影响边界）
```

---

## 什么时候我需要直接安装/运行它？

只有两种情况你会亲自和它打交道：

1. **你想单独校验一份已有的 `source-index.json`**：检查某个研究或提案项目交出来的来源索引有没有遗漏必填绑定、或者有没有漏报未读盲区；
2. **你是 Skill 开发者 / 企业工作流定制者**：希望让自己的 Skill 也共享同一份 `source-index/2.0.0` 契约，并与 [`planners-fact-check`](https://github.com/thePlannerIvan/planners-fact-check) 无缝对接回源核查。

### 谁在使用它？

- **直接消费并校验**：`planners-quali-box`、`planners-quanti-box`、`planners-proposal-system`、`planners-bypage`、`planners-method-wiki`、`planners-fact-check`
- **遵循同契约格式输出**：`video-idea-system`（`inventory-sources.mjs` 按 `source-index/2.0.0` 格式清点项目资料）

---

## 快速安装与使用

### 安装

```bash
npx skills add https://github.com/thePlannerIvan/planners-source-index --skill planners-source-index
```

或克隆至本地 Skill 目录（使用消费方 Skill 时，它们也会在缺失时自动帮你拉取本公共模组）：

```bash
git clone https://github.com/thePlannerIvan/planners-source-index.git ~/.codex/skills/planners-source-index
# 或
git clone https://github.com/thePlannerIvan/planners-source-index.git ~/.claude/skills/planners-source-index
```

### 校验已有索引文件

```text
我手上有一份 source-index.json，用 planners-source-index 帮我核对格式和盲区登记是否完整。
```

对应命令行：

```bash
node scripts/validate-source-index.mjs <source-index.json> --text
```

---

<details>
<summary>开发者说明：契约四形态、校验命令与目录结构（普通用户可忽略）</summary>

### 登记层与四种解析层形态

同一份契约覆盖所有上层工作流，差异仅体现在 `audit_layer.mode`：

| `audit_layer.mode` | 适用形态 | 上游绑定字段 | 典型生成方 |
| --- | --- | --- | --- |
| `source_file` | 直接读取原文本/原文件 | — | `planners-proposal-system`、`video-idea-system` |
| `audit_companion` | 二进制/PDF 抽取后的机器审计副本 | `derived_from_sha256` | `planners-bypage` |
| `normalized_table` | 规范化表格数据包 | `snapshot_sha256` | `planners-quanti-box` |
| `normalized_corpus` | 规范化编码语料 | `derived_from_sha256` | `planners-quali-box` |

注：`planners-quanti-box` 的 **Quick** 单表模式允许省略落盘 `source-index.json` 而直接绑定原数据快照，Standard / Deep 强制生成；`partial` / `sampled` 覆盖状态必须配齐 `blind_spots[]`。

### 校验参数与回归测试

```bash
node scripts/validate-source-index.mjs <source-index.json> [--text] [--strict-files] [--stamp]
node evals/run.mjs
```

- `--text`：输出人读文本报告；
- `--strict-files`：将“原文件在磁盘缺失”从 warning 升级为硬错误；
- `--stamp`：写入/更新权威 `index_sha256`。
- 环境要求：Node.js 20+，零第三方依赖，不依赖 DSH。

### 目录结构

```text
planners-source-index/
├── SKILL.md
├── GOTCHAS.md
├── contracts/
│   └── source-index.schema.json        # source-index/2.0.0 权威契约
├── scripts/
│   └── validate-source-index.mjs       # 唯一校验器
├── evals/
│   └── run.mjs                         # 覆盖闸门、盲区交叉、派生绑定与哈希回归测试
└── references/
    └── architecture.md                 # 适配器约定与消费方分工边界
```

</details>

---

## 品牌边界、开源协议与商业合作

- **许可协议**：以 [AGPL-3.0-only](LICENSE) 发布；可商用，修改版与网络服务须公开源码。
- **署名与商标**：索引产物本身不写入作者品牌字段；出处保留在 [NOTICE](NOTICE)，商标边界见 [TRADEMARK.md](TRADEMARK.md)。
- **商业合作**：定制研究源审计规范或企业私有化集成，请联系 `Lawyif@163.com` 或访问 [demyth.info](https://demyth.info)，详见 [COMMERCIAL.md](COMMERCIAL.md)。

## 相关项目

- [Planners Fact Check](https://github.com/thePlannerIvan/planners-fact-check) —— 基于本契约回源审计成品事实
- [Planners Quali Box](https://github.com/thePlannerIvan/planners-quali-box) / [Planners Quanti Box](https://github.com/thePlannerIvan/planners-quanti-box) —— 定性与定量分析入口
- [Planners Bypage](https://github.com/thePlannerIvan/planners-bypage) —— 多源资料 → 逐页 PPT 内容包
