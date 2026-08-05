import { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import { MdMonitor } from "react-icons/md";
import { MdLock } from "react-icons/md";
import { MdLockPerson } from "react-icons/md";

export default function SessionsPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const loadSessions = async () => {
    try {
      const data = await api.getAllTestSessions();
      setSessions(data || []);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 3000);
    return () => clearInterval(interval);
  }, []);

  const getTimeRemaining = (expiresAt, isCompleted) => {
    if (isCompleted || !expiresAt) return { text: 'Finished', expired: true, color: '#6B7280' };
    const rawStr = String(expiresAt).trim();
    const utcStr = (rawStr.endsWith('Z') || rawStr.includes('+')) ? rawStr : rawStr + 'Z';
    const exp = new Date(utcStr).getTime();
    const now = new Date().getTime();
    const diff = exp - now;

    if (diff <= 0) return { text: 'Time Expired', expired: true, color: '#EF4444' };

    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    const text = `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;

    if (mins < 5) return { text, expired: false, color: '#F59E0B' };
    return { text, expired: false, color: '#10B981' };
  };

  const handleExtendTime = async (sessionId, studentName) => {
    const input = prompt(`Extend test duration for ${studentName}:
Enter extra minutes:`, '15');
    if (!input) return;
    const mins = parseInt(input, 10);
    if (isNaN(mins) || mins <= 0) return alert('Invalid minutes');

    try {
      await api.extendTestSessionTime(sessionId, mins);
      setActionMsg(`✅ Extended test duration by ${mins} minutes for ${studentName}.`);
      setTimeout(() => setActionMsg(''), 4000);
      loadSessions();
    } catch (err) {
      alert('Failed to extend time: ' + err.message);
    }
  };

  const handleUnlock = async (sessionId, studentName) => {
    const input = prompt(`Unlock test session & reset proctor warnings for ${studentName}:\nEnter extra minutes to extend (Enter 0 to unlock with NO time extension, default: 0):`, '0');
    if (input === null) return;
    const parsed = parseInt(input, 10);
    const mins = (!isNaN(parsed) && parsed >= 0) ? parsed : 0;

    try {
      await api.unlockTestSession(sessionId, mins);
      const msg = mins > 0
        ? `✅ Unlocked & extended time by ${mins} mins for ${studentName}.`
        : `✅ Unlocked ${studentName} (no time extension).`;
      setActionMsg(msg);
      setTimeout(() => setActionMsg(''), 4000);
      loadSessions();
    } catch (err) {
      alert('Failed to unlock: ' + err.message);
    }
  };

  const handleEditSlot = async (userId, studentName, currentSlot) => {
    const input = prompt(`Edit assigned slot timing for ${studentName}:`, currentSlot || '09:00-11:00');
    if (input === null) return;

    try {
      await api.updateUserSlot(userId, input.trim());
      setActionMsg(`✅ Updated slot timing to '${input}' for ${studentName}.`);
      setTimeout(() => setActionMsg(''), 4000);
      loadSessions();
    } catch (err) {
      alert('Failed to update slot timing: ' + err.message);
    }
  };

  const handleToggleAccountActive = async (userId, studentName, currentActive) => {
    try {
      await api.approveUser(userId, !currentActive);
      setActionMsg(`✅ ${studentName}'s account ${!currentActive ? 'Activated (Login Allowed)' : 'Deactivated'}.`);
      setTimeout(() => setActionMsg(''), 4000);
      loadSessions();
    } catch (err) {
      alert('Failed to change user status: ' + err.message);
    }
  };

  const handleForceFinish = async (sessionId, studentName) => {
    if (!confirm(`Force finish and lock test for ${studentName}? Student will be deactivated.`)) return;
    try {
      await api.forceFinishTestSession(sessionId);
      setActionMsg(`🛑 Force finished & locked session for ${studentName}.`);
      setTimeout(() => setActionMsg(''), 4000);
      loadSessions();
    } catch (err) {
      alert('Failed to force finish: ' + err.message);
    }
  };

  const handleDelete = async (sessionId, studentName) => {
    if (!confirm(`Delete test session record for ${studentName}?`)) return;
    try {
      await api.deleteTestSession(sessionId);
      setActionMsg(`🗑️ Deleted test session for ${studentName}.`);
      setTimeout(() => setActionMsg(''), 4000);
      loadSessions();
    } catch (err) {
      alert('Failed to delete session: ' + err.message);
    }
  };

  const handleBulkExtend = async () => {
    if (selectedIds.length === 0) return alert('Select at least one session');
    const input = prompt(`Bulk Extend Time:
Enter extra minutes for ${selectedIds.length} selected session(s):`, '15');
    if (!input) return;
    const mins = parseInt(input, 10);
    if (isNaN(mins) || mins <= 0) return;

    try {
      await Promise.all(selectedIds.map(id => api.extendTestSessionTime(id, mins)));
      setActionMsg(`✅ Bulk extended ${mins} minutes for ${selectedIds.length} sessions.`);
      setTimeout(() => setActionMsg(''), 4000);
      setSelectedIds([]);
      loadSessions();
    } catch (err) {
      alert('Bulk extend error: ' + err.message);
    }
  };

  const filteredSessions = sessions.filter(s => {
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      (s.student_name && s.student_name.toLowerCase().includes(q)) ||
      (s.roll_number && s.roll_number.toLowerCase().includes(q)) ||
      (s.student_email && s.student_email.toLowerCase().includes(q)) ||
      (s.question_title && s.question_title.toLowerCase().includes(q));

    if (!matchesSearch) return false;

    if (filter === 'in_progress') return !s.is_completed && !s.proctor_locked;
    if (filter === 'locked') return s.proctor_locked || s.warning_count >= 3;
    if (filter === 'dual_login') return s.dual_login_flag || s.completion_reason === 'Dual Login Detected';
    if (filter === 'expired') return !s.is_completed && s.expires_at && new Date(s.expires_at) < new Date();
    if (filter === 'completed') return s.is_completed;

    return true;
  });

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredSessions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredSessions.map(s => s.id));
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <MdMonitor size={32} /> Session Control & Live Monitoring
          </h2>
          <p>Real-time proctoring monitoring, live test countdowns, slot management, and timing controls</p>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, background: '#ECFDF5',
          border: '1px solid #A7F3D0', padding: '6px 14px', borderRadius: 100, fontSize: 13, fontWeight: 700, color: '#059669'
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: '#10B981',
            boxShadow: '0 0 8px #10B981', animation: 'pulse 1.5s infinite'
          }} />
          Live Auto-Refresh ({lastRefreshed.toLocaleTimeString()})
        </div>
      </div>

      {actionMsg && (
        <div className="badge badge-pass" style={{ padding: 12, width: '100%', marginBottom: 16, display: 'block', fontSize: 14 }}>
          {actionMsg}
        </div>
      )}

      <div className="card-grid" style={{ marginBottom: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div className="stat-card">
          <span className="stat-icon"><MdMonitor size={32} /></span>
          <div className="stat-value">{sessions.length}</div>
          <div className="stat-label">Total Test Sessions</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon" style={{ color: '#10B981' }}>⚡</span>
          <div className="stat-value" style={{ color: '#10B981' }}>
            {sessions.filter(s => !s.is_completed && !s.proctor_locked).length}
          </div>
          <div className="stat-label">Active / In Progress</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon" style={{ color: '#EF4444' }}><MdLock size={30} /></span>
          <div className="stat-value" style={{ color: '#EF4444' }}>
            {sessions.filter(s => s.proctor_locked || s.warning_count >= 3).length}
          </div>
          <div className="stat-label">Proctor Locked</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon" style={{ color: '#F97316' }}>👥</span>
          <div className="stat-value" style={{ color: '#F97316' }}>
            {sessions.filter(s => s.dual_login_flag || s.completion_reason === 'Dual Login Detected').length}
          </div>
          <div className="stat-label">Dual Login Flagged</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon" style={{ color: '#F59E0B' }}>⏰</span>
          <div className="stat-value" style={{ color: '#F59E0B' }}>
            {sessions.filter(s => s.is_completed).length}
          </div>
          <div className="stat-label">Finished / Expired</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20, padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 8, padding: 3, gap: 2 }}>
            {[
              { id: 'all', label: `All (${sessions.length})` },
              { id: 'in_progress', label: '⚡ In Progress' },
              { id: "locked", label: <> <MdLockPerson size={18} /> Proctor Locked </> },
              { id: 'dual_login', label: <>👥 Dual Login ({sessions.filter(s => s.dual_login_flag || s.completion_reason === 'Dual Login Detected').length})</> },
              { id: 'completed', label: '✅ Finished' },
            ].map(tab => (
              <button
                key={tab.id}
                className={`btn btn-sm ${filter === tab.id ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 6, fontSize: 13, padding: '4px 12px' }}
                onClick={() => setFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <input
              className="form-input"
              placeholder="Search by Roll Num, Name, Email, Question..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 260, fontSize: 13, padding: '6px 12px' }}
            />

            {selectedIds.length > 0 && (
              <button className="btn btn-sm btn-primary" onClick={handleBulkExtend}>
                ⏱️ Extend Selected ({selectedIds.length})
              </button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loader"><div className="spinner" /></div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={selectedIds.length > 0 && selectedIds.length === filteredSessions.length} onChange={toggleSelectAll} />
                </th>
                <th>Roll Num</th>
                <th>Student</th>
                <th>Level</th>
                <th>Question</th>
                <th>Slot Timing</th>
                <th>Time Remaining</th>
                <th>Proctor Warnings</th>
                <th>Score</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '36px 20px', color: '#9CA3AF' }}>
                    No sessions match the selected filter.
                  </td>
                </tr>
              ) : (
                filteredSessions.map(s => {
                  const timer = getTimeRemaining(s.expires_at, s.is_completed);
                  const isSelected = selectedIds.includes(s.id);

                  return (
                    <tr key={s.id} style={{ background: isSelected ? '#F5F3FF' : 'transparent' }}>
                      <td>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(s.id)} />
                      </td>
                      <td style={{ fontWeight: 800, fontSize: 13, color: '#374151' }}>
                        {s.roll_number || '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="user-avatar" style={{ width: 32, height: 32, fontSize: 12, minWidth: 32 }}>
                            {(s.student_name || 'U').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                              {s.student_name}
                              {(s.dual_login_flag || s.completion_reason === 'Dual Login Detected') && (
                                <span style={{
                                  background: '#FFEDD5', color: '#C2410C', padding: '1px 7px',
                                  borderRadius: 100, fontSize: 10, fontWeight: 800, border: '1px solid #FDBA74'
                                }}>
                                  ⚠️ Dual Login
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: '#9CA3AF' }}>{s.student_email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span style={{ background: '#EEF2FF', color: '#4F46E5', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                          {s.level_name}
                        </span>
                      </td>
                      <td style={{ fontSize: 13, fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.question_title}
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: 12, padding: '2px 8px', background: '#F3F4F6', color: '#374151', border: '1px dashed #D1D5DB' }}
                          title="Click to edit/extend assigned slot timing"
                          onClick={() => handleEditSlot(s.student_id, s.student_name, s.session_slot)}
                        >
                          🕒 {s.session_slot} ✏️
                        </button>
                      </td>
                      <td>
                        <span style={{ fontWeight: 800, fontSize: 13, color: timer.color }}>
                          {timer.text}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 800,
                            background: s.proctor_locked ? '#FEF2F2' : (s.warning_count > 0 ? '#FEF3C7' : '#ECFDF5'),
                            color: s.proctor_locked ? '#EF4444' : (s.warning_count > 0 ? '#D97706' : '#10B981'),
                          }}>
                            {s.proctor_locked ? '🚨 3/3 Locked' : `${s.warning_count}/3 Warnings`}
                          </span>
                        </div>
                      </td>
                      <td>
                        {(s.has_evaluation || s.is_completed || (s.best_score !== null && s.best_score !== undefined)) ? (
                          <span style={{ fontWeight: 800, color: s.passed ? '#10B981' : '#EF4444' }}>
                            {(s.best_score ?? 0).toFixed(0)}% {s.passed ? '✅' : '❌'}
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: '#9CA3AF' }}>Not graded</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-sm btn-primary"
                            style={{ padding: '4px 8px', fontSize: 12 }}
                            title="Extend test time"
                            onClick={() => handleExtendTime(s.id, s.student_name)}
                          >
                            ⏱️ +Time
                          </button>

                          {s.proctor_locked ? (
                            <button
                              className="btn btn-sm btn-success"
                              style={{ padding: '4px 8px', fontSize: 12 }}
                              onClick={() => handleUnlock(s.id, s.student_name)}
                            >
                              ✅ Unlock
                            </button>
                          ) : !s.is_completed ? (
                            <button
                              className="btn btn-sm btn-secondary"
                              style={{ padding: '4px 8px', fontSize: 12 }}
                              title="Force finish test"
                              onClick={() => handleForceFinish(s.id, s.student_name)}
                            >
                              🛑 Finish
                            </button>
                          ) : null}

                          {!s.student_active && (
                            <button
                              className="btn btn-sm btn-ghost"
                              style={{ padding: '4px 8px', fontSize: 12, color: '#059669', background: '#ECFDF5' }}
                              title="Re-activate student account for login"
                              onClick={() => handleToggleAccountActive(s.student_id, s.student_name, false)}
                            >
                              🟢 Login
                            </button>
                          )}

                          <button
                            className="btn btn-sm btn-danger"
                            style={{ padding: '4px 8px', fontSize: 12 }}
                            title="Delete session"
                            onClick={() => handleDelete(s.id, s.student_name)}
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
