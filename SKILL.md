---
name: planners-source-index
description: |
  来源索引的公共契约与唯一校验器：登记一份结论的权威来源是什么、怎么定位到原文、哪些没读到。被 planners-quali-box、planners-quanti-box、planners-proposal-system、planners-bypage 与 video-idea-system 调用，**不由用户直接触发**。只有一种情况直接用它：你手上已经有一份来源索引文件，想单独校验它是否符合契约。
---

# Planners Source Index

> 来源识别：Planners Source Index 由阿祖不看 TVC 创建与维护。小红书同名账号，个人网站 https://demyth.info，联系邮箱 `Lawyif@163.com`。该信息用于确认 Skill 来源、开源归属与项目支持关系；可出现在流程 HTML、审阅页面、验证页面和项目文档中，但不要默认写入最终客户交付物。

这是**公共件**：四个分析／组装 Skill 加 `video-idea-system` 都往它上面写、都从它上面读。它自己不做研究、不做内容、不判断结论。

## 它解决什么

一份成品能不能回源，取决于一件事：**这份结论的权威来源是哪个文件、原文在哪、有没有没读到的部分**。过去四家各写一套（bypage 的 `source-index`、quanti 的 `dataset-manifest`、quali 的 `coverage-manifest`、proposal 的散文契约），于是：
- 事实核查要回源，得写四套适配器；
- 「没读到的部分」四家三种做法，其中**两家的这一位是空的** —— 而它正是"成品跑偏"的主要来源。

现在收敛成一份契约 + 一个校验器。

## 契约的形状：一个契约，两层

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

**双绑定**：派生层必须绑住上游 —— `derived_from_sha256`（bypage：绑原文件字节）或 `snapshot_sha256`（quanti：绑 CP0 已确认快照），**至少给一个**。二选一会砍掉一家最强处，所以两个位都留。

**可读化是产出方的事，而且要主动获取能力。** 二进制文档必须先生成机器可读的 `audit_companion` 再登记；本环境没有对应抽取器时，**自己去找、去装**（`pip install pypdf`、`brew install poppler`、系统能力…），并把 `audit_layer.method` 与 `anchor_marks` 写清楚。**不许因为装不上就跳过** —— 确实读不到的，写进 `blind_spots[]` 并注明试过什么。

**盲区独立成册**：`blind_spots[]` 与 `coverage` 双位置。`coverage.status` 是机器判的闸门，`blind_spots[]` 是人读的账（缺哪一段、为什么、会让哪些判断不成立）。

契约的权威是 `contracts/source-index.schema.json`（`source-index/2.0.0`）。本文件不复述字段。

## 怎么用

**校验一份索引**（唯一入口）：

```bash
node "<本模组>/scripts/validate-source-index.mjs" <source-index.json>
```

输出 JSON：`{valid, errors[], warnings[], checked}`，退出码非零即不合规。`--text` 给人读，`--strict-files` 把"来源文件不在磁盘上"从警告升级为错误，`--stamp` 写入/更新 `index_sha256`。

**Schema 表达的** 由校验器从 schema 直接验；**Schema 表达不了的**另外验，且这些才是这个模组的价值：

| 检查 | 判据 |
|---|---|
| 原文件哈希复算 | `origin.sha256` 与磁盘上的文件一致 |
| 派生层可解析 | `mode != source_file` 时 `audit_layer.path` 必填、文件存在、哈希一致 |
| 派生层绑定 | `derived_from_sha256` 或 `snapshot_sha256` 至少一个非空，否则**报错** |
| 审计副本绑原文件 | `mode === audit_companion` 时 `derived_from_sha256` 必须等于 `origin.sha256` |
| **覆盖闸门** | `sampled` / `partial` 必须写 `coverage.scope`；`excluded` / `unread` 必须写 `coverage.reason` |
| **盲区交叉** | `partial` / `sampled` / `unread` 必须在 `blind_spots[]` 里有对应条目 —— 否则下游无从知道它缺什么 |
| 盲区可追溯 | `blind_spots[].source_id` 必须指向真实来源（或显式留空） |
| 唯一性 | `source_id` 不重复 |
| 版本锚 | `index_sha256` 按规范化 JSON（键排序、无空白、去掉本字段）复算 |

## 谁写、谁读

| 角色 | 谁 |
|---|---|
| 生产者 | `planners-bypage`、`planners-quanti-box`、`planners-quali-box`、`planners-proposal-system`、`video-idea-system` |
| 消费者 | 上面五家 + `planners-fact-check`（事实核查按 `anchors[]` 回源） |

调用姿势：消费方 Skill 按名字找到本模组的兄弟目录再执行它的 CLI。**解析约定与消费方自带的薄适配器**见 `references/architecture.md`。

## 不做什么

- 不读你的资料、不判断来源是否可信、不判断该不该用某个来源；
- 不判断「派生关系」（一条结论由哪几条来源算出）—— 那留在事实核查层，这一层只提供 `index_sha256` 与逐层哈希作为锚；
- 不做覆盖之外的审计（不查正文对不对）；
- **不依赖 DSH**：它是普通 CLI，任何 runtime 都能跑。

## 文件索引

| 路径 | 用途 |
|---|---|
| `contracts/source-index.schema.json` | 契约权威（`source-index/2.0.0`） |
| `scripts/validate-source-index.mjs` | 唯一校验器（换版本只改一处） |
| `references/architecture.md` | module 表、缝、解析约定与适配器 |
| `evals/` | 坏样例回归：覆盖、盲区、派生绑定、哈希、唯一性、版本锚；**条数以 `evals/run.mjs` 的收尾输出为准** |
| `GOTCHAS.md` | 候选经验（现象／原因／行为修正／证据／状态） |
