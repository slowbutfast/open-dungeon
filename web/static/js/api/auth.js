// Auth + quota UI surface (vercel-deployment-and-auth, tasks 5.1–5.4).
//
// Renders the "Sign in with Vercel" / profile banner and the remaining-quota
// indicator, and centralizes the client-side handling of the 401 (login) and
// 402 (quota exhausted) responses returned by the default-deny guards.

function buildSignInBanner(banner) {
  banner.textContent = '';
  const link = document.createElement('a');
  link.className = 'btn btn-primary auth-signin';
  link.href = '/api/auth/login';
  link.textContent = 'Sign in with Vercel';
  banner.appendChild(link);
}

function buildProfileBanner(banner, user) {
  banner.textContent = '';
  const label = document.createElement('span');
  label.className = 'auth-user';
  label.textContent = `Signed in as ${user.name || user.email || user.sub}`;
  banner.appendChild(label);

  const out = document.createElement('a');
  out.className = 'btn btn-utility auth-signout';
  out.href = '/api/auth/logout';
  out.textContent = 'Sign out';
  banner.appendChild(out);
}

export function renderAuthBanner(me) {
  const banner = document.getElementById('auth-banner');
  if (!banner) return;
  if (me && me.authenticated && me.user) {
    buildProfileBanner(banner, me.user);
  } else {
    buildSignInBanner(banner);
  }
}

export function renderQuota(quota) {
  const el = document.getElementById('val-quota');
  if (!el || !quota) return;
  const limit = typeof quota.limit === 'number' ? quota.limit : 2.5;
  const remaining = typeof quota.remaining === 'number' ? quota.remaining : 0;
  el.textContent = `$${remaining.toFixed(2)} / $${limit.toFixed(2)}`;
  el.classList.toggle('quota-exhausted', remaining <= 0);
}

/**
 * Handle an auth/quota HTTP failure. Returns true when the response was
 * consumed (caller should stop processing), false otherwise.
 */
export function handleAuthError(status) {
  if (status === 401) {
    window.location.href = '/api/auth/login';
    return true;
  }
  if (status === 402) {
    alert('Your $2.50 free quota is exhausted.');
    return true;
  }
  if (status === 429) {
    alert('A turn is already in progress for this account. Please wait.');
    return true;
  }
  return false;
}

export async function initAuthBanner() {
  try {
    const meRes = await fetch('/api/user/me');
    if (meRes.ok) {
      renderAuthBanner(await meRes.json());
    } else if (meRes.status === 401) {
      renderAuthBanner(null);
    } else {
      renderAuthBanner(null);
    }
  } catch (e) {
    renderAuthBanner(null);
  }

  try {
    const quotaRes = await fetch('/api/user/quota');
    if (quotaRes.ok) {
      renderQuota(await quotaRes.json());
    }
  } catch (e) {
    // Leave the indicator blank until the first turn updates it.
  }
}
