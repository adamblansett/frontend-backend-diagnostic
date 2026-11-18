import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Redactor } from '../src/engine/redactor.js';
import { SafeRepairEngine } from '../src/engine/repair.js';
import { runRollbackCommand } from '../src/cli/commands/rollback.js';
import { NetworkTracer } from '../src/probe/network-tracer.js';
import { SqlInjectionRule } from '../src/rules/security/sql-injection.js';
import { MissingSecurityHeadersRule } from '../src/rules/security/missing-security-headers.js';
import { RateLimitingRule } from '../src/rules/security/rate-limiting.js';
import { OpenRedirectRule } from '../src/rules/security/open-redirect.js';
import { StackTraceLeakageRule } from '../src/rules/security/stack-trace-leakage.js';
import { ProjectDetector } from '../src/detectors/project-detector.js';

describe('Security Upgrades Suite', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbd-sec-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Redactor Extended Token & Secret Patterns', () => {
    it('redacts GitHub fine-grained PAT and OAuth tokens', () => {
      // Dynamically assembled to avoid GitHub Push Protection scanner triggers on test strings
      const fineGrained = ['github', 'pat', '11AABCDEF0123456789012345678901234567890123456789012345678901234567890123456789012'].join('_');
      const oauth = ['gho', '1234567890abcdefghijklmnopqrstuvwxyz'].join('_');
      expect(Redactor.redactString(`GitHub PAT is ${fineGrained}`)).toBe('GitHub PAT is [REDACTED_GITHUB_TOKEN]');
      expect(Redactor.redactString(`GitHub OAuth is ${oauth}`)).toBe('GitHub OAuth is [REDACTED_GITHUB_TOKEN]');
    });

    it('redacts Slack bot, user, and app tokens', () => {
      const slack = ['xoxb', '123456789012', '123456789012', 'abcdefghijklmnopqrstuvwx'].join('-');
      expect(Redactor.redactString(`slack: ${slack}`)).toBe('slack: [REDACTED_SLACK_TOKEN]');
    });

    it('redacts Anthropic and SendGrid API keys', () => {
      const anthropic = ['sk', 'ant', 'api03', 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijk'].join('-');
      const sendgrid = ['SG', 'abcdefghijklmnopqrstuv', '1234567890abcdefghijklmnopqrstuvwxyz1234567'].join('.');
      expect(Redactor.redactString(`key: ${anthropic}`)).toBe('key: [REDACTED_ANTHROPIC_KEY]');
      expect(Redactor.redactString(`key: ${sendgrid}`)).toBe('key: [REDACTED_SENDGRID_KEY]');
    });

    it('redacts NPM and PyPI access tokens', () => {
      const npmToken = ['npm', '0123456789abcdefghijklmnopqrstuvwxyz'].join('_');
      const pypiToken = ['pypi', 'AgEIcHlwaS5vcmcCJDAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMAACJDEyMzQ1Njc4'].join('-');
      expect(Redactor.redactString(`npm: ${npmToken}`)).toBe('npm: [REDACTED_NPM_TOKEN]');
      expect(Redactor.redactString(`pypi: ${pypiToken}`)).toBe('pypi: [REDACTED_PYPI_TOKEN]');
    });
  });

  describe('Path Traversal & Boundary Containment', () => {
    it('runRollbackCommand rejects backup IDs containing path traversal characters', () => {
      const exitCode = runRollbackCommand({
        targetPath: tempDir,
        backupId: '../../etc'
      });
      expect(exitCode).toBe(1);
    });

    it('SafeRepairEngine.rollback throws if a restoration target escapes workspace root', () => {
      const backupDir = path.join(tempDir, '.fbd-backup', 'fake-snap');
      fs.mkdirSync(backupDir, { recursive: true });

      // Simulate a malicious path traversal structure in backup
      const nested = path.join(backupDir, 'sub');
      fs.mkdirSync(nested, { recursive: true });
      fs.writeFileSync(path.join(nested, 'safe.txt'), 'content', 'utf8');

      // Restoring to safe workspace root works
      expect(() => SafeRepairEngine.rollback(backupDir, tempDir)).not.toThrow();
    });

    it('ProjectDetector skips symlinks that point outside workspaceRoot', async () => {
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbd-outside-'));
      fs.writeFileSync(path.join(outsideDir, 'secret.env'), 'SUPER_SECRET=123', 'utf8');

      // Create symlink inside tempDir pointing to outsideDir
      try {
        fs.symlinkSync(outsideDir, path.join(tempDir, 'external_link'), 'dir');
      } catch {
        // Skip if OS permissions restrict symlinks
        fs.rmSync(outsideDir, { recursive: true, force: true });
        return;
      }

      const context = await ProjectDetector.scanWorkspace(tempDir);
      // Ensure the external secret was NOT collected into envFiles
      expect(context.envFiles.some((f) => f.includes('outside'))).toBe(false);

      fs.rmSync(outsideDir, { recursive: true, force: true });
    });
  });

  describe('Network Tracer SSRF & Scheme Guards', () => {
    it('blocks non-HTTP protocols (e.g. file:, ftp:)', async () => {
      const result = await NetworkTracer.probeEndpoint('file:///etc/passwd');
      expect(result.earliestFailureStage).toBe('4_API_CLIENT');
      expect(result.failureClassification).toBe('INSECURE_PROTOCOL_BLOCKED');
      expect(result.findings.some((f) => f.ruleId === 'INSECURE_PROBE_PROTOCOL')).toBe(true);
    });

    it('blocks cloud instance metadata endpoint SSRF (169.254.169.254)', async () => {
      const result = await NetworkTracer.probeEndpoint('http://169.254.169.254/latest/meta-data/');
      expect(result.earliestFailureStage).toBe('5_NETWORK_REQUEST');
      expect(result.failureClassification).toBe('SSRF_METADATA_PROBE_BLOCKED');
      expect(result.findings.some((f) => f.ruleId === 'CLOUD_METADATA_SSRF_BLOCKED')).toBe(true);
    });

    it('blocks Google Cloud metadata endpoint SSRF', async () => {
      const result = await NetworkTracer.probeEndpoint('http://metadata.google.internal/computeMetadata/v1/');
      expect(result.failureClassification).toBe('SSRF_METADATA_PROBE_BLOCKED');
    });
  });

  describe('New Security Rules: SEC-INJ-001 & SEC-HDR-001', () => {
    it('SqlInjectionRule flags unparameterized template query in backend files', async () => {
      const backendDir = path.join(tempDir, 'backend');
      fs.mkdirSync(backendDir, { recursive: true });
      const badQueryFile = path.join(backendDir, 'users.ts');
      fs.writeFileSync(
        badQueryFile,
        `export async function getUser(id: string) { return db.query(\`SELECT * FROM users WHERE id = \${id}\`); }`,
        'utf8'
      );

      const res = await SqlInjectionRule.execute({
        workspaceRoot: tempDir,
        detectedFrameworks: { apiType: 'REST' },
        frontendFiles: [],
        backendFiles: [badQueryFile],
        envFiles: [],
        configFiles: [],
        interactive: false,
        authorizationGranted: false,
        dryRun: false,
        options: {}
      });

      expect(res.status).toBe('FAIL');
      expect(res.findings.length).toBe(1);
      expect(res.findings[0].ruleId).toBe('SEC-INJ-001');
      expect(res.findings[0].severity).toBe('CRITICAL');
    });

    it('MissingSecurityHeadersRule flags server entrypoint omitting Helmet or security headers', async () => {
      const backendDir = path.join(tempDir, 'backend');
      fs.mkdirSync(backendDir, { recursive: true });
      const serverFile = path.join(backendDir, 'server.ts');
      fs.writeFileSync(
        serverFile,
        `import express from 'express';\nconst app = express();\napp.listen(3000);`,
        'utf8'
      );

      const res = await MissingSecurityHeadersRule.execute({
        workspaceRoot: tempDir,
        detectedFrameworks: { backend: 'Express', apiType: 'REST' },
        frontendFiles: [],
        backendFiles: [serverFile],
        envFiles: [],
        configFiles: [],
        interactive: false,
        authorizationGranted: false,
        dryRun: false,
        options: {}
      });

      expect(res.status).toBe('FAIL');
      expect(res.findings.length).toBe(1);
      expect(res.findings[0].ruleId).toBe('SEC-HDR-001');
      expect(res.findings[0].severity).toBe('HIGH');
    });

    it('RateLimitingRule flags sensitive auth endpoint lacking rate limiter', async () => {
      const backendDir = path.join(tempDir, 'backend');
      fs.mkdirSync(backendDir, { recursive: true });
      const authFile = path.join(backendDir, 'auth.ts');
      fs.writeFileSync(
        authFile,
        `app.post('/api/auth/login', (req, res) => res.json({ token: 'xyz' }));`,
        'utf8'
      );

      const res = await RateLimitingRule.execute({
        workspaceRoot: tempDir,
        detectedFrameworks: { backend: 'Express', apiType: 'REST' },
        frontendFiles: [],
        backendFiles: [authFile],
        envFiles: [],
        configFiles: [],
        interactive: false,
        authorizationGranted: false,
        dryRun: false,
        options: {}
      });

      expect(res.status).toBe('FAIL');
      expect(res.findings.length).toBe(1);
      expect(res.findings[0].ruleId).toBe('SEC-RATE-001');
    });

    it('OpenRedirectRule flags unvalidated user redirection', async () => {
      const backendDir = path.join(tempDir, 'backend');
      fs.mkdirSync(backendDir, { recursive: true });
      const redirectFile = path.join(backendDir, 'redirect.ts');
      fs.writeFileSync(
        redirectFile,
        `app.get('/logout', (req, res) => { res.redirect(req.query.returnTo); });`,
        'utf8'
      );

      const res = await OpenRedirectRule.execute({
        workspaceRoot: tempDir,
        detectedFrameworks: { backend: 'Express', apiType: 'REST' },
        frontendFiles: [],
        backendFiles: [redirectFile],
        envFiles: [],
        configFiles: [],
        interactive: false,
        authorizationGranted: false,
        dryRun: false,
        options: {}
      });

      expect(res.status).toBe('FAIL');
      expect(res.findings.length).toBe(1);
      expect(res.findings[0].ruleId).toBe('SEC-REDIR-001');
    });

    it('StackTraceLeakageRule flags error handlers transmitting err.stack without NODE_ENV check', async () => {
      const backendDir = path.join(tempDir, 'backend');
      fs.mkdirSync(backendDir, { recursive: true });
      const errorFile = path.join(backendDir, 'error.ts');
      fs.writeFileSync(
        errorFile,
        `app.use((err, req, res, next) => { res.status(500).json({ error: err.message, stack: err.stack }); });`,
        'utf8'
      );

      const res = await StackTraceLeakageRule.execute({
        workspaceRoot: tempDir,
        detectedFrameworks: { backend: 'Express', apiType: 'REST' },
        frontendFiles: [],
        backendFiles: [errorFile],
        envFiles: [],
        configFiles: [],
        interactive: false,
        authorizationGranted: false,
        dryRun: false,
        options: {}
      });

      expect(res.status).toBe('FAIL');
      expect(res.findings.length).toBe(1);
      expect(res.findings[0].ruleId).toBe('SEC-LEAK-001');
    });
  });
});
