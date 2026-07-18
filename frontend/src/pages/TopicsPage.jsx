import { useState, useEffect } from 'react';
import { api } from '../services/api.js';

export default function TopicsPage() {
  const [topics, setTopics] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => { setTopics(await api.getTopics()); };
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      await api.createTopic({ name, description });
      setName(''); setDescription(''); setShowModal(false); load();
    } catch (err) { alert(err.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this topic and all its questions?')) return;
    await api.deleteTopic(id); load();
  };

  const presets = ['VLAN', 'STP', 'OSPF', 'RIP', 'EIGRP', 'ACL', 'NAT', 'DHCP', 'EtherChannel', 'Static Routing', 'Security', 'VTP'];

  return (
    <>
      <div className="page-header">
        <h2>Topics</h2>
        <p>Manage networking topics for lab evaluations</p>
      </div>

      <div style={{ marginBottom: 20 }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Topic</button>
      </div>

      {topics.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <p style={{ fontSize: 48, marginBottom: 12 }}>📁</p>
          <h3>No topics yet</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>Create your first topic to get started</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {presets.slice(0, 6).map(p => (
              <button key={p} className="btn btn-secondary btn-sm" onClick={async () => {
                await api.createTopic({ name: p, description: `${p} configuration and troubleshooting` }); load();
              }}>{p}</button>
            ))}
          </div>
        </div>
      ) : (
        <div className="card-grid">
          {topics.map(t => (
            <div className="card" key={t.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <span className="badge badge-topic">{t.slug}</span>
                  <h3 style={{ fontSize: 18, marginTop: 8 }}>{t.name}</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>{t.description || 'No description'}</p>
                </div>
                <button className="btn btn-sm" style={{ color: 'var(--danger)', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }} onClick={() => handleDelete(t.id)}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Create Topic</h3>
            <form onSubmit={handleCreate}>
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
