#!/usr/bin/env node
// scripts/xring/validate.mjs — X-Ring 三 Schema 校验器（ajv strict，纯函数导出）
// 语义边界（方案 §6）: 字段完整性与结构合规归 schema；语义正确性归环外 verify。
// strict=true ⇒ 未识别关键字/不安全 schema 直接抛错；additionalProperties:false 全覆盖
// ⇒ 未知字段拒绝（契约封闭面，防 worker 携带任意载荷入回流管道）。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCHEMA_DIR = path.join(HERE, 'schemas')

function loadSchema(name) {
  return JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, name), 'utf8'))
}

const ajv = new Ajv({ strict: true, allErrors: true })
addFormats(ajv)

// 模块级预编译（ajv 同实例按 $id 缓存，重复 compile 同 id 会抛 already exists）
const COMPILED = {}
for (const name of ['hypotheses.schema.json', 'repro_paths.schema.json', 'lessons.schema.json']) {
  COMPILED[name] = ajv.compile(loadSchema(name))
}

/** 校验单份产出文件内容（已 JSON.parse 的对象）。返回 {ok, errors}。 */
export function validateAgainst(schemaName, doc) {
  const v = COMPILED[schemaName]
  if (!v) return { ok: false, errors: [`未知 schema: ${schemaName}`] }
  v.errors = null // ajv 复用实例会累积 errors，校验前重置
  const valid = v(doc)
  return { ok: valid, errors: valid ? [] : (v.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).slice(0, 20) }
}

export const validateHypotheses = (doc) => validateAgainst('hypotheses.schema.json', doc)
export const validateReproPaths = (doc) => validateAgainst('repro_paths.schema.json', doc)
export const validateLessons = (doc) => validateAgainst('lessons.schema.json', doc)

/** 产出文件名 → 校验函数（回流管道用）。未知文件名拒绝。 */
export const VALIDATORS = {
  'hypotheses.json': validateHypotheses,
  'repro_paths.json': validateReproPaths,
  'lessons.json': validateLessons,
}

export function validateFile(filePath) {
  const base = path.basename(filePath)
  const fn = VALIDATORS[base]
  if (!fn) return { ok: false, errors: [`未知产出文件名: ${base}（契约仅 hypotheses/repro_paths/lessons）`] }
  let doc
  try {
    doc = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (e) {
    return { ok: false, errors: [`JSON 解析失败: ${e.message.slice(0, 120)}`] }
  }
  return fn(doc)
}

const isDirect = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isDirect) {
  for (const f of process.argv.slice(2)) {
    const r = validateFile(f)
    console.log(r.ok ? `✓ ${path.basename(f)}` : `✗ ${path.basename(f)}: ${r.errors.join(' | ')}`)
  }
  process.exit(0)
}
