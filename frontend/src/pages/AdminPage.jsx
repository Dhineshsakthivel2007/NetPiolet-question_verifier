import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api.js';

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', email: '', password: '', role: 'student' });
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const fileRef = useRef(null);

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

  /* ─── Manual Add User ─── */
  const handleAddUser = async (e) => {
    e.preventDefault();
    setAddError(''); setAddSuccess('');
    try {
      const res = await api.adminCreateUser(newUser);
      setAddSuccess(res.message || `User "${newUser.username}" created & activated.`);
      setNewUser({ username: '', email: '', password: '', role: 'student' });
      load();
    } catch (err) {
      setAddError(err.message);
    }
  };

  const [bulkRole, setBulkRole] = useState('student');
  const [pendingFile, setPendingFile] = useState(null);

  /* ─── Excel File Picked ─── */
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPendingFile(file);
    setUploadMsg('');
  };

  /* ─── Execute Bulk Upload ─── */
  const executeBulkUpload = async () => {
    if (!pendingFile) return;
    setUploading(true); setUploadMsg('');
    try {
      const formData = new FormData();
      formData.append('file', pendingFile);
      formData.append('role', bulkRole);
      const res = await api.adminBulkUploadUsers(formData);
      setUploadMsg(`✅ Successfully imported ${res.created} ${bulkRole}(s). (${res.skipped} skipped/duplicate)`);
      setPendingFile(null);
      load();
    } catch (err) {
      setUploadMsg(`❌ Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>👥 User Management</h2>
        <p>Add users manually or import from Excel, manage roles and access</p>
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

      {/* Add User Controls */}
      <div className="card" style={{ marginBottom: 24, padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={() => { setShowAddForm(!showAddForm); setAddError(''); setAddSuccess(''); }}>
            {showAddForm ? '✕ Cancel' : '➕ Add User Manually'}
          </button>

          <div style={{ position: 'relative' }}>
            <input type="file" ref={fileRef} accept=".xlsx,.xls,.csv" onChange={handleFileSelect} style={{ display: 'none' }} />
            <button className="btn btn-sm btn-secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
              📥 Select Excel File
            </button>
          </div>

          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>
            Excel columns: <code style={{ fontSize: 11, background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: 4 }}>username, email</code>
          </span>
        </div>

        {/* Selected Excel File & Role Assignment Box */}
        {pendingFile && (
          <div style={{
            marginTop: 16, padding: '14px 18px', background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap'
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>📁 {pendingFile.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(pendingFile.size / 1024).toFixed(1)} KB</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Select Role for Imported Users:</label>
              <select className="form-select" value={bulkRole} onChange={e => setBulkRole(e.target.value)} style={{ width: 130, padding: '5px 8px', fontSize: 13 }}>
                <option value="student">Student</option>
                <option value="professor">Professor</option>
                <option value="admin">Admin</option>
              </select>
              <button className="btn btn-sm btn-success" onClick={executeBulkUpload} disabled={uploading}>
                {uploading ? '⏳ Importing...' : '✅ Confirm & Import Users'}
              </button>
              <button className="btn btn-sm btn-secondary" onClick={() => { setPendingFile(null); if (fileRef.current) fileRef.current.value = ''; }} disabled={uploading}>
                ✕ Cancel
              </button>
            </div>
          </div>
        )}

        {uploadMsg && (
          <p style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: uploadMsg.startsWith('✅') ? '#16A34A' : '#DC2626' }}>
            {uploadMsg}
          </p>
        )}

        {/* Manual Add Form */}
        {showAddForm && (
          <form onSubmit={handleAddUser} style={{ marginTop: 20, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label className="form-label" style={{ fontSize: 12 }}>Username</label>
              <input className="form-input" value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                placeholder="Username" required style={{ width: 160, padding: '6px 10px', fontSize: 13 }} />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 12 }}>Email</label>
              <input className="form-input" type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="user@bitsathy.ac.in" required style={{ width: 220, padding: '6px 10px', fontSize: 13 }} />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 12 }}>Password</label>
              <input className="form-input" type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="Min 6 chars" required minLength={6} style={{ width: 150, padding: '6px 10px', fontSize: 13 }} />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 12 }}>Role</label>
              <select className="form-select" value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                style={{ width: 130, padding: '6px 10px', fontSize: 13 }}>
                <option value="student">Student</option>
                <option value="professor">Professor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button className="btn btn-sm btn-success" type="submit">✓ Create & Activate</button>
            {addError && <p style={{ color: '#DC2626', fontSize: 13, fontWeight: 600, width: '100%', marginTop: 4 }}>❌ {addError}</p>}
            {addSuccess && <p style={{ color: '#16A34A', fontSize: 13, fontWeight: 600, width: '100%', marginTop: 4 }}>✅ {addSuccess}</p>}
          </form>
        )}
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
