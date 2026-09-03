// @wufufu770/d2d-skills - SKILL.md loader + validator + registry
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

// Simple YAML-ish frontmatter parser (key: value, basic types)
function parseFrontmatter(yaml) {
  const result = {};
  const lines = yaml.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) { i++; continue; }
    const [, key, valueRaw] = m;
    let value = valueRaw.trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // Lists (next line starts with -)
    if (value === '' && i + 1 < lines.length && lines[i + 1].match(/^\s+-/)) {
      const items = [];
      i++;
      while (i < lines.length && lines[i].match(/^\s+-/)) {
        items.push(lines[i].replace(/^\s+-\s*/, '').trim());
        i++;
      }
      result[key] = items;
      continue;
    }
    // Booleans
    if (value === 'true') { result[key] = true; i++; continue; }
    if (value === 'false') { result[key] = false; i++; continue; }
    // Numbers
    if (/^\d+$/.test(value)) { result[key] = parseInt(value, 10); i++; continue; }
    result[key] = value;
    i++;
  }
  return result;
}

// ===== Validator =====
export function validateSkillMeta(meta, skillDir) {
  const dirName = path.basename(skillDir);
  const required = ['name', 'version', 'description', 'when_to_use'];
  const errors = [];
  for (const k of required) {
    if (!meta[k]) errors.push(`missing required field: ${k}`);
  }
  if (meta.name && meta.name !== dirName) {
    errors.push(`skill name '${meta.name}' must match directory name '${dirName}'`);
  }
  if (meta.description && meta.description.length > 200) {
    errors.push(`description too long (${meta.description.length} > 200)`);
  }
  return errors;
}

// ===== Loader =====
export function loadSkill(skillDir) {
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (!existsSync(skillMdPath)) {
    throw new Error(`SKILL.md not found in ${skillDir}`);
  }
  const raw = readFileSync(skillMdPath, 'utf8');
  const m = raw.match(FRONTMATTER_RE);
  if (!m) {
    throw new Error(`No YAML frontmatter in ${skillMdPath}`);
  }
  const meta = parseFrontmatter(m[1]);
  const prompt = m[2].trim();
  const errors = validateSkillMeta(meta, skillDir);
  if (errors.length > 0) {
    throw new Error(`invalid skill ${meta.name || '?'}: ${errors.join('; ')}`);
  }
  return {
    id: meta.name,
    version: meta.version,
    meta,
    prompt,
    dir: skillDir,
  };
}

export function loadAllSkills(skillsRoot) {
  if (!existsSync(skillsRoot)) return [];
  const skills = [];
  for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    try {
      skills.push(loadSkill(path.join(skillsRoot, entry.name)));
    } catch (err) {
      // skip broken skills, log warning
      if (typeof process !== 'undefined' && process.stderr) {
        process.stderr.write(`[d2d-skills] skip ${entry.name}: ${err.message}\n`);
      }
    }
  }
  return skills;
}

// ===== Selector (v0.2.0: simple version-match) =====
export function selectSkills(target, allSkills, opts = {}) {
  const limit = opts.limit || 5;
  const matches = [];
  const targetLower = String(target || '').toLowerCase();
  for (const skill of allSkills) {
    const trigger = (skill.meta.when_to_use || '').toLowerCase();
    const desc = (skill.meta.description || '').toLowerCase();
    let score = 0;
    if (trigger.includes(targetLower) || desc.includes(targetLower)) score += 2;
    if (targetLower.includes(skill.id)) score += 3;
    if (score > 0) matches.push({ skill: skill.id, score });
  }
  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}
