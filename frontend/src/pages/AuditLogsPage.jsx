import { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import { FaHistory, FaSearch, FaSync, FaUser, FaKey, FaFlask, FaTrash, FaPlus, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('');
  const [filterUsername, setFilterUsername] = useState('');

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await api.getAuditLogs({ action: filterAction, username: filterUsername });
      setLogs(data || []);
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [filterAction, filterUsername]);

  const getActionBadge = (action) => {
    const act = (action || '').toUpperCase();
    if (act.includes('LOGIN')) {
      return <span className="badge" style={{ background: '#EEF2FF', color: '#6366F1', border: '1px solid #C7D2FE', display: 'inline-flex', alignItems: 'center', gap: 4 }}><FaKey size={11} /> LOGIN</span>;
    }
    if (act.includes('DELETED')) {
      return <span className="badge" style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FCA5A5', display: 'inline-flex', alignItems: 'center', gap: 4 }}><FaTrash size={11} /> DELETED</span>;
    }
    if (act.includes('CREATED')) {
      return <span className="badge" style={{ background: '#ECFDF5', color: '#10B981', border: '1px solid #A7F3D0', display: 'inline-flex', alignItems: 'center', gap: 4 }}><FaPlus size={11} /> CREATED</span>;
    }
    if (act.includes('SUBMITTED') || act.includes('EVALUATED')) {
      return <span className="badge" style={{ background: '#F0F9FF', color: '#0EA5E9', border: '1px solid #BAE6FD', display: 'inline-flex', alignItems: 'center', gap: 4 }}><FaFlask size={11} /> LAB SUBMIT</span>;
    }
    return <span className="badge" style={{ background: '#F8FAFC', color: '#475569', border: '1px solid #CBD5E1' }}>{action}</span>;
  };

  return (
    <>
      <div className="page-header" style={{ marginBottom: 20 }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FaHistory style={{ color: '#7C5CFC' }} /> Audit Activity Logs
        </h2>
        <p>Record of user logins, lab evaluations, question management, and administrative actions.</p>
      </div>

      {/* Filter Controls */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
            <div style={{ position: 'relative', minWidth: 220 }}>
              <FaSearch style={{ position: 'absolute', left: 12, top: 12, color: '#94A3B8' }} />
              <input
                className="form-input"
                style={{ paddingLeft: 34 }}
                placeholder="Search username..."
                value={filterUsername}
                onChange={e => setFilterUsername(e.target.value)}
              />
            </div>

            <select
              className="form-select"
              style={{ width: 180 }}
              value={filterAction}
              onChange={e => setFilterAction(e.target.value)}
            >
              <option value="">All Event Actions</option>
              <option value="USER_LOGIN">User Logins</option>
              <option value="QUESTION_DELETED">Question Deletions</option>
              <option value="QUESTION_CREATED">Question Creation</option>
              <option value="LAB_SUBMITTED">Lab Submissions</option>
            </select>
          </div>

          <button className="btn btn-secondary" onClick={loadLogs} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <FaSync /> Refresh
          </button>
        </div>
      </div>

      {/* Logs Data Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Loading audit logs...</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#64748B' }}>
            <FaHistory size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
            <h4 style={{ fontSize: 16, fontWeight: 700 }}>No Audit Records Found</h4>
            <p style={{ fontSize: 13 }}>Activity logs will appear here as users log in, submit labs, or manage questions.</p>
          </div>
        ) : (
          <table className="data-table" style={{ width: '100%', margin: 0 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', textAlign: 'left' }}>
                <th style={{ padding: '12px 16px' }}>Timestamp</th>
                <th style={{ padding: '12px 16px' }}>User</th>
                <th style={{ padding: '12px 16px' }}>Action</th>
                <th style={{ padding: '12px 16px' }}>Details / Activity Description</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748B', whiteSpace: 'nowrap' }}>
                    {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', background: '#EEF2FF', color: '#6366F1',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12
                      }}>
                        {log.username ? log.username.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div>
                        <strong style={{ fontSize: 13, display: 'block', color: '#1E293B' }}>{log.username}</strong>
                        <span style={{ fontSize: 11, color: '#94A3B8', textTransform: 'capitalize' }}>{log.role || 'user'}</span>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {getActionBadge(log.action)}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#334155' }}>
                    {log.details || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
