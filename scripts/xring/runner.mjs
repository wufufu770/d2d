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
 */
export function stripGraphTokenEnv(sentinelDir) {
  const saved = {
    P2P_WORKER_TOKEN: process.env.P2P_WORKER_TOKEN,
    P2P_WORKER_TOKEN_FILE: process.env.P2P_WORKER_TOKEN_FILE,
    P2P_HOST_TOKEN: process.env.P2P_HOST_TOKEN,
  }
  const sentinel = path.join(sentinelDir, '.xring-no-token-sentinel') // 必不存在路径
  delete process.env.P2P_WORKER_TOKEN
  delete process.env.P2P_HOST_TOKEN
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
