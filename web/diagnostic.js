// Diagnostic renderers for configuration and boot issues.
// Renders human-readable HTML for browser navigation and structured JSON for API calls.

export function renderConfigDiagnosticJson(cfg) {
    return {
        status: 500,
        error: 'Configuration Error',
        failClosed: true,
        message: cfg.configError || 'OpenDungeon is missing required production configuration.',
        missing: cfg.missingVars || [],
        errors: cfg.configErrors || (cfg.configError ? [cfg.configError] : []),
        warnings: cfg.configWarnings || [],
        remedy: 'Add the missing environment variables in Vercel Project Settings > Environment Variables, then redeploy.'
    };
}

export function renderConfigDiagnosticHtml(cfg) {
    const missing = cfg.missingVars || [];
    const errors = cfg.configErrors || (cfg.configError ? [cfg.configError] : []);
    const warnings = cfg.configWarnings || [];

    const envDefinitions = [
        {
            name: 'OPENROUTER_API_KEY',
            required: true,
            desc: 'OpenRouter API key used for story narration and game mechanics.',
            example: 'sk-or-v1-...'
        },
        {
            name: 'LLM_BACKEND',
            required: true,
            desc: 'Must be set to "openrouter" in Vercel production.',
            example: 'openrouter'
        },
        {
            name: 'SESSION_SECRET',
            required: true,
            desc: 'Cryptographic secret (32+ chars) used to sign HMAC-SHA256 session cookies.',
            example: 'e.g. openssl rand -hex 32'
        },
        {
            name: 'VERCEL_APP_CLIENT_ID',
            required: true,
            desc: 'Client ID from your Vercel OAuth Application (under Vercel Account Settings > Integrations / OAuth).',
            example: 'oac_...'
        },
        {
            name: 'VERCEL_APP_CLIENT_SECRET',
            required: true,
            desc: 'Client Secret from your Vercel OAuth Application.',
            example: '...'
        },
        {
            name: 'KV_REST_API_URL',
            required: false,
            desc: 'Vercel KV or Upstash Redis REST URL for multi-turn state persistence and rate/spend quotas.',
            example: 'https://...upstash.io'
        },
        {
            name: 'KV_REST_API_TOKEN',
            required: false,
            desc: 'Vercel KV or Upstash Redis REST token.',
            example: '...'
        }
    ];

    const errorListHtml = errors.length > 0
        ? `<ul class="issue-list">${errors.map(e => `<li><span class="badge badge-error">ERROR</span> <code>${escapeHtml(e)}</code></li>`).join('')}</ul>`
        : `<p class="dim">No specific error strings registered.</p>`;

    const warningListHtml = warnings.length > 0
        ? `<ul class="issue-list">${warnings.map(w => `<li><span class="badge badge-warn">WARN</span> <code>${escapeHtml(w)}</code></li>`).join('')}</ul>`
        : '';

    const varTableRows = envDefinitions.map(def => {
        const isMissing = missing.includes(def.name);
        const statusBadge = isMissing
            ? `<span class="badge badge-missing">MISSING</span>`
            : (def.required ? `<span class="badge badge-ok">CONFIGURED</span>` : `<span class="badge badge-opt">OPTIONAL</span>`);
        return `
            <tr class="${isMissing ? 'row-missing' : ''}">
                <td><code class="var-name">${escapeHtml(def.name)}</code></td>
                <td>${statusBadge}</td>
                <td>${escapeHtml(def.desc)}</td>
                <td><code>${escapeHtml(def.example)}</code></td>
            </tr>
        `;
    }).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OpenDungeon — Configuration Error</title>
    <style>
        :root {
            --bg: #0d1117;
            --panel: #161b22;
            --panel-border: #30363d;
            --text: #c9d1d9;
            --text-dim: #8b949e;
            --text-bright: #f0f6fc;
            --accent: #58a6ff;
            --error: #f85149;
            --error-bg: rgba(248, 81, 73, 0.15);
            --warn: #d29922;
            --warn-bg: rgba(210, 153, 34, 0.15);
            --ok: #3fb950;
            --ok-bg: rgba(63, 185, 80, 0.15);
            --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            background-color: var(--bg);
            color: var(--text);
            font-family: var(--font-mono);
            font-size: 14px;
            line-height: 1.6;
            padding: 32px 16px;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
        }
        .header {
            border-bottom: 2px solid var(--panel-border);
            padding-bottom: 20px;
            margin-bottom: 24px;
        }
        .logo {
            color: var(--accent);
            font-size: 20px;
            font-weight: 700;
            letter-spacing: 1px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .subtitle {
            color: var(--text-dim);
            font-size: 13px;
            margin-top: 4px;
        }
        .card {
            background: var(--panel);
            border: 1px solid var(--panel-border);
            border-radius: 6px;
            padding: 20px;
            margin-bottom: 20px;
        }
        .card-title {
            color: var(--text-bright);
            font-size: 15px;
            font-weight: 600;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .banner-error {
            border-left: 4px solid var(--error);
            background: var(--error-bg);
            padding: 16px;
            border-radius: 4px;
            margin-bottom: 20px;
        }
        .banner-error h2 {
            color: var(--error);
            font-size: 16px;
            margin-bottom: 6px;
        }
        .issue-list {
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .issue-list li {
            display: flex;
            align-items: baseline;
            gap: 10px;
        }
        .badge {
            display: inline-block;
            padding: 2px 7px;
            font-size: 11px;
            font-weight: 600;
            border-radius: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .badge-error { background: var(--error-bg); color: var(--error); border: 1px solid var(--error); }
        .badge-warn { background: var(--warn-bg); color: var(--warn); border: 1px solid var(--warn); }
        .badge-missing { background: var(--error-bg); color: var(--error); border: 1px solid var(--error); }
        .badge-ok { background: var(--ok-bg); color: var(--ok); border: 1px solid var(--ok); }
        .badge-opt { background: rgba(255,255,255,0.08); color: var(--text-dim); border: 1px solid var(--panel-border); }
        code {
            font-family: var(--font-mono);
            background: rgba(0,0,0,0.3);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 13px;
        }
        .var-name {
            color: var(--accent);
            font-weight: 600;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            font-size: 13px;
        }
        th, td {
            text-align: left;
            padding: 10px 12px;
            border-bottom: 1px solid var(--panel-border);
        }
        th {
            color: var(--text-dim);
            font-weight: 600;
            text-transform: uppercase;
            font-size: 11px;
            letter-spacing: 0.5px;
        }
        tr.row-missing {
            background: rgba(248, 81, 73, 0.05);
        }
        .instructions ol {
            padding-left: 24px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .instructions a {
            color: var(--accent);
            text-decoration: underline;
        }
        .footer {
            margin-top: 32px;
            text-align: center;
            color: var(--text-dim);
            font-size: 12px;
            display: flex;
            justify-content: center;
            gap: 16px;
        }
        .btn {
            display: inline-block;
            padding: 8px 16px;
            background: #21262d;
            border: 1px solid var(--panel-border);
            color: var(--text-bright);
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.15s ease;
        }
        .btn:hover {
            background: #30363d;
        }
    </style>
</head>
<body>
    <div class="container">
        <header class="header">
            <div class="logo">
                <span>[ OPENDUNGEON // SYSTEM DIAGNOSTIC ]</span>
            </div>
            <p class="subtitle">Deployment Environment: Vercel Serverless Function &nbsp;|&nbsp; Status: 500 Configuration Error (Fail-Closed)</p>
        </header>

        <div class="banner-error">
            <h2>&#9888; Required Configuration Missing on Vercel</h2>
            <p>OpenDungeon is running on Vercel (<code>VERCEL=1</code>), but essential production environment variables are missing. All game actions and authentication are halted in <strong>fail-closed</strong> mode until the variables below are configured.</p>
        </div>

        <div class="card">
            <div class="card-title">&#128308; Issues Detected</div>
            ${errorListHtml}
            ${warningListHtml}
        </div>

        <div class="card">
            <div class="card-title">&#128221; Environment Variables Audit</div>
            <table>
                <thead>
                    <tr>
                        <th>Variable</th>
                        <th>Status</th>
                        <th>Description</th>
                        <th>Expected / Example</th>
                    </tr>
                </thead>
                <tbody>
                    ${varTableRows}
                </tbody>
            </table>
        </div>

        <div class="card instructions">
            <div class="card-title">&#128295; How to Fix in Vercel</div>
            <ol>
                <li>Open your <a href="https://vercel.com/dashboard" target="_blank" rel="noopener">Vercel Dashboard</a> and select your <code>open-dungeon</code> project.</li>
                <li>Go to <strong>Settings</strong> &rarr; <strong>Environment Variables</strong>.</li>
                <li>Add each missing variable listed above (make sure to select <strong>Production</strong> and <strong>Preview</strong> environments).</li>
                <li>Go to <strong>Deployments</strong>, open the menu on the latest deployment, and click <strong>Redeploy</strong> (or push a new commit).</li>
            </ol>
        </div>

        <div class="footer">
            <a href="/" class="btn">&larr; Return to OpenDungeon Home</a>
            <button onclick="location.reload()" class="btn">&#8635; Retry Request</button>
        </div>
    </div>
</body>
</html>`;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
