import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import './AppHeader.css';

export default function AppHeader() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = user?.displayName
    ? user.displayName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '--';

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="header-logo" />
        <div className="header-brand">
          <div className="header-title">SmartMed · AI Segmentation Workstation</div>
          <div className="header-sub">MRI / NIfTI Viewer + Segmentation Overlay</div>
        </div>
      </div>

      <div className="header-right">
        <div className="header-avatar">{initials}</div>
        <div className="header-user-info">
          <div className="header-user-name">{user?.displayName || 'Guest'}</div>
          <div className="header-user-meta">
            <span>ID: {user?.userId || '--'}</span>
            <span className="sep">·</span>
            <span>{user?.institution || '--'}</span>
          </div>
        </div>

        <nav className="header-nav">
          <button className="btn btn-sm" onClick={() => navigate('/patient')}>Patient</button>
          <button className="btn btn-sm" onClick={() => navigate('/doctor')}>Doctor</button>
          <button className="btn btn-sm" onClick={() => navigate('/records')}>Records</button>
        </nav>

        <div className="header-status">
          <span className="status-dot" />
          <span className="status-text">Ready</span>
        </div>

        <button className="btn btn-sm btn-danger" onClick={handleLogout}>Logout</button>
      </div>
    </header>
  );
}
