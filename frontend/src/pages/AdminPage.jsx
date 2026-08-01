import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api.js';
import { FaUsersCog } from "react-icons/fa";
import { MdManageAccounts } from "react-icons/md";

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', email: '', password: '', role: 'student', roll_number: '', session_slot: '09:00-11:00', level_id: '' });
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [levels, setLevels] = useState([]);
  const fileRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const [u, l] = await Promise.all([
        api.getUsers(),
        api.getLevels().catch(() => [])
      ]);
      setUsers(u);
      setLevels(l || []);
    }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  const [sessions, setSessions] = useState([]);
  const [unlockMsg, setUnlockMsg] = useState('');

  const loadSessions = async () => {
    try {
      const s = await api.getAllTestSessions();
      setSessions(s || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    load();
    loadSessions();
    const interval = setInterval(loadSessions, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleUnlockSession = async (sessionId, studentName) => {
    const input = prompt(`Allow ${studentName} to attend / continue test?\nEnter extra minutes to extend (Enter 0 to unlock with NO time extension, default: 0):`, "0");
    if (input === null) return; // Admin cancelled
    const parsed = parseInt(input, 10);
    const extendMinutes = (!isNaN(parsed) && parsed >= 0) ? parsed : 0;

    try {
      await api.unlockTestSession(sessionId, extendMinutes);
      const msg = extendMinutes > 0
        ? `✅ Allowed ${studentName} to attend test! Warnings reset & time extended by ${extendMinutes} mins.`
        : `✅ Allowed ${studentName} to attend test! Warnings reset (no time extension).`;
      setUnlockMsg(msg);
      setTimeout(() => setUnlockMsg(''), 5000);
      loadSessions();
    } catch (err) {
      alert('Failed to allow test: ' + err.message);
    }
  };

  const handleFinishSession = async (sessionId, studentName) => {
    if (!confirm(`Force finish the test for ${studentName}? The student will not be able to edit further.`)) return;
    try {
      await api.forceFinishTestSession(sessionId);
      setUnlockMsg(`🛑 Test finished & locked for ${studentName}.`);
      setTimeout(() => setUnlockMsg(''), 5000);
      loadSessions();
    } catch (err) {
      alert('Failed to finish session: ' + err.message);
    }
  };

  const handleDeleteSession = async (sessionId, studentName) => {
    if (!confirm(`Delete test session for ${studentName}?`)) return;
    try {
      await api.deleteTestSession(sessionId);
      setUnlockMsg(`🗑️ Test session deleted for ${studentName}.`);
      setTimeout(() => setUnlockMsg(''), 5000);
      loadSessions();
    } catch (err) {
      alert('Failed to delete test session: ' + err.message);
    }
  };

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

  /* ─── Attendance Handlers ─── */
  const [selectedSlotFilter, setSelectedSlotFilter] = useState('All Slots');
  const [attendanceMsg, setAttendanceMsg] = useState('');

  const handleMarkAttendance = async (userId, attendanceStatus) => {
    try {
      await api.updateUserAttendance(userId, attendanceStatus);
      setAttendanceMsg(`✅ Attendance set to '${attendanceStatus}'.`);
      setTimeout(() => setAttendanceMsg(''), 3000);
      load();
    } catch (err) {
      alert('Failed to update attendance: ' + err.message);
    }
  };

  const handleBulkSlotAttendance = async (targetAttendance) => {
    const slotArg = selectedSlotFilter === 'All Slots' ? null : selectedSlotFilter;
    try {
      const res = await api.bulkUpdateAttendance(slotArg, targetAttendance);
      setAttendanceMsg(`✅ Marked ${res.count} student(s) as '${targetAttendance}' for ${selectedSlotFilter}.`);
      setTimeout(() => setAttendanceMsg(''), 3000);
      load();
    } catch (err) {
      alert('Failed to update bulk attendance: ' + err.message);
    }
  };

  const slotOptions = Array.from(new Set(users.filter(u => u.session_slot).map(u => u.session_slot)));

  /* ─── Manual Add User ─── */
  const handleAddUser = async (e) => {
    e.preventDefault();
    setAddError(''); setAddSuccess('');
    try {
      const res = await api.adminCreateUser(newUser);
      setAddSuccess(res.message || `User "${newUser.username}" created & activated.`);
      setNewUser({ username: '', email: '', password: '', role: 'student', roll_number: '', session_slot: '09:00-11:00', level_id: '' });
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
        <h2
  style={{
    display: "flex",
    alignItems: "center",
    gap: "10px",
    fontSize: "25px",
    fontWeight: "700",
    margin: 0,
  }}
>
  <FaUsersCog
    size={40}
    style={{
      position: "relative",
      top: "2px",
    }}
  />
  <span>User Management & Attendance</span>
</h2>
        <p>Add users manually or import from Excel, manage slot timing, and mark student attendance</p>
      </div>

      {/* Stats */}
      <div className="card-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <MdManageAccounts className="nav-icon" size={29} />
          <div className="stat-value">{users.length}</div>
          <div className="stat-label">Total Users</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">✅</span>
          <div className="stat-value">{users.filter(u => u.is_active).length}</div>
          <div className="stat-label">Active Users</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon" style={{ color: '#10B981' }}>📋</span>
          <div className="stat-value" style={{ color: '#10B981' }}>
            {users.filter(u => u.role === 'student' && u.attendance === 'Present').length}
          </div>
          <div className="stat-label">Students Present</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">🎓</span>
          <div className="stat-value">{users.filter(u => u.role === 'student').length}</div>
          <div className="stat-label">Total Students</div>
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
              📥 Select Excel / CSV File
            </button>
          </div>

          <button className="btn btn-sm btn-ghost" onClick={() => api.downloadSampleTemplate()} style={{ border: '1px solid #C7D2FE', color: '#4F46E5', background: '#EEF2FF' }}>
            📄 Download Sample Excel Template
          </button>

          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>
            Columns: <code style={{ fontSize: 11, background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: 4 }}>roll_number, username, email, password, session_slot, level_name</code>
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
              <label className="form-label" style={{ fontSize: 12 }}>Roll Num</label>
              <input className="form-input" value={newUser.roll_number} onChange={e => setNewUser({ ...newUser, roll_number: e.target.value })}
                placeholder="21EC001" style={{ width: 110, padding: '6px 10px', fontSize: 13 }} />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 12 }}>Username</label>
              <input className="form-input" value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                placeholder="Username" required style={{ width: 140, padding: '6px 10px', fontSize: 13 }} />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 12 }}>Email</label>
              <input className="form-input" type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="user@bitsathy.ac.in" required style={{ width: 180, padding: '6px 10px', fontSize: 13 }} />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 12 }}>Password</label>
              <input className="form-input" type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="Min 6 chars" required minLength={6} style={{ width: 120, padding: '6px 10px', fontSize: 13 }} />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 12 }}>Slot Timing</label>
              <input className="form-input" value={newUser.session_slot} onChange={e => setNewUser({ ...newUser, session_slot: e.target.value })}
                placeholder="09:00-11:00" style={{ width: 110, padding: '6px 10px', fontSize: 13 }} />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 12 }}>Assigned Level</label>
              <select className="form-select" value={newUser.level_id} onChange={e => setNewUser({ ...newUser, level_id: e.target.value })}
                style={{ width: 130, padding: '6px 10px', fontSize: 13 }}>
                <option value="">All Levels</option>
                {levels.map(lvl => <option key={lvl.id} value={lvl.id}>{lvl.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 12 }}>Role</label>
              <select className="form-select" value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                style={{ width: 110, padding: '6px 10px', fontSize: 13 }}>
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

      {/* Attendance & Slot Access Control Section */}
      <div className="card" style={{ marginBottom: 24, padding: '20px 24px', background: '#FAFAFA', border: '1px solid #E5E7EB' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              📋 Student Attendance & Slot Access Control
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Select a slot timing to mark attendance. <strong>Only students marked 'Present' are allowed to log in during their slot.</strong>
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Filter by Slot:</label>
            <select
              className="form-select"
              value={selectedSlotFilter}
              onChange={e => setSelectedSlotFilter(e.target.value)}
              style={{ width: 160, padding: '6px 10px', fontSize: 13, fontWeight: 600 }}
            >
              <option value="All Slots">All Slots</option>
              {slotOptions.map(slot => (
                <option key={slot} value={slot}>{slot}</option>
              ))}
            </select>

            <button
              className="btn btn-sm btn-success"
              onClick={() => handleBulkSlotAttendance('Present')}
              style={{ fontSize: 12 }}
            >
              ✅ Mark All ({selectedSlotFilter}) Present
            </button>

            <button
              className="btn btn-sm btn-danger"
              onClick={() => handleBulkSlotAttendance('Absent')}
              style={{ fontSize: 12 }}
            >
              ❌ Mark All ({selectedSlotFilter}) Absent
            </button>
          </div>
        </div>

        {attendanceMsg && (
          <p style={{ fontSize: 13, fontWeight: 600, color: '#16A34A', marginBottom: 12 }}>
            {attendanceMsg}
          </p>
        )}

        {/* Slot Students Attendance Table */}
        <div style={{ overflowX: 'auto', background: '#FFFFFF', borderRadius: 8, border: '1px solid #E5E7EB' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Roll Num</th>
                <th>Student</th>
                <th>Email</th>
                <th>Slot Timing</th>
                <th>Level</th>
                <th>Attendance</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {users
                .filter(u => u.role === 'student' && u.is_active)
                .filter(u => selectedSlotFilter === 'All Slots' || u.session_slot === selectedSlotFilter)
                .length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '24px 16px', color: '#9CA3AF' }}>
                      No active students pending attendance for slot '{selectedSlotFilter}'.
                    </td>
                  </tr>
                ) : (
                  users
                    .filter(u => u.role === 'student' && u.is_active)
                    .filter(u => selectedSlotFilter === 'All Slots' || u.session_slot === selectedSlotFilter)
                    .map(u => (
                      <tr key={u.id}>
                        <td style={{ fontWeight: 700, fontSize: 13 }}>{u.roll_number || '—'}</td>
                        <td><strong>{u.username}</strong></td>
                        <td style={{ fontSize: 13, color: '#6B7280' }}>{u.email}</td>
                        <td>
                          <span style={{ background: '#F3F4F6', color: '#374151', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                            {u.session_slot || '—'}
                          </span>
                        </td>
                        <td>
                          <span style={{ background: '#EEF2FF', color: '#4F46E5', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                            {u.level_name || 'All Levels'}
                          </span>
                        </td>
                        <td>
                          {u.attendance === 'Present' ? (
                            <span className="badge badge-pass" style={{ background: '#DCFCE7', color: '#15803D' }}>✅ Present</span>
                          ) : (
                            <span className="badge badge-fail" style={{ background: '#FEE2E2', color: '#B91C1C' }}>❌ Absent</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              className={`btn btn-sm ${u.attendance === 'Present' ? 'btn-success' : 'btn-ghost'}`}
                              style={{ padding: '2px 8px', fontSize: 12, border: u.attendance === 'Present' ? 'none' : '1px solid #BBF7D0', color: u.attendance === 'Present' ? '#FFF' : '#15803D' }}
                              onClick={() => handleMarkAttendance(u.id, 'Present')}
                            >
                              ✓ Present
                            </button>
                            <button
                              className={`btn btn-sm ${u.attendance === 'Absent' ? 'btn-danger' : 'btn-ghost'}`}
                              style={{ padding: '2px 8px', fontSize: 12, border: u.attendance === 'Absent' ? 'none' : '1px solid #FECACA', color: u.attendance === 'Absent' ? '#FFF' : '#B91C1C' }}
                              onClick={() => handleMarkAttendance(u.id, 'Absent')}
                            >
                              ✕ Absent
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                )}
            </tbody>
          </table>
        </div>
      </div>

      {loading ? (
        <div className="loader"><div className="spinner" /></div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Roll Num</th>
                <th>User</th>
                <th>Email</th>
                <th>Slot Timing</th>
                <th>Level</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 700, fontSize: 13, color: '#4B5563' }}>
                    {u.roll_number || '—'}
                  </td>
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
                    <span style={{ background: '#F3F4F6', color: '#374151', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                      {u.session_slot || '—'}
                    </span>
                  </td>
                  <td>
                    <span style={{ background: '#EEF2FF', color: '#4F46E5', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                      {u.level_name || 'All Levels'}
                    </span>
                  </td>
                  <td>
                    <select className="form-select" value={u.role} onChange={e => handleRole(u.id, e.target.value)}
                      style={{ width: 110, padding: '4px 8px', fontSize: 12 }}>
                      <option value="student">Student</option>
                      <option value="professor">Professor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>
                    {u.is_active
                      ? <span className="badge badge-pass">Active</span>
                      : <span className="badge badge-pending">Deactivated</span>
                    }
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {!u.is_active ? (
                        <button className="btn btn-sm btn-success" onClick={() => handleApprove(u.id, true)}>✓ Activate</button>
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

      {/* Proctoring & Test Sessions Section */}
      {/*<div className="card" style={{ marginTop: 24, padding: '24px' }}>
        <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          🔒 Student Test Sessions & Proctoring Violations
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Monitor active tests, view proctoring warning counts, and unlock sessions terminated due to maximum exit warnings.
        </p>

        {unlockMsg && (
          <div style={{ padding: '10px 16px', background: '#D1FAE5', color: '#065F46', borderRadius: 8, fontSize: 14, fontWeight: 600, marginBottom: 14 }}>
            {unlockMsg}
          </div>
        )}

        {sessions.filter(s => s.proctor_locked || s.is_completed || s.warning_count >= 3).length === 0 ? (
          <p style={{ fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' }}>No proctoring violations or completed student sessions to display.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Question</th>
                <th>Proctor Status</th>
                <th>Score</th>
                <th>Started</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.filter(s => s.proctor_locked || s.is_completed || s.warning_count >= 3).map(s => (
                <tr key={s.id}>
                  <td><strong>{s.student_name}</strong> <span style={{ fontSize: 12, color: '#9CA3AF' }}>({s.student_email})</span></td>
                  <td>{s.question_title}</td>
                  <td>
                    {s.proctor_locked ? (
                      <span className="badge" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', fontWeight: 800 }}>
                        🚨 LOCKED ({s.warning_count}/3 Warnings)
                      </span>
                    ) : s.warning_count > 0 ? (
                      <span className="badge" style={{ background: '#FEF3C7', color: '#D97706' }}>
                        ⚠️ {s.warning_count}/3 Warnings
                      </span>
                    ) : s.is_completed ? (
                      <span className="badge badge-pass">Completed</span>
                    ) : (
                      <span className="badge badge-pending">Active</span>
                    )}
                  </td>
                  <td><strong>{s.best_score?.toFixed(0)}</strong> / 100</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {s.started_at ? new Date(s.started_at).toLocaleString() : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-sm btn-success"
                        style={{ fontSize: 12, fontWeight: 700, padding: '5px 10px' }}
                        onClick={() => handleUnlockSession(s.id, s.student_name)}
                        title="Reset warnings, unlock session, extend time, and allow student to continue test"
                      >
                        ✅ Allow to Attend Test
                      </button>
                      {!s.is_completed && !s.proctor_locked ? (
                        <button
                          className="btn btn-sm btn-danger"
                          style={{ fontSize: 12, fontWeight: 700, padding: '5px 10px' }}
                          onClick={() => handleFinishSession(s.id, s.student_name)}
                          title="Force finish and lock student test session"
                        >
                          🛑 Finish Test
                        </button>
                      ) : null}
                      <button
                        className="btn btn-sm btn-secondary"
                        style={{ fontSize: 12, fontWeight: 700, padding: '5px 10px', color: '#DC2626', borderColor: '#FECACA', background: '#FEF2F2' }}
                        onClick={() => handleDeleteSession(s.id, s.student_name)}
                        title="Delete this test session"
                      >
                        🗑 Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>*/}
    </>
  );
}
