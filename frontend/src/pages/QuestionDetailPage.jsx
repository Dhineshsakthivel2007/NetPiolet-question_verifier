import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';

export default function QuestionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [question, setQuestion] = useState(null);
  const [planJson, setPlanJson] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Editable question fields
  const [editForm, setEditForm] = useState({
    title: '', question_text: '', week_number: 1,
    semester: '', academic_year: '', is_active: true,
    time_limit_minutes: 60, max_attempts: 3,
  });
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const load = async () => {
    const q = await api.getQuestion(id);
    setQuestion(q);
    setEditForm({
      title: q.title || '',
      question_text: q.question_text || '',
      week_number: q.week_number || 1,
      semester: q.semester || '',
      academic_year: q.academic_year || '',
      is_active: q.is_active ?? true,
      time_limit_minutes: q.time_limit_minutes ?? 60,
      max_attempts: q.max_attempts ?? 3,
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
      const q = await api.updateQuestion(id, editForm);
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
    } catch (err) {
      setError('Failed to launch lab: ' + err.message);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this question? This cannot be undone.')) return;
    try {
      await api.deleteQuestion(id);
      navigate('/questions');
    } catch (err) { setError(err.message); }
  };

  const handleGenerate = async () => {
    setGenerating(true); setError('');
    try {
      const q = await api.generatePlan(id, '');
      setQuestion(q);
      if (q.evaluation_plan) setPlanJson(JSON.stringify(q.evaluation_plan, null, 2));
    } catch (err) { setError(err.message); }
    finally { setGenerating(false); }
  };

  const handleSavePlan = async () => {
    setSaving(true); setError('');
    try {
      const plan = JSON.parse(planJson);
      const q = await api.updatePlan(id, plan);
      setQuestion(q);
      setSuccess('Evaluation plan saved!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err.message === 'Unexpected token' ? 'Invalid JSON' : err.message); }
    finally { setSaving(false); }
  };

  if (!question) return <div className="loader"><div className="spinner" /></div>;

  const plan = question.evaluation_plan;

  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <button className="btn btn-sm btn-secondary" onClick={() => navigate('/questions')}>← Back</button>
          <span className="badge badge-topic">W{question.week_number}</span>
          {plan ? <span className="badge badge-pass">Plan Ready</span> : <span className="badge badge-pending">No Plan</span>}
          {hasChanges && <span className="badge" style={{ background: '#F59E0B', color: 'white' }}>Unsaved Changes</span>}
        </div>
        <h2>{question.title}</h2>
      </div>

      {/* Alerts */}
      {error && <div style={{
        background: '#FEE2E2', color: '#991B1B', padding: '10px 16px', borderRadius: 10,
        fontSize: 14, marginBottom: 16, border: '1px solid #FECACA',
      }}>⚠️ {error}</div>}
      {success && <div style={{
        background: '#D1FAE5', color: '#065F46', padding: '10px 16px', borderRadius: 10,
        fontSize: 14, marginBottom: 16, border: '1px solid #A7F3D0',
      }}>✅ {success}</div>}

      {/* Editable Question Details */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, color: 'var(--text-secondary)', margin: 0 }}>📝 Question Details</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleTestLab}
            >🧪 Launch Interactive Lab</button>
            <button
              className="btn btn-danger btn-sm"
              onClick={handleDelete}
              style={{ opacity: 0.8 }}
            >🗑 Delete</button>
            <button
              className={`btn btn-sm ${hasChanges ? 'btn-primary' : 'btn-secondary'}`}
              onClick={handleSaveQuestion}
              disabled={savingQuestion || !hasChanges}
              style={{ minWidth: 120 }}
            >
              {savingQuestion ? '⏳ Saving...' : hasChanges ? '💾 Save Changes' : '✓ Saved'}
            </button>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Title</label>
          <input
            className="form-input"
            value={editForm.title}
            onChange={e => handleFieldChange('title', e.target.value)}
            placeholder="Question title..."
          />
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Question Text</label>
          <textarea
            className="form-textarea"
            value={editForm.question_text}
            onChange={e => handleFieldChange('question_text', e.target.value)}
            placeholder="Full lab instructions..."
            style={{ minHeight: 200, fontFamily: 'inherit', fontSize: 14, lineHeight: 1.7 }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr', gap: 12 }}>
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
            <button className="btn btn-primary btn-sm" onClick={handleGenerate} disabled={generating}>
              {generating ? '⏳ Generating...' : '🤖 Generate with AI'}
            </button>
            {planJson && (
              <button className="btn btn-secondary btn-sm" onClick={handleSavePlan} disabled={saving}>
                {saving ? 'Saving...' : '💾 Save Plan'}
              </button>
            )}
          </div>
        </div>

        {plan && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
              Topic: <strong>{plan.topic}</strong> · Checks: <strong>{plan.checks?.length || 0}</strong> · Pass Threshold: <strong>{(plan.pass_threshold * 100)}%</strong>
            </p>
            <div style={{ maxHeight: 300, overflow: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              {plan.checks?.map((check, i) => (
                <div key={i} className="check-result">
                  <span style={{ color: 'var(--accent-primary-light)', fontWeight: 700, minWidth: 24 }}>{i + 1}</span>
                  <div className="check-info">
                    <div className="check-name">{check.description || check.type}</div>
                    <div className="check-message">Type: {check.type} · Weight: {check.weight} · {check.required ? 'Required' : 'Optional'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <textarea className="json-editor" value={planJson} onChange={e => setPlanJson(e.target.value)}
          placeholder={generating ? 'Generating evaluation plan with AI...' : 'Click "Generate with AI" to create an evaluation plan, or paste JSON here...'} />
      </div>
    </>
  );
}
