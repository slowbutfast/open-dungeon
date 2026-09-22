// Vercel serverless entrypoint with graceful error boundary.
//
// Dynamic import ensures that any module initialization failure (missing
// environment variables, native binary incompatibilities, or bundle issues)
// is caught by the handler and rendered as a visible diagnostic page/JSON
// rather than crashing cold-start with an opaque FUNCTION_INVOCATION_FAILED.

let appPromise = null;

async function getApp() {
    if (!appPromise) {
        appPromise = import('../web/server.js').then(m => m.default);
    }
    return appPromise;
}

export default async function handler(req, res) {
    try {
        const app = await getApp();
        return app(req, res);
    } catch (err) {
        console.error('VERCEL_SERVERLESS_INIT_ERROR:', err);
        const acceptsHtml = req.headers && req.headers.accept && req.headers.accept.includes('text/html');
        res.statusCode = 500;
        if (acceptsHtml) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>OpenDungeon — Initialization Error</title>
    <style>
        body { background: #0d1117; color: #c9d1d9; font-family: ui-monospace, SFMono-Regular, monospace; padding: 32px 16px; margin: 0; }
        .container { max-width: 900px; margin: 0 auto; }
        h1 { color: #f85149; font-size: 20px; margin-bottom: 12px; }
        p { margin-bottom: 16px; font-size: 14px; line-height: 1.6; }
        pre { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 16px; overflow-x: auto; color: #ff7b72; font-size: 13px; line-height: 1.5; }
        .btn { display: inline-block; padding: 8px 16px; background: #21262d; border: 1px solid #30363d; color: #f0f6fc; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 16px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>[ OPENDUNGEON // INITIALIZATION FAILURE ]</h1>
        <p>The serverless function failed during startup:</p>
        <p><strong>${err.name || 'Error'}:</strong> <code>${err.message || 'Unknown error'}</code></p>
        <pre>${err.stack || 'No stack trace available'}</pre>
        <a href="/" class="btn">&larr; Return to Home</a>
    </div>
</body>
</html>`);
        } else {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({
                status: 500,
                error: 'Initialization Error',
                message: err.message,
                stack: err.stack
            }, null, 2));
        }
    }
}
