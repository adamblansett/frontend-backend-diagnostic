import { DiagnosticRunSummary } from '../types/index.js';

export class JsonReporter {
  public static generate(summary: DiagnosticRunSummary): string {
    return JSON.stringify(summary, null, 2);
  }
}
