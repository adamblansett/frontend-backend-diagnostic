import { describe, it, expect } from 'vitest';
import { Redactor } from '../src/engine/redactor.js';

describe('Redactor', () => {
  it('redacts Bearer tokens from authorization strings', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.super_secret_payload.signature';
    const output = Redactor.redactString(input);
    expect(output).toContain('Bearer [REDACTED_TOKEN]');
    expect(output).not.toContain('super_secret_payload');
  });

  it('redacts passwords in database URLs', () => {
    const url = 'postgres://app_admin:P@ssw0rd12345@postgres.cluster.internal:5432/main_db';
    const output = Redactor.redactString(url);
    expect(output).toBe('postgres://app_admin:[REDACTED_PASSWORD]@postgres.cluster.internal:5432/main_db');
    expect(output).not.toContain('P@ssw0rd12345');
  });

it('redacts API keys and secret values', () => {
  const text =
    'stripe_key: stripe_test_placeholder_123456 and AWS key AWS_EXAMPLE_KEY_PLACEHOLDER';

  const output = Redactor.redactString(text);

  expect(output).toContain('[REDACTED_STRIPE_KEY]');
  expect(output).toContain('[REDACTED_AWS_KEY]');
  expect(output).not.toContain('stripe_test_placeholder_123456');
  expect(output).not.toContain('AWS_EXAMPLE_KEY_PLACEHOLDER');
});

  it('redacts private key PEM blocks', () => {
    const pem = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Y1+
-----END RSA PRIVATE KEY-----`;
    const output = Redactor.redactString(pem);
    expect(output).toBe('[REDACTED_PRIVATE_KEY]');
  });

  it('deeply redacts sensitive keys in nested objects', () => {
    const obj = {
      config: {
        host: 'api.example.com',
        apiKey: 'super-sensitive-api-token',
        nested: {
          userPassword: 'secretPassword!'
        }
      },
      publicData: 'hello world'
    };
    const redacted = Redactor.redactObject(obj);
    expect(redacted.config.apiKey).toBe('[REDACTED_SECRET]');
    expect(redacted.config.nested.userPassword).toBe('[REDACTED_SECRET]');
    expect(redacted.config.host).toBe('api.example.com');
    expect(redacted.publicData).toBe('hello world');
  });
});
