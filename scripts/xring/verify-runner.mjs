#!/usr/bin/env node
// scripts/xring/verify-runner.mjs — A 级工件独立重放执行器（XR-P4 族 1 真执行器形态）
// 接口: verify(artifact) → { verdict: 'pass'|'fail'|'manual', evidence, failureClass? }
//
// **R9 reward-hacking 规避声明**: 本模块是【重放器不是裁判】——零 LLM-judge 零自主性。
// 判定 = 种子工件里人写的 expected 与受控靶 observed 的机械包含比对; 对内容质量的任何
// 判断都在环外（人工/主流程）。执行器不评估"漏洞是否真实"，只回答"声明的复现步骤在
// 受控靶上是否逐步复现出声明的期望特征"。
//
// **目标面硬边界**: 仅 targetBase（受控靶）。步骤出现绝对 URL / 非 '/' 开头路径 = manual
// 旗标留验（靶外尝试不执行——这是执行器硬边界，不是可配置项）；redirect 不跟随。
//
// 步骤语法（种子工件 steps 字符串数组, 逐行机械解释, 不猜）:
//   "METHOD /path?query"    → 向 targetBase 发该请求（method 白名单; 记录 status+body）
//   "POST /path --data <串>" → XR-G4: 带固定值载荷的请求（--data 后整段为载荷字面量; 载荷
//                              以 '{' 开头按 application/json 发, 否则表单编码——E11a#2:
//                              JSON API 靶场登录链的实弹修正）
//   "AUTH <loginPath> <credRef> <tokenExtract>" → E11a#2: 登录原语——POST loginPath
//                              （JSON body 字段取凭据实体）, 按 tokenExtract 提取 Bearer
//                              token 入进程内存 session, 后续请求自动注入 Authorization。
//                              凭据经 credRef 间接引用 ~/.d2d-data/creds/<eng>.env
//                              （CRED_<REF>_USER/_PASS/_USERFIELD/_PASSFIELD）; 凭据值
//                              零落盘零日志零 evidence 回显。提取失败（非 2XX/路径
//                              miss/空值）= 整单转 manual 且 failureClass='auth-failure'
//                              （不降级为无 token 继续跑——半链验证是伪验证）。
//   "EXPECT <substring>"    → 机械断言: 上一响应体含子串
//   其他任何形态             → 歧义 → 整单 manual 留验（诚实形态）
//
// XR-G4 会话态表达（拍板 1）: cookie jar（内存 Map, 生命周期=verify 调用=reflow=
// engagement run——不落盘不跨 run）; Set-Cookie 入 jar 随后续请求回放。载荷为固定值
// 重放（无变量无提取——参数化重构造被拍板排除）。表达力≠容忍度（原则 1）: 扩的是可
// 机械表达的动作空间; 判定逻辑与判据零改动。
// 网络动作 scope 绑定（原则 3）: 全部请求 URL=base.origin+相对路径, base=targetBase 由
// 调用方（reflow）绑定 engagement scope——相对路径硬边界保证重放动作永不触达靶集外。
// XR-G7 pass 判定分层（原则 2）: baseline GET 效应依赖探测, effectPreExisted 进
// evidence——verdict 本身不改（分层是标注不是否决）。
//
// E11a#1 TLS 分层: artifact.env.tls {mode:'insecure'|'ca', caPath} 消费——https 请求
// 走 node:https 直连路径（insecure=rejectUnauthorized:false; ca=注入目标专属 CA）,
// **零全局 env 污染**（不设 NODE_TLS_REJECT_UNAUTHORIZED——同进程其他 fetch 不受影响;
// fetchImpl 主路径逐字节保持）。mode 非法/缺省(null)=严格校验照旧; caPath 不可读=整单
// manual。scope 门零触碰: TLS 层只解决证书信任, 可达性判定仍归 engagement scope。
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import http from 'node:http'

const expandHome = (p) => String(p ?? '').replace(/^~(?=\/|$)/, os.homedir())
import os from 'node:os'

