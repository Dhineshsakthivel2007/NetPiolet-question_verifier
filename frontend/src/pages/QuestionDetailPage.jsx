import { useState, useEffect } from 'react';
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

  const load = async () => {
    const q = await api.getQuestion(id);
    setQuestion(q);
    if (q.evaluation_plan) setPlanJson(JSON.stringify(q.evaluation_plan, null, 2));
  };
  useEffect(() => { load(); }, [id]);

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
    } catch (err) { setError(err.message === 'Unexpected token' ? 'Invalid JSON' : err.message); }
    finally { setSaving(false); }
  };

  if (!question) return <div className="loader"><div className="spinner" /></div>;

  const plan = question.evaluation_plan;

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <button className="btn btn-sm btn-secondary" onClick={() => navigate('/questions')}>← Back</button>
          <span className="badge badge-topic">W{question.week_number}</span>
          {plan ? <span className="badge badge-pass">Plan Ready</span> : <span className="badge badge-pending">No Plan</span>}
        </div>
        <h2>{question.title}</h2>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 8 }}>📝 Question Text</h3>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.7 }}>{question.question_text}</div>
      </div>

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

        {error && <p style={{ color: 'var(--danger)', fontSize: 14, marginBottom: 12 }}>{error}</p>}

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
