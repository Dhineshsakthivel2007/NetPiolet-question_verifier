import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';

const LEVEL_ICONS = ['💻', '📟', '🖧', '⚡', '🛡️', '☁️', '🏆'];

export default function LevelsPage() {
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  const [form, setForm] = useState({ name: '', description: '', order: 1 });
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getLevels();
      setLevels(data.sort((a, b) => a.order - b.order));
      setForm(f => ({ ...f, order: data.length + 1 }));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault(); setCreating(true);
    try {
      await api.createLevel(form);
      setForm({ name: '', description: '', order: levels.length + 2 });
      setShowModal(false);
      showToast('✅ Level created successfully');
      load();
    } catch (err) { alert(err.message); }
    finally { setCreating(false); }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete "${name}" and all its topics & questions?`)) return;
    try {
      await api.deleteLevel(id);
      showToast(`🗑️ "${name}" deleted`);
      load();
    } catch (err) { alert('Failed to delete: ' + err.message); }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const filtered = levels.filter(l =>
    !search || l.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ position: 'relative', minHeight: '100%' }}>

      {/* ─── Top Header Bar ─── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 8, padding: '0 0 16px 0',
        borderBottom: '1px solid var(--border)',
      }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>Levels</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <input
              className="form-input"
              placeholder="Search levels..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: 220, padding: '8px 14px 8px 36px', fontSize: 13,
                borderRadius: 10, background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
              }}
            />
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#9CA3AF', pointerEvents: 'none' }}>🔍</span>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setShowModal(true)}
            style={{
              padding: '9px 20px', fontSize: 14, fontWeight: 700,
              borderRadius: 10, display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{ fontSize: 16 }}>+</span> New Level
          </button>
        </div>
      </div>

      <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '12px 0 24px' }}>
        Levels for PS assessments
      </p>

      {/* ─── Level Cards Grid ─── */}
      {loading ? (
        <div className="loader"><div className="spinner" /></div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 20, marginBottom: 32,
        }}>
          {filtered.map((lvl, idx) => (
            <div
              key={lvl.id}
              style={{
                background: 'white',
                border: '1px solid #E8E8EE',
                borderRadius: 14,
                padding: '22px 22px 18px',
                position: 'relative',
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(124,92,252,0.12)';
                e.currentTarget.style.borderColor = '#7C5CFC';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = '';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                e.currentTarget.style.borderColor = '#E8E8EE';
              }}
              onClick={() => navigate(`/topics?level=${lvl.id}`)}
            >
              {/* Delete × button */}
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(lvl.id, lvl.name); }}
                style={{
                  position: 'absolute', top: 12, right: 14,
                  background: 'none', border: 'none', fontSize: 16,
                  color: '#C0C0C8', cursor: 'pointer', padding: '2px 6px',
                  borderRadius: 6, transition: 'all 0.2s',
                  lineHeight: 1,
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.background = '#FEF2F2'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#C0C0C8'; e.currentTarget.style.background = 'none'; }}
              >×</button>

              {/* Icon */}
              <div style={{
                width: 42, height: 42, borderRadius: 10,
                background: 'rgba(124,92,252,0.08)',
                border: '1px solid rgba(124,92,252,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, marginBottom: 14,
              }}>
                {LEVEL_ICONS[idx % LEVEL_ICONS.length]}
              </div>

              {/* Name + Order */}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#1A1A2E' }}>{lvl.name}</h3>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#B0B0BE' }}>#{lvl.order}</span>
              </div>

              {/* Description */}
              <p style={{
                fontSize: 13, lineHeight: 1.5, color: '#7A7A8C',
                margin: '0 0 16px', minHeight: 40,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>
                {lvl.description || 'No description'}
              </p>

              {/* Topics badge */}
              <div
                style={{
                  display: 'inline-block', padding: '4px 14px',
                  background: 'rgba(124,92,252,0.08)',
                  color: '#7C5CFC', fontSize: 11, fontWeight: 800,
                  borderRadius: 6, letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                }}
              >
                TOPICS
              </div>
            </div>
          ))}

          {/* Add New Level Card */}
          <div
            onClick={() => setShowModal(true)}
            style={{
              border: '2px dashed #D4D4DE',
              borderRadius: 14,
              padding: '22px',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', minHeight: 200,
              transition: 'all 0.25s',
              background: 'transparent',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#7C5CFC';
              e.currentTarget.style.background = 'rgba(124,92,252,0.03)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = '#D4D4DE';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              border: '2px solid #D4D4DE',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 12, fontSize: 22, color: '#9CA3AF',
              transition: 'all 0.2s',
            }}>
              +
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#9CA3AF' }}>Add New Level</span>
          </div>
        </div>
      )}



      {/* ─── Create Modal ─── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Create Level</h3>
              <button onClick={() => setShowModal(false)} style={{
                background: 'none', border: 'none', fontSize: 20, color: '#9CA3AF',
                cursor: 'pointer', padding: '2px 6px', borderRadius: 6,
              }}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Level Name</label>
                <input
                  className="form-input" required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Level 1 - Basics"
                  style={{ fontSize: 14 }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-textarea"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="What topics does this level cover?"
                  rows={3} style={{ fontSize: 14 }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Order</label>
                <input
                  className="form-input" type="number" min="1"
                  value={form.order}
                  onChange={e => setForm({ ...form, order: parseInt(e.target.value) || 1 })}
                  style={{ width: 100, fontSize: 14 }}
                />
                <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 8 }}>Display order</span>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={creating}
                  style={{ flex: 1, padding: '11px 20px', fontSize: 14, fontWeight: 700 }}>
                  {creating ? '⏳ Creating...' : '+ Create Level'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}
                  style={{ padding: '11px 20px', fontSize: 14 }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Toast Notification ─── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: '#1A1A2E', color: 'white',
          padding: '12px 24px', borderRadius: 12,
          fontSize: 14, fontWeight: 600,
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', gap: 10,
          animation: 'slideUp 0.3s ease',
          zIndex: 9999,
        }}>
          <span style={{ fontSize: 16 }}>ℹ️</span>
          {toast}
          <button onClick={() => setToast('')} style={{
            background: 'none', border: 'none', color: '#9CA3AF',
            cursor: 'pointer', fontSize: 16, marginLeft: 8,
          }}>×</button>
        </div>
      )}
    </div>
  );
}
