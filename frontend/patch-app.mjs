/**
 * Phase 4 Frontend Patcher - applies targeted string replacements to App.jsx
 * Runs once to inject auth gates and clean up corrupted insertions.
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(__dirname, 'src', 'App.jsx');
let src = readFileSync(appPath, 'utf8');

// ─── FIX 1: Remove the corrupted auth block injected inside navItems.map ─────
// It was injected between `const isActive = tab === item.id;` and the button
src = src.replace(
  `            const isActive = tab === item.id;
            // Early return: auth gates
  if (authMode === 'checking') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, border: '3px solid #25D366', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#64748b', fontSize: 14 }}>Loading GS Shop Dashboard…</p>
        </div>
      </div>
    );
  }

  if (authMode === 'setup') {
    return <SetupView form={setupForm} setForm={setSetupForm} onSubmit={handleSetup} loading={authLoading} error={authError} />;
  }

  if (authMode === 'login') {
    return <LoginView form={loginForm} setForm={setLoginForm} onSubmit={handleLogin} loading={authLoading} error={authError} />;
  }

  return (
              <button`,
  `            const isActive = tab === item.id;
            return (
              <button`
);
console.log('[FIX 1] Removed corrupted auth block from navItems.map');

// ─── FIX 2: Add auth gate returns right before the main App return ─────────────
// Find the top-level `return (` inside App that renders the app-container div
src = src.replace(
  `  return (
    <div className="app-container">`,
  `  // ── Auth Gates (early returns) ──────────────────────────────
  if (authMode === 'checking') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc', flexDirection: 'column', gap: 12 }}>
        <div style={{ width: 48, height: 48, border: '3px solid #25D366', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>Loading GS Shop Dashboard…</p>
      </div>
    );
  }
  if (authMode === 'setup') {
    return <SetupView form={setupForm} setForm={setSetupForm} onSubmit={handleSetup} loading={authLoading} error={authError} />;
  }
  if (authMode === 'login') {
    return <LoginView form={loginForm} setForm={setLoginForm} onSubmit={handleLogin} loading={authLoading} error={authError} />;
  }

  return (
    <div className="app-container">`
);
console.log('[FIX 2] Added auth gate early returns before main render');

// ─── FIX 3: Update user-profile section to show real owner name + logout ──────
src = src.replace(
  `            <div className="user-profile">
              <div className="user-avatar">GS</div>
              <div className="user-meta">
                <b>GS Admin</b>
                <small>Alangulam</small>
              </div>
            </div>`,
  `            <div className="user-profile">
              <div className="user-avatar">{authOwner?.displayName?.charAt(0)?.toUpperCase() || 'G'}</div>
              <div className="user-meta">
                <b>{authOwner?.displayName || 'GS Admin'}</b>
                <small>@{authOwner?.username || 'admin'}</small>
              </div>
            </div>
            <button
              className="action-icon-btn"
              onClick={handleLogout}
              title="Logout"
              style={{ color: '#ef4444' }}
            >
              <LogOut size={17} />
            </button>`
);
console.log('[FIX 3] Updated user profile to show real owner + logout button');

// ─── FIX 4: Replace the empty SettingsView with a real one ─────────────────
// Find the stub and replace it
if (src.includes(`{tab === 'settings' && <SettingsView />}`)) {
  src = src.replace(
    `{tab === 'settings' && <SettingsView />}`,
    `{tab === 'settings' && <SettingsView authOwner={authOwner} onChangePassword={async (curr, newp) => {
              try {
                await request('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: curr, newPassword: newp }) });
                setNotice('Password changed successfully.');
              } catch (e) { setError(e.message); }
            }} />}`
  );
  console.log('[FIX 4] Updated SettingsView invocation with real props');
} else {
  console.warn('[FIX 4] SettingsView pattern not found — may already be updated');
}

writeFileSync(appPath, src, 'utf8');
console.log('\nDone patching App.jsx');
