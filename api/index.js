// Vercel serverless entrypoint (vercel-deployment-and-auth, task 6.2).
//
// Importing the app pulls in `web/config.js`, whose module-level config
// validates the environment and throws under Vercel when a required secret is
// missing, MOCK_LLM is enabled, or the backend is not OpenRouter — so a
// misconfigured deployment fails closed before any request is served. The
// Express app is directly callable as a (req, res) handler, so exporting it is
// all Vercel needs.
import app from '../web/server.js';

export default app;
