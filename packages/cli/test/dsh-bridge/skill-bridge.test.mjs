// @wufufu770/d2d-cli test - dsh-skill bridge
import { test } from 'node:test';
import assert from 'node:assert';
import { listSkills, getSkill, registerSkills, scanSkillsDir, parseFrontmatter } from '../../src/dsh-bridge/skill-bridge.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('parseFrontmatter: simple key-value', () => {
  const r = parseFrontmatter('---\nname: foo\nversion: 1.0\n---\nbody');
  assert.equal(r.meta.name, 'foo');
  assert.equal(r.meta.version, '1.0');
  assert.equal(r.body, 'body');
});

test('parseFrontmatter: no frontmatter', () => {
  const r = parseFrontmatter('just body');
  assert.deepEqual(r.meta, {});
  assert.equal(r.body, 'just body');
});

test('parseFrontmatter: empty', () => {
  const r = parseFrontmatter('');
  assert.deepEqual(r.meta, {});
  assert.equal(r.body, '');
});

test('parseFrontmatter: quoted values', () => {
  const r = parseFrontmatter('---\ntitle: "My Skill"\ndesc: \'x y\'\n---\nbody');
  assert.equal(r.meta.title, 'My Skill');
  assert.equal(r.meta.desc, 'x y');
});

test('scanSkillsDir: missing dir returns []', () => {
  const r = scanSkillsDir('/nonexistent/path');
  assert.deepEqual(r, []);
});

test('scanSkillsDir: empty dir returns []', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-skills-'));
  try {
    const r = scanSkillsDir(tmp);
    assert.deepEqual(r, []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('scanSkillsDir: parses all valid skills', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-skills-'));
  try {
    // Create 3 skills
    for (const name of ['foo', 'bar', 'baz']) {
      const dir = path.join(tmp, name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'SKILL.md'),
        `---\nname: ${name}\nversion: 1.0.0\ndescription: ${name} skill\nwhen_to_use: always\n---\nbody for ${name}`);
    }
    // Create invalid dir (no SKILL.md)
    fs.mkdirSync(path.join(tmp, 'broken'), { recursive: true });

    const r = scanSkillsDir(tmp);
    assert.equal(r.length, 3, 'should find 3 valid skills, skip broken');
    assert.ok(r.find(s => s.id === 'foo'));
    assert.ok(r.find(s => s.id === 'bar'));
    assert.ok(r.find(s => s.id === 'baz'));
    assert.equal(r[0].path.endsWith('SKILL.md'), true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('listSkills: returns builtin from default path', () => {
  // The default builtin path is packages/skills/skills
  const r = listSkills();
  // We restored 5 skills in this branch
  assert.ok(r.builtin.length >= 5, `expected >=5 builtin, got ${r.builtin.length}`);
  assert.ok(r.builtin.find(s => s.id === 'pentest'));
  assert.ok(r.builtin.find(s => s.id === 'sqli-detector'));
});

test('listSkills: returns user skills from custom dir', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-user-'));
  try {
    const userDir = path.join(tmp, 'skills');
    fs.mkdirSync(path.join(userDir, 'my-custom-skill'), { recursive: true });
    fs.writeFileSync(path.join(userDir, 'my-custom-skill', 'SKILL.md'),
      '---\nname: my-custom-skill\nversion: 0.1.0\ndescription: user\n---\nuser body');

    const r = listSkills({ userDir });
    assert.ok(r.user.find(s => s.id === 'my-custom-skill'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('listSkills: builtin + user combined', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-user-'));
  try {
    const userDir = path.join(tmp, 'skills');
    fs.mkdirSync(path.join(userDir, 'custom'), { recursive: true });
    fs.writeFileSync(path.join(userDir, 'custom', 'SKILL.md'),
      '---\nname: custom\n---\nbody');

    const r = listSkills({ userDir });
    assert.equal(r.all.length, r.builtin.length + r.user.length);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('listSkills: graceful on missing user dir', () => {
  const r = listSkills({ userDir: '/nonexistent/path' });
  // Should not throw
  assert.equal(r.user.length, 0);
  assert.ok(r.builtin.length >= 5);
});

test('getSkill: by id', () => {
  const r = getSkill('pentest');
  assert.ok(r);
  assert.equal(r.id, 'pentest');
  assert.match(r.prompt, /七问|pentest/i);
});

test('getSkill: not found', () => {
  const r = getSkill('nonexistent-skill-xyz');
  assert.equal(r, null);
});

test('registerSkills: injects into mock ctx', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-bridge-'));
  try {
    const userDir = path.join(tmp, 'skills');
    fs.mkdirSync(path.join(userDir, 'test-skill'), { recursive: true });
    fs.writeFileSync(path.join(userDir, 'test-skill', 'SKILL.md'),
      '---\nname: test-skill\nversion: 1.0.0\ndescription: for testing\nwhen_to_use: tests\n---\ndo tests');

    const registered = [];
    const ctx = {
      skills: {
        register: (def) => registered.push(def),
      },
    };

    const result = await registerSkills(ctx, { userDir });
    assert.ok(result.registered >= 6);  // 5 builtin + 1 test
    assert.ok(registered.length >= 6);
    assert.ok(registered.find(r => r.name === 'test-skill'));
    assert.ok(registered.find(r => r.name === 'pentest'));
    // Check schema + execute
    const test = registered.find(r => r.name === 'test-skill');
    assert.deepEqual(test.schema, { type: 'object', properties: {} });
    assert.equal(typeof test.execute, 'function');
    const out = await test.execute({ foo: 'bar' });
    assert.equal(out.name, 'test-skill');
    assert.equal(out.version, '1.0.0');
    assert.match(out.instructions, /do tests/);
    assert.deepEqual(out.params, { foo: 'bar' });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('registerSkills: throws if ctx missing', async () => {
  await assert.rejects(async () => {
    await registerSkills(null);
  }, /ctx\.skills\.register is required/);
});

test('registerSkills: continues on per-skill failure', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-bridge-'));
  try {
    const userDir = path.join(tmp, 'skills');
    fs.mkdirSync(userDir, { recursive: true });

    // Mock a skill that throws on register
    const registered = [];
    const failed = [];
    const ctx = {
      skills: {
        register: (def) => {
          if (def.name === 'pentest') {
            failed.push(def.name);
            throw new Error('simulated failure');
          }
          registered.push(def);
        },
      },
    };

    // Need to mock listSkills to return only pentest + one other
    const { listSkills } = await import('../../src/dsh-bridge/skill-bridge.mjs');
    const origList = listSkills;

    // The test can't easily inject a different listSkills, but verify that
    // registerSkills() returns a positive registered count even with one failure
    const result = await registerSkills(ctx, { userDir });
    // pentest fails (mocked), but others succeed
    assert.ok(result.registered > 0);
    assert.ok(registered.length > 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('5 builtin skills have required fields', () => {
  const { builtin } = listSkills();
  const ids = ['pentest', 'sqli-detector', 'ssrf-hunter', 'xss-detect', 'auth-bypass-finder'];
  for (const id of ids) {
    const s = builtin.find(x => x.id === id);
    assert.ok(s, `missing builtin skill: ${id}`);
    assert.ok(s.description, `${id} missing description`);
    assert.ok(s.when_to_use, `${id} missing when_to_use`);
    assert.ok(s.prompt.length > 50, `${id} prompt too short`);
  }
});
