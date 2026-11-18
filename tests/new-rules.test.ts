import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { ProjectDetector } from '../src/detectors/project-detector.js';
import { missingAbortSignalRule } from '../src/rules/frontend/missing-abort-signal.js';
import { sensitiveStorageRule } from '../src/rules/security/sensitive-storage.js';
import { csrfProtectionRule } from '../src/rules/security/csrf-protection.js';
import { cacheControlMutationsRule } from '../src/rules/caching/cache-control-mutations.js';

describe('New Diagnostic Rules Suite', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbd-new-rules-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('FE-TIME-001 flags fetch calls without AbortSignal or timeout', async () => {
    const clientPath = path.join(tmpDir, 'client.ts');
    fs.writeFileSync(clientPath, `
export async function getProfile() {
  const res = await fetch('/api/profile');
  return res.json();
}
    `, 'utf8');

    const context = await ProjectDetector.scanWorkspace(tmpDir);
    const result = await missingAbortSignalRule.execute(context);

    expect(result.status).toBe('WARN');
    expect(result.findings.length).toBe(1);
    expect(result.findings[0]?.ruleId).toBe('FE-TIME-001');
  });

  it('SEC-STORE-001 flags sensitive auth tokens stored in localStorage', async () => {
    const authPath = path.join(tmpDir, 'auth.ts');
    fs.writeFileSync(authPath, `
export function saveToken(token: string) {
  localStorage.setItem('auth_token', token);
  sessionStorage.setItem('jwt', token);
}
    `, 'utf8');

    const context = await ProjectDetector.scanWorkspace(tmpDir);
    const result = await sensitiveStorageRule.execute(context);

    expect(result.status).toBe('FAIL');
    expect(result.findings.length).toBe(2);
    expect(result.findings[0]?.ruleId).toBe('SEC-STORE-001');
  });

  it('SEC-CSRF-001 flags cookie mutations lacking CSRF middleware', async () => {
    const serverPath = path.join(tmpDir, 'server.ts');
    fs.writeFileSync(serverPath, `
import express from 'express';
import cookieParser from 'cookie-parser';
const app = express();
app.use(cookieParser());

app.post('/api/account/delete', (req, res) => {
  res.json({ status: 'deleted' });
});
    `, 'utf8');

    const context = await ProjectDetector.scanWorkspace(tmpDir);
    const result = await csrfProtectionRule.execute(context);

    expect(result.status).toBe('FAIL');
    expect(result.findings.length).toBe(1);
    expect(result.findings[0]?.ruleId).toBe('SEC-CSRF-001');
  });

  it('NET-CACHE-001 flags mutation endpoints with public Cache-Control', async () => {
    const serverPath = path.join(tmpDir, 'server.ts');
    fs.writeFileSync(serverPath, `
import express from 'express';
const app = express();

app.post('/api/orders', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json({ orderId: 101 });
});
    `, 'utf8');

    const context = await ProjectDetector.scanWorkspace(tmpDir);
    const result = await cacheControlMutationsRule.execute(context);

    expect(result.status).toBe('WARN');
    expect(result.findings.length).toBe(1);
    expect(result.findings[0]?.ruleId).toBe('NET-CACHE-001');
  });
});
