import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';

export default function QuestionsPage() {
  const [questions, setQuestions] = useState([]);
  const [topics, setTopics] = useState([]);
  const [levels, setLevels] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ topic_id: '', title: '', question_text: '', week_number: 1, semester: '', academic_year: '', time_limit_minutes: 60, max_attempts: 3, level_id: '' });
  const [loading, setLoading] = useState(false);
  const [filterTopic, setFilterTopic] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const navigate = useNavigate();

  const load = async () => {
    const params = {};
    if (filterTopic) params.topic_id = filterTopic;
    if (filterLevel) params.level_id = filterLevel;
    const [q, t, l] = await Promise.all([
      api.getQuestions(params),
      api.getTopics(filterLevel || undefined),
      api.getLevels(),
    ]);
    setQuestions(q); setTopics(t); setLevels(l);
  };
  useEffect(() => { load(); }, [filterTopic, filterLevel]);

  // When modal level changes, reload topics for that level
  const [modalTopics, setModalTopics] = useState([]);
  useEffect(() => {
    if (showModal) {
      api.getTopics(form.level_id || undefined).then(t => setModalTopics(t));
    }
  }, [form.level_id, showModal]);

  const handleCreate = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const payload = { ...form };
      if (!payload.level_id) delete payload.level_id;
      const q = await api.createQuestion(payload);
      setShowModal(false); setForm({ topic_id: '', title: '', question_text: '', week_number: 1, semester: '', academic_year: '', time_limit_minutes: 60, max_attempts: 3, level_id: '' });
      navigate(`/questions/${q.id}`);
    } catch (err) { alert(err.message); }
    finally { setLoading(false); }
  };

  const handleLevelChange = (levelId) => {
    setFilterLevel(levelId);
    setFilterTopic(''); // Reset topic filter when level changes
  };

  return (
    <>
      <div className="page-header">
        <h2>Questions</h2>
        <p>Create and manage weekly lab questions</p>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Question</button>
        <select className="form-select" value={filterLevel} onChange={e => handleLevelChange(e.target.value)} style={{ width: 180 }}>
          <option value="">All Levels</option>
          {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select className="form-select" value={filterTopic} onChange={e => setFilterTopic(e.target.value)} style={{ width: 200 }}>
          <option value="">All Topics</option>
          {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {questions.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <p style={{ fontSize: 48, marginBottom: 12 }}>❓</p>
          <h3>No questions yet</h3>
          <p style={{ color: 'var(--text-secondary)' }}>Create your first weekly question</p>
        </div>
      ) : (
        <table className="data-table">
          <thead><tr><th>Week</th><th>Title</th><th>Level</th><th>Topic</th><th>Plan</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {questions.map(q => (
              <tr key={q.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/questions/${q.id}`)}>
                <td><strong>W{q.week_number}</strong></td>
                <td>{q.title}</td>
                <td>
                  {q.level_id ? (
                    <span className="badge" style={{ background: 'rgba(124,92,252,0.1)', color: '#7C5CFC', fontSize: 11 }}>
                      {levels.find(l => l.id === q.level_id)?.name || '—'}
                    </span>
                  ) : <span style={{ color: '#9CA3AF', fontSize: 12 }}>—</span>}
                </td>
                <td><span className="badge badge-topic">{topics.find(t => t.id === q.topic_id)?.name || '—'}</span></td>
                <td>{q.evaluation_plan ? <span className="badge badge-pass">Ready</span> : <span className="badge badge-pending">No Plan</span>}</td>
                <td>{q.is_active ? <span className="badge badge-pass">Active</span> : <span className="badge badge-fail">Inactive</span>}</td>
                <td><button className="btn btn-sm btn-secondary" onClick={e => { e.stopPropagation(); navigate(`/questions/${q.id}`); }}>View →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Create Question</h3>
            <form onSubmit={handleCreate}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Level</label>
                  <select className="form-select" value={form.level_id} onChange={e => setForm({...form, level_id: e.target.value, topic_id: ''})}>
                    <option value="">No Level</option>
                    {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Topic</label>
                  <select className="form-select" value={form.topic_id} onChange={e => setForm({...form, topic_id: e.target.value})} required>
                    <option value="">Select topic...</option>
                    {modalTopics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Title</label>
                <input className="form-input" value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="e.g. Configure OSPF Area 0" required />
              </div>
              <div className="form-group">
                <label className="form-label">Question Text</label>
                <textarea className="form-textarea" value={form.question_text} onChange={e => setForm({...form, question_text: e.target.value})}
                  placeholder="Enter the full lab question instructions here..." required style={{ minHeight: 180 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Week</label>
                  <input className="form-input" type="number" min="1" value={form.week_number} onChange={e => setForm({...form, week_number: parseInt(e.target.value)})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Semester</label>
                  <input className="form-input" value={form.semester} onChange={e => setForm({...form, semester: e.target.value})} placeholder="Fall 2026" />
                </div>
                <div className="form-group">
                  <label className="form-label">Year</label>
                  <input className="form-input" value={form.academic_year} onChange={e => setForm({...form, academic_year: e.target.value})} placeholder="2025-2026" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Test Duration (minutes)</label>
                  <input className="form-input" type="number" min="0" value={form.time_limit_minutes} onChange={e => setForm({...form, time_limit_minutes: parseInt(e.target.value) || 0})} />
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>0 = unlimited</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Max Attempts</label>
                  <input className="form-input" type="number" min="1" max="10" value={form.max_attempts} onChange={e => setForm({...form, max_attempts: parseInt(e.target.value) || 1})} />
                </div>
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
