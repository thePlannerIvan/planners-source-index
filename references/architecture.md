# 架构：module、缝、解析约定

给**改它的人**读：每个 module 拥有什么、接口是什么、不做什么、动了会牵连谁。

## 目的与全景

这个模组只稳定完成一件事：**让「一份结论的权威来源是什么、原文在哪、哪些没读到」有一个可被机器校验的共同说法**。

```text
五个生产者 ──写──> source-index.json ──读──> 事实核查 / 五家自己
                        │
                        └── 唯一校验器（schema + 机械闸门）
```

它不认识任何一种分析：不知道 quali 的八种方法，也不知道 quanti 的 Playbook。只有一个例外值得记住：**解析层** `audit_layer.mode` 是四家唯一真正不同的地方，所以它在契约里被显式枚举，而不是被抹平。

## 模块表

| module | 它是什么 | 拥有什么（唯一主人） | 接口 | 不做什么 |
|---|---|---|---|---|
| `contracts/source-index.schema.json` | 契约**权威** | 字段、枚举、必填、模式 —— 所有关于"索引长什么样"的规定只在这里一份 | 被校验器读取；被生产者引用 | 不是文档（不给判断方法、不解释为什么） |
| `scripts/validate-source-index.mjs` | **唯一校验器** | 结构校验（对着 schema 跑）+ 机械校验（哈希复算、派生层绑定、覆盖闸门、盲区交叉、`index_sha256` 复算）；`--stamp` 写版本锚 | CLI：`node validate-source-index.mjs <file> [--text] [--strict-files] [--stamp]`，退出码非零即不合规 | 不读资料、不判断来源可信、不判断该不该用某个来源；**不判断正文对不对** |
| `evals/run.mjs` | 判据的可执行形态 | 七条坏样例的回归（含三类必须 FAIL 的闸门） | `node evals/run.mjs` | 不是规格来源（规格在 schema 与 SKILL.md）；不代替人工判断 |
| `GOTCHAS.md` | 候选经验 | 现象／原因／行为修正／证据／状态 + 它属于哪个 module | 人读；升级进 `maintenance-history.md`（尚未建立，出现第一次升级时创建） | 不存一次性过程日志 |

**为什么校验器要读 schema 而不是手写字段检查**：字段表只有一份，改契约时不会出现"schema 改了、校验器没改"的第二真相源。

## 缝：谁写、谁读、怎么找到它

| 角色 | 谁 | 写/读什么 |
|---|---|---|
| 生产者 | `planners-bypage`、`planners-quanti-box`、`planners-quali-box`、`planners-proposal-system`、`video-idea-system` | 写 `source-index.json`（各自那份旧格式迁移到 2.0.0） |
| 消费者 | 上面五家 + `planners-fact-check` | 读 `anchors[]` / `audit_layer` / `coverage` 回源 |

**解析约定（跨 Skill 调用唯一的缝）**。本模组是**独立发布的条目**，与其它 Skill 平铺在同一个 skills 根下，所以按名字找兄弟目录即可：

```text
① $PLANNERS_MODULES_HOME/<module-name>/
② 调用方 Skill 自己目录的兄弟：<skills-root>/<module-name>/     ← 发布后的主路径，runtime 无关
③ monorepo 开发布局：02-skills-library/00-system/<module-name>/
④ 用户级安装根：$PLANNERS_MODULES_INSTALL_DIR → $PLANNERS_MODULES_HOME → ~/.planners-modules/<module-name>/
   （**库外**；永不写进 02-skills-library 工作树，也不写 ~/.codex|~/.claude|~/.gemini 的技能目录）
⑤ ①–④ 都没有 → **自动从 GitHub 装上**，装完复验（SKILL.md + 本模组声明的契约/校验器锚点）再重解析；
   装不成才报错，且错误信息必须给出可复制的手动装法（不要静默降级成"跳过校验"）
```

**自动安装**（2026-09-26 加）：`git clone --depth 1` 到暂存目录 → 验 → `rename` 原子就位；装的是**默认分支 HEAD**（日志里写 commit，不钉 tag）。`PLANNERS_NO_AUTO_INSTALL=1` 时只报不装。**不静默**：缺哪个、找过哪些路径、从哪装、装到哪、哪个 commit，全部打印；失败一律清掉暂存并给可复制的手动命令。禁地断言只允许落在库外的用户级安装根。实现是各消费方自带的小安装器（`planners-modules-install.mjs` / `planners_modules_install.py`，同一套契约的两份语言镜像，**永不写进模组目录**）；消费方 README 里有完整说明。

**适配器**：每个消费方留一份约 25 行的 `scripts/lib/planners-modules.mjs`，只做「按名字找到兄弟目录」这一件事，导出 `resolveModule(name)` 与 `moduleCli(name, script)`。**这是允许重复的 seam 适配器**（每家的语言/运行时可能不同），实质逻辑一律不复制。

**为什么不做成"发布时打包"**：作者 2026-09-26 裁定按独立条目发布 —— `publish_skills.py` 因此不用改，它已经用 `file_digest` / `same_file` / `.skills-library-manifest.json` 保证发布副本与源一致。

## 同一件事的两个真相源（故意分开，写清谁读谁）

1. **`coverage` 与 `blind_spots`**：机器读 `coverage.status`（闸门），人读 `blind_spots[]`（缺哪一段、为什么、会让哪些判断不成立）。合并成一个会让「机器要判的」和「人要读的」互相将就。
2. **`derived_from_sha256` 与 `snapshot_sha256`**：前者绑**原文件字节**（bypage 的审计副本就是这份文件的文本渲染，必须一致），后者绑**上游已确认快照**（quanti 的分析只许在已批准的规范表上跑）。两个都留、至少一个非空 —— 二选一会砍掉一家最强处。
3. **契约 vs 文档**：`schema` 是字段权威；`SKILL.md` 与这份 `architecture.md` 解释为什么、以及怎么用。改字段只改 schema 一处。

**派生关系（一条结论由哪几条来源算出）不在这一层** —— 它留在事实核查层，本层只给 `index_sha256` + 逐层哈希 + `anchors[]` 作锚。放进来的代价是这层要理解复算链，收益只是少一次 join。

## 动了 X 会牵连什么

| 你要改 | 该动哪里 | 会牵连什么 |
|---|---|---|
| 字段 / 枚举 / 必填 | `contracts/source-index.schema.json` 一处 | 校验器自动跟着变；**五个生产者都要改**；已发布项目里的旧索引会立刻不合规（`contract_version` 是 `const`，旧版本文件会被 `const` 拒掉 —— 这正是"不让半新半旧混跑"的机制） |
| 覆盖闸门 | `scripts/validate-source-index.mjs` 的 `checkCoverage` / `checkBlindSpots` | 五个生产者可能立刻变红；判断"哪些状态算真空区"要同步 SKILL.md 的表 |
| `index_sha256` 的规范化定义 | `canonical()` | 已盖过章的所有索引都会复算不符。**改动等于重新盖章**（`--stamp`） |
| 解析约定 | 本文件 + 各消费方的 25 行适配器 | 顺序一变，runtime 与本地可能各找到不同的一份 —— 改完必须在三个 runtime 各验证一次 |

## 退役

（暂无。出现被替换的机制时记在这里，并同步删掉活跃旧规则与消费者。）
