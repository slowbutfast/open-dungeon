# serverless-edge-deployment Specification

## Purpose
Defines the edge deployment, HTTP routing, Content Security Policy, caching controls, and serverless execution configuration for running OpenDungeon on Vercel.
## Requirements
### Requirement: Serverless Function Entrypoint and Rewrites
The system SHALL export the Express application via `api/index.js`, and `vercel.json` SHALL configure URL rewrites routing `/api/(.*)` and the root document (`/`) to `api/index.js`, while routing static assets (`/static/(.*)`) directly to static files via Vercel Edge CDN. The function configuration in `vercel.json` SHALL specify `"includeFiles": "web/templates/**"` so that dynamic templates can be served from the serverless function.

#### Scenario: Serverless API execution
- **WHEN** an incoming HTTP request matches `/api/(.*)` on Vercel
- **THEN** the request is forwarded to `api/index.js`, processed by the Express app, and returned with appropriate headers and status

#### Scenario: Direct CDN static file serving
- **WHEN** an incoming HTTP request asks for `/static/(.*)`
- **THEN** Vercel Edge CDN serves the file directly from `web/static/` without invoking `api/index.js`

#### Scenario: Root document serverless routing
- **WHEN** an incoming HTTP request asks for `/`
- **THEN** Vercel routes the request to `api/index.js` where Express checks authentication and serves the appropriate template

### Requirement: Function Execution Duration
The deployment configuration in `vercel.json` SHALL set `"maxDuration": 60` for `api/index.js` to ensure long-running LLM generation turns and Server-Sent Event streams complete without premature serverless timeout.

#### Scenario: Turn execution time allowance
- **WHEN** an LLM generation turn takes 35 seconds to stream narrative chunks
- **THEN** the serverless invocation continues executing normally within its 60-second execution window

### Requirement: Edge Content Security Policy and Headers
The system SHALL configure HTTP response headers in `vercel.json` to enforce strict Content Security Policy and MIME security rules. The CSP SHALL permit required external resources (Google Fonts, OpenRouter API, Vercel OAuth endpoints) while forbidding unsafe eval.

#### Scenario: CSP header enforcement
- **WHEN** any page or asset is requested from the Vercel deployment
- **THEN** the response includes `Content-Security-Policy` granting `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`, `font-src 'self' https://fonts.gstatic.com`, `connect-src 'self' https://openrouter.ai https://api.vercel.com https://vercel.com`, and `X-Content-Type-Options: nosniff`

### Requirement: Granular Static Caching Controls
The deployment configuration SHALL specify granular cache-control headers in `vercel.json`. Third-party vendor libraries SHALL receive immutable long-term caching, unbundled ES modules SHALL receive `no-store` headers to prevent stale execution across edge deployments, and static media SHALL receive standard public caching.

#### Scenario: Vendor library caching
- **WHEN** a browser requests a vendor script from `/static/js/vendor/(.*)`
- **THEN** the edge returns `Cache-Control: public, max-age=31536000, immutable`

#### Scenario: Unbundled JS module caching
- **WHEN** a browser requests an application script from `/static/js/(.*)`
- **THEN** the edge returns `Cache-Control: no-cache, no-store, must-revalidate`

#### Scenario: Static media caching
- **WHEN** a browser requests CSS or audio from `/static/(.*)`
- **THEN** the edge returns `Cache-Control: public, max-age=3600, must-revalidate`

### Requirement: Deployment Exclusions
The repository `.vercelignore` SHALL exclude test files, documentation, Python virtual environments, diagnostics, scratch directories, and local playgrounds from edge deployment.

#### Scenario: Deployment bundle hygiene
- **WHEN** the project is built and packaged on Vercel
- **THEN** directories `tests/`, `docs/`, `venv/`, `diagnostics/`, `scratch/`, and `playgrounds/` are omitted from the deployed bundle