/** E11a#1: 自签/CA 通道的原始 https(s) 请求（Response-like 最小面: status/text/getSetCookie）。 */
function rawRequest(urlStr, { method, headers = {}, body, tls, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    const mod = u.protocol === 'https:' ? https : http
    const opts = {
      method,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      headers,
    }
    if (u.protocol === 'https:' && tls?.mode === 'insecure') opts.rejectUnauthorized = false
    if (u.protocol === 'https:' && tls?.mode === 'ca') {
      try { opts.ca = fs.readFileSync(expandHome(tls.caPath), 'utf8') } catch (e) { return reject(new Error(`caPath 不可读: ${String(e?.message ?? e).slice(0, 80)}`)) }
    }
    const req = mod.request(opts, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const b = Buffer.concat(chunks).toString('utf8')
        const setc = res.headers['set-cookie'] ?? []
        resolve({ status: res.statusCode, text: async () => b, headers: { getSetCookie: () => setc }, ok: res.statusCode >= 200 && res.statusCode < 300 })
      })
    })
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timeout ${timeoutMs}ms`)))
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}

/** E11a#2: dot 路径提取（"$.data.token"/"data.token" 同形）; 命中非空字符串才返回。 */
function extractDot(obj, dotPath) {
  let cur = obj
  for (const k of String(dotPath).replace(/^\$\.?/, '').split('.')) {
    if (cur == null) return null
    cur = cur[k]
  }
  return typeof cur === 'string' && cur.length ? cur : null
}

/** E11a#2: 凭据实体读取（~/.d2d-data/creds/<eng>.env; KEY=VALUE）。缺键=返回 null。 */
function loadCreds(credsDir, eng, credRef) {
  if (!eng || !credRef) return null
  let txt
  try { txt = fs.readFileSync(path.join(credsDir, `${eng}.env`), 'utf8') } catch { return null }
  const kv = {}
  for (const line of txt.split('\n')) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim())
    if (m) kv[m[1]] = m[2]
  }
  const R = credRef.toUpperCase().replace(/[^A-Za-z0-9]/g, '_')
  const user = kv[`CRED_${R}_USER`]
  const pass = kv[`CRED_${R}_PASS`]
  if (!user || !pass) return null
  return { user, pass, userField: kv[`CRED_${R}_USERFIELD`] ?? 'username', passField: kv[`CRED_${R}_PASSFIELD`] ?? 'password' }
}

export function createVerifyRunner({ replay = null, targetBase = '', fetchImpl = fetch, timeoutMs = 8000, eng = '', credsDir = null } = {}) {
  return {
    /** replay: async (artifact) => { ok: bool, evidence } — 注入点（测试/外部执行器）。 */
    async verify(artifact) {
      if (typeof replay === 'function') {
        try {
          const r = await replay(artifact)
          return { verdict: r?.ok ? 'pass' : 'fail', evidence: String(r?.evidence ?? '') }
        } catch (e) {
          return { verdict: 'fail', evidence: `replay threw: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      }
      return replayHttp(artifact, { targetBase, fetchImpl, timeoutMs, eng, credsDir: credsDir ?? path.join(os.homedir(), '.d2d-data', 'creds') })
    },
  }
}

