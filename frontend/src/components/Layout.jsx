import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '../services/api.js';

const navItems = [
  { to: '/', icon: '📊', label: 'Dashboard' },
  { to: '/levels', icon: '🎯', label: 'Levels' },
  { to: '/topics', icon: '📁', label: 'Topics' },
  { to: '/questions', icon: '❓', label: 'Questions' },
  { to: '/evaluate', icon: '⚡', label: 'Evaluate' },
  { to: '/results', icon: '📋', label: 'Results' },
];

export default function Layout() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const role = localStorage.getItem('role');

  useEffect(() => {
    api.getMe().then(u => setUser(u)).catch(() => {});
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    navigate('/login');
  };

  const initial = user?.username?.charAt(0)?.toUpperCase() || 'U';

  return (
    <div className="app-layout">
      <aside
        className="sidebar"
        onMouseEnter={() => setSidebarOpen(true)}
        onMouseLeave={() => setSidebarOpen(false)}
        style={{ width: sidebarOpen ? 220 : 68 }}
      >
        <div className="sidebar-logo">
          <div className="logo-icon">PG</div>
          {sidebarOpen && <h1 style={{ opacity: 1, width: 'auto', display: 'block' }}>PacketGrader</h1>}
        </div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <span className="nav-icon">{item.icon}</span>
              {sidebarOpen && <span style={{ opacity: 1 }}>{item.label}</span>}
            </NavLink>
          ))}
          {role === 'admin' && (
            <NavLink to="/admin" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <span className="nav-icon">👥</span>
              {sidebarOpen && <span style={{ opacity: 1 }}>Users</span>}
            </NavLink>
          )}
        </nav>

        <div className="user-section">
          <div className="user-avatar">{initial}</div>
          {sidebarOpen && (
            <div style={{ opacity: 1 }}>
              <strong style={{ fontSize: 13, display: 'block' }}>{user?.username || '...'}</strong>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{role || 'user'}</span>
            </div>
          )}
        </div>

        <button className="nav-link" onClick={handleLogout} style={{ marginBottom: 8 }}>
          <span className="nav-icon">🚪</span>
          {sidebarOpen && <span style={{ opacity: 1 }}>Logout</span>}
        </button>
      </aside>

      {/* Main content adjusts margin based on sidebar width */}
      <main className="main-content" style={{ marginLeft: sidebarOpen ? 220 : 68, transition: 'margin-left 0.35s cubic-bezier(0.4, 0, 0.2, 1)' }}>
        <Outlet />
      </main>
    </div>
  );
}
