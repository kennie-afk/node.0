import { Suspense, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronsLeft, ChevronsRight, Church, LogOut, Menu, User, X } from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { navFor } from '../../nav/registry';
import type { NavGroup } from '../../nav/types';
import { ToastProvider } from '../../ui/ToastProvider';
import { PageLoader } from '../../ui/Skeleton';
import { Badge } from '../../ui/Badge';
import { ThemeSwitch } from '../../ui/ThemeSwitch';
import { useMediaQuery } from '../../ui/hooks/useMediaQuery';
import { cx } from '../../ui/classes';

const RAIL_KEY = 'sidebarCollapsed';
const GROUPS_KEY = 'navClosedGroups';

function readClosed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

function groupHoldsPath(group: NavGroup, pathname: string): boolean {
  return group.items.some((item) => (item.end ? pathname === item.path : pathname === item.path || pathname.startsWith(`${item.path}/`)));
}

/**
 * The application shell. The sidebar is rendered from the nav registry (src/nav), filtered by the
 * signed-in role's permissions, so a screen is added by registering it, never by editing this file.
 */
export default function DashboardLayout() {
  const { logout, email, permissions, roleLabel } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mobile = useMediaQuery('(max-width: 1023px)');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rail, setRail] = useState(() => localStorage.getItem(RAIL_KEY) === 'true');
  const [closed, setClosed] = useState<Record<string, boolean>>(readClosed);

  const groups = useMemo(() => navFor(permissions), [permissions]);
  const railMode = rail && !mobile;

  useEffect(() => localStorage.setItem(RAIL_KEY, String(rail)), [rail]);
  useEffect(() => localStorage.setItem(GROUPS_KEY, JSON.stringify(closed)), [closed]);

  // Navigating closes the drawer and opens the group that holds the page you landed on. Done
  // during render (React's "adjust state when a value changes" pattern), not in an effect.
  const [seenPath, setSeenPath] = useState(location.pathname);
  if (seenPath !== location.pathname) {
    setSeenPath(location.pathname);
    setDrawerOpen(false);
    const holder = groups.find((group) => groupHoldsPath(group, location.pathname));
    if (holder && closed[holder.id]) setClosed({ ...closed, [holder.id]: false });
  }

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setDrawerOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const showSidebar = !mobile || drawerOpen;
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = (email ?? '?').slice(0, 2).toUpperCase();

  return (
    <ToastProvider>
      <div className={cx('ui-shell', railMode && 'is-rail', mobile && 'is-mobile')}>
        {showSidebar && (
          <aside className={cx('ui-side', railMode && 'is-rail', mobile && 'is-drawer')}>
            <div className="ui-side-head">
              <span className="ui-brand">
                <span className="ui-brand-mark"><Church size={26} aria-hidden /></span>
                {!railMode && <span className="ui-side-title">Church <b>CMS</b></span>}
              </span>
              {mobile && (
                <button type="button" className="ui-btn is-ghost is-sm" aria-label="Close menu" onClick={() => setDrawerOpen(false)}>
                  <X size={16} aria-hidden />
                </button>
              )}
            </div>

            <nav className="ui-side-nav" aria-label="Main navigation">
              {groups.map((group, index) => {
                const isClosed = !railMode && closed[group.id];
                return (
                  <div key={group.id} className="ui-nav-group">
                    {railMode ? (
                      index > 0 && <div className="ui-nav-rule" />
                    ) : (
                      <button
                        type="button"
                        className="ui-nav-group-btn"
                        aria-expanded={!isClosed}
                        onClick={() => setClosed((state) => ({ ...state, [group.id]: !state[group.id] }))}
                      >
                        {group.label}
                        <ChevronDown size={13} aria-hidden style={{ transform: isClosed ? 'rotate(-90deg)' : undefined }} />
                      </button>
                    )}
                    {!isClosed &&
                      group.items.map((item) => (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          end={item.end}
                          title={railMode ? item.label : undefined}
                          aria-label={railMode ? item.label : undefined}
                          className={({ isActive }) => cx('ui-nav-item', isActive && 'is-active')}
                        >
                          <item.icon size={17} aria-hidden />
                          {!railMode && <span>{item.label}</span>}
                        </NavLink>
                      ))}
                  </div>
                );
              })}
            </nav>

            {!mobile && (
              <button type="button" className="ui-side-collapse" aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setRail((value) => !value)}>
                {rail ? <ChevronsRight size={16} aria-hidden /> : <><ChevronsLeft size={16} aria-hidden />Collapse</>}
              </button>
            )}

            <div className="ui-side-foot">
              <div className="ui-who-row">
                <span className="ui-avatar" aria-hidden="true">{initials}</span>
                {!railMode && (
                  <div style={{ minWidth: 0 }}>
                    <div className="ui-who" title={email ?? undefined}>{email ?? 'Signed in'}</div>
                    <div className="ui-who-role">{roleLabel}</div>
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}

        <header className="ui-topbar">
          {mobile && (
            <button type="button" className="ui-btn is-ghost ui-icon-btn" aria-label={drawerOpen ? 'Close menu' : 'Open menu'} aria-expanded={drawerOpen} onClick={() => setDrawerOpen((open) => !open)}>
              <Menu size={18} aria-hidden />
            </button>
          )}
          <div className="ui-topbar-spacer" />
          <ThemeSwitch className="ui-btn is-ghost ui-icon-btn" />
          <div className="ui-usermenu">
            <button type="button" className="ui-usermenu-btn" aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Account menu" onClick={() => setMenuOpen((open) => !open)}>
              <span className="ui-avatar" aria-hidden="true">{initials}</span>
              <ChevronDown size={13} aria-hidden />
            </button>
            {menuOpen && (
              <>
                <div className="ui-usermenu-scrim" onClick={() => setMenuOpen(false)} />
                <div className="ui-usermenu-panel" role="menu">
                  <div className="ui-usermenu-head">
                    <div className="ui-who" title={email ?? undefined}>{email ?? 'Signed in'}</div>
                    <Badge tone="accent">{roleLabel}</Badge>
                  </div>
                  <button type="button" role="menuitem" className="ui-usermenu-item" onClick={() => { setMenuOpen(false); navigate('/me'); }}>
                    <User size={14} aria-hidden />My account
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="ui-usermenu-item is-danger"
                    onClick={() => {
                      logout();
                      navigate('/login');
                    }}
                  >
                    <LogOut size={14} aria-hidden />Log out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="ui-main" id="main">
          <div className="ui-main-in">
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </div>
        </main>

        {mobile && drawerOpen && <div className="ui-scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}
      </div>
    </ToastProvider>
  );
}
