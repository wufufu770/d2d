#!/usr/bin/env node
// E13/R-02: manifest fold 的确定性工具——把 gates V-16 检查前移到提交时。
// E12 定谳形态+E14-B 口径修正：头段=git 索引态（write-tree+archive 导出）全 tracked 文件
// （不含 manifest.sha256 自身）的 sha256sum 白名单——逐提交自洽（工作树口径会把未提交的
// 他族改动哈希进中间提交=639c7d8 实证）；尾段=自 "# --- node_modules" marker 起的钉扎
// 注释段原样保留（node_modules 不在 git 索引内，仅由 verify-dsh-version.mjs 本地校验）。
// 用法：
//   node scripts/ops/manifest-regen.mjs --check   仅校验，失配 exit 1（落库工作流的内容笔前置步）
//   node scripts/ops/manifest-regen.mjs --write   重生成头段+保留尾段，写后自校验
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
  // E14-B 修正: 索引态哈希（write-tree+archive 导出）——工作树口径会把未提交的他族改动
  // 哈希进本笔 manifest, 中间提交 V-16 自洽破坏（639c7d8 CI 实证）。索引口径=暂存内容
  // 取新哈希、未暂存文件取 HEAD 哈希: 逐提交自洽, 多族拆批中间提交皆可过 V-16。
  const tree = execFileSync('git', ['write-tree']).toString().trim();
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'manifest-idx-'));
  let head = '';
  try {
    execFileSync('bash', ['-lc', `git archive '${tree}' | tar -x -C '${tmp}'`]);
    const rels = [];
    const walk = (rel) => {
      for (const e of readdirSync(path.join(tmp, rel), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (r === MANIFEST) continue;
        if (e.isDirectory()) walk(r);
        else if (e.isFile()) rels.push(r);
      }
    };
    walk('');
    const absent = files.filter((f) => !rels.includes(f));
    if (absent.length) {
      process.stderr.write(`索引与导出树不一致（异常态, 须人工排查）: ${absent.slice(0, 5).join('、')}\n`);
      process.exit(1);
    }
    // 单次 sha256sum 批量（608 文件量级）; 绝对前缀替换回仓库相对路径
    const raw = execFileSync('sha256sum', rels.map((r) => path.join(tmp, r)), { encoding: 'utf8', cwd: tmp });
    head = raw.split('\n').map((l) => l.replace(`${tmp}/`, '')).join('\n');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  const old = readFileSync(MANIFEST, 'utf8');
  const markerAt = old.indexOf(MARKER);
  const tail = markerAt === -1 ? '' : old.slice(markerAt);
  writeFileSync(MANIFEST, head + tail);
  // 自校验=索引口径: 在新鲜导出树上 -c（磁盘口径在脏树恒败, 无判定意义）
  try {
    const tmp2 = mkdtempSync(path.join(os.tmpdir(), 'manifest-verify-'));
    try {
      execFileSync('bash', ['-lc', `git archive '${execFileSync('git', ['write-tree']).toString().trim()}' | tar -x -C '${tmp2}'`]);
      execFileSync('cp', [MANIFEST, path.join(tmp2, MANIFEST)]);
      execFileSync('sha256sum', ['-c', MANIFEST, '--quiet'], { cwd: tmp2, stdio: ['ignore', 'ignore', 'pipe'] });
    } finally {
      rmSync(tmp2, { recursive: true, force: true });
    }
  } catch (err) {
    process.stderr.write(`写入后自校验失败（异常态，须人工排查）：\n${String(err.stderr ?? err).slice(0, 2000)}\n`);
    process.exit(1);
  }
  console.log(`manifest 重生成：${files.length} 文件头段+尾段钉扎段${markerAt === -1 ? '（无 marker，尾段为空）' : '保留'}，自校验通过`);
  process.exit(0);
}

process.stderr.write('用法: node scripts/ops/manifest-regen.mjs --check | --write\n');
process.exit(2);
