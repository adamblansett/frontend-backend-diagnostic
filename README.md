# frontend-backend-diagnostic (`fbd`)

A production-quality, extensible diagnostic and safe-repair CLI tool that detects, isolates, traces, and resolves integration failures between frontend web applications and backend API services.

---

## 1. Project Purpose & Principles

Modern full-stack web applications frequently suffer from subtle, intermittent integration defects at the boundaries between client bundles and backend microservices: URL path mismatches, double slashes, CORS configuration violations, response contract drifts, environment secret leaks, and silent error swallowing.

`fbd` operates under 10 strict engineering principles:
1. **Evidence before assumptions**: Findings must cite verifiable source lines, network traces, or schema comparisons.
2. **Diagnose before modifying code**: Read-only by default. Never mutate files without explicit authorization.
3. **Fix root causes rather than symptoms**: Resolve the fundamental integration mismatch.
4. **Preserve existing architecture**: Make targeted, minimal fixes without broad rewrites.
5. **Never fabricate test passes**: Report only actually executed and verified results.
6. **Never invent endpoints or behaviors**: Grounded strictly in static analysis and active traces.
7. **Preserve backward compatibility**: Minimize breaking contract changes.
8. **Protect credentials and secrets**: Automated redaction of passwords, tokens, and keys across all logs and reports.
9. **Deterministic diagnostics**: Reproducible execution across CI and local environments.
10. **Actionable findings**: Every finding provides reproduction steps, impact, and remediation guidance.

---

## 2. Supported Frameworks & Environments

| Layer | Supported Frameworks & Environments |
| :--- | :--- |
| **Frontend** | React, Next.js, Vue.js, Svelte, Vite, Angular, Vanilla JavaScript/TypeScript |
| **Backend** | Express, NestJS, Fastify, Python (FastAPI, Flask, Django), Go (Gin) |
| **Contracts** | REST APIs, OpenAPI 3.0 / 3.1, Swagger 2.0, JSON Schemas, TypeScript Interfaces |
| **Runtimes** | Node.js >= 18.0.0, Linux, macOS, Windows |

---

## 3. Installation & Getting Started

```bash
# Clone the repository
git clone https://github.com/adamblansett/frontend-backend-diagnostic.git
cd frontend-backend-diagnostic

# Install dependencies
npm install

# Build the TypeScript project
npm run build

# Link CLI globally (optional)
npm link
```

---

## 4. Diagnostic Commands

### Workspace Diagnostic Scan (`scan`)
Scans any target project directory, detects frameworks, evaluates diagnostic rules, and produces structured findings.

```bash
# Basic console scan
fbd scan ./my-project

# Generate GitHub-Flavored Markdown report
fbd scan ./my-project --format markdown --output diagnostic-report.md

# Generate Machine-Readable JSON report (CI/CD integration)
fbd scan ./my-project --format json --output diagnostic-summary.json

# Preview proposed safe patches without modifying files
fbd scan ./my-project --dry-run

# Authorize and apply safe repairs
fbd scan ./my-project --fix

# Filter by specific diagnostic categories
fbd scan ./my-project --categories AUTHENTICATION_SECURITY,API_CLIENT_CONFIGURATION
```

### Active 15-Stage Network Trace (`probe`)
Performs an active, live request trace against an endpoint and isolates failures to the exact lifecycle stage.

```bash
fbd probe http://localhost:3000/api/users --method GET
```

### API Contract Agreement Analysis (`contract`)
Extracts frontend API consumption patterns and backend route handlers/response schemas to detect contract drift.

```bash
fbd contract ./my-project
```

---

## 5. Diagnostic Rule Catalog

`fbd` includes modular, decoupled rules categorized by integration layer:

| Rule ID | Category | Severity | Description | Auto-Repair |
| :--- | :--- | :--- | :--- | :---: |
| `FE-URL-001` | `API_CLIENT_CONFIGURATION` | HIGH | Detects duplicate slashes (e.g. `//users`), missing base URLs, and URL path concatenation errors | Yes |
| `FE-ERR-001` | `REQUEST_LIFECYCLE` | HIGH / MED | Detects empty catch blocks and promise catch handlers that silently discard API failures | No |
| `FE-HDR-001` | `API_CLIENT_CONFIGURATION` | HIGH | Detects JSON-stringified payloads transmitted without `Content-Type: application/json` | Yes |
| `BE-CORS-001` | `AUTHENTICATION_SECURITY` | CRITICAL | Flags illegal CORS wildcard origin (`*`) paired with credentials (`credentials: true`) | Yes |
| `BE-ERR-001` | `ERROR_HANDLING` | HIGH | Flags backend catch blocks returning HTTP 200 OK for error payloads, bypassing client interceptors | No |
| `BE-RTE-001` | `ROUTING_HTTP_SEMANTICS` | MEDIUM | Detects trailing slash inconsistencies causing 404s or payload-dropping 301 redirects | Yes |
| `BE-HLT-001` | `DATABASE_DEPENDENCIES` | MEDIUM | Verifies presence of operational health check endpoints (`/health`, `/healthz`, `/status`) | No |
| `ENV-SEC-001` | `ENVIRONMENT_CONFIGURATION` | CRITICAL | Detects server secrets (DB passwords, private keys) prefixed with client-exposed prefixes (`NEXT_PUBLIC_`) | Yes |
| `ENV-URL-001` | `ENVIRONMENT_CONFIGURATION` | HIGH | Detects port or hostname discrepancies between frontend environment URLs and backend server listen ports | Yes |
| `CON-RSP-001` | `RESPONSE_CONTRACTS` | HIGH | Analyzes response payload schemas against frontend data consumption to identify missing properties | No |

