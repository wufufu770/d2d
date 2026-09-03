// @wufufu770/d2d-skills test
import { test } from 'node:test';
import assert from 'node:assert';
import {
  loadSkill, loadAllSkills, selectSkills, validateSkillMeta,
} from '../src/loader.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_ROOT = path.join(__dirname, '..', 'skills');

test('5 starter skills load successfully', () => {
  const skills = loadAllSkills(SKILLS_ROOT);
  assert.equal(skills.length, 5, `expected 5 skills, got ${skills.length}`);
});

test('each skill has required frontmatter fields', () => {
  const skills = loadAllSkills(SKILLS_ROOT);
  for (const skill of skills) {
    assert.ok(skill.meta.name, `${skill.id} missing name`);
    assert.ok(skill.meta.version, `${skill.id} missing version`);
    assert.ok(skill.meta.description, `${skill.id} missing description`);
    assert.ok(skill.meta.when_to_use, `${skill.id} missing when_to_use`);
  }
});

test('skill name matches directory name', () => {
  const skills = loadAllSkills(SKILLS_ROOT);
  for (const skill of skills) {
    assert.equal(skill.id, path.basename(skill.dir), `skill id ${skill.id} != dir ${skill.dir}`);
  }
});

test('description is <= 200 chars', () => {
  const skills = loadAllSkills(SKILLS_ROOT);
  for (const skill of skills) {
    assert.ok(skill.meta.description.length <= 200,
              `${skill.id} description too long: ${skill.meta.description.length}`);
  }
});

test('loadSkill throws for missing SKILL.md', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-skill-'));
  try {
    assert.throws(() => loadSkill(tmp), /SKILL.md not found/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadSkill throws for missing frontmatter', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-skill-'));
  fs.writeFileSync(path.join(tmp, 'SKILL.md'), '# no frontmatter\n\nbody');
  try {
    assert.throws(() => loadSkill(tmp), /No YAML frontmatter/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadSkill throws for name mismatch', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-skill-'));
  fs.writeFileSync(path.join(tmp, 'SKILL.md'),
    '---\nname: different-name\nversion: 0.1.0\ndescription: x\nwhen_to_use: x\n---\nbody');
  try {
    assert.throws(() => loadSkill(tmp), /must match directory name/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('selectSkills returns ranked matches', () => {
  const skills = loadAllSkills(SKILLS_ROOT);
  const results = selectSkills('sql injection', skills);
  assert.ok(results.length > 0, 'should find at least one match');
  // sqli-detector should rank high
  const sqli = results.find(r => r.skill === 'sqli-detector');
  assert.ok(sqli, 'sqli-detector should match "sql injection"');
});

test('selectSkills returns empty for no match', () => {
  const skills = loadAllSkills(SKILLS_ROOT);
  const results = selectSkills('completely-unrelated-quantum-computing', skills);
  assert.equal(results.length, 0);
});

test('pentest skill is always loadable (core methodology)', () => {
  const pentest = loadSkill(path.join(SKILLS_ROOT, 'pentest'));
  assert.equal(pentest.id, 'pentest');
  assert.match(pentest.prompt, /七问|seven-question|7-question/i);
});

test('all 5 skills have non-empty prompt', () => {
  const skills = loadAllSkills(SKILLS_ROOT);
  for (const skill of skills) {
    assert.ok(skill.prompt.length > 100, `${skill.id} prompt too short: ${skill.prompt.length}`);
  }
});
