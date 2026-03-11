import { NavLink, Outlet } from 'react-router-dom';
import { VoiceEntryButton } from '../features/voice/components/VoiceEntryButton';

function navClassName({ isActive }: { isActive: boolean }) {
  return isActive ? 'nav-link active' : 'nav-link';
}

export function AppShell() {
  return (
    <>
      <header className="header shell-header">
        <div>
          <h1>Mission Control</h1>
          <div className="sub">Browser-accessible operating cockpit with Voice Mode foundations</div>
        </div>

        <div className="shell-actions">
          <nav className="nav" aria-label="Primary">
            <NavLink to="/" end className={navClassName}>
              Cockpit
            </NavLink>
            <NavLink to="/voice/new" className={navClassName}>
              Voice intake
            </NavLink>
            <NavLink to="/ops/cron" className={navClassName}>
              Cron ops
            </NavLink>
          </nav>

          <VoiceEntryButton />
        </div>
      </header>

      <div className="shell-main">
        <Outlet />
      </div>
    </>
  );
}
