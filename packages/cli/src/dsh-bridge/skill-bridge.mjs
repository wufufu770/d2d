// @wufufu770/d2d-cli - dsh-skill bridge
// Expose d2d skills (built-in + user-defined) to dsh via ctx.skills

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Parse YAML frontmatter from SKILL.md content.
 * Returns { meta, body } where meta is a flat key-value object (lists not supported in v0.2.0).
 */
export function parseFrontmatter(content) {
  if (!content) return { meta: {}, body: '' };
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
    if (m) {
      let v = m[2].trim();
      // Strip surrounding quotes
      if ((v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      meta[m[1]] = v;
    }
  }
  return { meta, body: match[2].trim() };
}

/**
 * Scan a directory for skill subdirs, each with SKILL.md.
 * Returns array of skill metadata + full path to SKILL.md.
 */
export function scanSkillsDir(dir) {
  if (!dir || !existsSync(dir)) return [];
  try {
    const stat = statSync(dir);
    if (!stat.isDirectory()) return [];
  } catch {
    return [];
  }
  const skills = [];
  for (const name of readdirSync(dir)) {
    const skillDir = join(dir, name);
    try {
      const s = statSync(skillDir);
      if (!s.isDirectory()) continue;
    } catch {
      continue;
    }
    const skillFile = join(skillDir, 'SKILL.md');
    if (!existsSync(skillFile)) continue;
    try {
      const content = readFileSync(skillFile, 'utf8');
      const { meta, body } = parseFrontmatter(content);
      skills.push({
        id: name,
        name: meta.name || name,
        description: meta.description || '',
        when_to_use: meta.when_to_use || '',
        category: meta.category || 'general',
        allowed_tools: meta['allowed-tools'] ? meta['allowed-tools'].split(/\s+/).filter(Boolean) : [],
        user_invocable: meta['user-invocable'] !== 'false',
        version: meta.version || '0.0.0',
        prompt: body,
        path: skillFile,
      });
    } catch {
      // skip broken skill
    }
  }
  return skills;
}

/**
 * List all available skills (built-in + user-defined).
 * Built-in dir defaults to <cli>/../../skills/skills (i.e. packages/skills/skills).
 * User dir defaults to $D2D_DATA_DIR/skills.
 */
export function listSkills(opts = {}) {
  const builtinDir = opts.builtinDir || join(__dirname, '..', '..', '..', 'skills', 'skills');
  const dataDir = opts.d2dDataDir || process.env.D2D_DATA_DIR || `${process.env.HOME || '/root'}/.d2d-data`;
  const userDir = opts.userDir || join(dataDir, 'skills');

  const builtin = scanSkillsDir(builtinDir);
  const user = scanSkillsDir(userDir);
  return { builtin, user, all: [...builtin, ...user] };
}

/**
 * Get a single skill by id.
 */
export function getSkill(id, opts = {}) {
  const { all } = listSkills(opts);
  return all.find(s => s.id === id || s.name === id) || null;
}

/**
 * Register all d2d skills into a dsh ctx.skills-like object.
 * The ctx object should have:
 *   ctx.skills.register({ name, description, schema, execute })
 * Returns { registered: number, skills: string[] }
 */
export async function registerSkills(ctx, opts = {}) {
  if (!ctx || !ctx.skills || typeof ctx.skills.register !== 'function') {
    throw new Error('ctx.skills.register is required (dsh-skill-bridge target)');
  }
  const { all } = listSkills(opts);
  let registered = 0;
  const ids = [];
  for (const skill of all) {
    try {
      ctx.skills.register({
        name: skill.id,
        description: skill.description,
        when_to_use: skill.when_to_use,
        category: skill.category,
        version: skill.version,
        allowed_tools: skill.allowed_tools,
        schema: { type: 'object', properties: {} },
        async execute(args) {
          return {
            name: skill.id,
            version: skill.version,
            description: skill.description,
            instructions: skill.prompt,
            params: args,
          };
        },
      });
      registered++;
      ids.push(skill.id);
    } catch (e) {
      // continue registering others
    }
  }
  return { registered, skills: ids };
}

// ===== CLI entry =====
if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] || 'list';
  if (cmd === 'list') {
    const { builtin, user, all } = listSkills();
    console.log(JSON.stringify({ builtin, user, total: all.length }, null, 2));
  } else if (cmd === 'show') {
    const id = process.argv[3];
    const skill = getSkill(id);
    if (!skill) { console.error(`not found: ${id}`); process.exit(1); }
    console.log(JSON.stringify(skill, null, 2));
  } else {
    console.error('usage: skill-bridge.mjs <list|show <id>>');
    process.exit(1);
  }
}
