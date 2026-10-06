#!/usr/bin/env node
// scripts/xring/runner.mjs — X-Ring spawn 接线（XR-P1 族 1）
// 职责: prompt 模板实例化 → adapter.spawnWorker({ring:'xring',task,cwd}) 直调（零 scheduler）。
// 安全形态（拍板 1 定谳的更强落地）: **X-Ring worker env 剥除全部图 token** —— 既有 graphd
// token 分级实测（XR-P1 取证）: worker token 对结构化写面（/write/finding|signal|hypothesis|
// endpoint）可写（I-013 既有设计=scheduler worker 回写通道）, host-only 面 403。
// X-Ring 的"写权归 host 回流管道"由此以 env 剥除达成且强于 graphd 侧拒绝: worker 对 /query
// 与 /write/* 全部 401（图完全不可达, workspace 是其唯一世界——M4 存档隐结构）。
// 记录面外置: xring/<eng>/<run-id>/ 路径不进 worker env（双外置之记录面侧）。
import fs from 'node:fs'
import path from 'node:path'
import { createDshAdapter } from '../../plugin/pentest-dsh/adapter-dsh.mjs'

/** 读 prompt 模板并实例化（{{RUN_ID}}/{{WORKSPACE}} 占位）。extraTask 追加于尾部（smoke 微任务用）。 */
export function renderPrompt(xringDir, { runId, workspace, extraTask = '' }) {
  const tpl = fs.readFileSync(path.join(xringDir, 'prompt.md'), 'utf8')
  let task = tpl.replaceAll('{{RUN_ID}}', runId).replaceAll('{{WORKSPACE}}', workspace)
  if (extraTask) task += `\n\n## 本轮附加任务（宿主注入）\n${extraTask}\n`
  return task
}

/**
 * env 剥除图 token（进程级; 返回 restore）。
 * adapter.spawnWorker 的 env 从 process.env 拷贝: 剥 P2P_WORKER_TOKEN + 把
 * P2P_WORKER_TOKEN_FILE 指到必不存在路径（防 :237 的文件回退读到真 token）。
 * FIX-2 A7(白名单制双层防线之进程级层): 并剥 P2P_HOST_TOKEN_FILE 与全部 P2P_HOST_* —
 * 冷读 A7 实锚: 宿主 env 的 P2P_HOST_TOKEN_FILE 原样穿透, worker 侧 `cat $P2P_HOST_TOKEN_FILE`
 * 一行即得 host token(xring worker 是隔离沙箱里的不可信会话, host 凭据面默认不进 env)。
 * spawn 级第二层=adapter buildWorkerEnv(host 面白名单剥离, 两层语义一致)。
 */
