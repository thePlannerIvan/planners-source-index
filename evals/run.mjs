#!/usr/bin/env node
/**
 * 来源索引校验器的回归：好样例必须过，七条坏样例必须**指名**失败。
 * 「写下的规则不算闸门」—— 每条闸门都要有一个坏样例证明它拦得住。
 *
 * 用法：node evals/run.mjs
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const VALIDATOR = join(ROOT, 'scripts', 'validate-source-index.mjs');
const sha = buf => createHash('sha256').update(buf).digest('hex');

let failed = 0;
let badSamples = 0;
let structural = 0;
// 断言条数自己数，不靠文档复述（文档复述过的数字已经漂过三次）。
let assertions = 0;
const ok = m => { assertions++; console.log(`  ✓ ${m}`); };
const bad = m => { failed++; assertions++; console.log(`  ✗ ${m}`); };

function run(dir, args = []) {
  const r = spawnSync(process.execPath, [VALIDATOR, join(dir, 'source-index.json'), ...args], { encoding: 'utf8' });
  let parsed = null;
  try { parsed = JSON.parse(r.stdout); } catch { /* --stamp 会写 stderr；stdout 仍是 JSON */ }
  return { code: r.status, out: parsed, stdout: r.stdout, stderr: r.stderr };
}
const codes = res => (res.out?.errors || []).map(e => e.code);

/** 造一个样例目录：一份源文件 +（可选）一份审计副本 + 索引 */
function fixture(name, mutate) {
  const dir = mkdtempSync(join(tmpdir(), `srcidx-${name}-`));
  const doc = Buffer.from('# 报告\n\n2024 年销量 1200 台。\n');
  writeFileSync(join(dir, 'report.md'), doc);
  const companion = Buffer.from('=== PAGE 1 ===\n2024 年销量 1200 台。\n');
  writeFileSync(join(dir, 'report.txt'), companion);

  const index = {
    contract_version: 'source-index/2.0.0',
    source_root: '.',
    index_sha256: null,
    sources: [{
      source_id: 'src-report',
      origin: { path: 'report.md', sha256: sha(doc), bytes: doc.length },
      kind: 'document',
      role: '主要事实来源',
      audit_layer: {
        mode: 'audit_companion', path: 'report.txt', sha256: sha(companion),
        derived_from_sha256: sha(doc), snapshot_sha256: null,
        method: 'pandoc-plain', anchor_marks: '=== PAGE n ===',
      },
      coverage: { status: 'full', scope: null, reason: null, impact_if_incomplete: null, counts: { pages: 1 } },
      analysis_unit: '一份报告',
      anchors: [{ kind: 'page', value: '1', note: '销量数字所在页' }],
      conflicts: [], notes: '',
    }],
    blind_spots: [],
  };
  if (mutate) mutate(index);
  writeFileSync(join(dir, 'source-index.json'), JSON.stringify(index, null, 2));
  return dir;
}

const tmpDirs = [];
const fx = (name, mutate) => { const d = fixture(name, mutate); tmpDirs.push(d); return d; };

console.log('来源索引校验器 · 回归');
console.log('\n[好样例]');
{
  const d = fx('good');
  const res = run(d, ['--stamp']);           // 先盖章
  const res2 = run(d);                        // 再校验（带 index_sha256）
  if (res2.code === 0 && res2.out?.valid === true) ok('干净索引通过，且盖章后复算一致');
  else bad(`干净索引未通过：${JSON.stringify(codes(res2))} ${res2.stderr || ''}`);
}

console.log('\n[坏样例 —— 每条闸门必须拦得住]');
const cases = [
  ['sampled 不写 coverage.scope', i => { i.sources[0].coverage = { status: 'sampled', scope: null, reason: '抽样', impact_if_incomplete: '可能漏页', counts: null }; }, 'coverage_scope_required'],
  ['partial 缺 blind_spots 条目', i => {
    i.sources[0].coverage = { status: 'partial', scope: '只读了前 3 页', reason: null, impact_if_incomplete: '结论可能不完整', counts: null };
  }, 'blind_spot_missing'],
  ['派生层未绑定上游', i => {
    i.sources[0].audit_layer.derived_from_sha256 = null;
    i.sources[0].audit_layer.snapshot_sha256 = null;
  }, 'audit_layer_unbound'],
  ['审计副本没绑原文件哈希', i => { i.sources[0].audit_layer.derived_from_sha256 = 'a'.repeat(64); }, 'audit_companion_source_hash'],
  ['原文件哈希不符', i => { i.sources[0].origin.sha256 = 'b'.repeat(64); }, 'origin_hash_mismatch'],
  ['source_id 重复', i => { i.sources.push({ ...i.sources[0] }); }, 'duplicate_source_id'],
  ['unread 不写 reason', i => {
    i.sources[0].coverage = { status: 'unread', scope: null, reason: null, impact_if_incomplete: '结论核不了', counts: null };
    i.sources[0].origin.sha256 = null;
    delete i.sources[0].role;
  }, 'coverage_reason_required'],
  ['unread 不写 impact', i => {
    i.sources[0].coverage = { status: 'unread', scope: null, reason: '没时间读', impact_if_incomplete: null, counts: null };
    i.sources[0].origin.sha256 = null;
    delete i.sources[0].role;
  }, 'coverage_impact_required'],
  ['读过却不给 origin.sha256', i => { i.sources[0].origin.sha256 = null; }, 'origin_hash_required'],
  ['读过却不写 role', i => { delete i.sources[0].role; }, 'role_required'],
  ['blind_spots 指向不存在的来源', i => { i.blind_spots.push({ source_id: 'src-nope', scope: 'a', reason: 'b', impact: 'c' }); }, 'blind_spot_unknown_source'],
  ['index_sha256 复算不符', i => { i.index_sha256 = 'c'.repeat(64); }, 'index_sha256_mismatch'],
];

for (const [label, mutate, expect] of cases) {
  badSamples += 1;
  const d = fx(label.replace(/[^\w\u4e00-\u9fa5]+/g, '-'), mutate);
  const res = run(d);
  if (res.code !== 0 && codes(res).includes(expect)) ok(`${label} → ${expect}`);
  else bad(`${label} → 期望 ${expect}，实际 ${JSON.stringify(codes(res))} (exit ${res.code})`);
}

console.log('\n[结构闸门]');
{
  const d = fx('struct', i => { delete i.sources; });
  structural += 1;
  const res = run(d);
  if (res.code !== 0 && codes(res).includes('required')) ok('缺 sources 被 schema 拦下，且不刷机械噪音');
  else bad(`缺 sources 未被正确拦下：${JSON.stringify(codes(res))}`);
}
{
  const d = fx('badver', i => { i.contract_version = 'source-index/1.1.0'; });
  structural += 1;
  const res = run(d);
  if (res.code !== 0 && codes(res).includes('const')) ok('旧版本号被 const 拦下（不让半新半旧混跑）');
  else bad(`旧版本号未被拦下：${JSON.stringify(codes(res))}`);
}

for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
console.log(failed ? `\n${assertions} 条断言，${failed} 条失败` : `\n全部通过（${assertions} 条断言 = 1 好样例 + ${badSamples} 条坏样例 + ${structural} 条结构闸门）`);
process.exit(failed ? 1 : 0);
