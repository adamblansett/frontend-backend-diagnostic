import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { ContractValidator } from '../src/contract/contract-validator.js';

describe('Parameterized Routes & AST Traversal Suite', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbd-param-routes-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('matches Express :param and OpenAPI {param} routes with client calls', () => {
    // Exact match
    expect(ContractValidator.pathsMatch('/api/v1/users', '/api/v1/users')).toBe(true);

    // Express style :id
    expect(ContractValidator.pathsMatch('/api/v1/users/42', '/api/v1/users/:id')).toBe(true);
    expect(ContractValidator.pathsMatch('/api/v1/users/usr_abc123', '/api/v1/users/:userId')).toBe(true);

    // OpenAPI style {id}
    expect(ContractValidator.pathsMatch('/api/v1/users/42', '/api/v1/users/{id}')).toBe(true);

    // Next.js style [id]
    expect(ContractValidator.pathsMatch('/api/v1/users/42', '/api/v1/users/[id]')).toBe(true);

    // Template string with :param
    expect(ContractValidator.pathsMatch('/api/v1/users/:param', '/api/v1/users/:id')).toBe(true);

    // Query parameters stripped
    expect(ContractValidator.pathsMatch('/api/v1/users?page=1&limit=10', '/api/v1/users')).toBe(true);

    // Mismatched routes
    expect(ContractValidator.pathsMatch('/api/v1/orders/42', '/api/v1/users/:id')).toBe(false);
  });

  it('extracts template literals and destructured properties via TypeScript AST', () => {
    const clientPath = path.join(tmpDir, 'client.ts');
    fs.writeFileSync(
      clientPath,
      `
export async function getUser(userId: string) {
  const res = await fetch(\`/api/v1/users/\${userId}\`);
  const { id, name, role } = await res.json();
  return { id, name, role };
}
      `,
      'utf8'
    );

    const calls = ContractValidator.extractFrontendCalls([clientPath]);
    expect(calls.length).toBe(1);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.urlOrPath).toBe('/api/v1/users/:param');
    expect(calls[0]?.consumedFields).toContain('id');
    expect(calls[0]?.consumedFields).toContain('name');
    expect(calls[0]?.consumedFields).toContain('role');
  });

  it('verifies agreement between parameterized backend route and template string call', () => {
    const serverPath = path.join(tmpDir, 'server.ts');
    fs.writeFileSync(
      serverPath,
      `
import express from 'express';
const app = express();
app.get('/api/v1/users/:id', (req, res) => {
  res.json({ id: '1', name: 'Alice', role: 'admin' });
});
      `,
      'utf8'
    );

    const clientPath = path.join(tmpDir, 'client.ts');
    fs.writeFileSync(
      clientPath,
      `
export async function fetchUser(id: string) {
  const res = await fetch(\`/api/v1/users/\${id}\`);
  const data = await res.json();
  return { id: data.id, name: data.name, role: data.role };
}
      `,
      'utf8'
    );

    const routes = ContractValidator.extractBackendRoutes([serverPath]);
    const calls = ContractValidator.extractFrontendCalls([clientPath]);

    const findings = ContractValidator.compareContracts(calls, routes);
    expect(findings.length).toBe(0);
  });
});
