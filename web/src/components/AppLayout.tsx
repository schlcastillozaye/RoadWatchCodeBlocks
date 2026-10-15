import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { BRAND } from '../lib/config';
import { useAuth } from '../lib/auth';
import { ROLE_LABELS } from '../lib/format';
import { BrandLogo } from './BrandLogo';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

function navItemsFor(role: string | undefined): NavItem[] {
  if (role === 'ADMIN') {
    return [
      { to: '/', label: 'Dashboard', icon: '▦', end: true },
      { to: '/reports', label: 'Reports', icon: '☰' },
      { to: '/map', label: 'Public map', icon: '◉' },
      { to: '/users', label: 'Users', icon: '☺' },
      { to: '/audit', label: 'Audit log', icon: '⌸' },
    ];
  }
  if (role === 'MAINTENANCE_OFFICER') {
    return [
      { to: '/', label: 'My dashboard', icon: '▦', end: true },
      { to: '/assignments', label: 'Assignments', icon: '✎' },
      { to: '/map', label: 'Public map', icon: '◉' },
    ];
  }
  return [
    { to: '/', label: 'Dashboard', icon: '▦', end: true },
    { to: '/map', label: 'Public map', icon: '◉' },
  ];
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const items = navItemsFor(user?.role);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const initials =
    user?.fullName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?';

  const nav = (
    <nav className="flex flex-col gap-1.5">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-brand-sm px-3.5 py-2.5 text-sm font-semibold transition ${
              isActive ? 'bg-sky/20 text-surface' : 'text-azure hover:bg-white/5 hover:text-surface'
            }`
          }
        >
          <span aria-hidden="true" className="w-5 text-center text-base">
            {item.icon}
          </span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-sheet">
      {/* Desktop sidebar */}
      <aside className="block-motif sticky top-0 hidden h-screen w-[268px] shrink-0 flex-col justify-between bg-navy px-5 py-6 lg:flex">
        <div>
          <div className="px-1 pb-7">
            <BrandLogo onDark size="md" showTagline />
          </div>
          {nav}
        </div>
        <UserBox initials={initials} onLogout={onLogout} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-azure bg-surface/95 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Toggle navigation"
              className="flex h-10 w-10 items-center justify-center rounded-brand-sm border border-azure text-navy lg:hidden"
            >
              ☰
            </button>
            <div className="lg:hidden">
              <BrandLogo onDark={false} size="sm" />
            </div>
            <div className="hidden lg:block">
              <p className="font-display text-lg font-bold text-navy">
                {items.find((item) => item.to === location.pathname)?.label ?? BRAND.product}
              </p>
              <p className="text-xs text-ink-3">{BRAND.system}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-azure bg-sheet px-3 py-1 text-xs font-semibold text-ink-2 sm:inline-flex">
              {user ? ROLE_LABELS[user.role] : ''}
            </span>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy text-xs font-bold text-sky">
                {initials}
              </span>
              <div className="hidden text-left leading-tight sm:block">
                <p className="text-sm font-semibold text-navy">{user?.fullName}</p>
                <p className="text-xs text-ink-3">{user?.email}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Mobile drawer */}
        {menuOpen && (
          <div className="block-motif border-b border-azure bg-navy px-4 py-4 lg:hidden">
            {nav}
            <div className="mt-4">
              <UserBox initials={initials} onLogout={onLogout} />
            </div>
          </div>
        )}

        <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>

        <footer className="border-t border-azure px-4 py-5 text-center text-xs text-ink-3 lg:px-8">
          {BRAND.product} · {BRAND.company} — {BRAND.tagline}
        </footer>
      </div>
    </div>
  );
}

function UserBox({ initials, onLogout }: { initials: string; onLogout: () => void }) {
  return (
    <div className="rounded-brand-sm border border-white/10 bg-white/5 p-3">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky text-xs font-bold text-navy">
          {initials}
        </span>
        <button
          type="button"
          onClick={onLogout}
          className="flex-1 rounded-brand-sm px-2 py-1.5 text-left text-sm font-semibold text-azure transition hover:bg-white/10 hover:text-surface"
        >
          Sign out →
        </button>
      </div>
    </div>
  );
}
