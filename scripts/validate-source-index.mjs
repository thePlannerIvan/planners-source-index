#!/usr/bin/env node
/**
 * 来源索引的唯一校验器（source-index/2.0.0）。
 *
 * 用法：
 *   node validate-source-index.mjs <source-index.json> [--text] [--strict-files] [--stamp]
 *
 * 它做两件事，两件都必须做：
 *   1. 结构校验 —— 直接读 contracts/source-index.schema.json（契约权威只有一份，不在这里复述字段）；
 *   2. 机械校验 —— schema 表达不了的那些：哈希复算、派生层绑定、覆盖闸门、盲区交叉。
 *
 * 退出码：0 合规；1 有 error。warnings 不影响退出码（除非 --strict-files）。
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(HERE, '..', 'contracts', 'source-index.schema.json');

const errors = [];
const warnings = [];
const err = (code, message) => errors.push({ code, message });
const warn = (code, message) => warnings.push({ code, message });

// ---------- 规范化 JSON：键排序、无空白。index_sha256 的可复算定义 ----------
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
const sha256 = buf => createHash('sha256').update(buf).digest('hex');
const sha256File = p => sha256(readFileSync(p));
const typeOf = v => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
// JSON Schema 的 integer 是 number 的子集；JS 里两者的 typeof 都是 'number'，必须单独判
const typeMatches = (v, t) =>
  t === 'integer' ? typeof v === 'number' && Number.isInteger(v)
  : t === 'number' ? typeof v === 'number'
  : typeOf(v) === t;
const isBlank = v => typeof v !== 'string' || v.trim() === '';

// ---------- 1. 通用结构校验（对着 schema 跑，不重写字段表） ----------
function validateNode(node, schema, path) {
  if (schema.const !== undefined && node !== schema.const)
    err('const', `${path} 必须是 ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(node))
    err('enum', `${path} 取值 ${JSON.stringify(node)} 不在 ${JSON.stringify(schema.enum)}`);
  const types = schema.type ? (Array.isArray(schema.type) ? schema.type : [schema.type]) : null;
  if (types && !types.some(t => typeMatches(node, t))) {
    err('type', `${path} 应为 ${types.join('|')}，实际是 ${typeOf(node)}`);
    return;
  }
  if (typeof node === 'string') {
    if (schema.minLength !== undefined && node.length < schema.minLength)
      err('minLength', `${path} 长度不足 ${schema.minLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(node))
      err('pattern', `${path} 不匹配 ${schema.pattern}`);
  }
  if (typeof node === 'number' && schema.minimum !== undefined && node < schema.minimum)
    err('minimum', `${path} 小于 ${schema.minimum}`);
  if (Array.isArray(node)) {
    if (schema.minItems !== undefined && node.length < schema.minItems)
      err('minItems', `${path} 至少 ${schema.minItems} 项`);
    if (schema.items) node.forEach((v, i) => validateNode(v, schema.items, `${path}[${i}]`));
  }
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    for (const r of schema.required || []) if (!(r in node)) err('required', `${path} 缺少必填字段 ${r}`);
    const props = schema.properties || {};
    if (schema.additionalProperties === false)
      for (const k of Object.keys(node)) if (!(k in props)) err('additionalProperties', `${path} 出现未定义字段 ${k}`);
    for (const [k, s] of Object.entries(props)) if (k in node) validateNode(node[k], s, `${path}.${k}`);
  }
}

// ---------- 2. 机械校验 ----------
function checkOrigin(root, source, where) {
  const unread = source.coverage?.status === 'unread';
  // unread 的来源允许不付哈希代价（发现即登记）；其余状态必须给，否则「这条来源没变过」无从判断
  if (isBlank(source.origin.sha256)) {
    if (!unread) err('origin_hash_required', `${where} coverage.status=${source.coverage?.status} 必须给 origin.sha256`);
  } else if (!/^[a-f0-9]{64}$/.test(source.origin.sha256)) {
    err('origin_sha256', `${where} origin.sha256 必须是 64 位小写十六进制`);
  }
  if (isBlank(source.role) && !unread) err('role_required', `${where} 读过的来源必须写 role（这份材料在项目里干什么用）`);

  const p = resolve(root, source.origin.path);
  if (!existsSync(p) || !statSync(p).isFile()) {
    warn('origin_file_absent', `${where} 来源文件不在磁盘上：${source.origin.path}（离线校验？）`);
    return;
  }
  if (source.origin.sha256 && sha256File(p) !== source.origin.sha256)
    err('origin_hash_mismatch', `${where} origin.sha256 与磁盘文件不一致：${source.origin.path}`);
  if (source.origin.bytes !== undefined && statSync(p).size !== source.origin.bytes)
    err('origin_bytes_mismatch', `${where} origin.bytes 与磁盘文件大小不一致：${source.origin.path}`);
}

function checkAuditLayer(indexDir, source, where) {
  const al = source.audit_layer;
  if (al.mode === 'source_file') {
    if (al.path) err('audit_layer_path_unexpected', `${where} mode=source_file 不该有 audit_layer.path`);
    if (al.sha256) err('audit_layer_hash_unexpected', `${where} mode=source_file 不该有 audit_layer.sha256`);
    return;
  }
  if (isBlank(al.path)) {
    err('audit_layer_path_required', `${where} mode=${al.mode} 必须给 audit_layer.path`);
  } else {
    const p = resolve(indexDir, al.path);
    if (!existsSync(p)) err('audit_layer_missing', `${where} 派生层文件不存在：${al.path}`);
    else if (al.sha256 && sha256File(p) !== al.sha256)
      err('audit_layer_hash_mismatch', `${where} audit_layer.sha256 与文件不一致：${al.path}`);
    else if (!al.sha256) warn('audit_layer_hash_absent', `${where} 派生层没有 sha256，无法复算`);
  }
  if (isBlank(al.method)) warn('audit_layer_method_absent', `${where} 派生层没记 method（提取/转换方式）`);

  // 双绑定：bypage 绑原文件字节，quanti 绑 CP0 快照 —— 至少一个
  if (isBlank(al.derived_from_sha256) && isBlank(al.snapshot_sha256))
    err('audit_layer_unbound', `${where} 派生层未绑定上游：derived_from_sha256 与 snapshot_sha256 至少给一个`);

  // 审计副本就是这份文件的文本渲染，所以必须绑当前原文件哈希
  if (al.mode === 'audit_companion' && al.derived_from_sha256 && al.derived_from_sha256 !== source.origin.sha256)
    err('audit_companion_source_hash', `${where} 审计副本没有绑当前原文件哈希（derived_from_sha256 ≠ origin.sha256）`);
}

function checkCoverage(source, where) {
  const c = source.coverage;
  if (c.status === 'sampled' || c.status === 'partial') {
    if (isBlank(c.scope)) err('coverage_scope_required', `${where} coverage.status=${c.status} 必须写 coverage.scope（实际读到哪）`);
  }
  if (c.status === 'excluded' || c.status === 'unread') {
    if (isBlank(c.reason)) err('coverage_reason_required', `${where} coverage.status=${c.status} 必须写 coverage.reason`);
  }
  if (c.status === 'unread') {
    // 未读的来源不进任何结论，它的风险就靠这两项表达
    if (isBlank(c.impact_if_incomplete)) err('coverage_impact_required', `${where} unread 必须写 impact_if_incomplete（没读它会让哪些判断不成立）`);
  } else if (c.status !== 'full' && isBlank(c.impact_if_incomplete)) {
    warn('coverage_impact_absent', `${where} 没读全却没写 impact_if_incomplete（会让哪些判断不成立）`);
  }
}

function checkBlindSpots(doc, seen) {
  const bySource = new Map();
  (doc.blind_spots || []).forEach((b, i) => {
    if (b.source_id) {
      if (!seen.has(b.source_id)) err('blind_spot_unknown_source', `blind_spots[${i}].source_id 指向不存在的来源：${b.source_id}`);
      bySource.set(b.source_id, b);
    }
  });
  // 「可能被当成全量」的危险只在**用过但没读全**时成立：partial / sampled 必须独立成册。
  // unread 不进任何结论，它的风险由 coverage.reason + impact_if_incomplete 表达（见 checkCoverage）。
  for (const s of doc.sources) {
    const st = s.coverage.status;
    if (st !== 'partial' && st !== 'sampled') continue;
    if (!bySource.has(s.source_id))
      err('blind_spot_missing', `${s.source_id} 的覆盖状态是 ${st}，但 blind_spots 里没有对应条目 —— 下游会把它当全量`);
  }
}

// ---------- 主流程 ----------
function main() {
  const argv = process.argv.slice(2);
  const text = argv.includes('--text');
  const strictFiles = argv.includes('--strict-files');
  const stamp = argv.includes('--stamp');
  const file = argv.find(a => !a.startsWith('--'));
  if (!file) {
    console.error('用法：node validate-source-index.mjs <source-index.json> [--text] [--strict-files] [--stamp]');
    process.exit(2);
  }
  const abs = resolve(file);
  if (!existsSync(abs)) {
    console.error(`找不到文件：${abs}`);
    process.exit(2);
  }
  let doc;
  try {
    doc = JSON.parse(readFileSync(abs, 'utf8'));
  } catch (e) {
    console.error(`不是合法 JSON：${e.message}`);
    process.exit(2);
  }
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));

  validateNode(doc, schema, '$');

  // 结构不合规时停止机械校验（否则会读出 undefined 刷屏）
  if (errors.length) return finish(doc, text);

  const indexDir = dirname(abs);
  const root = resolve(indexDir, doc.source_root || '.');
  const seen = new Map();
  doc.sources.forEach((s, i) => {
    if (seen.has(s.source_id)) err('duplicate_source_id', `source_id 重复：${s.source_id}`);
    seen.set(s.source_id, i);
  });

  doc.sources.forEach((s, i) => {
    const where = `sources[${i}](${s.source_id})`;
    checkOrigin(root, s, where);
    checkAuditLayer(indexDir, s, where);
    checkCoverage(s, where);
  });
  checkBlindSpots(doc, seen);

  if (doc.index_sha256) {
    const actual = sha256(canonical({ ...doc, index_sha256: null }));
    if (actual !== doc.index_sha256)
      err('index_sha256_mismatch', `index_sha256 复算不符（期望 ${actual}）。规范化定义：键排序、无空白、去掉本字段`);
  }

  if (stamp) {
    const next = { ...doc, index_sha256: sha256(canonical({ ...doc, index_sha256: null })) };
    writeFileSync(abs, JSON.stringify(next, null, 2) + '\n', 'utf8');
    if (!text) console.error(`已写入 index_sha256 = ${next.index_sha256}`);
    doc.index_sha256 = next.index_sha256;
  }
  return finish(doc, text);
}

function finish(doc, text) {
  const fatal = errors.length > 0;
  if (text) {
    for (const w of warnings) console.log(`WARN  [${w.code}] ${w.message}`);
    for (const e of errors) console.log(`ERROR [${e.code}] ${e.message}`);
    console.log(fatal ? `\n不合规：${errors.length} 个错误、${warnings.length} 个警告` : `\n合规：${warnings.length} 个警告`);
  } else {
    console.log(JSON.stringify({ valid: !fatal, errors, warnings, checked: { sources: (doc.sources || []).length, blind_spots: (doc.blind_spots || []).length } }, null, 2));
  }
  process.exit(fatal ? 1 : 0);
}

main();
