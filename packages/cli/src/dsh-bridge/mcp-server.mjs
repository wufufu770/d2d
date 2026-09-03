// @wufufu770/d2d-mcp-server — bridge 25 tools to dsh via MCP
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = join(__dirname, '..', '..', 'data', 'tool-registry.json');
const VERSION = '0.2.0';

// ===== Load registry =====
function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) {
    throw new Error(`tool-registry.json not found at ${REGISTRY_PATH}`);
  }
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
}

// ===== MCP server (manual implementation) =====
// Note: uses @modelcontextprotocol/sdk if installed; falls back to minimal stdio JSON-RPC.
// This allows tests to run without the SDK installed.

const TOOL_REGISTRY = loadRegistry();
const tools = TOOL_REGISTRY.tools.map(t => ({
  name: `d2d_${t.id}`,
  description: `${t.purpose}\nLicense: ${t.license}\nCategory: ${t.category}\nbinary: ${t.binary}`,
  inputSchema: {
    type: 'object',
    properties: {
      args: { type: 'array', items: { type: 'string' }, description: 'CLI args' },
      options: { type: 'object', description: 'Tool-specific options' },
    },
    required: ['args'],
  },
}));

// ===== In-process tool registry (for tools marked in_process: true) =====
const IN_PROCESS_TOOLS = new Map();

function registerInProcessTool(id, handler) {
  IN_PROCESS_TOOLS.set(id, handler);
}

function defaultInProcessHandlers() {
  // Stub handlers for OSINT tools (v0.3.0+ implementation)
  for (const tool of TOOL_REGISTRY.tools.filter(t => t.in_process)) {
    registerInProcessTool(tool.id, async (args) => {
      return {
        ok: false,
        error: `${tool.id} not yet implemented (v0.3.0-rc milestone)`,
        args,
      };
    });
  }
  // MITM proxy stub
  registerInProcessTool('http_mitm_proxy', async (args) => {
    return { ok: false, error: 'http-mitm-proxy integration pending', args };
  });
}

defaultInProcessHandlers();

// ===== CLI tool runner (for binary tools) =====
function runCliTool(binary, args, timeoutMs = 60000) {
  return new Promise((resolve) => {
    // Parse "python3 -c 'import xxx'" syntax
    let cmd, cmdArgs;
    if (binary.startsWith('python3 -c')) {
      const m = binary.match(/'import (\w+)'/);
      if (m) {
        cmd = 'python3';
        cmdArgs = ['-c', `import ${m[1]}`];
      } else {
        cmd = 'python3';
        cmdArgs = ['-c', ''];
      }
    } else if (binary.startsWith('node -e')) {
      const m = binary.match(/require\("([^"]+)"\)/);
      if (m) {
        cmd = 'node';
        cmdArgs = ['-e', `require("${m[1]}")`];
      } else {
        cmd = 'node';
        cmdArgs = ['-e', ''];
      }
    } else {
      cmd = binary.split(' ')[0];
      cmdArgs = [];
    }

    let stdout = '', stderr = '';
    const child = spawn(cmd, [...cmdArgs, ...args], { timeout: timeoutMs });
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('close', (code, signal) => {
      resolve({
        exitCode: code ?? (signal ? 128 : 1),
        stdout: stdout.slice(0, 100000),
        stderr: stderr.slice(0, 10000),
        signal,
      });
    });
    child.on('error', (err) => {
      resolve({
        exitCode: 127,
        stdout: '',
        stderr: `spawn error: ${err.message}`,
      });
    });
  });
}

// ===== Public API: list tools + call tool =====
export function listTools() {
  return tools;
}

export async function callTool(name, args) {
  const toolName = String(name).replace(/^d2d_/, '');
  const tool = TOOL_REGISTRY.tools.find(t => t.id === toolName);
  if (!tool) {
    return { ok: false, error: `Unknown tool: ${toolName}`, exitCode: 1 };
  }

  const argList = (args && args.args) || [];
  const opts = (args && args.options) || {};

  // In-process tool: call handler directly
  if (tool.in_process && IN_PROCESS_TOOLS.has(toolName)) {
    try {
      const result = await IN_PROCESS_TOOLS.get(toolName)(argList, opts);
      return { ...result, exitCode: result.exitCode ?? 0 };
    } catch (err) {
      return { ok: false, error: err.message, exitCode: 1 };
    }
  }

  // CLI tool: spawn binary
  return await runCliTool(tool.binary, argList);
}

export { handleMcpRequest, loadRegistry, runCliTool, IN_PROCESS_TOOLS, registerInProcessTool, TOOL_REGISTRY };

// ===== MCP JSON-RPC server (stdio) =====
function isMcpToolListRequest(msg) {
  return msg && msg.method === 'tools/list';
}

function isMcpToolCallRequest(msg) {
  return msg && msg.method === 'tools/call';
}

function isInitializeRequest(msg) {
  return msg && msg.method === 'initialize';
}

// Minimal MCP server (no SDK dependency for testability)
async function runMcpServer() {
  process.stderr.write('[d2d-mcp] server started (stdio)\n');

  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        const response = await handleMcpRequest(msg);
        if (response) {
          process.stdout.write(JSON.stringify(response) + '\n');
        }
      } catch (err) {
        process.stderr.write(`[d2d-mcp] parse error: ${err.message}\n`);
      }
    }
  });

  process.stdin.on('end', () => {
    process.exit(0);
  });
}

async function handleMcpRequest(msg) {
  const id = msg.id;

  if (isInitializeRequest(msg)) {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'd2d-mcp-server', version: VERSION },
      },
    };
  }

  if (isMcpToolListRequest(msg)) {
    return {
      jsonrpc: '2.0',
      id,
      result: { tools: listTools() },
    };
  }

  if (isMcpToolCallRequest(msg)) {
    const { name, arguments: args } = msg.params || {};
    const result = await callTool(name, args || {});
    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text: JSON.stringify(result).slice(0, 20000) }],
        isError: result.exitCode !== 0 || result.ok === false,
      },
    };
  }

  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${msg.method}` },
  };
}

// ===== CLI entry =====
if (import.meta.url === `file://${process.argv[1]}`) {
  runMcpServer().catch(err => {
    process.stderr.write(`[d2d-mcp] fatal: ${err.message}\n`);
    process.exit(1);
  });
}
