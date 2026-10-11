import { DiagnosticCategory, DiagnosticContext, DiagnosticRule } from '../types/index.js';

export class RuleRegistry {
  private rules: Map<string, DiagnosticRule> = new Map();

  public register(rule: DiagnosticRule): void {
    if (this.rules.has(rule.id)) {
      throw new Error(`Rule with ID "${rule.id}" is already registered.`);
    }
    this.rules.set(rule.id, rule);
  }

  public getRule(id: string): DiagnosticRule | undefined {
    return this.rules.get(id);
  }

  public getAllRules(): DiagnosticRule[] {
    return Array.from(this.rules.values());
  }

  public getRulesByCategory(category: DiagnosticCategory): DiagnosticRule[] {
    return this.getAllRules().filter((r) => r.category === category);
  }

  public getApplicableRules(context: DiagnosticContext): DiagnosticRule[] {
    const requestedCategories = context.options.categories;
    return this.getAllRules().filter((rule) => {
      if (requestedCategories && requestedCategories.length > 0) {
        if (!requestedCategories.includes(rule.category)) {
          return false;
        }
      }
      return rule.applicability(context);
    });
  }
}
