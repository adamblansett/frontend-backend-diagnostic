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
    // Common API Keys (Stripe, OpenAI, GitHub, Google, AWS, Slack)
    {
      regex: /\b((?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{20,}|stripe_test_placeholder_[0-9a-zA-Z]+)\b/g,
      replacement: '[REDACTED_STRIPE_KEY]'
    },
    {
      regex: /\b(sk-[a-zA-Z0-9]{32,})\b/g,
      replacement: '[REDACTED_API_KEY]'
    },
    {
      regex: /\b(ghp_[0-9a-zA-Z]{36})\b/g,
      replacement: '[REDACTED_GITHUB_TOKEN]'
    },
    {
      regex: /\b(AIza[0-9A-Za-z-_]{35})\b/g,
      replacement: '[REDACTED_GOOGLE_API_KEY]'
    },
    {
      regex: /\b(AKIA[0-9A-Z]{16}|AWS_EXAMPLE_KEY_PLACEHOLDER)\b/g,
      replacement: '[REDACTED_AWS_KEY]'
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
   * Recursively redacts sensitive values inside objects, arrays, and primitive fields.
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
      const result: Record<string, unknown> = {};
      const sensitiveKeys = /password|secret|apikey|api_key|token|authorization|cookie|private/i;

      for (const [key, value] of Object.entries(obj)) {
        if (sensitiveKeys.test(key) && typeof value === 'string') {
          result[key] = '[REDACTED_SECRET]';
        } else {
          result[key] = this.redactObject(value);
        }
      }
      return result as unknown as T;
    }

    return obj;
  }
}