---

## 6. End-to-End 15-Stage Request Lifecycle Model

When running `fbd probe`, requests are traced across 15 discrete stages:
1. `USER_INTERACTION`: User event initiation
2. `FRONTEND_EVENT_HANDLER`: Event dispatch
3. `FRONTEND_STATE_AND_VALIDATION`: Pre-flight state & validation
4. `API_CLIENT`: Client URL & parameter assembly
5. `NETWORK_REQUEST`: DNS lookup, TCP/TLS handshake, wire transmission
6. `REVERSE_PROXY_OR_GATEWAY`: Reverse proxy ingress & routing
7. `BACKEND_ROUTING_AND_MIDDLEWARE`: Route matching & middleware pipeline
8. `AUTHENTICATION_AND_AUTHORIZATION`: Credential validation & RBAC checks
9. `REQUEST_VALIDATION`: Request payload & schema validation
10. `BUSINESS_LOGIC`: Core domain service execution
11. `DATABASE_OR_EXTERNAL_SERVICE`: Persistence query & downstream dependency
12. `BACKEND_RESPONSE`: Response serialization & HTTP status code emission
13. `FRONTEND_RESPONSE_PARSING`: Client body parsing (JSON/Text/Blob)
14. `STATE_UPDATE`: Client state store mutation
15. `FINAL_UI_RENDERING`: DOM update and error boundary rendering

---

## 7. Security & Redaction Safeguards

`fbd` guarantees that sensitive credentials are never stored, logged, or emitted in diagnostic reports:
- **Automatic Redaction:** Bearer tokens, JWT tokens, AWS/Stripe/Google API keys, private key PEM blocks, passwords in connection strings, basic auth headers, and session cookies are sanitized with replacement tokens (e.g. `[REDACTED_PASSWORD]`, `[REDACTED_SECRET]`).
- **Read-Only Guarantee:** `fbd` never writes or alters project files unless explicitly invoked with `--fix`.
- **Dry-Run Inspection:** `--dry-run` displays unified diffs before any modification is permitted.

---

## 8. Verification & Testing

Run the full automated test suite:

```bash
# Type check TypeScript codebase
npm run typecheck

# Build project to dist/
npm run build

# Run unit and integration tests with Vitest
npm test
```

All 32 tests in the suite execute deterministically, testing the core rule engine, redaction engine, safe repair engine, 15-stage network probe, Markdown/JSON reporters, and fixtures (`fixtures/broken-app` and `fixtures/healthy-app`).

---

## 9. Known Limitations

- **Binary Protocols:** Current probes evaluate HTTP/1.1 and HTTP/2 REST endpoints; gRPC and binary protobuf inspection are planned for subsequent milestones.
- **Dynamic URL Generation:** Deep runtime string concatenation with non-static variables requires active probing via `fbd probe` rather than static scan.
- **Authorization Scopes:** Live probing verifies public and authenticated endpoints reachable from the execution host.

---

## 10. ⚖️ Legal Disclaimer & Limitation of Liability

### 1. "AS IS" and Express Warranty Disclaimer
This software, documentation, diagnostic heuristics, network probes, and automated repair engines are provided on an **"AS IS"** and **"AS AVAILABLE"** basis, **WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND**, either express, implied, statutory, or otherwise. To the maximum extent permitted by applicable law, the author, copyright holders, and contributors expressly disclaim all warranties, including but not limited to implied warranties of merchantability, fitness for a particular purpose, title, quiet enjoyment, and non-infringement.

### 2. Active Probing & Authorized Network Testing
- **Explicit Authorization Required:** The `fbd probe` command issues active network requests (DNS resolution, TCP socket connection, TLS handshakes, HTTP/HTTPS preflight, CORS inspection, and response parsing) to targeted hostnames and URLs.
- Users must only execute network probes against endpoints, servers, and networks that they own or have received explicit, documented authorization to test.
- Unauthorized scanning or probing may trigger web application firewalls (WAF), IP blocking, rate limiting, or violate cybercrime laws (including 18 U.S.C. § 1030). The user assumes full legal responsibility for all probe activities.

### 3. Automated Configuration Repairs (`--fix`)
- The automated repair engine (`--fix`) modifies configuration files (such as Next.js rewrites, Vite proxy tables, environment variable declarations, or CORS headers).
- Users are strictly required to preview proposed diffs using `--dry-run` and verify changes in a development branch before applying fixes.
- The author and contributors disclaim all liability for syntax errors, broken build configurations, unintended exposure of endpoints, or operational downtime resulting from automated fixes.

### 4. Limitation of Liability
To the maximum extent permitted by applicable law, **IN NO EVENT SHALL THE AUTHOR, COPYRIGHT HOLDERS, OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, PUNITIVE, OR CONSEQUENTIAL DAMAGES** (including, but not limited to, loss of use, data, revenue, profits, business, or goodwill; network disruptions; firewall bans; broken builds; downtime; or procurement of substitute goods or services), however caused and on any theory of liability, whether in contract, strict liability, tort (including negligence or otherwise), or statute, arising in any way out of the use, reproduction, modification, distribution, or reliance upon this software, even if advised of the possibility of such damages.

### 5. Third-Party Trademarks & Non-Affiliation
All product names, logos, brands, and registered trademarks mentioned within this project (including Next.js, Vite, React, Node.js, Express, FastAPI, and Vitest) are the property of their respective owners. Mention of these entities does not imply endorsement, sponsorship, or affiliation with the author.

---

## 11. 📄 License

This project is open-source software licensed under the [MIT License](LICENSE).
