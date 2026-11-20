import { A, useLocation, useNavigate } from '@solidjs/router';
import { For, Show, createSignal, createEffect, onMount, onCleanup } from 'solid-js';
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  ChartNoAxesCombined,
  Settings,
  ClipboardList,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  UserRound,
  ArrowUpRight,
} from 'lucide-solid';
import { user, logout } from '../stores/auth';
import { act } from './ui';
const adminNav = [
  ['dashboard', 'Overview', LayoutDashboard],
  ['crew', 'Crew directory', Users],
  ['crew/approvals', 'Account approvals', ShieldCheck],
  ['events', 'Events', CalendarDays],
  ['performance', 'Performance', ChartNoAxesCombined],
  ['settings', 'Settings', Settings],
];
const crewNav = [
  ['dashboard', 'Overview', LayoutDashboard],
  ['profile', 'My profile', UserRound],
  ['events', 'My events', CalendarDays],
  ['applications', 'Applications', ClipboardList],
  ['performance', 'My performance', ChartNoAxesCombined],
  ['settings', 'Account settings', Settings],
];
export default function AppLayout(p) {
  const location = useLocation(),
    navigate = useNavigate();
  const [open, setOpen] = createSignal(false);
  const [mobile, setMobile] = createSignal(false);
  let sidebar, menuButton;
  const closeMenu = () => {
    setOpen(false);
    menuButton?.focus();
  };
  onMount(() => {
    const media = window.matchMedia('(max-width: 800px)');
    const update = () => {
      setMobile(media.matches);
      if (!media.matches) setOpen(false);
    };
    update();
    media.addEventListener('change', update);
    onCleanup(() => media.removeEventListener('change', update));
  });
  createEffect(() => {
    if (!open() || !mobile()) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebar?.querySelector('button')?.focus();
    onCleanup(() => {
      document.body.style.overflow = previous;
    });
  });
  function drawerKeydown(event) {
    if (!mobile() || !open()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
    }
    if (event.key !== 'Tab') return;
    const items = [...sidebar.querySelectorAll('a[href], button:not([disabled])')].filter(
      (el) => el.getClientRects().length,
    );
    const first = items[0],
      last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  const base = () => (user()?.account_role === 'ADMIN' ? '/admin' : '/crew');
  const nav = () => (user()?.account_role === 'ADMIN' ? adminNav : crewNav);
  return (
    <div class="app-shell" classList={{ 'crew-shell': user()?.account_role === 'CREW' }}>
      <aside
        ref={sidebar}
        id="workspace-navigation"
        classList={{ sidebar: true, open: open() }}
        inert={mobile() && !open()}
        role={mobile() ? 'dialog' : undefined}
        aria-modal={mobile() && open() ? 'true' : undefined}
        aria-label="Workspace navigation"
        onKeyDown={drawerKeydown}
      >
        <button class="icon-button drawer-close" aria-label="Close navigation" onClick={closeMenu}>
          <X size={22} />
        </button>
        <A href={base() + '/dashboard'} class="sidebar-username" onClick={closeMenu}>
          {user()?.username}
        </A>
        <div class="nav-label">WORKSPACE</div>
        <nav>
          <For each={nav()}>
            {([path, label, Icon]) => (
              <A
                href={`${base()}/${path}`}
                end={path === 'crew'}
                activeClass="active"
                onClick={closeMenu}
              >
                <Icon size={18} />
                {label}
              </A>
            )}
          </For>
        </nav>
        <div class="sidebar-bottom">
          <span class="live-dot" /> All your people. One place.
          <small>ABRACODEBRA CREW OS · V3</small>
        </div>
      </aside>
      <Show when={open()}>
        <button class="sidebar-scrim" tabindex="-1" aria-label="Close menu" onClick={closeMenu} />
      </Show>
      <div class="workspace" inert={mobile() && open()}>
        <header class="topbar">
          <div class="actions">
            <button
              class="icon-button mobile-menu"
              ref={menuButton}
              aria-controls="workspace-navigation"
              aria-expanded={open()}
              onClick={() => setOpen(!open())}
              aria-label="Toggle menu"
            >
              <Menu size={20} />
            </button>
            <span class="muted topbar-title">
              <span class="workspace-prefix">
                Workspace <span class="breadcrumb">/</span>
              </span>{' '}
              <span class="text-primary">
                {nav().find((n) => location.pathname === `${base()}/${n[0]}`)?.[1] || 'Details'}
              </span>
            </span>
          </div>
          <div class="account">
            <span class="badge">{user()?.account_role}</span>
            <span class="account-name" title={user()?.username}>
              {user()?.username}
            </span>
            <button
              class="icon-button"
              aria-label="Log out"
              onClick={() => act(logout, () => navigate('/login'), 'Logged out')}
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <main>{p.children}</main>
        <footer class="workspace-footer">
          Built for the people behind the experience.<span>ABRACODEBRA</span>
        </footer>
      </div>
      <Show when={user()?.account_role === 'CREW'}>
        <nav class="mobile-bottom-nav" aria-label="Crew shortcuts" inert={mobile() && open()}>
          <For
            each={crewNav.filter(([path]) =>
              ['dashboard', 'events', 'applications', 'performance'].includes(path),
            )}
          >
            {([path, label, Icon]) => (
              <A href={`/crew/${path}`} activeClass="active">
                <Icon size={21} />
                <span>{label.replace('My ', '')}</span>
              </A>
            )}
          </For>
        </nav>
      </Show>
    </div>
  );
}
