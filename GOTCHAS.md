# GOTCHAS（候选）

格式：现象 / 原因 / 行为修正 / 证据 / 状态 / 属于哪个 module。
只有**会改变未来行为**的非显然失败才记在这里；一次性过程日志不记。
升级记录（做了什么、为什么、影响了哪些 module、删了什么）进 `references/maintenance-history.md`（第一次升级时创建）。

---

## 1. 通用 schema 校验器必须单独处理 `integer`

- **现象**：好样例直接被拦下 —— `$.sources[0].origin.bytes 应为 integer，实际是 number`；更糟的是 11 条坏样例**全部**被同一个 `type` 噪音盖住，三条闸门一条都没验到（首跑 1 好 + 11 坏共 10 条失败，错误码清一色 `type`）。
- **原因**：JSON Schema 里 `integer` 是 `number` 的子集，而 JS 里两者的 `typeof` 都是 `'number'`。`types.some(t => typeOf(node) === t)` 因此永远匹配不上 `integer`。
- **行为修正**：加 `typeMatches(v, t)` —— `integer` 走 `Number.isInteger`；`number` 接受所有 number（整数也算）；其余按 `typeOf` 比。
- **证据**：`evals/run.mjs` 首跑输出（10 条失败，错误码全为 `type`）；修后全绿。
- **状态**：已修。
- **module**：`scripts/validate-source-index.mjs`

## 2. 坏样例必须**指名**失败，不能只断言"退出码非零"

- **现象**：上面那个 `type` bug 会让回归**看起来全绿** —— 每条坏样例确实都失败了，只是失败在无关的原因上。
- **原因**：闸门的价值是「拦得住**这一条**」，不是「拦得住什么」。
- **行为修正**：`evals/run.mjs` 每条坏样例都断言**期望的错误码出现在 `errors[]` 里**，不看数量、只看码。
- **证据**：若只判退出码，首跑会显示 9/9 通过（实际三条闸门一条都没验到）。
- **状态**：已写入判据（`evals/run.mjs` 的 `codes(res).includes(expect)`）。
- **module**：`evals/run.mjs`

## 3. 二进制来源读不了时，先获取能力再登记

- **现象**：`audit_companion` 是硬要求（缺了校验器直接报错），但"这个环境没有 PDF 抽取器"很容易变成一个被接受的借口 —— 生产者在 `blind_spots` 里写一句就过去了。
- **原因**：契约只规定了"要有可读副本"，没规定"没有工具时该做什么"。
- **行为修正**：SKILL.md 写明 —— 自己去找、去装抽取工具（`pip install pypdf`、`brew install poppler`…），并把 `audit_layer.method` / `anchor_marks` 写清楚；**只有真试过仍不行**才登记盲区并注明试过什么。
- **证据**：`planners-fact-check` 的真实案例回放（`b2-real-replay`）撞到同一堵墙。
- **状态**：已修（SKILL.md）。
- **module**：`SKILL.md`（可读化纪律）

## 4. 「可省略」必须用不写，不是写空

- **现象**：把 `role` 从 `required` 里拿掉之后，写 `role: ""` 仍然被 schema 的 `minLength: 1` 拦下（错误码是 `minLength`，不是 `role_required`）—— 因为结构校验先跑，机械判据根本没轮到。
- **原因**：`required` 管的是"字段在不在"，`minLength` 管的是"值够不够长"。两者是两道独立的门。
- **行为修正**：生产者要表达"这项没有"时，**不写这个字段**，不要写空串或 null（除非 schema 允许 null）。校验器这边保持两道门都在。
- **证据**：`evals/run.mjs` 里三条新用例首跑报 `minLength`，改用 `delete` 后按预期报 `role_required` / `coverage_impact_required`。
- **状态**：已写入判据与文档。
- **module**：`contracts/source-index.schema.json` + `scripts/validate-source-index.mjs`
