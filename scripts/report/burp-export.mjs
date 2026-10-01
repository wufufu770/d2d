// burp-export.mjs — T3-2-3 Burp findings 导出(拍板 3: 只做导出格式, 不做实时代理桥)
// 格式结论(审计项 3): **通用 XML(降级路径)** — Burp 可导入 reporting XML 的公共 schema 形态
//   (issue/name/severity/host/path/issueDetail 等字段, 社区解析器通用), 本机无 Burp 无法实测
//   导入 → 按止损规则登记开放项(Burp 实导入验证待有环境时)。字段映射: d2d Finding{title,
//   severity, evidence, repro, gate_status} → issue{name, severity, issueDetail, path, host}。
// 安全纪律(Mimosa 约束): 生成的 XML **零 DOCTYPE/零 ENTITY**(外部消费侧拒解析并防 XXE 复装);
//   findings 全字段经 xmlEscape 转义(外部数据进结构前消毒 — 6-5 同款哲学)。
// 用法: node scripts/report/burp-export.mjs [--graph 8766] [--out <文件>] [--status verified|all]
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'

const _gi = process.argv.indexOf('--graph')
const GRAPH = _gi > -1 ? `http://127.0.0.1:${process.argv[_gi + 1] || '8766'}` : 'http://127.0.0.1:8766'
const oi = process.argv.indexOf('--out')
const OUT = oi > -1 ? process.argv[oi + 1] : `${os.homedir()}/.d2d-data/export/burp-findings-${Date.now()}.xml`
const ONLY_VERIFIED = !process.argv.includes('--all')
const SEV_MAP = { critical: 'High', high: 'High', medium: 'Medium', low: 'Low', info: 'Information' }

/** XML 转义(结构消毒: 五实体全覆盖; 生成侧唯一入口) */
export function xmlEscape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    // 剔除 XML 非法控制字符(0x00-0x08/0x0B/0x0C/0x0E-0x1F) — 防"合法转义后仍非法文档"
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
}

function gq(cy) {
  const token = fs.readFileSync(`${os.homedir()}/.config/d2d/host-token`, 'utf8').trim()
  const res = execFileSync('curl', ['-s', '-m', '10', '-X', 'POST', `${GRAPH}/query`,
    '-H', 'Content-Type: application/json', '-H', `X-Auth: ${token}`, '-d', JSON.stringify({ cypher: cy })], { encoding: 'utf8' })
  return JSON.parse(res).rows ?? []
}

const rows = gq(`MATCH (f:Finding) RETURN f.id AS id, f.title AS title, f.severity AS severity, f.url AS url, f.evidence AS evidence, f.gate_status AS gate ORDER BY f.id LIMIT 500`)
const picked = ONLY_VERIFIED ? rows.filter((r) => String(r.gate ?? '') === 'verified') : rows

const issueXml = (r) => {
  const sev = SEV_MAP[String(r.severity ?? '').toLowerCase()] ?? 'Information'
  const host = String(r.url ?? '').replace(/^[a-z]+:\/\//i, '').split('/')[0] || '(unknown)'
  return [
    '  <issue>',
    `    <name>${xmlEscape(r.title)}</name>`,
    `    <severity>${xmlEscape(sev)}</severity>`,
    `    <confidence>${xmlEscape(String(r.gate) === 'verified' ? 'Certain' : 'Tentative')}</confidence>`,
    `    <host>${xmlEscape(host)}</host>`,
    `    <path>${xmlEscape(String(r.url ?? ''))}</path>`,
    `    <issueDetail>${xmlEscape(`[d2d ${r.id} gate=${r.gate}] ${r.evidence}`)}</issueDetail>`,
    '  </issue>',
  ].join('\n')
}
const doc = ['<?xml version="1.0" encoding="UTF-8"?>', '<issues>', ...picked.map(issueXml), '</issues>', ''].join('\n')

fs.mkdirSync(OUT.replace(/[/\\][^/\\]+$/, ''), { recursive: true })
fs.writeFileSync(OUT, doc)
console.log(`✅ Burp 形态 XML 导出: ${picked.length}/${rows.length} 条(${ONLY_VERIFIED ? '仅 verified, --all 全量' : '全量'}) → ${OUT}`)
console.log('注: 通用 XML(降级路径) — Burp 实导入验证登记开放项; 零 DOCTYPE/零 ENTITY(结构消毒)。')
