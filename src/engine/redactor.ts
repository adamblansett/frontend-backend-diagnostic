export class Redactor {
  private static readonly SECRET_PATTERNS: { regex: RegExp; replacement: string }[] = [
    // Private keys
    {
      regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
      replacement: '[REDACTED_PRIVATE_KEY]'
    },
    // Bearer / OAuth Tokens
    {
      regex: /Bearer\s+([a-zA-Z0-9_\-\.]{15,})/gi,
      replacement: 'Bearer [REDACTED_TOKEN]'
    },
    // Basic Auth
    {
      regex: /Basic\s+([a-zA-Z0-9+/=]{10,})/gi,
      replacement: 'Basic [REDACTED_BASIC_AUTH]'
    },
    // JWT pattern: xxx.yyy.zzz
    {
      regex: /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g,
      replacement: '[REDACTED_JWT]'
    },
    // GitHub Personal Access Tokens & OAuth tokens
    {
      regex: /\b(github_pat_[0-9a-zA-Z_]{82})\b/g,
      replacement: '[REDACTED_GITHUB_TOKEN]'
    },
    {
      regex: /\b(gh[pousr]_[0-9a-zA-Z]{36,})\b/g,
      replacement: '[REDACTED_GITHUB_TOKEN]'
    },
    // Slack Tokens
    {
      regex: /\b(xox[bpar]-[0-9a-zA-Z\-]{24,})\b/g,
      replacement: '[REDACTED_SLACK_TOKEN]'
    },
    // Anthropic API Keys
    {
      regex: /\b(sk-ant-api03-[a-zA-Z0-9_\-]{80,})\b/g,
      replacement: '[REDACTED_ANTHROPIC_KEY]'
    },
    // SendGrid API Keys
    {
      regex: /\b(SG\.[a-zA-Z0-9_\-]{22}\.[a-zA-Z0-9_\-]{43})\b/g,
      replacement: '[REDACTED_SENDGRID_KEY]'
    },
    // Stripe API Keys
    {
      regex: /\b((?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{20,}|stripe_test_placeholder_[0-9a-zA-Z]+)\b/g,
      replacement: '[REDACTED_STRIPE_KEY]'
    },
    // OpenAI and Generic sk- API Keys
    {
      regex: /\b(sk-[a-zA-Z0-9]{32,})\b/g,
      replacement: '[REDACTED_API_KEY]'
    },
    // Google API Keys
    {
      regex: /\b(AIza[0-9A-Za-z-_]{35})\b/g,
      replacement: '[REDACTED_GOOGLE_API_KEY]'
    },
    // AWS Access Key IDs & Temporary Session Keys
    {
      regex: /\b((?:AKIA|ASIA)[0-9A-Z]{16}|AWS_EXAMPLE_KEY_PLACEHOLDER)\b/g,
      replacement: '[REDACTED_AWS_KEY]'
    },
    // NPM and PyPI Access Tokens
    {
      regex: /\b(npm_[a-zA-Z0-9]{36})\b/g,
      replacement: '[REDACTED_NPM_TOKEN]'
    },
    {
      regex: /\b(pypi-AgEIcHlwaS5vcmc[a-zA-Z0-9_\-]{50,})\b/g,
      replacement: '[REDACTED_PYPI_TOKEN]'
    },
    // URLs with user:password@host (including passwords containing special chars like @)
    {
      regex: /([a-zA-Z]+:\/\/[^:\/\s]+):([^\/\s]+)@([a-zA-Z0-9.\-_]+(?::\d+)?(?:[\/\?]|$))/g,
      replacement: '$1:[REDACTED_PASSWORD]@$3'
    },
    // Key-value pairs for secrets: API_KEY=..., SECRET=..., PASSWORD=...
    {
      regex: /(password|secret|api_key|apikey|token|private_key|auth_token|access_token)\s*([:=])\s*["']?([^\s"';,]+)["']?/gi,
      replacement: '$1$2"[REDACTED_SECRET]"'
    },
    // Cookie session / auth tokens
    {
      regex: /(sessionid|connect\.sid|auth_token|token)=([^;,\s]+)/gi,
      replacement: '$1=[REDACTED_COOKIE]'
    }
  ];

  /**
   * Redacts sensitive secrets from a string.
   */
  public static redactString(input: string): string {
    if (!input || typeof input !== 'string') return input;
    let sanitized = input;
    for (const pattern of this.SECRET_PATTERNS) {
      sanitized = sanitized.replace(pattern.regex, pattern.replacement);
    }
    return sanitized;
  }

  /**
   * Deeply redacts sensitive properties and string values from an object or array.
   */
  public static redactObject<T>(obj: T): T {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'string') {
      return this.redactString(obj) as unknown as T;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.redactObject(item)) as unknown as T;
    }

    if (typeof obj === 'object') {
      const copy: Record<string, any> = {};
      const sensitiveKeys = /password|secret|apikey|api_key|token|authorization|cookie|private|key/i;

      for (const [key, value] of Object.entries(obj)) {
        if (sensitiveKeys.test(key) && typeof value === 'string') {
          copy[key] = '[REDACTED_SECRET]';
        } else {
          copy[key] = this.redactObject(value);
        }
      }
      return copy as T;
    }

    return obj;
  }
}