export function stripGraphTokenEnv(sentinelDir) {
  // FIX-2 A7: 全部 P2P_HOST_* 键进 saved 快照(不止已知四键) —— strip 删掉的一切
  // restore 都能还原(replace 语义对未知 host 变量同样闭环)。
  const saved = {
    P2P_WORKER_TOKEN: process.env.P2P_WORKER_TOKEN,
    P2P_WORKER_TOKEN_FILE: process.env.P2P_WORKER_TOKEN_FILE,
  }
  for (const k of Object.keys(process.env)) {
    if (/^P2P_HOST_/i.test(k)) saved[k] = process.env[k]
  }
  const sentinel = path.join(sentinelDir, '.xring-no-token-sentinel') // 必不存在路径
  for (const k of Object.keys(saved)) delete process.env[k]
  process.env.P2P_WORKER_TOKEN_FILE = sentinel
  return () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

/** workspace 创建+权限收紧（worker 同属主可写, 组/其他无权; 记录面由调用方 0700 另建）。 */
export function prepareWorkspace(workspace) {
  fs.mkdirSync(workspace, { recursive: true })
  fs.chmodSync(workspace, 0o750)
  return workspace
}

// ── XR-G1: 发射预建 engagement 上下文（拍板 1 方案 A——图内真实节点, 零门语义改动）──────
// 首跑实证（run-xrp4b-10070540）: xring 直调 spawnWorker 不建立 engagement 上下文 → worker
// 插件门 sched.resolveEngagement() 查无 active engagement → domain/scope.checkBash fail-closed
// 全拦（"OPSEC: 无 engagement 上下文"）——worker 无法触达授权靶场本身。
// 修法对接既有机制（门本体判据零触碰——C5 fail-closed 语义原样）:
//   ①图内 CREATE Engagement（status='active', scope=受控靶）——worker 插件门既有查询直接命中;
//   ②worker env 注入 P2P_ENGAGEMENT（resolveEngagement ①路径精准归属, 多 engagement 环境零歧义;
//     键名不含 KEY/TOKEN/SECRET——dsh env 擦洗不剥, 存活到 worker 会话）;
//   ③leased_by 占位=防 web 调度器 adoptRequested 认领（认领条件=无主|租约过期, 占位租约新鲜
//     →不认领）; 收尾 release 置 frozen+清租约（stopAll 同款终态语义, 不留 active 僵尸）。
// fail-closed 保持=硬约束: 不预建=照旧全拦（首跑形态回归保真）; scope 外目标=照拦（scope 单值
// 白名单+denylist 叠加）; 图不可达=resolveEngagement healthy:false → 门照拦外网命令。
// 审计留痕: 建立/释放事件由调用方落 events.jsonl（append-only）+实录 JSON——与 WRAP-2 人工
// 裁决轨（graphd audit.log）不同轨同纪律（append-only）。
async function _gql(graphdUrl, hostToken, cypher, params) {
  const r = await fetch(`${graphdUrl}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth': hostToken },
    body: JSON.stringify({ cypher, params: params ?? {} }),
    signal: AbortSignal.timeout(10000),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`graphd /query 失败: ${r.status} ${JSON.stringify(j).slice(0, 200)}`)
  return j.rows ?? []
}

/** 发射预建: 图内 active engagement（scope=受控靶）+容量门同责（H12 不旁路——超 cap 抛错由
 * 调用方按 S3 停下处置）。返回 { name, scope }（name=xring-<runId 消毒>, 过 ENG_NAME_RE 白名单）。 */
export async function ensureXRingEngagement({ graphdUrl, hostToken, runId, scope = '127.0.0.1', target = '', objective = '' }) {
  if (!hostToken) throw new Error('hostToken 必填（engagement 建立是 host 授权面操作）')
  const name = `xring-${String(runId ?? '').replace(/[^A-Za-z0-9._-]/g, '')}`.slice(0, 60)
  if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error(`engagement 名白名单外: ${name}`)
  const capRows = await _gql(graphdUrl, hostToken, `MATCH (e:Engagement) WHERE e.status IN ['active','requested'] RETURN count(e) AS c`)
  const cap = Number(capRows[0]?.c ?? 0)
  const maxActive = Number(process.env.P2P_MAX_ACTIVE ?? '4') || 4
  if (cap >= maxActive)
    throw new Error(`active engagements ${cap} >= cap ${maxActive} — xring 发射不挤占容量（H12 同责, 不旁路容量门）, 请先冻结存量或调 P2P_MAX_ACTIVE`)
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const rows = await _gql(graphdUrl, hostToken,
    `CREATE (e:Engagement {name:$n, status:'active', scope:$s, target:$t, objective:$o, instances:1, created_at:$ts, leased_by:$lb, lease_at:$la, cancel:'false'}) RETURN e.name AS n`,
    { n: name, s: scope, t: target, o: objective, ts: now, lb: `xring-${name}`, la: Date.now() })
  if (!rows.length) throw new Error('engagement 建立未返回（graphd 异常）——发射中止')
  return { name: String(rows[0].n ?? name), scope }
}

/** 收尾释放: 冻结+清租约（stopAll 同款终态语义）——xring run 结束不留 active 僵尸。 */
export async function releaseXRingEngagement({ graphdUrl, hostToken, name }) {
  await _gql(graphdUrl, hostToken,
    `MATCH (e:Engagement {name:$n}) SET e.status='frozen', e.cancel='true', e.leased_by='', e.lease_at=0 RETURN e.name AS n`,
    { n: String(name ?? '') })
  return { name: String(name ?? ''), status: 'frozen' }
}

/**
 * 创建 X-Ring runner。
 * opts 透传 createDshAdapter（home/dataDir/dshHome/dshBin/timeoutMs…）。
 * 返回 { start } — start({runId, workspace, extraTask, recordRoot}) → { promise, workspace, task }。
 * 调用方约定: start 前先 stripGraphTokenEnv()（本函数不隐式改进程 env, 测试可单测两半）。
 */
export function createXRingRunner(opts = {}) {
  const adapter = createDshAdapter(opts)
  const xringDir = path.dirname(new URL(import.meta.url).pathname)
  return {
    adapter,
    /** 实例化 prompt 并 spawn。eng=runId（仅 evidence 日志分桶, 无租约语义）。 */
    start({ runId, workspace, extraTask = '', recordRoot }) {
      const task = renderPrompt(xringDir, { runId, workspace, extraTask })
      prepareWorkspace(workspace)
      // 记录面目录创建+收紧（worker env 不含此路径 —— 双外置; 0700 仅宿主监控可入）
      if (recordRoot) {
        fs.mkdirSync(recordRoot, { recursive: true })
        fs.chmodSync(recordRoot, 0o700)
      }
      const promise = adapter.spawnWorker({ ring: 'xring', task, cwd: workspace, eng: runId })
      return { promise, workspace, task }
    },
  }
}

const isDirect = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isDirect) {
  console.error('runner — 由 smoke/编排层调用; 用法见测试与 smoke 实录')
}
