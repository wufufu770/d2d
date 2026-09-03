// @wufufu770/d2d-cli test - dsh-tool bridge
import { test } from 'node:test';
import assert from 'node:assert';
import {
  slotOf,
  getToolSlots,
  listSlotTools,
  executeSlotTool,
  registerTools,
  manifest,
} from '../../src/dsh-bridge/tool-bridge.mjs';

test('slotOf: RE tools → fs', () => {
  for (const id of ['jadx', 'apktool', 'mobsf', 'wasm2c', 'radare2', 'ghidra']) {
    const slot = slotOf({ id, category: 're/mobile' });
    assert.equal(slot, 'fs', `${id} (re/*) should be fs`);
  }
});

test('slotOf: nmap, frida, pwntools → bash', () => {
  // nmap is pentest/recon (raw socket) → bash
  assert.equal(slotOf({ id: 'nmap', category: 'pentest/recon' }), 'bash');
  // pwntools is re/exploit (runtime toolkit) → bash
  assert.equal(slotOf({ id: 'pwntools', category: 're/exploit' }), 'bash');
  // frida is re/mobile per registry → fs (re/* wins over explicit id rule)
  assert.equal(slotOf({ id: 'frida', category: 're/mobile' }), 'fs');
});

test('slotOf: web/network tools → web', () => {
  for (const id of ['httpx', 'nuclei', 'katana', 'ffuf', 'sqlmap', 'osint_fofa', 'http_mitm_proxy']) {
    const slot = slotOf({ id, category: 'pentest/recon' });
    assert.equal(slot, 'web', `${id} should be web`);
  }
});

test('getToolSlots: counts match registry totals (25 tools)', () => {
  const g = getToolSlots();
  const sum = g._meta.perSlot.fs + g._meta.perSlot.web + g._meta.perSlot.bash;
  assert.equal(sum, 25);
  assert.equal(g._meta.total, 25);
});

test('getToolSlots: fs slot contains all RE tools', () => {
  const g = getToolSlots();
  const ids = g.fs.map(t => t.id);
  for (const id of ['jadx', 'apktool', 'mobsf', 'wasm2c', 'radare2', 'ghidra']) {
    assert.ok(ids.includes(id), `${id} should be in fs slot`);
  }
});

test('getToolSlots: web slot contains scanners/fuzzers/osint/mitm', () => {
  const g = getToolSlots();
  const ids = g.web.map(t => t.id);
  for (const id of ['httpx', 'nuclei', 'katana', 'ffuf', 'feroxbuster', 'gobuster',
    'sqlmap', 'dalfox', 'commix', 'interactsh', 'jwt_tool',
    'osint_fofa', 'osint_hunter', 'osint_quake', 'osint_riskbird', 'http_mitm_proxy']) {
    assert.ok(ids.includes(id), `${id} should be in web slot`);
  }
});

test('getToolSlots: bash slot contains only runtime tools', () => {
  const g = getToolSlots();
  const ids = g.bash.map(t => t.id);
  for (const id of ['nmap', 'pwntools']) {
    assert.ok(ids.includes(id), `${id} should be in bash slot`);
  }
  assert.equal(ids.length, 2);
  // frida is re/mobile → fs, not bash
  assert.ok(!ids.includes('frida'), 'frida should not be in bash slot');
});

test('listSlotTools: returns array for valid slot', () => {
  assert.ok(Array.isArray(listSlotTools('fs')));
  assert.ok(Array.isArray(listSlotTools('web')));
  assert.ok(Array.isArray(listSlotTools('bash')));
});

test('listSlotTools: throws on invalid slot', () => {
  assert.throws(() => listSlotTools('invalid'), /invalid slot/);
});

test('listSlotTools: accepts registry override', () => {
  const reg = { tools: [{ id: 'foo', category: 're/wasm', binary: 'foo' }] };
  const r = listSlotTools('fs', { registry: reg });
  assert.equal(r.length, 1);
  assert.equal(r[0].id, 'foo');
});

test('executeSlotTool: rejects invalid slot', async () => {
  await assert.rejects(async () => {
    await executeSlotTool('garbage', 'nmap', []);
  }, /invalid slot/);
});

test('executeSlotTool: rejects tool not in slot', async () => {
  const r = await executeSlotTool('fs', 'nmap', []);
  assert.equal(r.ok, false);
  assert.match(r.error, /not in slot 'fs'/);
});

