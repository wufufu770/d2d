// @wufufu770/d2d-cli - dsh-tool bridge
// Expose d2d's 25 pentest tools to dsh via the three tool slots:
//   tool-fs  — file-producing tools (jadx, apktool, mobsf, wasm2c, radare2, ghidra)
//   tool-web — HTTP/network tools (httpx, nuclei, katana, ffuf, sqlmap, osint_*, …)
//   tool-bash — runtime/exec tools (nmap, frida, pwntools)
//
// Slot assignments are deterministic and follow dsh conventions:
//   • re/*  → fs (RE tools decode binary inputs into files)
//   • osint/passive, mitm → web (all HTTP-based, including in-process)
//   • pentest/scanner|fuzzer|sqli|xss|cmdi|oob|jwt → web
//   • pentest/recon → bash for nmap (raw socket), web for httpx+katana (HTTP)
//   • re/exploit → bash (runtime exploit toolkit)
//
// Each slot call wraps the d2d MCP runner so the agent sees a unified API:
//   ctx.tools.fs.execute(toolId, args, opts)
//   ctx.tools.web.execute(toolId, args, opts)
//   ctx.tools.bash.execute(toolId, args, opts)
//
// #31 is the M1 final bridge.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = join(__dirname, '..', '..', 'data', 'tool-registry.json');

// ===== Registry loader =====
function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) {
    throw new Error(`tool-registry.json not found at ${REGISTRY_PATH}`);
  }
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
}

// ===== Slot assignment =====
/**
 * Map a tool entry to one of: 'fs' | 'web' | 'bash'.
 * Reasoning is exposed so tests + the bridge manifest can verify intent.
 */
export function slotOf(tool) {
  const cat = String(tool?.category ?? '');
  const id = String(tool?.id ?? '');
  // RE tools decode → fs
  if (cat.startsWith('re/mobile') || cat.startsWith('re/wasm') || cat.startsWith('re/native')) {
    return 'fs';
  }
  // Runtime / raw-socket tools → bash
  if (id === 'nmap' || id === 'frida' || id === 'pwntools') {
    return 'bash';
  }
  // Exploit runtime (pwntools also covered above; future-proof)
  if (cat.startsWith('re/exploit')) {
    return 'bash';
  }
  // Everything else: HTTP/network → web
  return 'web';
}

/**
 * Group the registry's tools by their assigned slot.
 * Returns { fs: [...], web: [...], bash: [...], _meta: {...} }
 */
export function getToolSlots(opts = {}) {
  const registry = opts.registry || loadRegistry();
  const slots = { fs: [], web: [], bash: [] };
  for (const tool of registry.tools) {
    slots[slotOf(tool)].push(tool);
  }
  return {
    ...slots,
    _meta: {
      total: registry.tools.length,
      perSlot: {
        fs: slots.fs.length,
        web: slots.web.length,
        bash: slots.bash.length,
      },
      registryVersion: registry.version,
    },
  };
}

// ===== Slot call dispatch =====
/**
 * Build the per-slot execute() implementation. It uses runCliTool for
 * binary tools and IN_PROCESS_TOOLS for in-process handlers — both come
 * from the existing MCP bridge (PR #72). The bridge re-exports them via
 * dynamic import so tests don't require @modelcontextprotocol/sdk.
 */
async function defaultSlotRunner(toolId, args, opts) {
  const reg = loadRegistry();
  const tool = reg.tools.find(t => t.id === toolId);
  if (!tool) return { ok: false, error: `unknown tool: ${toolId}`, slot: opts?.slot };

  // Lazy import the MCP bridge so we don't pull stdio JSON-RPC into memory.
  const mcp = await import('./mcp-server.mjs');
  if (tool.in_process) {
    if (!mcp.IN_PROCESS_TOOLS.has(toolId)) {
      return { ok: false, error: `${toolId} has no in-process handler`, slot: opts?.slot };
    }
    return await mcp.IN_PROCESS_TOOLS.get(toolId)(args || {});
  }
  if (typeof mcp.runCliTool !== 'function') {
    return { ok: false, error: 'mcp runCliTool not available', slot: opts?.slot };
  }
  const raw = await mcp.runCliTool(tool.binary, args || [], opts?.timeoutMs ?? 60000);
  // Normalize Node child_process shape → { ok, stdout, stderr, code, error, slot }
  if (raw && typeof raw.ok === 'boolean') return { ...raw, slot: opts?.slot };
  const code = raw?.status ?? raw?.code ?? -1;
  return {
    ok: code === 0,
    stdout: raw?.stdout ?? '',
    stderr: raw?.stderr ?? '',
    code,
    error: code === 0 ? undefined : (raw?.error?.message ?? `exit ${code}`),
    slot: opts?.slot,
  };
}

