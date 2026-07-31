import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';

export default function QuestionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [question, setQuestion] = useState(null);
  const [levels, setLevels] = useState([]);
  const [planJson, setPlanJson] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Editable question fields
  const [editForm, setEditForm] = useState({
    title: '', question_text: '', week_number: 1,
    semester: '', academic_year: '', is_active: true,
    time_limit_minutes: 60, max_attempts: 3, level_id: '',
  });
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const load = async () => {
    const [q, l] = await Promise.all([
      api.getQuestion(id),
      api.getLevels().catch(() => []),
    ]);
    setQuestion(q);
    setLevels(l);
    setEditForm({
      title: q.title || '',
      question_text: q.question_text || '',
      week_number: q.week_number || 1,
      semester: q.semester || '',
      academic_year: q.academic_year || '',
      is_active: q.is_active ?? true,
      time_limit_minutes: q.time_limit_minutes ?? 60,
      max_attempts: q.max_attempts ?? 3,
      level_id: q.level_id || '',
    });
    setHasChanges(false);
    if (q.evaluation_plan) setPlanJson(JSON.stringify(q.evaluation_plan, null, 2));
  };
  useEffect(() => { load(); }, [id]);

  const handleFieldChange = useCallback((field, value) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
    setSuccess('');
  }, []);

  const handleSaveQuestion = async () => {
    setSavingQuestion(true); setError(''); setSuccess('');
    try {
      const payload = { ...editForm };
      if (!payload.level_id) payload.level_id = null;
      const q = await api.updateQuestion(id, payload);
      setQuestion(q);
      setHasChanges(false);
      setSuccess('Question updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err.message); }
    finally { setSavingQuestion(false); }
  };

  const handleTestLab = async () => {
    try {
      const proj = await api.createProject(id);
      navigate(`/student/lab/${proj.id}`);
    } catch (err) { alert(err.message); }
  };

  const handleGeneratePlan = async () => {
    setGenerating(true); setError(''); setSuccess('');
    try {
      const updated = await api.generatePlan(id);
      setQuestion(updated);
      if (updated.evaluation_plan) setPlanJson(JSON.stringify(updated.evaluation_plan, null, 2));
      setSuccess('Evaluation plan generated with AI!');
    } catch (err) { setError(err.message); }
    finally { setGenerating(false); }
  };

  const handleSavePlan = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const parsed = JSON.parse(planJson);
      const updated = await api.updatePlan(id, parsed);
      setQuestion(updated);
      setSuccess('Evaluation plan saved successfully!');
    } catch (err) {
      setError(err instanceof SyntaxError ? 'Invalid JSON syntax' : err.message);
    } finally { setSaving(false); }
  };

  if (!question) return <div className="loader"><div className="spinner" /></div>;

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <button className="btn btn-sm btn-secondary" onClick={() => navigate('/questions')} style={{ marginBottom: 8 }}>← Back to Questions</button>
          <h2>{question.title}</h2>
          <p>Configure question details, lab environment, and evaluation rules</p>
        </div>
        <button className="btn btn-primary" onClick={handleTestLab} style={{ fontSize: 14, padding: '10px 20px' }}>
          🧪 Test Lab Canvas
        </button>
      </div>

      {error && <div className="badge badge-fail" style={{ padding: 12, width: '100%', marginBottom: 16, display: 'block' }}>{error}</div>}
      {success && <div className="badge badge-pass" style={{ padding: 12, width: '100%', marginBottom: 16, display: 'block' }}>{success}</div>}

      {/* Editable Question Details */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>📝 Question Details</h3>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSaveQuestion}
            disabled={!hasChanges || savingQuestion}
          >
            {savingQuestion ? '💾 Saving...' : '💾 Save Question Changes'}
          </button>
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Title</label>
          <input
            className="form-input"
            value={editForm.title}
            onChange={e => handleFieldChange('title', e.target.value)}
            style={{ fontWeight: 600 }}
          />
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Question Text (Instructions given to students)</label>
          <textarea
            className="form-textarea"
            rows={6}
            value={editForm.question_text}
            onChange={e => handleFieldChange('question_text', e.target.value)}
            style={{ minHeight: 120, fontSize: 14, lineHeight: 1.6 }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Level</label>
            <select
              className="form-select"
              value={editForm.level_id}
              onChange={e => handleFieldChange('level_id', e.target.value)}
            >
              <option value="">No Level</option>
              {levels.map(lvl => <option key={lvl.id} value={lvl.id}>{lvl.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Week</label>
            <input
              className="form-input"
              type="number"
              min="1"
              value={editForm.week_number}
              onChange={e => handleFieldChange('week_number', parseInt(e.target.value) || 1)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Semester</label>
            <input
              className="form-input"
              value={editForm.semester}
              onChange={e => handleFieldChange('semester', e.target.value)}
              placeholder="Fall 2026"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Academic Year</label>
            <input
              className="form-input"
              value={editForm.academic_year}
              onChange={e => handleFieldChange('academic_year', e.target.value)}
              placeholder="2025-2026"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select
              className="form-select"
              value={editForm.is_active ? 'true' : 'false'}
              onChange={e => handleFieldChange('is_active', e.target.value === 'true')}
            >
              <option value="true">✅ Active</option>
              <option value="false">❌ Inactive</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Duration (min)</label>
            <input
              className="form-input"
              type="number"
              min="0"
              value={editForm.time_limit_minutes}
              onChange={e => handleFieldChange('time_limit_minutes', parseInt(e.target.value) || 0)}
            />
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>0 = unlimited</span>
          </div>
          <div className="form-group">
            <label className="form-label">Max Attempts</label>
            <input
              className="form-input"
              type="number"
              min="1"
              max="10"
              value={editForm.max_attempts}
              onChange={e => handleFieldChange('max_attempts', parseInt(e.target.value) || 1)}
            />
          </div>
        </div>
      </div>

      {/* Evaluation Plan */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 15 }}>🤖 Evaluation Plan</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={handleGeneratePlan} disabled={generating}>
              {generating ? '⏳ Generating...' : '✨ Generate with AI'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleSavePlan} disabled={saving}>
              {saving ? 'Saving...' : '💾 Save Plan'}
            </button>
          </div>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
          The evaluation plan defines the automated validation checks run on Packet Tracer (.pkt) files submitted for this question.
        </p>

        <textarea
          className="form-textarea"
          rows={16}
          value={planJson}
          onChange={e => setPlanJson(e.target.value)}
          placeholder='{"pass_threshold": 0.7, "total_points": 100, "checks": [...]}'
          style={{ fontFamily: 'monospace', fontSize: 13, minHeight: 300 }}
        />
      </div>
    </>
  );
}
