import { Outlet, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '../services/api.js';

/** Student layout — NO sidebar. Just a minimal top bar. */
export default function StudentLayout() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    api.getMe().then(u => setUser(u)).catch(() => {});
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    navigate('/login');
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Minimal top bar */}
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 28px',
        background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--accent-gradient)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: 14, color: 'white',
          }}>PG</div>
          <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>PacketGrader</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            {user?.username || '...'}
          </span>
          <button className="btn btn-sm btn-secondary" onClick={handleLogout}>Logout</button>
        </div>
      </header>
      <main style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
        <Outlet />
      </main>
    </div>
  );
}
