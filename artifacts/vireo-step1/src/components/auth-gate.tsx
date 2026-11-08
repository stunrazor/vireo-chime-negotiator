import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Building2, KeyRound, LogOut, Mail, RefreshCw, ShieldCheck, UserRound } from 'lucide-react';
import { QueryClient } from '@tanstack/react-query';
import {
  getAuthSession,
  login,
  logout,
  enrollMfa,
  requestPasswordRecovery,
  startMfaChallenge,
  setSelectedWorkspaceId,
  updatePasswordFromRecovery,
  verifyMfa,
  type AuthSession,
  type WorkspaceMembership,
} from '@/lib/vireo-api';

type AuthGateProps = {
  children: ReactNode;
  queryClient: QueryClient;
};

const WorkspaceRoleContext = createContext<string | null>(null);

export function useWorkspaceRole() {
  return useContext(WorkspaceRoleContext);
}

type AuthCallback =
  | { kind: 'password'; accessToken: string; linkType: 'invite' | 'recovery' }
  | { kind: 'error' };

function readAuthCallback(): AuthCallback | null {
  if (typeof window === 'undefined') return null;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const accessToken = hash.get('access_token') || query.get('access_token');
  const linkType = hash.get('type') || query.get('type');
  if (accessToken && (linkType === 'invite' || linkType === 'recovery')) {
    return { kind: 'password', accessToken, linkType };
  }
  if (
    accessToken ||
    hash.has('error') ||
    hash.has('error_code') ||
    query.has('error') ||
    query.has('error_code')
  ) {
    return { kind: 'error' };
  }
  return null;
}

const cardStyle = {
  width: 'min(100% - 36px, 440px)',
  margin: '8vh auto 48px',
  padding: '30px',
  border: '1px solid #302D43',
  borderRadius: '18px',
  background: 'linear-gradient(145deg, rgba(34,31,51,.96), rgba(25,23,38,.98))',
  boxShadow: '0 24px 70px rgba(0,0,0,.24)',
} as const;

function membershipsChanged(current: AuthSession, next: AuthSession) {
  const signature = (session: AuthSession) =>
    JSON.stringify(
      session.workspaces
        .map(({ id, language, role }) => [id, language, role])
        .sort(([leftId], [rightId]) => String(leftId).localeCompare(String(rightId))),
    );
  return signature(current) !== signature(next);
}

function selectWorkspace(session: AuthSession): WorkspaceMembership | undefined {
  if (typeof window !== 'undefined') {
    try {
      const savedId = window.localStorage.getItem(`vireo:selected-workspace:${session.user.id}`);
      const saved = session.workspaces.find((workspace) => workspace.id === savedId);
      if (saved) return saved;
    } catch {
      // Workspace choice is a convenience; session access never depends on storage.
    }
  }
  return session.workspaces[0];
}

