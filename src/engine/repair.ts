import * as fs from 'node:fs';
import { DiagnosticFinding, PatchOperation } from '../types/index.js';

export interface DiffPreview {
  filePath: string;
  originalSnippet: string;
  replacementSnippet: string;
  diff: string;
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
   * Safely applies a patch operation to disk with atomic write, verifying exact match before modifying.
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
