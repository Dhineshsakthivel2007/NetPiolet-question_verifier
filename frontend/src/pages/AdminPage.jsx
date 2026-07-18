import { useState, useEffect } from 'react';
import { api } from '../services/api.js';

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { const u = await api.getUsers(); setUsers(u); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleApprove = async (id, active) => {
    await api.approveUser(id, active);
    load();
  };

  const handleRole = async (id, role) => {
    await api.changeUserRole(id, role);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this user?')) return;
    await api.deleteUser(id);
    load();
  };

  return (
    <>
      <div className="page-header">
        <h2>👥 User Management</h2>
        <p>Approve, manage roles, and control access for all users</p>
      </div>

      {/* Stats */}
      <div className="card-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <span className="stat-icon">👥</span>
          <div className="stat-value">{users.length}</div>
          <div className="stat-label">Total Users</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">✅</span>
          <div className="stat-value">{users.filter(u => u.is_active).length}</div>
          <div className="stat-label">Active</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">⏳</span>
          <div className="stat-value">{users.filter(u => !u.is_active).length}</div>
          <div className="stat-label">Pending</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">🎓</span>
          <div className="stat-value">{users.filter(u => u.role === 'student').length}</div>
          <div className="stat-label">Students</div>
        </div>
      </div>

      {loading ? (
        <div className="loader"><div className="spinner" /></div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="user-avatar" style={{ width: 32, height: 32, fontSize: 12, minWidth: 32 }}>
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                      <strong>{u.username}</strong>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{u.email}</td>
                  <td>
                    <select className="form-select" value={u.role} onChange={e => handleRole(u.id, e.target.value)}
                      style={{ width: 120, padding: '4px 8px', fontSize: 12 }}>
                      <option value="student">Student</option>
                      <option value="professor">Professor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>
                    {u.is_active
                      ? <span className="badge badge-pass">Active</span>
                      : <span className="badge badge-pending">Pending</span>
                    }
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {!u.is_active ? (
                        <button className="btn btn-sm btn-success" onClick={() => handleApprove(u.id, true)}>✓ Approve</button>
                      ) : (
                        <button className="btn btn-sm btn-secondary" onClick={() => handleApprove(u.id, false)}>Deactivate</button>
                      )}
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(u.id)}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