export function AuthGate({ children, queryClient }: AuthGateProps) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authCallback, setAuthCallback] = useState<AuthCallback | null>(() => readAuthCallback());
  const [authMode, setAuthMode] = useState<'login' | 'recover' | 'set-password'>(() =>
    authCallback?.kind === 'password' ? 'set-password' : authCallback?.kind === 'error' ? 'recover' : 'login',
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [authError, setAuthError] = useState(() =>
    authCallback?.kind === 'error' ? 'This invite or password link is invalid or expired. Request a new link.' : '',
  );
  const [authNotice, setAuthNotice] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [revalidationError, setRevalidationError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const expiredHandling = useRef(false);
  const revalidationInFlight = useRef(false);
  const sessionRef = useRef<AuthSession | null>(null);
  const selectedIdRef = useRef('');
  const switchingRef = useRef(false);
  const authGeneration = useRef(0);

  const commitSession = (nextSession: AuthSession | null) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
  };
  const commitSelectedId = (workspaceId: string) => {
    selectedIdRef.current = workspaceId;
    setSelectedId(workspaceId);
  };

  useEffect(() => {
    const handleAuthCallback = () => {
      const callback = readAuthCallback();
      if (!callback) return;
      setAuthCallback(callback);
      setAuthMode(callback.kind === 'password' ? 'set-password' : 'recover');
      setAuthError(callback.kind === 'error'
        ? 'This invite or password link is invalid or expired. Request a new link.'
        : '');
      setAuthNotice('');
      setPasswordSaved(false);
    };
    window.addEventListener('hashchange', handleAuthCallback);
    return () => window.removeEventListener('hashchange', handleAuthCallback);
  }, []);

  useEffect(() => {
    if (!authCallback) return;
    void queryClient.cancelQueries().finally(() => queryClient.clear());
    const url = new URL(window.location.href);
    url.hash = '';
    for (const key of [
      'access_token', 'refresh_token', 'token_type', 'expires_in', 'expires_at',
      'provider_token', 'provider_refresh_token', 'type', 'code',
      'error', 'error_code', 'error_description',
    ]) {
      url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
  }, [authCallback, queryClient]);

  useEffect(() => {
    let active = true;
    if (authCallback) {
      setLoading(false);
      setLoadError('');
      setSelectedWorkspaceId(null);
      commitSelectedId('');
      commitSession(null);
      return () => {
        active = false;
      };
    }
    setLoading(true);
    setLoadError('');
    void getAuthSession()
      .then((nextSession) => {
        if (!active) return;
        const workspace = nextSession ? selectWorkspace(nextSession) : undefined;
        setSelectedWorkspaceId(workspace?.id);
        commitSelectedId(workspace?.id || '');
        commitSession(nextSession);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : 'Your session could not be checked.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadAttempt, authCallback]);

  useEffect(() => {
    const handleExpiredSession = () => {
      if (!sessionRef.current || expiredHandling.current) return;
      expiredHandling.current = true;
      switchingRef.current = true;
      setSwitching(true);
      sessionRef.current = null;
      selectedIdRef.current = '';
      void (async () => {
        await queryClient.cancelQueries();
        queryClient.clear();
        setSelectedWorkspaceId(null);
        commitSelectedId('');
        commitSession(null);
        setAuthError('Your session expired. Sign in again to continue.');
        setSwitching(false);
        switchingRef.current = false;
        expiredHandling.current = false;
      })().catch(() => {
        setLoadError('The expired session could not be cleared safely. Reload the page to sign in again.');
        setSwitching(false);
        switchingRef.current = false;
        expiredHandling.current = false;
      });
    };
    window.addEventListener('vireo:auth-expired', handleExpiredSession);
    return () => window.removeEventListener('vireo:auth-expired', handleExpiredSession);
  }, [queryClient]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    const revalidateSession = async () => {
      const currentSession = sessionRef.current;
      if (!active || !currentSession || switchingRef.current || revalidationInFlight.current) return;
      revalidationInFlight.current = true;
      try {
        const nextSession = await getAuthSession();
        if (!active || sessionRef.current !== currentSession) return;
        if (!nextSession) {
          window.dispatchEvent(new Event('vireo:auth-expired'));
          return;
        }

        const changedIdentity = currentSession.user.id !== nextSession.user.id;
        const changedMemberships = membershipsChanged(currentSession, nextSession);
        setRevalidationError('');
        if (!changedIdentity && !changedMemberships) {
          // Keep the active workflow mounted so routine checks do not discard in-progress forms.
          commitSession(nextSession);
          return;
        }

        switchingRef.current = true;
        setSwitching(true);
        await queryClient.cancelQueries();
        if (!active || sessionRef.current !== currentSession) return;
        queryClient.clear();

        const stillSelected =
          !changedIdentity &&
          nextSession.workspaces.find((workspace) => workspace.id === selectedIdRef.current);
        const workspace = stillSelected || selectWorkspace(nextSession);
        setSelectedWorkspaceId(workspace?.id);
        commitSelectedId(workspace?.id || '');
        authGeneration.current += 1;
        commitSession(nextSession);
        setAuthError('');
      } catch (error) {
        if (active && sessionRef.current) {
          setRevalidationError(error instanceof Error ? error.message : 'Your session could not be revalidated.');
        }
      } finally {
        revalidationInFlight.current = false;
        if (switchingRef.current && active && sessionRef.current) {
          switchingRef.current = false;
          setSwitching(false);
        }
      }
    };
    const onFocus = () => void revalidateSession();
    const intervalId = window.setInterval(() => void revalidateSession(), 60_000);
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
    };
  }, [Boolean(session), queryClient]);

  const selectedWorkspace = session?.workspaces.find((workspace) => workspace.id === selectedId);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');
    setAuthNotice('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      const nextSession = await getAuthSession();
      if (!nextSession) throw new Error('Sign-in did not create an active session. Check your credentials and try again.');
      await queryClient.cancelQueries();
      queryClient.clear();
      const workspace = selectWorkspace(nextSession);
      setSelectedWorkspaceId(workspace?.id);
      commitSelectedId(workspace?.id || '');
      commitSession(nextSession);
      setPassword('');
      setRevalidationError('');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleRecoveryRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');
    setAuthNotice('');
    setBusy(true);
    try {
      const redirectTo = new URL(import.meta.env.BASE_URL || '/', window.location.origin).toString();
      await requestPasswordRecovery(email.trim(), redirectTo);
      setAuthNotice('If this email belongs to an invited Vireo user, a password link will be sent. Check the inbox and spam folder. If nothing arrives, ask the Vireo administrator to verify the invitation and app redirect settings.');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'A password link could not be requested. Try again later.');
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');
    setAuthNotice('');
    if (authCallback?.kind !== 'password') {
      setAuthError('The invite or password link is unavailable. Request a fresh link.');
      return;
    }
    if (newPassword.length < 8) {
      setAuthError('Choose a password with at least 8 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setAuthError('The passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      await updatePasswordFromRecovery(authCallback.accessToken, newPassword);
      setPasswordSaved(true);
      try {
        await logout();
      } catch {
        setAuthError('Your password was updated, but Vireo could not clear an existing browser session. Open Vireo in a private window before signing in.');
        return;
      }
      await queryClient.cancelQueries();
      queryClient.clear();
      setSelectedWorkspaceId(null);
      commitSelectedId('');
      commitSession(null);
      setAuthCallback(null);
      setAuthMode('login');
      setAuthNotice('Your password is set. Sign in with your work email and new password.');
      setNewPassword('');
      setConfirmNewPassword('');
      setPassword('');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'The password could not be updated. Request a fresh link and try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setAuthError('');
    setAuthNotice('');
    setBusy(true);
    try {
      await logout();
      await queryClient.cancelQueries();
      queryClient.clear();
      setSelectedWorkspaceId(null);
      commitSelectedId('');
      commitSession(null);
      setPassword('');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Sign-out failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleWorkspaceChange = async (workspaceId: string) => {
    if (!workspaceId || workspaceId === selectedId) return;
    switchingRef.current = true;
    setSwitching(true);
    setAuthError('');
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      setSelectedWorkspaceId(workspaceId);
      commitSelectedId(workspaceId);
      if (session) {
        try {
          window.localStorage.setItem(`vireo:selected-workspace:${session.user.id}`, workspaceId);
        } catch {
          // The in-memory selection remains valid for this session.
        }
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'The workspace could not be changed safely.');
    } finally {
      switchingRef.current = false;
      setSwitching(false);
    }
  };

  if (authCallback?.kind === 'password' && authMode === 'set-password') {
    return <AuthPage><AuthCard>
      <AuthHeading
        icon={<KeyRound size={19} />}
        title="Set your password"
        description={authCallback.linkType === 'invite'
          ? 'Create a password to finish setting up your invited Vireo account.'
          : 'Choose a new password for your Vireo account.'}
      />
      {passwordSaved ? <>
        <AuthNotice>Password updated. If this browser session could not be cleared, open Vireo in a private window before signing in.</AuthNotice>
        {authError && <AuthMessage>{authError}</AuthMessage>}
      </> : <form onSubmit={handlePasswordUpdate}>
        <input
          aria-hidden="true"
          autoComplete="username"
          name="username"
          readOnly
          tabIndex={-1}
          value={email}
          style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}
        />
        <label className="field-label" htmlFor="vireo-new-password">New password</label>
        <input id="vireo-new-password" className="field" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="At least 8 characters" />
        <label className="field-label" htmlFor="vireo-confirm-password" style={{ marginTop: 17 }}>Confirm password</label>
        <input id="vireo-confirm-password" className="field" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} placeholder="Enter it again" />
        {authError && <AuthMessage>{authError}</AuthMessage>}
        <button type="submit" disabled={busy} className="button button-primary full-width" style={{ marginTop: 22 }}>
          {busy ? <RefreshCw size={15} className="spin" /> : <>Save password <ArrowRight size={15} /></>}
        </button>
      </form>}
    </AuthCard></AuthPage>;
  }

  if (authMode === 'recover') {
    return <AuthPage><AuthCard>
      <AuthHeading icon={<Mail size={19} />} title="Password setup or reset" description="Enter the work email on your Vireo invitation. If it belongs to an invited account, we’ll send a time-limited link." />
      <form onSubmit={handleRecoveryRequest}>
        <label className="field-label" htmlFor="vireo-recovery-email">Work email</label>
        <input id="vireo-recovery-email" className="field" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" />
        {authError && <AuthMessage>{authError}</AuthMessage>}
        {authNotice && <AuthNotice>{authNotice}</AuthNotice>}
        <button type="submit" disabled={busy} className="button button-primary full-width" style={{ marginTop: 22 }}>
          {busy ? <RefreshCw size={15} className="spin" /> : <>Send password link <ArrowRight size={15} /></>}
        </button>
      </form>
      <button type="button" className="button button-secondary full-width" style={{ marginTop: 12 }} onClick={() => { setAuthMode('login'); setAuthError(''); setAuthNotice(''); }}>
        <ArrowLeft size={15} /> Back to sign in
      </button>
    </AuthCard></AuthPage>;
  }

  if (loading || switching) {
    return <AuthPage><div style={{ display: 'grid', justifyItems: 'center', gap: 14, color: '#A19DB1', padding: '30px 0' }}><RefreshCw size={22} className="spin" /><span>{switching ? 'Changing workspace…' : 'Checking your secure session…'}</span></div></AuthPage>;
  }

  if (loadError) {
    return <AuthPage><AuthCard>
      <AuthHeading icon={<ShieldCheck size={19} />} title="Session unavailable" description="Vireo could not verify your session with the server." />
      <AuthMessage>{loadError}</AuthMessage>
      <button type="button" className="button button-primary full-width" onClick={() => setLoadAttempt((attempt) => attempt + 1)}><RefreshCw size={15} /> Try again</button>
    </AuthCard></AuthPage>;
  }

  if (!session) {
    return <AuthPage><AuthCard>
      <AuthHeading icon={<KeyRound size={19} />} title="Welcome back" description="Sign in to access your procurement workspace." />
      {authNotice && <AuthNotice>{authNotice}</AuthNotice>}
      <form onSubmit={handleLogin}>
        <label className="field-label" htmlFor="vireo-email">Work email</label>
        <input id="vireo-email" className="field" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" />
        <label className="field-label" htmlFor="vireo-password" style={{ marginTop: 17 }}>Password</label>
        <input id="vireo-password" className="field" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" />
        {authError && <AuthMessage>{authError}</AuthMessage>}
        <button type="submit" disabled={busy} className="button button-primary full-width" style={{ marginTop: 22 }}>
          {busy ? <RefreshCw size={15} className="spin" /> : <>Sign in <ArrowRight size={15} /></>}
        </button>
      </form>
      <button
        type="button"
        className="button button-secondary full-width"
        style={{ marginTop: 12 }}
        onClick={() => { setAuthMode('recover'); setAuthError(''); setAuthNotice(''); }}
      >
        Forgot password or setting up an invite?
      </button>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 22, color: '#8F8A9F', fontSize: 11, lineHeight: 1.6 }}>
        <ShieldCheck size={15} style={{ flex: '0 0 auto', color: '#8E88F1' }} />
        <span>Access is invitation-only. Contact your Vireo administrator if you need an account or workspace access.</span>
      </div>
    </AuthCard></AuthPage>;
  }

  if (session.aal !== 'aal2' || !session.factors.some((factor) => factor.status === 'verified')) {
    const finishMfa = async () => {
      const nextSession = await getAuthSession();
      if (
        !nextSession ||
        nextSession.aal !== 'aal2' ||
        !nextSession.factors.some((factor) => factor.status === 'verified')
      ) {
        throw new Error('Vireo could not confirm multi-factor sign-in. Try the current authenticator code again.');
      }
      await queryClient.cancelQueries();
      queryClient.clear();
      const workspace = selectWorkspace(nextSession);
      setSelectedWorkspaceId(workspace?.id);
      commitSelectedId(workspace?.id || '');
      commitSession(nextSession);
      setAuthError('');
      setRevalidationError('');
    };
    return <MfaGate
      session={session}
      busy={busy}
      onVerified={finishMfa}
      onSignOut={() => void handleLogout()}
    />;
  }

  return <>
    <header className="topbar" style={{ width: 'min(1240px, calc(100% - 64px))', minHeight: 66, height: 'auto', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: '#A6A1B8', fontSize: 11 }}>
        <UserRound size={15} style={{ color: '#938DFA' }} />
        <span>{session.user.email}</span>
      </div>
      <div className="topbar-meta" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {session.workspaces.length > 0 && <>
          <label htmlFor="workspace-select" style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#9691A6', fontSize: 10 }}>
            <Building2 size={14} /> WORKSPACE
          </label>
          <select
            id="workspace-select"
            className="field"
            aria-label="Select procurement workspace"
            value={selectedId}
            onChange={(event) => void handleWorkspaceChange(event.target.value)}
            style={{ width: 'min(300px, 54vw)', minHeight: 36, padding: '7px 10px', fontSize: 11 }}
          >
            {session.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.display_name} · {workspace.language} · {workspace.id.slice(0, 8)}</option>)}
          </select>
        </>}
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => void handleLogout()} style={{ minHeight: 36, padding: '8px 12px', fontSize: 11 }}>
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </header>
    {(authError || revalidationError) && <div role="alert" className="notice-bar notice-error" style={{ width: 'min(1240px, calc(100% - 64px))', margin: '10px auto' }}><AlertCircle size={16} /><span>{authError || `Session revalidation failed: ${revalidationError}`}</span></div>}
    {session.workspaces.length === 0 ? <AuthPage>
      <AuthCard>
        <AuthHeading icon={<Building2 size={19} />} title="No workspace access" description="Your account is signed in, but it is not a member of a procurement workspace." />
        <p style={{ margin: '0 0 18px', color: '#A19DB1', fontSize: 12, lineHeight: 1.7 }}>Workspace access is managed by an administrator. Ask your Vireo administrator to invite you; you cannot create or join a workspace from here.</p>
        <button type="button" className="button button-secondary full-width" disabled={busy} onClick={() => void handleLogout()}><LogOut size={15} /> Sign out</button>
      </AuthCard>
    </AuthPage> : selectedWorkspace ? <div key={`${session.user.id}:${selectedWorkspace.id}:${authGeneration.current}`} style={{ display: 'contents' }}><WorkspaceRoleContext.Provider value={selectedWorkspace.role}>{children}</WorkspaceRoleContext.Provider></div> : <AuthPage>
      <AuthCard><AuthHeading icon={<Building2 size={19} />} title="Choose a workspace" description="Select one of the workspaces you have been invited to access." /></AuthCard>
    </AuthPage>}
  </>;
}

