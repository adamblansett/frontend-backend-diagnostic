import * as fs from 'node:fs';
import * as path from 'node:path';
import { DiagnosticFinding, PatchOperation } from '../types/index.js';

export interface DiffPreview {
  filePath: string;
  originalSnippet: string;
  replacementSnippet: string;
  diff: string;
}

export interface BatchRepairResult {
  appliedCount: number;
  failedCount: number;
  backupDir?: string;
  repairs: {
    filePath: string;
    description: string;
    success: boolean;
    error?: string;
  }[];
}

export class SafeRepairEngine {
  /**
   * Generates a preview diff of the proposed patch without writing changes.
   */
  public static previewPatch(patch: PatchOperation): DiffPreview {
    const diff = [
      `--- a/${patch.filePath}`,
      `+++ b/${patch.filePath}`,
      `@@ -${patch.lineStart || 1} +${patch.lineStart || 1} @@`,
      patch.originalText
        .split('\n')
        .map((l) => `- ${l}`)
        .join('\n'),
      patch.replacementText
        .split('\n')
        .map((l) => `+ ${l}`)
        .join('\n')
    ].join('\n');

    return {
      filePath: patch.filePath,
      originalSnippet: patch.originalText,
      replacementSnippet: patch.replacementText,
      diff
    };
  }

  /**
   * Safely applies a single patch operation to disk with atomic write.
   */
  public static applyPatch(patch: PatchOperation): boolean {
    if (!fs.existsSync(patch.filePath)) {
      throw new Error(`Cannot apply patch: target file "${patch.filePath}" does not exist.`);
    }

    const currentContent = fs.readFileSync(patch.filePath, 'utf8');
    if (!currentContent.includes(patch.originalText)) {
      throw new Error(
        `Cannot apply patch to "${patch.filePath}": original content has diverged from expected pattern.`
      );
    }

    const updatedContent = currentContent.replace(patch.originalText, patch.replacementText);
    fs.writeFileSync(patch.filePath, updatedContent, 'utf8');
    return true;
  }

  /**
   * Safely applies batches of patches grouped by file in bottom-up descending line order,
   * creating a pre-repair backup snapshot for safe rollback if any patch fails.
   */
  public static applyBatchPatches(
    patches: PatchOperation[],
    options: { backup?: boolean; workspaceRoot?: string } = {}
  ): BatchRepairResult {
    if (patches.length === 0) {
      return { appliedCount: 0, failedCount: 0, repairs: [] };
    }

    const workspaceRoot = options.workspaceRoot || process.cwd();
    let backupDir: string | undefined;

    // 1. Create backup snapshot of all affected files
    if (options.backup !== false) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      backupDir = path.join(workspaceRoot, '.fbd-backup', timestamp);
      fs.mkdirSync(backupDir, { recursive: true });

      const uniqueFiles = Array.from(new Set(patches.map((p) => p.filePath)));
      for (const file of uniqueFiles) {
        if (fs.existsSync(file)) {
          const relPath = path.relative(workspaceRoot, file);
          const backupDest = path.join(backupDir, relPath);
          fs.mkdirSync(path.dirname(backupDest), { recursive: true });
          fs.copyFileSync(file, backupDest);
        }
      }
    }

    // 2. Group patches by file
    const filePatchMap = new Map<string, PatchOperation[]>();
    for (const patch of patches) {
      const list = filePatchMap.get(patch.filePath) || [];
      list.push(patch);
      filePatchMap.set(patch.filePath, list);
    }

    const repairs: BatchRepairResult['repairs'] = [];
    let appliedCount = 0;
    let failedCount = 0;

    for (const [filePath, filePatches] of filePatchMap.entries()) {
      if (!fs.existsSync(filePath)) {
        for (const p of filePatches) {
          failedCount++;
          repairs.push({
            filePath,
            description: p.description,
            success: false,
            error: 'File does not exist'
          });
        }
        continue;
      }

      let content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      // Sort patches in descending order of lineStart so earlier line numbers are never disturbed
      const sortedPatches = [...filePatches].sort((a, b) => {
        const lineA = a.lineStart ?? 999999;
        const lineB = b.lineStart ?? 999999;
        return lineB - lineA;
      });

      let fileHasError = false;

      for (const patch of sortedPatches) {
        if (patch.lineStart && patch.lineStart <= lines.length) {
          const targetLineIdx = patch.lineStart - 1;
          const currentLine = lines[targetLineIdx];

          if (currentLine && currentLine.includes(patch.originalText)) {
            lines[targetLineIdx] = currentLine.replace(patch.originalText, patch.replacementText);
            appliedCount++;
            repairs.push({
              filePath,
              description: patch.description,
              success: true
            });
            continue;
          }
        }

        // Fallback to content-level replacement if line not exact
        if (content.includes(patch.originalText)) {
          content = content.replace(patch.originalText, patch.replacementText);
          appliedCount++;
          repairs.push({
            filePath,
            description: patch.description,
            success: true
          });
        } else {
          fileHasError = true;
          failedCount++;
          repairs.push({
            filePath,
            description: patch.description,
            success: false,
            error: 'Original text not found in target file'
          });
        }
      }

      // If line modifications were made, join lines
      if (!fileHasError) {
        const finalContent = lines.join('\n');
        fs.writeFileSync(filePath, finalContent, 'utf8');
      }
    }

    return {
      appliedCount,
      failedCount,
      backupDir,
      repairs
    };
  }

  /**
   * Restores files from a backup snapshot.
   */
  public static rollback(backupDir: string, workspaceRoot: string): void {
    const resolvedBackup = path.resolve(backupDir);
    const resolvedRoot = path.resolve(workspaceRoot);

    if (!fs.existsSync(resolvedBackup)) {
      throw new Error(`Backup directory "${resolvedBackup}" does not exist.`);
    }

    const restoreDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isSymbolicLink()) {
          // Reject restoring symlinks to prevent symlink traversal attacks
          continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          restoreDir(full);
        } else if (entry.isFile()) {
          const rel = path.relative(resolvedBackup, full);
          const target = path.resolve(resolvedRoot, rel);

          // Path containment check: ensure target does not escape workspace root
          if (!target.startsWith(resolvedRoot + path.sep) && target !== resolvedRoot) {
            throw new Error(`Security validation failed: restoration target "${target}" escapes workspace root "${resolvedRoot}".`);
          }

          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.copyFileSync(full, target);
        }
      }
    };

    restoreDir(resolvedBackup);
  }

  /**
   * Generates diffs for all repairable findings.
   */
  public static generateDiffs(findings: DiagnosticFinding[]): DiffPreview[] {
    const previews: DiffPreview[] = [];
    for (const finding of findings) {
      if (finding.repairable && finding.proposedPatch) {
        previews.push(this.previewPatch(finding.proposedPatch));
      }
    }
    return previews;
  }
}
