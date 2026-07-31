import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';

export default function TopicsPage() {
  const [topics, setTopics] = useState([]);
  const [levels, setLevels] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const selectedLevelId = searchParams.get('level') || '';

  const load = async () => {
    const [t, l] = await Promise.all([
      api.getTopics(selectedLevelId || undefined),
      api.getLevels(),
    ]);
    setTopics(t); setLevels(l);
  };
  useEffect(() => { load(); }, [selectedLevelId]);

  const selectedLevel = levels.find(l => l.id === selectedLevelId);

  const handleCreate = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      await api.createTopic({ name, description, level_id: selectedLevelId || null });
      setName(''); setDescription(''); setShowModal(false); load();
    } catch (err) { alert(err.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this topic and all its questions?')) return;
    try {
      await api.deleteTopic(id);
      await load();
    } catch (err) {
      alert('Failed to delete topic: ' + err.message);
    }
  };

  const handleLevelFilter = (levelId) => {
    if (levelId) {
      setSearchParams({ level: levelId });
    } else {
      setSearchParams({});
    }
  };

  const presets = ['VLAN', 'STP', 'OSPF', 'RIP', 'EIGRP', 'ACL', 'NAT', 'DHCP', 'EtherChannel', 'Static Routing', 'Security', 'VTP'];

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {selectedLevel && (
            <button className="btn btn-sm btn-secondary" onClick={() => navigate('/levels')}
              style={{ fontSize: 13, padding: '4px 10px' }}>← Levels</button>
          )}
          <div>
            <h2>Topics {selectedLevel ? <span style={{ color: 'var(--primary)', fontWeight: 400 }}>— {selectedLevel.name}</span> : ''}</h2>
            <p>{selectedLevel ? `Manage topics under ${selectedLevel.name}` : 'Manage networking topics for lab evaluations'}</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Topic</button>
        <select className="form-select" value={selectedLevelId} onChange={e => handleLevelFilter(e.target.value)} style={{ width: 200 }}>
          <option value="">All Levels</option>
          {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      {topics.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <p style={{ fontSize: 48, marginBottom: 12 }}>📁</p>
          <h3>No topics yet{selectedLevel ? ` in ${selectedLevel.name}` : ''}</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>Create your first topic to get started</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {presets.slice(0, 6).map(p => (
              <button key={p} className="btn btn-secondary btn-sm" onClick={async () => {
                await api.createTopic({ name: p, description: `${p} configuration and troubleshooting`, level_id: selectedLevelId || null }); load();
              }}>{p}</button>
            ))}
          </div>
        </div>
      ) : (
        <div className="card-grid">
          {topics.map(t => {
            const topicLevel = levels.find(l => l.id === t.level_id);
            return (
              <div className="card" key={t.id} style={{ transition: 'transform 0.2s, box-shadow 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      <span className="badge badge-topic">{t.slug}</span>
                      {topicLevel && !selectedLevelId && (
                        <span className="badge" style={{ background: 'rgba(124,92,252,0.1)', color: '#7C5CFC', fontSize: 11, padding: '2px 8px' }}>{topicLevel.name}</span>
                      )}
                    </div>
                    <h3 style={{ fontSize: 18, marginTop: 4 }}>{t.name}</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>{t.description || 'No description'}</p>
                  </div>
                  <button className="btn btn-sm" style={{ color: 'var(--danger)', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }} onClick={() => handleDelete(t.id)}>×</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Create Topic</h3>
            <form onSubmit={handleCreate}>
              {!selectedLevelId && (
                <div className="form-group">
                  <label className="form-label">Level</label>
                  <select className="form-select" value={selectedLevelId} onChange={e => handleLevelFilter(e.target.value)}>
                    <option value="">No Level (Global)</option>
                    {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Name</label>
                <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. OSPF" required />
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {presets.map(p => <button key={p} type="button" className="btn btn-sm btn-secondary" onClick={() => { setName(p); setDescription(`${p} configuration and troubleshooting`); }}>{p}</button>)}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-textarea" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Creating...' : 'Create'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
