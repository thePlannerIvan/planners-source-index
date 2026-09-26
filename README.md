# Planners Source Index

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-2563eb)](LICENSE)
[![Contract](https://img.shields.io/badge/contract-source--index%2F2.0.0-0f766e)](contracts/source-index.schema.json)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933)](https://nodejs.org)
[![Runtime](https://img.shields.io/badge/runtime-plain%20Node-6b7280)](references/architecture.md)

来源索引的公共契约与唯一校验器：登记**一份结论的权威来源是什么、怎么定位到原文、哪些没读到**。

> 作者：阿祖不看 TVC（小红书同名）· [demyth.info](https://demyth.info) · [Lawyif@163.com](mailto:Lawyif@163.com)

## 它解决什么

一份成品能不能回源，取决于一件事：这份结论的权威来源是哪个文件、原文在哪、**有没有没读到的部分**。

过去五家各写一套（bypage 的 `source-index`、quanti 的 `dataset-manifest`、quali 的 `coverage-manifest`、proposal 的散文契约），于是：

- 事实核查要回源，得写四套适配器；
- 「没读到的部分」四家三种做法，其中**两家的这一位是空的** —— 而它正是「成品跑偏」的主要来源。

现在收敛成一份契约 + 一个校验器。

## 核心工作流

```text
登记层（所有来源共用）
  source_id · origin{path,sha256,bytes} · kind · role · analysis_unit
  coverage{status,scope,reason,counts,impact_if_incomplete}
  anchors[] · conflicts[] · notes

解析层（audit_layer.mode，四家差异只在这一位）
  source_file       直接读原文件                —— proposal 现状
  audit_companion   读二进制文档的机器审计副本   —— bypage 现状
  normalized_table  读规范化表                  —— quanti 现状
  normalized_corpus 读规范化语料                —— quali 现状
```

**双绑定**：派生层必须绑住上游 —— `derived_from_sha256`（bypage：绑原文件字节）或 `snapshot_sha256`（quanti：绑已确认快照），至少给一个。

**盲区独立成册**：`blind_spots[]` 与 `coverage` 双位置。`coverage.status` 是机器判的闸门，`blind_spots[]` 是人读的账（缺哪一段、为什么、会让哪些判断不成立）。

**可读化是产出方的事，而且要主动获取能力。** 二进制文档必须先生成机器可读的 `audit_companion` 再登记；本环境没有对应抽取器时，自己去找、去装（`pip install pypdf`、`brew install poppler`、系统能力…），并把 `audit_layer.method` 与 `anchor_marks` 写清楚。确实读不到的，写进 `blind_spots[]` 并注明试过什么。

校验入口只有一条：

```bash
node scripts/validate-source-index.mjs <source-index.json>
```

输出 JSON：`{valid, errors[], warnings[], checked}`，退出码非零即不合规。`--text` 给人读，`--strict-files` 把「来源文件不在磁盘上」从警告升级为错误，`--stamp` 写入/更新 `index_sha256`。

Schema 表达不了的另外验，且这些才是本模组的价值：原文件哈希复算、派生层可解析、派生层绑定、审计副本绑原文件、**覆盖闸门**、**盲区交叉**、盲区可追溯、唯一性、版本锚。

## 适合 / 不适合

适合：

- 结论需要回源（事实核查、引用核对、审计）；
- 多源材料里存在二进制文档、规范化表或语料，需要统一登记口径；
- 需要把「没读到的部分」变成机器能判、人能读的账；
- 想在写完结论之后还能定位到原文位置。

不适合：

- 只处理一两个纯文本、不需要回源的一次性任务；
- 想让本模组判断「来源是否可信」「该不该用某个来源」——**它只登记，不判断**；
- 想让它判断「一条结论由哪几条来源算出」——派生关系留在事实核查层，这一层只提供 `index_sha256` 与逐层哈希作锚。

## 安装

通用 Skills CLI：

```bash
npx skills add https://github.com/thePlannerIvan/planners-source-index --skill planners-source-index
```

也可直接放入 Codex 或 Claude 的 Skill 目录：

```bash
git clone https://github.com/thePlannerIvan/planners-source-index.git ~/.codex/skills/planners-source-index
# 或
git clone https://github.com/thePlannerIvan/planners-source-index.git ~/.claude/skills/planners-source-index
```

环境要求：**Node.js 20+**，零第三方依赖。**不依赖 DSH** —— 它是普通 CLI，任何 runtime 都能跑。

```bash
node evals/run.mjs   # 1 好样例 + 12 条坏样例 + 2 条结构闸门
```

## 典型 prompt

本模组**不由用户直接触发**，由 `planners-bypage`、`planners-quanti-box`、`planners-quali-box`、`planners-proposal-system` 与 `video-idea-system` 调用。只有一种情况直接用它：

```text
我手上已经有一份来源索引文件，帮我校验它是否符合契约：
node scripts/validate-source-index.mjs <source-index.json> --text
```

消费方 Skill 按名字找到本模组的兄弟目录再执行它的 CLI；解析约定与那 25 行适配器见 `references/architecture.md`。

## 目录结构

```text
planners-source-index/
├── SKILL.md
├── GOTCHAS.md
├── contracts/
│   └── source-index.schema.json        # 契约权威（source-index/2.0.0）
├── scripts/
│   └── validate-source-index.mjs       # 唯一校验器（换版本只改一处）
├── evals/
│   └── run.mjs                         # 四类坏样例：未覆盖、盲区缺失、派生层未绑定、哈希不符
└── references/
    └── architecture.md                 # module 表、缝、解析约定与适配器
```

## 品牌与署名边界

来源信息可出现在 Skill 文档、流程 HTML、审阅页面、验证页面和开发者工作面中；**不默认写入最终客户交付物**。索引文件本身是工作产物，默认不带任何作者品牌字段。

`Planners Source Index` 与 `阿祖不看 TVC` 用于标识本项目及其来源。开源许可证授予代码使用权，不自动授予项目名或作者名的商标使用权。修改版请标注 fork，不要暗示作者背书。详见 [TRADEMARK.md](TRADEMARK.md)。

## 开源协议和商业入口

本项目以 **AGPL-3.0** 发布 —— 可以商业使用；修改版与通过网络提供的服务需公开对应源码。若需要闭源授权、私有部署、企业工作流或私有增强模块：

- Email：`Lawyif@163.com`
- Website：[demyth.info](https://demyth.info)

详见 [COMMERCIAL.md](COMMERCIAL.md) · 归属声明见 [NOTICE](NOTICE)。

## 相关项目

- [Planners Fact Check](https://github.com/thePlannerIvan/planners-fact-check) —— 按 `anchors[]` 回源的事实核查
- [Planners Review Core](https://github.com/thePlannerIvan/planners-review-core) —— 人工审阅的公共接缝
- [Planners Bypage](https://github.com/thePlannerIvan/planners-bypage) —— 多源资料 → 逐页 PPT 内容包
