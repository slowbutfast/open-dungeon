# spend-quota-enforcement Specification

## Purpose
Defines the authoritative lifetime spend tracking, concurrency defense, and quota enforcement system, guaranteeing each authenticated user account has a maximum limit of $2.50 in OpenRouter LLM generation costs, guarded by an in-flight turn lock and an overarching global project spending ceiling.

## ADDED Requirements

### Requirement: Authoritative Durable Spend Ledger
The system SHALL maintain a durable record of accumulated OpenRouter costs per user account keyed by the user's OpenID `sub` (`user:spend:<subId>`) using Vercel KV / Upstash Redis. When running in production (`VERCEL === '1'`), mutations SHALL use atomic float increments (`HINCRBYFLOAT`). In local development where KV is unconfigured, the system SHALL fall back to a local memory or disk ledger.

#### Scenario: Authoritative balance retrieval
- **WHEN** the system checks an authenticated user's accumulated spend
- **THEN** the total spent is queried from the durable KV store key `user:spend:<subId>`

#### Scenario: Atomic spend increment
- **WHEN** an LLM generation completes with known token consumption
- **THEN** the computed cost is atomically added to `user:spend:<subId>`, and the new total is returned

### Requirement: Lifetime $2.50 Spend Cap & Default-Deny Route Guard
The system SHALL enforce a strict lifetime ceiling of $2.50 per user account across ALL routes that invoke LLM completions, including `/api/init`, `/api/action`, `/api/summary`, `/api/lore`, `/api/scan`, and `/api/goals/complete`. If an authenticated user's accumulated spend reaches or exceeds $2.50, any LLM-touching request SHALL be rejected.

#### Scenario: User within quota balance
- **WHEN** an authenticated user with $1.50 in total spend submits a game action to `/api/action` or initializes an adventure at `/api/init`
- **THEN** the request proceeds to LLM narration generation

#### Scenario: User quota exhausted
- **WHEN** an authenticated user with $2.50 or more in total spend submits a request to any LLM-touching endpoint
- **THEN** the request is rejected immediately with HTTP 402 Payment Required and JSON `{ "error": "Quota exceeded", "limit": 2.50, "spent": ... }` without contacting OpenRouter

#### Scenario: Unauthenticated access to cost-incurring route
- **WHEN** an unauthenticated visitor requests `/api/init` or `/api/action`
- **THEN** the request is rejected immediately with HTTP 401 Unauthorized

### Requirement: In-Flight Concurrency Lock
The system SHALL acquire an atomic in-flight lock in KV (`user:lock:<subId>`) with a 30-second TTL before processing any LLM turn for a user, releasing the lock upon turn completion. If a concurrent request arrives while a turn is in-flight for the same user, it SHALL be rejected.

#### Scenario: Concurrent turn attempt
- **WHEN** a user with a turn already in-flight sends a second action request
- **THEN** the server detects the active lock and returns HTTP 429 Too Many Requests, preventing parallel overspend race conditions

### Requirement: Global Project Spend Kill-Switch
The system SHALL maintain a global aggregate project spend counter in KV (`global:spend:total`). If the aggregate project spend exceeds the configured global limit (default: $50.00), ALL LLM requests across all users SHALL be immediately halted.

#### Scenario: Global ceiling reached
- **WHEN** `global:spend:total` reaches or exceeds $50.00
- **THEN** all subsequent LLM requests return HTTP 503 Service Unavailable with `{ "error": "Global service quota reached" }`, preventing runaway project-wide costs

### Requirement: Comprehensive Turn Token Cost Calculation
The system SHALL calculate the exact financial cost of all LLM operations executed during a turn (including narration, summarization, extraction, and opening scenes) using model pricing metadata (`prompt_price` and `completion_price` per 1M tokens), and aggregate them into the user's spend ledger.

#### Scenario: Calculate multi-call turn cost
- **WHEN** a turn executes a narration completion (1200 prompt, 350 completion tokens) followed by background extraction (800 prompt, 150 completion tokens)
- **THEN** the costs of both completions are summed and atomically committed to the user's spend ledger

#### Scenario: Unlisted model fallback pricing
- **WHEN** a turn runs on a model not explicitly listed in the pricing catalog
- **THEN** the system applies a conservative default cost rate ($0.002 / 1K tokens) to prevent zero-cost credit draining

### Requirement: Real-Time SSE Quota Streaming
Because action responses stream narration chunks via Server-Sent Events (`text/event-stream`), the system SHALL call `res.flushHeaders()` immediately upon initiating the stream, and SHALL emit the updated spend and remaining quota as a JSON SSE event over the active stream before terminating the connection.

#### Scenario: SSE quota event emission
- **WHEN** narration streaming finishes and token consumption is recorded
- **THEN** an SSE message with format `data: {"type": "user_quota", "spent": <float>, "remaining": <float>, "limit": 2.50}\n\n` is written to the client stream before closing

### Requirement: User Quota Inspection Endpoint
The system SHALL provide a `/api/user/quota` endpoint allowing authenticated clients to query their current spend, remaining balance, and total quota limit.

#### Scenario: Query user quota
- **WHEN** an authenticated user calls `GET /api/user/quota`
- **THEN** the server returns HTTP 200 with `{ "authenticated": true, "spent": <float>, "remaining": <float>, "limit": 2.50 }`
