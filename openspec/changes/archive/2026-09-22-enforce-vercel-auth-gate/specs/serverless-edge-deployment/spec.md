## MODIFIED Requirements

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
