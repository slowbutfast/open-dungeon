// Environment configuration with fail-closed production validation
// (vercel-deployment-and-auth, task 2.1).
//
// The config is a pure function of the environment (`loadConfig`) so tests can
// exercise the fail-closed guard with synthetic environments. The module-level
// `config` singleton is evaluated at import time; under Vercel a missing or
// unsafe secret therefore halts boot before any route is mounted.

const DEV_SESSION_SECRET = 'open-dungeon-dev-session-secret';

/** Check production (Vercel) environment and return detailed diagnostic findings. */
export function getProductionConfigErrors(env = process.env) {
    const missing = [];
    if (!env.VERCEL_APP_CLIENT_ID) missing.push('VERCEL_APP_CLIENT_ID');
    if (!env.VERCEL_APP_CLIENT_SECRET) missing.push('VERCEL_APP_CLIENT_SECRET');
    if (!env.SESSION_SECRET) missing.push('SESSION_SECRET');
    if (!env.OPENROUTER_API_KEY) missing.push('OPENROUTER_API_KEY');

    const errors = [];
    if (missing.length > 0) {
        errors.push(
            `Missing required production environment variable(s): ${missing.join(', ')}.`
        );
    }
    if (env.MOCK_LLM === '1') {
        errors.push('MOCK_LLM=1 must not be enabled in production on Vercel.');
    }
    if (env.LLM_BACKEND !== 'openrouter') {
        errors.push(
            `LLM_BACKEND must be "openrouter" in production on Vercel (got ${JSON.stringify(env.LLM_BACKEND)}).`
        );
    }

    const warnings = [];
    const hasKv = (env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL) &&
                  (env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN);
    if (!hasKv) {
        warnings.push('KV_REST_API_URL / KV_REST_API_TOKEN is not configured. Game state will fall back to in-memory store and reset between cold starts.');
    }

    return { errors, missing, warnings };
}

/** Throwing validator for a production (Vercel) environment. */
export function validateProductionConfig(env = process.env) {
    const { errors } = getProductionConfigErrors(env);
    if (errors.length > 0) {
        throw new Error(
            `Fail-closed: ${errors.join(' ')} Refusing to boot on Vercel without them.`
        );
    }
    return true;
}

/** Build the runtime config object from an environment. */
export function loadConfig(env = process.env) {
    const isVercel = env.VERCEL === '1';
    let configError = null;
    let configErrors = [];
    let missingVars = [];
    let configWarnings = [];

    if (isVercel) {
        const check = getProductionConfigErrors(env);
        if (check.errors.length > 0) {
            configError = `Fail-closed: ${check.errors.join(' ')}`;
            configErrors = check.errors;
            missingVars = check.missing;
            configWarnings = check.warnings;
        }
    }

    return {
        isVercel,
        configError,
        configErrors,
        missingVars,
        configWarnings,
        nodeEnv: env.NODE_ENV || (isVercel ? 'production' : 'development'),
        isProduction: isVercel || env.NODE_ENV === 'production',
        sessionSecret: env.SESSION_SECRET || (isVercel ? null : DEV_SESSION_SECRET),
        vercelClientId: env.VERCEL_APP_CLIENT_ID || null,
        vercelClientSecret: env.VERCEL_APP_CLIENT_SECRET || null,
        vercelOAuthScope: env.VERCEL_OAUTH_SCOPE || null,
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