test('executeSlotTool: tries to run, surfaces error gracefully for unknown binary', async () => {
  // nmap is in bash slot — bridge should normalize the result to {ok, ...}
  const r = await executeSlotTool('bash', 'nmap', ['--version']);
  assert.equal(typeof r.ok, 'boolean', 'result.ok should be a boolean');
  // Whether nmap is installed or not, the bridge normalizes to {ok, stdout, stderr, code, slot}
  assert.ok(r.slot === 'bash');
  if (!r.ok) {
    assert.ok(r.error || r.stderr, 'failed run should surface an error');
  }
});

test('registerTools: wires all 25 tools into ctx.tools.{fs,web,bash}', async () => {
  const fsRegs = [];
  const webRegs = [];
  const bashRegs = [];
  const ctx = {
    tools: {
      fs: { register: (def) => fsRegs.push(def) },
      web: { register: (def) => webRegs.push(def) },
      bash: { register: (def) => bashRegs.push(def) },
    },
  };

  const r = await registerTools(ctx);
  assert.equal(r.total, 25);
  assert.equal(fsRegs.length, 7);
  assert.equal(webRegs.length, 16);
  assert.equal(bashRegs.length, 2);
});

test('registerTools: each tool has name, description, schema, execute, slot', async () => {
  const regs = [];
  const ctx = {
    tools: {
      fs: { register: (def) => regs.push({ ...def, _slot: 'fs' }) },
      web: { register: (def) => regs.push({ ...def, _slot: 'web' }) },
      bash: { register: (def) => regs.push({ ...def, _slot: 'bash' }) },
    },
  };
  await registerTools(ctx);
  assert.equal(regs.length, 25);
  for (const def of regs) {
    assert.match(def.name, /^d2d_/, `name should be d2d_*: ${def.name}`);
    assert.ok(def.description, `${def.name} missing description`);
    assert.equal(def.schema.type, 'object');
    assert.ok(def.schema.properties.args, `${def.name} missing args property`);
    assert.equal(typeof def.execute, 'function');
    assert.ok(['fs', 'web', 'bash'].includes(def.slot));
  }
});

test('registerTools: per-tool failure does not block others', async () => {
  const ok = [];
  const ctx = {
    tools: {
      fs: { register: () => { throw new Error('boom'); } },
      web: { register: (def) => ok.push(def) },
      bash: { register: (def) => ok.push(def) },
    },
  };
  const r = await registerTools(ctx);
  // fs throws on every call, but web+bash should still register
  assert.ok(r.registered.web > 0);
  assert.ok(r.registered.bash > 0);
  assert.equal(r.registered.fs, 0);
  assert.ok(ok.length > 0);
});

test('registerTools: graceful when a slot is missing', async () => {
  const ok = [];
  const ctx = {
    tools: {
      // only web slot present
      web: { register: (def) => ok.push(def) },
    },
  };
  const r = await registerTools(ctx);
  assert.equal(r.registered.web, 16);
  assert.equal(r.registered.fs, 0);
  assert.equal(r.registered.bash, 0);
  assert.equal(r.total, 16);
});

test('registerTools: graceful when ctx.tools is missing', async () => {
  await assert.rejects(async () => {
    await registerTools(null);
  }, /ctx\.tools is required/);
});

test('registerTools: graceful when ctx.tools exists but all slots missing', async () => {
  const r = await registerTools({ tools: {} });
  assert.equal(r.total, 0);
});

test('manifest: returns bridge metadata', () => {
  const m = manifest();
  assert.equal(m.bridge, 'dsh-tool');
  assert.deepEqual(m.slots, ['fs', 'web', 'bash']);
  assert.equal(m.totalTools, 25);
  assert.equal(m.perSlot.fs, 7);
  assert.equal(m.perSlot.web, 16);
  assert.equal(m.perSlot.bash, 2);
  assert.ok(m.slotAssignmentRule);
  assert.equal(m.registryVersion, '0.2.0');
});

test('manifest: toolsBySlot includes every tool id exactly once', () => {
  const m = manifest();
  const all = [...m.toolsBySlot.fs, ...m.toolsBySlot.web, ...m.toolsBySlot.bash];
  assert.equal(all.length, 25);
  assert.equal(new Set(all).size, 25, 'each tool appears in exactly one slot');
});

test('end-to-end: registered tool.execute() routes through executeSlotTool', async () => {
  let receivedSlot = null;
  const ctx = {
    tools: {
      bash: {
        register: (def) => {
          // Capture the registered def
          receivedSlot = def;
        },
      },
    },
  };
  await registerTools(ctx);
  // The execute() should be a function that calls executeSlotTool
  assert.equal(typeof receivedSlot.execute, 'function');
  // Calling with bogus binary args should not throw
  const r = await receivedSlot.execute({ args: ['--no-such-flag-xyz'] });
  assert.equal(typeof r.ok, 'boolean');
});