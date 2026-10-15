import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { BrandMark } from '../components/BrandMark';
import { Banner, Spinner } from '../components/Feedback';
import { errorMessage } from '../lib/errors';
import { useAuth } from '../lib/auth';
import { BRAND, MAPS_ENABLED } from '../lib/config';

const DEMO_ACCOUNTS = [
  { label: 'Administrator', email: 'admin@roadwatch.gov', password: 'Admin@12345' },
  { label: 'Maintenance officer', email: 'officer1@roadwatch.gov', password: 'Officer@12345' },
];

/** Seeded fixtures are a development convenience only — never shown in production builds. */
const SHOW_DEMO_ACCOUNTS = import.meta.env.DEV;

export function LoginPage() {
  const { login, user, initializing } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';

  useEffect(() => {
    if (!initializing && user) navigate(redirectTo, { replace: true });
  }, [initializing, user, navigate, redirectTo]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemo = (account: (typeof DEMO_ACCOUNTS)[number]) => {
    setEmail(account.email);
    setPassword(account.password);
    setError(null);
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Brand panel */}
      <section className="block-motif relative flex flex-col justify-between bg-navy px-6 py-10 text-surface sm:px-10 lg:w-[46%] lg:px-14 lg:py-14">
        <BrandLogo onDark size="lg" showTagline />

        <div className="my-10 max-w-md">
          <h1 className="text-3xl leading-tight text-surface sm:text-4xl">
            Road issue reporting &amp; maintenance management
          </h1>
          <p className="mt-4 text-sm text-azure sm:text-base">
            Moderators review citizen reports, maintenance officers record repairs, and everyone sees one live map of
            what is fixed and what still needs attention.
          </p>

          <ul className="mt-8 space-y-3 text-sm text-azure">
            {[
              'Two separate tracks: moderation and repair',
              'Officer assignment with progress photos',
              'Public map shows approved reports only',
            ].map((line) => (
              <li key={line} className="flex items-start gap-3">
                <BrandMark size={13} onDark />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-azure/80">
          {BRAND.company} — {BRAND.tagline}. Bulacan State University · BSIT 3H-G2 · Group 5.
        </p>
      </section>

      {/* Form panel */}
      <section className="flex flex-1 items-center justify-center bg-sheet px-6 py-12 sm:px-10">
        <div className="w-full max-w-[420px]">
          <div className="brand-card p-7 shadow-sm">
            <div className="lg:hidden">
              <BrandLogo onDark={false} size="md" showTagline />
              <div className="mt-6" />
            </div>

            <h2 className="text-2xl text-navy">Sign in</h2>
            <p className="mt-1 text-sm text-ink-3">Use your RoadWatch account to continue.</p>

            {error && (
              <div className="mt-5">
                <Banner tone="error">{error}</Banner>
              </div>
            )}

            <form className="mt-6 space-y-4" onSubmit={onSubmit}>
              <div>
                <label className="brand-label" htmlFor="email">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  className="brand-input"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@roadwatch.gov"
                />
              </div>

              <div>
                <label className="brand-label" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  className="brand-input"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
                {submitting ? <Spinner size={18} className="border-white/40 border-t-white" /> : null}
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            {!MAPS_ENABLED && (
              <p className="mt-5 text-xs text-ink-3">
                Tip: maps are disabled until a Google Maps key is configured. Every other feature works normally.
              </p>
            )}
          </div>

          {SHOW_DEMO_ACCOUNTS && (
            <div className="mt-6 rounded-brand border border-dashed border-azure bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Demo accounts (seeded)</p>
              <div className="mt-3 space-y-2">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => fillDemo(account)}
                    className="flex w-full items-center justify-between rounded-brand-sm border border-azure bg-sheet px-3.5 py-2.5 text-left text-sm transition hover:border-navy"
                  >
                    <span>
                      <span className="block font-semibold text-navy">{account.label}</span>
                      <span className="block text-xs text-ink-3">{account.email}</span>
                    </span>
                    <span className="text-xs font-semibold text-navy">Use →</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
