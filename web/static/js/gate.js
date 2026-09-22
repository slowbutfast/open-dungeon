// Access gate auth_error banner (enforce-vercel-auth-gate).
//
// External module rather than an inline <script>: the site-wide CSP sets
// `script-src 'self'`, so an inline handler never runs in production.

const MESSAGES = {
  oauth_failed: 'AUTHENTICATION FAILURE // The Vercel authorization was denied, expired, or could not be verified. Retry the sign-in handshake.',
  oauth_not_configured: 'CONFIGURATION FAULT // Vercel OAuth is not configured for this deployment. Notify the operator before retrying.'
};

export function initGateBanner(search = window.location.search) {
  const code = new URLSearchParams(search).get('auth_error');
  if (!code) return false;

  const banner = document.getElementById('auth-error');
  if (!banner) return false;

  banner.textContent = '> ' + (MESSAGES[code] || ('AUTH ERROR // ' + code));
  banner.hidden = false;
  return true;
}

initGateBanner();