/** 纯 HTTP 重放（缺省执行器）。歧义/越界一律 manual 留验——宁留验不猜（拍板 4）。 */
async function replayHttp(artifact, { targetBase, fetchImpl = fetch, timeoutMs = 8000, eng = '', credsDir }) {
  const steps = Array.isArray(artifact?.steps) ? artifact.steps.map((s) => String(s)) : null
  if (!steps || steps.length === 0) return { verdict: 'manual', evidence: 'steps 缺或空——无重放脚本, 留人工验收' }
  let base
  try {
    base = new URL(targetBase)
    if (base.protocol !== 'http:' && base.protocol !== 'https:') throw new Error('protocol')
  } catch {
    return { verdict: 'manual', evidence: `targetBase 非法（${String(targetBase).slice(0, 60)}）——留人工验收` }
  }
  // E11a#1: env.tls 分层（mode 白名单外=整单 manual——契约封闭面; 缺省 null=严格照旧）
  let tls = null
  const tlsRaw = artifact?.env?.tls
  if (tlsRaw !== undefined && tlsRaw !== null) {
    if (typeof tlsRaw !== 'object' || !['insecure', 'ca'].includes(tlsRaw.mode))
      return { verdict: 'manual', evidence: `env.tls.mode 非法（${JSON.stringify(tlsRaw).slice(0, 60)}）——白名单 insecure|ca, 留人工验收` }
    if (tlsRaw.mode === 'ca' && !tlsRaw.caPath)
      return { verdict: 'manual', evidence: 'env.tls.mode=ca 但缺 caPath——留人工验收' }
    tls = tlsRaw
  }
  // XR-G4: cookie jar（内存, verify 调用生命周期=engagement run 绑定——不落盘）
  const cookieJar = new Map()
  const cookieHeader = () => [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  const absorbSetCookie = (res) => {
    const sc = res.headers?.getSetCookie?.() ?? []
    for (const line of sc) {
      const [pair] = String(line).split(';')
      const eq = pair.indexOf('=')
      if (eq > 0) cookieJar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
    }
  }
  // E11a#2: token session（进程内存——零落盘零日志零 evidence 回显）
  const session = { token: null }
  const request = async (method, fullPath, body) => {
    const headers = {}
    if (cookieJar.size) headers.cookie = cookieHeader()
    if (session.token) headers.authorization = `Bearer ${session.token}`
    if (body !== undefined) {
      headers['content-type'] = String(body).trimStart().startsWith('{') ? 'application/json' : 'application/x-www-form-urlencoded'
      headers['content-length'] = String(Buffer.byteLength(body))
    }
    const url = base.origin + fullPath
    if (tls && url.startsWith('https:')) return rawRequest(url, { method, headers, body, tls, timeoutMs })
    return fetchImpl(url, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) })
  }
  const evidenceParts = []
  let lastBody = null
  const statuses = []
  // XR-G7 分层: 每个 EXPECT 断言的请求路径先做 baseline GET（重放前——效应/预置探测）
  const expectPaths = []
  for (const raw of steps) {
    const m = /^(GET|POST|PUT|DELETE|HEAD|OPTIONS)\s+(?!.*--data)(\S+)/.exec(raw.trim())
    if (m) expectPaths.push({ path: m[2], method: m[1] })
  }
  const finalExpectPath = [...expectPaths].reverse().find((p) => p.method === 'GET')?.path ?? null
  let effectPreExisted = null
  if (finalExpectPath) {
    try {
      const pre = await request('GET', finalExpectPath)
      const preBody = await pre.text().catch(() => '')
      effectPreExisted = { path: finalExpectPath, status: pre.status, probed: true }
      evidenceParts.push(`baseline GET ${finalExpectPath.slice(0, 40)}→${pre.status}(${preBody.length}B)`)
    } catch (e) {
      effectPreExisted = { path: finalExpectPath, probed: false, err: String(e?.message ?? e).slice(0, 80) }
    }
  }
  const expectNeedlesByOrder = steps.map((s) => (s.trim().startsWith('EXPECT ') ? s.trim().slice(7) : null)).filter((x) => x !== null)
  let expectIndex = -1
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i].trim()
    if (step.startsWith('EXPECT ')) {
      if (lastBody === null) return { verdict: 'manual', evidence: `步骤 ${i}: EXPECT 先于任何请求（歧义序）——留人工验收` }
      const needle = step.slice('EXPECT '.length)
      if (!lastBody.includes(needle)) {
        const preTag = effectPreExisted?.probed && lastBody.length === 0 ? '（认证墙/空响应——XR-G4 会话态边界如实记录）' : ''
        return { verdict: 'fail', evidence: `步骤 ${i}: 期望特征未复现——EXPECT "${needle.slice(0, 80)}" 不在响应体（${lastBody.length}B, statuses=${statuses.join(',')})${preTag}` }
      }
      evidenceParts.push(`EXPECT✓(${needle.length}B needle)`)
      expectIndex++
      continue
    }
    // E11a#2: AUTH 登录原语（credRef 间接引用凭据实体——凭据值零出现在 steps/evidence）
    if (step.startsWith('AUTH ')) {
      const am = /^AUTH\s+(\S+)\s+(\S+)\s+(\S+)$/.exec(step)
      if (!am) return { verdict: 'manual', failureClass: 'auth-failure', evidence: `步骤 ${i}: AUTH 形态不可解析（"AUTH <loginPath> <credRef> <tokenExtract>"）——留人工验收` }
      const [, loginPath, credRef, tokenExtract] = am
      if (!loginPath.startsWith('/')) return { verdict: 'manual', failureClass: 'auth-failure', evidence: `步骤 ${i}: AUTH loginPath 非相对路径——目标面硬边界, 留人工验收` }
      const creds = loadCreds(credsDir, eng, credRef)
      if (!creds) return { verdict: 'manual', failureClass: 'auth-failure', evidence: `步骤 ${i}: 凭据引用 "${credRef}" 在 creds 实体（eng=${eng || '(空)'}）中缺文件或缺键——留人工验收` }
      const body = JSON.stringify({ [creds.userField]: creds.user, [creds.passField]: creds.pass })
      let res
      try { res = await request('POST', loginPath, body) } catch (e) {
        return { verdict: 'manual', failureClass: 'auth-failure', evidence: `步骤 ${i}: 登录请求失败（${String(e?.message ?? e).slice(0, 120)}）——AUTH 链整单转人工` }
      }
      const respBody = await res.text().catch(() => '')
      absorbSetCookie(res)
      statuses.push(res.status)
      let token = null
      try { token = extractDot(JSON.parse(respBody), tokenExtract) } catch { token = null }
      if (!res.ok || !token) {
        return { verdict: 'manual', failureClass: 'auth-failure', evidence: `步骤 ${i}: 登录 status=${res.status} 但 token 提取失败（${tokenExtract} 路径 miss 或空）——AUTH 链整单转人工, 不降级` }
      }
      session.token = token
      lastBody = respBody
      evidenceParts.push(`AUTH✓(login ${res.status}, token 入会话)`)
      continue
    }
    // XR-G4: --data 载荷形态（固定值重放——载荷字面量原样发, 无变量无提取）
    const dm = /^(GET|POST|PUT|DELETE|HEAD|OPTIONS)\s+(\S+)\s+--data\s+(.+)$/.exec(step)
    let m = null, body
    if (dm) { m = dm; body = dm[3] }
    else {
      m = /^(GET|POST|PUT|DELETE|HEAD|OPTIONS)\s+(\S+)$/.exec(step)
      if (!m) return { verdict: 'manual', evidence: `步骤 ${i}: 不可解析形态（"${step.slice(0, 60)}"）——歧义留人工验收` }
    }
    const pathPart = m[2]
    if (!pathPart.startsWith('/')) {
      return { verdict: 'manual', evidence: `步骤 ${i}: 非相对路径（"${pathPart.slice(0, 60)}"）——目标面硬边界, 靶外尝试不执行, 留人工验收` }
    }
    let res
    try {
      res = await request(m[1], pathPart, body)
    } catch (e) {
      return { verdict: 'fail', evidence: `步骤 ${i}: 请求失败（${String(e?.message ?? e).slice(0, 120)}）——受控靶不可达或步骤不可复现` }
    }
    absorbSetCookie(res)
    statuses.push(res.status)
    lastBody = await res.text().catch(() => '')
    evidenceParts.push(`${m[1]} ${pathPart.slice(0, 40)}${body !== undefined ? '(--data)' : ''}→${res.status}`)
  }
  if (!evidenceParts.some((p) => p.startsWith('EXPECT'))) {
    return { verdict: 'manual', evidence: '无 EXPECT 断言——无判据即无重放判定, 留人工验收' }
  }
  // XR-G7 分层标注（原则 2: 证据链存在语义 pass + 独立复现语义另行标注——verdict 本身不改）
  const layered = expectIndex >= 0 && expectNeedlesByOrder.length > 0 && effectPreExisted?.probed
    ? '; XR-G7 分层: 独立复现语义未证（baseline 探测留痕见请求链——效应依赖/预置嫌疑时判定权打折, 人工面终裁）'
    : ''
  // XR-G4 顺手: 请求链逐条进 evidence（既有 evidenceParts 只进计数不进内容——与 fail 侧信息量对齐）
  return { verdict: 'pass', evidence: `重放通过: ${steps.length} 步/${statuses.length} 请求 + ${evidenceParts.filter((p) => p.startsWith('EXPECT')).length} 断言 | ${evidenceParts.join(' ; ')}${layered}` }
}