function MfaGate({
  session,
  busy,
  onVerified,
  onSignOut,
}: {
  session: AuthSession;
  busy: boolean;
  onVerified: () => Promise<void>;
  onSignOut: () => void;
}) {
  const [enrollment, setEnrollment] = useState<{
    id: string;
    secret: string;
    qrCode: string;
  } | null>(null);
  const [factorId, setFactorId] = useState(
    session.factors.find((factor) => factor.status === 'verified')?.id
      || session.factors.find((factor) => factor.status === 'unverified')?.id
      || '',
  );
  const [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const verifiedFactors = session.factors.filter((factor) => factor.status === 'verified');
  const pendingFactors = session.factors.filter((factor) => factor.status === 'unverified');

  const startChallenge = async (id: string) => {
    setError('');
    setNotice('');
    setWorking(true);
    try {
      const challenge = await startMfaChallenge(id);
      setFactorId(challenge.factor_id);
      setChallengeId(challenge.challenge_id);
      setCode('');
      setNotice('Enter the current six-digit code from your authenticator app.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The authenticator check could not be started.');
    } finally {
      setWorking(false);
    }
  };

  const beginEnrollment = async () => {
    setError('');
    setNotice('');
    setWorking(true);
    try {
      const factor = await enrollMfa();
      setEnrollment({
        id: factor.id,
        secret: factor.totp.secret,
        qrCode: factor.totp.qr_code,
      });
      await startChallenge(factor.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Authenticator setup could not be started.');
      setWorking(false);
    }
  };

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!factorId || !challengeId || !/^\d{6}$/.test(code)) {
      setError('Enter the six-digit code shown in your authenticator app.');
      return;
    }
    setError('');
    setWorking(true);
    try {
      await verifyMfa({ factor_id: factorId, challenge_id: challengeId, code });
      await onVerified();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The authenticator code could not be verified.');
      setCode('');
      setChallengeId('');
    } finally {
      setWorking(false);
    }
  };

  const pendingOnly = verifiedFactors.length === 0 && pendingFactors.length > 0 && !enrollment;
  return <AuthPage><AuthCard>
    <AuthHeading
      icon={<ShieldCheck size={19} />}
      title="Secure your Vireo sign-in"
      description="An authenticator code is required for every Vireo user before any procurement workspace or API data is available."
    />
    <p style={{ margin: '-8px 0 18px', color: '#A19DB1', fontSize: 12, lineHeight: 1.6 }}>
      Signed in as <strong style={{ color: '#F1EFFA' }}>{session.user.email}</strong>
    </p>

    {enrollment ? <>
      <div style={{ padding: 15, border: '1px solid #3A3551', borderRadius: 12, background: '#191725' }}>
        <p style={{ margin: '0 0 12px', color: '#F1EFFA', fontWeight: 700, fontSize: 13 }}>1. Add Vireo to your authenticator</p>
        {enrollment.qrCode.startsWith('data:image/svg+xml') && <img
          src={enrollment.qrCode}
          alt="Authenticator setup QR code"
          style={{ display: 'block', width: 176, height: 176, margin: '0 auto 13px', padding: 8, borderRadius: 8, background: '#fff' }}
        />}
        <p style={{ margin: '0 0 6px', color: '#A19DB1', fontSize: 11 }}>Or enter this setup key manually:</p>
        <code style={{ display: 'block', padding: 10, borderRadius: 8, color: '#F2D077', background: '#11101A', fontSize: 12, overflowWrap: 'anywhere' }}>{enrollment.secret}</code>
        <p style={{ margin: '11px 0 0', color: '#A19DB1', fontSize: 11, lineHeight: 1.5 }}>Keep the setup key private. Do not send it to Vireo support.</p>
      </div>
      {challengeId
        ? <p style={{ margin: '15px 0 0', color: '#A19DB1', fontSize: 12 }}>2. Enter a current code from the authenticator to finish setup.</p>
        : <button
          type="button"
          className="button button-secondary full-width"
          disabled={working || busy}
          style={{ marginTop: 14 }}
          onClick={() => void startChallenge(enrollment.id)}
        >
          {working ? <RefreshCw size={15} className="spin" /> : <>Start code verification <ArrowRight size={15} /></>}
        </button>}
    </> : verifiedFactors.length > 0 ? <>
      <label className="field-label" htmlFor="vireo-mfa-factor">Authenticator</label>
      <select
        id="vireo-mfa-factor"
        className="field"
        value={factorId}
        onChange={(event) => { setFactorId(event.target.value); setChallengeId(''); setCode(''); }}
      >
        {verifiedFactors.map((factor) => <option key={factor.id} value={factor.id}>
          {factor.friendly_name || 'Authenticator app'}
        </option>)}
      </select>
      <button
        type="button"
        className="button button-secondary full-width"
        disabled={working || busy || !factorId}
        style={{ marginTop: 14 }}
        onClick={() => void startChallenge(factorId)}
      >
        {working ? <RefreshCw size={15} className="spin" /> : <>Continue with authenticator <ArrowRight size={15} /></>}
      </button>
    </> : pendingOnly ? <div role="alert" className="notice-bar notice-warning" style={{ margin: '0 0 15px', alignItems: 'flex-start' }}>
      <AlertCircle size={15} style={{ flex: '0 0 auto', marginTop: 1 }} />
      <span>An unfinished authenticator setup already exists. For account safety, ask your Vireo administrator to reset that pending setup before trying again.</span>
    </div> : <button
      type="button"
      className="button button-primary full-width"
      disabled={working || busy}
      onClick={() => void beginEnrollment()}
    >
      {working ? <RefreshCw size={15} className="spin" /> : <>Set up authenticator <ArrowRight size={15} /></>}
    </button>}

    {challengeId && <form onSubmit={submitCode} style={{ marginTop: 18 }}>
      <label className="field-label" htmlFor="vireo-mfa-code">Six-digit authenticator code</label>
      <input
        id="vireo-mfa-code"
        className="field"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="000000"
      />
      {error && <AuthMessage>{error}</AuthMessage>}
      {notice && <AuthNotice>{notice}</AuthNotice>}
      <button type="submit" className="button button-primary full-width" disabled={working || busy} style={{ marginTop: 14 }}>
        {working ? <RefreshCw size={15} className="spin" /> : <>Verify and continue <ArrowRight size={15} /></>}
      </button>
    </form>}
    {!challengeId && error && <AuthMessage>{error}</AuthMessage>}
    {!challengeId && notice && <AuthNotice>{notice}</AuthNotice>}
    <button type="button" className="button button-secondary full-width" disabled={working || busy} onClick={onSignOut} style={{ marginTop: 12 }}>
      <LogOut size={15} /> Sign out
    </button>
  </AuthCard></AuthPage>;
}

