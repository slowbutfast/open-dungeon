// Environment configuration with fail-closed production validation
// (vercel-deployment-and-auth, task 2.1).
//
// The config is a pure function of the environment (`loadConfig`) so tests can
// exercise the fail-closed guard with synthetic environments. The module-level
// `config` singleton is evaluated at import time; under Vercel a missing or
// unsafe secret therefore halts boot before any route is mounted.

const DEV_SESSION_SECRET = 'open-dungeon-dev-session-secret';

/** Throwing validator for a production (Vercel) environment. */
export function validateProductionConfig(env = process.env) {
    const missing = [];
    if (!env.VERCEL_APP_CLIENT_ID) missing.push('VERCEL_APP_CLIENT_ID');
    if (!env.VERCEL_APP_CLIENT_SECRET) missing.push('VERCEL_APP_CLIENT_SECRET');
    if (!env.SESSION_SECRET) missing.push('SESSION_SECRET');
    if (!env.OPENROUTER_API_KEY) missing.push('OPENROUTER_API_KEY');

    if (missing.length > 0) {
        throw new Error(
            `Fail-closed: missing required production environment variable(s): ${missing.join(', ')}. ` +
            'Refusing to boot on Vercel without them.'
        );
    }
    if (env.MOCK_LLM === '1') {
        throw new Error('Fail-closed: MOCK_LLM=1 must not be enabled in production on Vercel.');
    }
    if (env.LLM_BACKEND !== 'openrouter') {
        throw new Error(
            `Fail-closed: LLM_BACKEND must be "openrouter" in production on Vercel (got ${JSON.stringify(env.LLM_BACKEND)}).`
        );
    }
    return true;
}

/** Build the runtime config object from an environment. */
export function loadConfig(env = process.env) {
    const isVercel = env.VERCEL === '1';

    if (isVercel) {
        validateProductionConfig(env);
    }

    return {
        isVercel,
        nodeEnv: env.NODE_ENV || (isVercel ? 'production' : 'development'),
        isProduction: isVercel || env.NODE_ENV === 'production',
        sessionSecret: env.SESSION_SECRET || (isVercel ? null : DEV_SESSION_SECRET),
        vercelClientId: env.VERCEL_APP_CLIENT_ID || null,
        vercelClientSecret: env.VERCEL_APP_CLIENT_SECRET || null,
        openrouterApiKey: env.OPENROUTER_API_KEY || null,
        llmBackend: env.LLM_BACKEND || null,
        mockLlm: env.MOCK_LLM === '1',
        appUrl: env.APP_URL || null,
        userSpendLimit: parseFloat(env.USER_SPEND_LIMIT_USD || '2.50'),
        globalSpendLimit: parseFloat(env.GLOBAL_SPEND_LIMIT_USD || '50.00'),
        kvUrl: env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || null,
        kvToken: env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || null
    };
}

export const config = loadConfig(process.env);
