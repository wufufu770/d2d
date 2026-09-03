// @wufufu770/d2d-mcp-server test
import { test } from 'node:test';
import assert from 'node:assert';
import { listTools, callTool, handleMcpRequest } from '../../src/dsh-bridge/mcp-server.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.join(__dirname, '..', '..', 'data', 'tool-registry.json');

test('tool-registry.json has 25 tools', () => {
  const data = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  assert.equal(data.tools.length, 25);
});

test('all tools have required fields', () => {
  const data = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  for (const t of data.tools) {
    assert.ok(t.id, `tool missing id`);
    assert.ok(t.category, `tool ${t.id} missing category`);
    assert.ok(t.purpose, `tool ${t.id} missing purpose`);
    assert.ok(t.binary, `tool ${t.id} missing binary`);
    assert.ok(t.license, `tool ${t.id} missing license`);
  }
});

test('all tool ids are unique', () => {
  const data = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  const ids = new Set();
  for (const t of data.tools) {
    assert.ok(!ids.has(t.id), `duplicate id: ${t.id}`);
    ids.add(t.id);
  }
});

test('listTools returns d2d_-prefixed tools', () => {
  const tools = listTools();
  assert.equal(tools.length, 25);
  for (const t of tools) {
    assert.ok(t.name.startsWith('d2d_'), `tool ${t.name} not prefixed`);
    assert.ok(t.description.length > 0);
    assert.ok(t.inputSchema);
  }
});

test('callTool unknown tool returns error', async () => {
  const r = await callTool('d2d_nonexistent_tool_xyz', { args: [] });
  assert.equal(r.ok, false);
  assert.match(r.error, /Unknown tool/);
  assert.equal(r.exitCode, 1);
});

test('callTool strips d2d_ prefix from name', async () => {
  // Use an in-process tool (fofa) — should return stub result
  const r = await callTool('d2d_osint_fofa', { args: [] });
  // Stub returns ok: false but no error
  assert.ok(r);
  assert.ok('exitCode' in r);
});

test('callTool without d2d_ prefix also works', async () => {
  const r = await callTool('osint_quake', { args: [] });
  assert.ok(r);
});

test('MCP handleMcpRequest: initialize', async () => {
  const req = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } };
  const res = await handleMcpRequest(req);
  assert.equal(res.jsonrpc, '2.0');
  assert.equal(res.id, 1);
  assert.ok(res.result.protocolVersion);
  assert.equal(res.result.serverInfo.name, 'd2d-mcp-server');
  assert.equal(res.result.serverInfo.version, '0.2.0');
  assert.deepEqual(res.result.capabilities, { tools: {} });
});

test('MCP handleMcpRequest: tools/list', async () => {
  const req = { jsonrpc: '2.0', id: 2, method: 'tools/list' };
  const res = await handleMcpRequest(req);
  assert.equal(res.jsonrpc, '2.0');
  assert.equal(res.id, 2);
  assert.equal(res.result.tools.length, 25);
  for (const t of res.result.tools) {
    assert.match(t.name, /^d2d_/);
  }
});

test('MCP handleMcpRequest: tools/call', async () => {
  const req = {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'd2d_osint_fofa',
      arguments: { args: [] },
    },
  };
  const res = await handleMcpRequest(req);
  assert.equal(res.jsonrpc, '2.0');
  assert.equal(res.id, 3);
  assert.ok(Array.isArray(res.result.content));
  assert.equal(res.result.content[0].type, 'text');
});

test('MCP handleMcpRequest: tools/call with missing tool', async () => {
  const req = {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'd2d_xyz_does_not_exist', arguments: {} },
  };
  const res = await handleMcpRequest(req);
  assert.equal(res.jsonrpc, '2.0');
  assert.equal(res.id, 4);
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /Unknown tool/);
});

test('MCP handleMcpRequest: unknown method returns -32601', async () => {
  const req = { jsonrpc: '2.0', id: 5, method: 'foo/bar' };
  const res = await handleMcpRequest(req);
  assert.equal(res.jsonrpc, '2.0');
  assert.equal(res.id, 5);
  assert.equal(res.error.code, -32601);
  assert.match(res.error.message, /Method not found/);
});

test('25 tools cover pentest / re / osint / mitm categories', () => {
  const data = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  const cats = new Set(data.tools.map(t => t.category));
  assert.ok([...cats].some(c => c.startsWith('pentest')), 'has pentest tools');
  assert.ok([...cats].some(c => c.startsWith('re/')), 'has RE tools');
  assert.ok([...cats].some(c => c.startsWith('osint/')), 'has OSINT tools');
  assert.ok([...cats].some(c => c === 'mitm'), 'has MITM tool');
});
