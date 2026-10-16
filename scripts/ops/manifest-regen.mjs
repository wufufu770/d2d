#!/usr/bin/env node
// E13/R-02: manifest fold 的确定性工具——把 gates V-16 检查前移到提交时。
// E12 定谳形态固化：头段=git ls-files 全 tracked 文件（不含 manifest.sha256 自身）的
// sha256sum 白名单；尾段=自 "# --- node_modules" marker 起的钉扎注释段原样保留
// （node_modules 不在 git 索引内，其哈希仅由 verify-dsh-version.mjs 本地校验）。
// 用法：
//   node scripts/ops/manifest-regen.mjs --check   仅校验，失配 exit 1（落库工作流的内容笔前置步）
//   node scripts/ops/manifest-regen.mjs --write   重生成头段+保留尾段，写后自校验
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const MARKER = '# --- node_modules';
const MANIFEST = 'manifest.sha256';
const mode = process.argv[2];

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(repoRoot);

if (mode === '--check') {
  try {
    execFileSync('sha256sum', ['-c', MANIFEST, '--quiet'], { stdio: ['ignore', 'ignore', 'pipe'] });
    console.log('manifest OK（全 tracked 文件哈希白名单校验通过）');
    process.exit(0);
  } catch (err) {
    const detail = String(err.stderr ?? err.stdout ?? err);
    process.stderr.write(`manifest 失配（须 --write 后随 regen 笔）：\n${detail.slice(0, 2000)}\n`);
    process.exit(1);
  }
}

if (mode === '--write') {
  const files = execFileSync('git', ['ls-files', '-z'])
    .toString()
    .split('\0')
    .filter(Boolean)
    .filter((f) => f !== MANIFEST);
  // 参数量级 ~600，远低于 ARG_MAX；git ls-files 输出即索引字节序，逐字节确定
  const head = execFileSync('sha256sum', files, { encoding: 'utf8' });
  const old = readFileSync(MANIFEST, 'utf8');
  const markerAt = old.indexOf(MARKER);
  const tail = markerAt === -1 ? '' : old.slice(markerAt);
  writeFileSync(MANIFEST, head + tail);
  try {
    execFileSync('sha256sum', ['-c', MANIFEST, '--quiet'], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (err) {
    process.stderr.write(`写入后自校验失败（异常态，须人工排查）：\n${String(err.stderr ?? err).slice(0, 2000)}\n`);
    process.exit(1);
  }
  console.log(`manifest 重生成：${files.length} 文件头段+尾段钉扎段${markerAt === -1 ? '（无 marker，尾段为空）' : '保留'}，自校验通过`);
  process.exit(0);
}

process.stderr.write('用法: node scripts/ops/manifest-regen.mjs --check | --write\n');
process.exit(2);
