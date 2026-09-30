import { Suspense, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { ROLE_LABELS } from '../../auth/permissions';
import { navFor } from '../../nav/registry';
import type { NavGroup } from '../../nav/types';
import { ToastProvider } from '../../ui/ToastProvider';
import { PageLoader } from '../../ui/Skeleton';
import { Badge } from '../../ui/Badge';
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
  const { logout, role, email } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mobile = useMediaQuery('(max-width: 720px)');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rail, setRail] = useState(() => localStorage.getItem(RAIL_KEY) === 'true');
  const [closed, setClosed] = useState<Record<string, boolean>>(readClosed);

  const groups = useMemo(() => navFor(role), [role]);
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

  return (
    <ToastProvider>
      <div className={cx('ui-shell', mobile && 'is-mobile')}>
        {mobile && (
          <div className="ui-topbar">
            <button type="button" className="ui-btn is-ghost is-sm" aria-label={drawerOpen ? 'Close menu' : 'Open menu'} aria-expanded={drawerOpen} onClick={() => setDrawerOpen((open) => !open)}>
              {drawerOpen ? <X size={16} aria-hidden /> : <Menu size={16} aria-hidden />}
            </button>
            <span className="ui-logo" aria-hidden="true">C</span>
            <strong style={{ fontSize: 'var(--fs-lg)' }}>Church CMS</strong>
          </div>
        )}

        {showSidebar && (
          <aside className={cx('ui-side', railMode && 'is-rail', mobile && 'is-drawer')}>
            <div className="ui-side-head" style={railMode ? { justifyContent: 'center', padding: '12px 0' } : undefined}>
              <span className="ui-logo" aria-hidden="true">C</span>
              {!railMode && <span className="ui-side-title">Church CMS</span>}
              {!mobile && (
                <button type="button" className="ui-btn is-ghost is-sm" aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setRail((value) => !value)} style={railMode ? { display: 'none' } : undefined}>
                  <ChevronLeft size={14} aria-hidden />
                </button>
              )}
            </div>

            <nav className="ui-side-nav" aria-label="Main navigation">
              {railMode && (
                <button type="button" className="ui-nav-item" aria-label="Expand sidebar" title="Expand sidebar" onClick={() => setRail(false)} style={{ width: '100%', background: 'none', cursor: 'pointer' }}>
                  <ChevronRight size={15} aria-hidden />
                </button>
              )}
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
                        <ChevronDown size={11} aria-hidden style={{ transform: isClosed ? 'rotate(-90deg)' : undefined }} />
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
                          <item.icon size={14} aria-hidden />
                          {!railMode && <span>{item.label}</span>}
                        </NavLink>
                      ))}
                  </div>
                );
              })}
            </nav>

            <div className="ui-side-foot">
              {!railMode && (
                <div>
                  <div className="ui-who" title={email ?? undefined}>{email ?? 'Signed in'}</div>
                  <Badge tone="accent">{ROLE_LABELS[role]}</Badge>
                </div>
              )}
              <button
                type="button"
                className="ui-btn is-danger is-sm"
                aria-label="Log out"
                title="Log out"
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
              >
                <LogOut size={13} aria-hidden />
                {!railMode && 'Log out'}
              </button>
            </div>
          </aside>
        )}

        <main className="ui-main" id="main">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>

        {mobile && drawerOpen && <div className="ui-scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}
      </div>
    </ToastProvider>
  );
}