function AuthPage({ children }: { children: ReactNode }) {
  return <main style={{ minHeight: '100dvh', paddingTop: 1, color: '#F1EFFA', background: 'radial-gradient(ellipse at 50% -12%, rgba(79,70,229,.16), transparent 52%), #14121F' }}>
    <AuthBrand />
    {children}
  </main>;
}

function AuthBrand() {
  return <div className="auth-brand" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, margin: '12vh auto 0' }}>
    <div className="brand-mark"><img className="brand-symbol" src="/logo.svg" alt="" aria-hidden="true" /></div>
    <div><div className="brand-name">Vireo<span>Intelligence</span></div><div className="brand-caption">Procurement workspace</div></div>
  </div>;
}

function AuthCard({ children }: { children: ReactNode }) {
  return <section style={cardStyle}>{children}</section>;
}

function AuthHeading({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return <div style={{ marginBottom: 24 }}>
    <span style={{ display: 'grid', width: 38, height: 38, placeItems: 'center', marginBottom: 17, border: '1px solid #49436E', borderRadius: 12, color: '#A49EFF', background: '#27233B' }}>{icon}</span>
    <h1 style={{ margin: '0 0 8px', color: '#F3F1FA', font: '700 25px/1.2 Manrope, sans-serif', letterSpacing: '-.04em' }}>{title}</h1>
    <p style={{ margin: 0, color: '#A19DB1', fontSize: 12, lineHeight: 1.7 }}>{description}</p>
  </div>;
}

function AuthMessage({ children }: { children: ReactNode }) {
  return <div role="alert" className="notice-bar notice-error" style={{ margin: '15px 0 0', alignItems: 'flex-start', lineHeight: 1.5 }}><AlertCircle size={15} style={{ flex: '0 0 auto', marginTop: 1 }} /><span>{children}</span></div>;
}

function AuthNotice({ children }: { children: ReactNode }) {
  return <div role="status" aria-live="polite" style={{ margin: '15px 0 0', padding: '11px 12px', border: '1px solid rgba(81,181,135,.28)', borderRadius: 10, color: '#B7E6CE', background: 'rgba(43,131,92,.12)', fontSize: 12, lineHeight: 1.6 }}>{children}</div>;
}