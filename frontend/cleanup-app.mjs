/**
 * Final cleanup: removes ALL spurious auth-gate blocks injected into sub-components
 * and fixes the SettingsView to its correct form.
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(__dirname, 'src', 'App.jsx');
let src = readFileSync(appPath, 'utf8');

// This is the exact block that was spuriously injected 16 extra times
const AUTH_GATE_BLOCK = `  // Early return: auth gates
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

  return (`;

// Count all occurrences
let count = 0;
let pos = 0;
while ((pos = src.indexOf(AUTH_GATE_BLOCK, pos)) !== -1) {
  count++;
  pos += AUTH_GATE_BLOCK.length;
}
console.log(`Found ${count} occurrences of the spurious auth-gate block`);

if (count > 1) {
  // Keep the FIRST occurrence (which is correct, inside App component)
  // Remove all subsequent ones — replace them with just the `return (` they were replacing
  let kept = false;
  let result = src;
  let searchFrom = 0;
  while (true) {
    const idx = result.indexOf(AUTH_GATE_BLOCK, searchFrom);
    if (idx === -1) break;
    if (!kept) {
      kept = true;
      searchFrom = idx + AUTH_GATE_BLOCK.length;
      continue; // skip first occurrence
    }
    // Remove this spurious block — replace the whole block with just `return (`
    result = result.slice(0, idx) + '  return (' + result.slice(idx + AUTH_GATE_BLOCK.length);
    // Don't advance searchFrom — new occurrence may be at same position after replacement
  }
  src = result;
  console.log('Removed all spurious auth-gate blocks (kept 1 in App component)');
} else if (count === 1) {
  console.log('Only 1 occurrence found — already clean');
} else {
  console.log('No occurrences found — already cleaned or different format');
}

// Also fix the SettingsView body - it still has the spurious block at the top
// The SettingsView starts like:
//   function SettingsView() {
//     // Early return: auth gates  <-- spurious if still there
// After cleanup above this should be resolved already, but let's verify
const settingsViewIdx = src.indexOf('function SettingsView()');
if (settingsViewIdx !== -1) {
  const nextReturn = src.indexOf('return (', settingsViewIdx);
  const segment = src.slice(settingsViewIdx, nextReturn + 8);
  console.log('\nSettingsView preamble (first 200 chars):');
  console.log(segment.slice(0, 200));
}

writeFileSync(appPath, src, 'utf8');
console.log('\nDone cleanup.');
