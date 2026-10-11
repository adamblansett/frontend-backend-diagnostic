import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SafeRepairEngine } from '../src/engine/repair.js';
import { PatchOperation } from '../src/types/index.js';

describe('SafeRepairEngine', () => {
  let tmpDir: string;
  let testFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbd-repair-test-'));
    testFile = path.join(tmpDir, 'client.ts');
    fs.writeFileSync(testFile, "const url = '/api/v1//users';", 'utf8');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates a clean unified diff preview without modifying target file', () => {
    const patch: PatchOperation = {
      filePath: testFile,
      description: 'Remove double slash',
      originalText: "const url = '/api/v1//users';",
      replacementText: "const url = '/api/v1/users';"
    };

    const preview = SafeRepairEngine.previewPatch(patch);
    expect(preview.diff).toContain("- const url = '/api/v1//users';");
    expect(preview.diff).toContain("+ const url = '/api/v1/users';");

    // Verify file on disk remained untouched
    expect(fs.readFileSync(testFile, 'utf8')).toBe("const url = '/api/v1//users';");
  });

  it('safely applies patch when original content matches', () => {
    const patch: PatchOperation = {
      filePath: testFile,
      description: 'Remove double slash',
      originalText: "const url = '/api/v1//users';",
      replacementText: "const url = '/api/v1/users';"
    };

    const success = SafeRepairEngine.applyPatch(patch);
    expect(success).toBe(true);
    expect(fs.readFileSync(testFile, 'utf8')).toBe("const url = '/api/v1/users';");
  });

  it('rejects patch if content has diverged from expected pattern', () => {
    const patch: PatchOperation = {
      filePath: testFile,
      description: 'Stale patch',
      originalText: "const url = 'DIFFERENT_TEXT';",
      replacementText: "const url = '/api/v1/users';"
    };

    expect(() => SafeRepairEngine.applyPatch(patch)).toThrowError(/diverged from expected pattern/);
  });
});