// ===== Public API =====
/**
 * List tools for a given slot. Accepts an optional override registry.
 */
export function listSlotTools(slot, opts = {}) {
  if (!['fs', 'web', 'bash'].includes(slot)) {
    throw new Error(`invalid slot: ${slot} (expected fs|web|bash)`);
  }
  return getToolSlots(opts)[slot];
}

/**
 * Execute a tool through its slot. Returns the raw MCP bridge result.
 */
export async function executeSlotTool(slot, toolId, args, opts = {}) {
  if (!['fs', 'web', 'bash'].includes(slot)) {
    throw new Error(`invalid slot: ${slot} (expected fs|web|bash)`);
  }
  const inSlot = listSlotTools(slot, opts).some(t => t.id === toolId);
  if (!inSlot) {
    return { ok: false, error: `${toolId} is not in slot '${slot}'`, slot };
  }
  return await defaultSlotRunner(toolId, args, { ...opts, slot });
}

/**
 * Register d2d tools into a dsh ctx.tools context.
 *
 * Expected dsh ctx shape:
 *   ctx.tools.fs.register({ name, description, schema, execute })
 *   ctx.tools.web.register(...)
 *   ctx.tools.bash.register(...)
 *
 * If a slot is missing the bridge silently skips it (graceful degradation).
 *
 * Returns { registered: { fs, web, bash }, total, ids }
 */
export async function registerTools(ctx, opts = {}) {
  if (!ctx || !ctx.tools) {
    throw new Error('ctx.tools is required (dsh tool context)');
  }
  const grouped = getToolSlots(opts);
  const out = { registered: { fs: 0, web: 0, bash: 0 }, total: 0, ids: { fs: [], web: [], bash: [] } };

  for (const slot of ['fs', 'web', 'bash']) {
    const slotCtx = ctx.tools?.[slot];
    if (!slotCtx || typeof slotCtx.register !== 'function') continue;
    for (const tool of grouped[slot]) {
      try {
        slotCtx.register({
          name: `d2d_${tool.id}`,
          description: `${tool.purpose}\nLicense: ${tool.license}\nCategory: ${tool.category}\nBinary: ${tool.binary}`,
          category: tool.category,
          binary: tool.binary,
          in_process: !!tool.in_process,
          slot,
          schema: {
            type: 'object',
            properties: {
              args: { type: 'array', items: { type: 'string' }, description: 'CLI args (binary tools) or query (in-process)' },
              options: { type: 'object', description: 'Tool-specific options' },
              timeoutMs: { type: 'number', description: 'Override default 60s timeout' },
            },
            required: ['args'],
          },
          async execute(input) {
            return await executeSlotTool(slot, tool.id, input?.args, { timeoutMs: input?.timeoutMs });
          },
        });
        out.registered[slot]++;
        out.ids[slot].push(`d2d_${tool.id}`);
        out.total++;
      } catch (e) {
        // per-tool failure should not block other registrations
      }
    }
  }
  return out;
}

/**
 * Static manifest for `d2d bridge status` and PR description.
 */
export function manifest(opts = {}) {
  const grouped = getToolSlots(opts);
  return {
    bridge: 'dsh-tool',
    version: '0.3.0-M1',
    slots: ['fs', 'web', 'bash'],
    registryVersion: grouped._meta.registryVersion,
    totalTools: grouped._meta.total,
    perSlot: grouped._meta.perSlot,
    toolsBySlot: {
      fs: grouped.fs.map(t => t.id),
      web: grouped.web.map(t => t.id),
      bash: grouped.bash.map(t => t.id),
    },
    slotAssignmentRule: 're/* → fs; nmap|frida|pwntools → bash; everything else → web',
  };
}

// ===== CLI entry =====
if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] || 'manifest';
  if (cmd === 'manifest') {
    console.log(JSON.stringify(manifest(), null, 2));
  } else if (cmd === 'slots') {
    const g = getToolSlots();
    for (const s of ['fs', 'web', 'bash']) {
      console.log(`${s}: ${g[s].map(t => t.id).join(', ')}`);
    }
  } else {
    console.error('usage: tool-bridge.mjs <manifest|slots>');
    process.exit(1);
  }
}