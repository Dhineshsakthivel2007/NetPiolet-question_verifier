import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';

export default function ResultsPage() {
  const [evaluations, setEvaluations] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [filterPassed, setFilterPassed] = useState('');
  const [filterQuestion, setFilterQuestion] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [downloading, setDownloading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const params = {};
    if (filterPassed !== '') params.passed = filterPassed === 'true';
    if (filterQuestion) params.question_id = filterQuestion;
    Promise.all([
      api.getEvaluations(params),
      api.getQuestions(),
    ]).then(([res, qs]) => {
      // Deduplicate: keep only the latest entry per student per day
      const raw = res.items || [];
      const seen = new Map();
      for (const ev of raw) {
        const studentKey = ev.student_id || ev.student_name || ev.created_by || 'anon';
        const dateKey = ev.evaluated_at ? new Date(ev.evaluated_at).toISOString().slice(0, 10) : 'unknown';
        const key = `${studentKey}__${ev.question_id}__${dateKey}`;
        // First occurrence is the latest (results are sorted desc by date)
        if (!seen.has(key)) {
          seen.set(key, ev);
        }
      }
      setEvaluations([...seen.values()]);
      setQuestions(qs || []);
    });
  }, [filterPassed, filterQuestion]);

  const getQuestionTitle = (qid) => questions.find(q => q.id === qid)?.title || '—';

  const handleDownloadExcel = async () => {
    setDownloading(true);
    try {
      const params = new URLSearchParams();
      if (filterPassed !== '') params.set('passed', filterPassed);
      if (filterQuestion) params.set('question_id', filterQuestion);
      if (fromDate) params.set('from_date', fromDate);
      if (toDate) params.set('to_date', toDate);
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/evaluations/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        let msg = 'Export failed';
        try {
          const errData = await res.json();
          msg = errData.detail || msg;
        } catch {}
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `evaluations_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed: ' + err.message);
    } finally { setDownloading(false); }
  };

  const passCount = evaluations.filter(e => e.passed).length;
  const failCount = evaluations.length - passCount;
  const avgScore = evaluations.length > 0 ? evaluations.reduce((s, e) => s + (e.overall_score || 0), 0) / evaluations.length : 0;

  return (
    <>
      <div className="page-header">
        <h2>📊 Evaluation Results</h2>
        <p>View all student evaluation results, check failure reasons, and export to Excel</p>
      </div>

      {/* Stats */}
      <div className="card-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <span className="stat-icon">📋</span>
          <div className="stat-value">{evaluations.length}</div>
          <div className="stat-label">Total</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">✅</span>
          <div className="stat-value" style={{ color: '#16A34A' }}>{passCount}</div>
          <div className="stat-label">Passed</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">❌</span>
          <div className="stat-value" style={{ color: '#DC2626' }}>{failCount}</div>
          <div className="stat-label">Failed</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">📈</span>
          <div className="stat-value">{avgScore.toFixed(1)}</div>
          <div className="stat-label">Avg Score</div>
        </div>
      </div>

      {/* Filters & Export */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <select className="form-select" value={filterPassed} onChange={e => setFilterPassed(e.target.value)} style={{ width: 160 }}>
          <option value="">All Results</option>
          <option value="true">✅ Passed Only</option>
          <option value="false">❌ Failed Only</option>
        </select>

        <select className="form-select" value={filterQuestion} onChange={e => setFilterQuestion(e.target.value)} style={{ width: 220 }}>
          <option value="">All Questions</option>
          {questions.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <label style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>From:</label>
          <input type="date" className="form-input" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ width: 150, padding: '6px 10px', fontSize: 13 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>To:</label>
          <input type="date" className="form-input" value={toDate} onChange={e => setToDate(e.target.value)} style={{ width: 150, padding: '6px 10px', fontSize: 13 }} />
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleDownloadExcel} disabled={downloading}
          style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          {downloading ? '⏳ Exporting...' : '📥 Download Excel'}
        </button>
      </div>

      {evaluations.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <p style={{ fontSize: 48, marginBottom: 12 }}>📋</p>
          <h3>No evaluations yet</h3>
          <p style={{ color: 'var(--text-secondary)' }}>Student submissions will appear here</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Question</th>
              <th>Score</th>
              <th>Checks</th>
              <th>Result</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {evaluations.map(ev => {
              const rawResults = ev.results || {};
              const checks = Array.isArray(rawResults) ? rawResults : (rawResults.check_results || []);
              const passedChecks = checks.filter(c => c.passed).length;
              const pct = ev.max_score ? (ev.overall_score / ev.max_score * 100) : 0;

              return (
                <tr key={ev.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/results/${ev.id}`)}>
                  <td>
                    <div>
                      <strong>{ev.student_name || '—'}</strong>
                      {ev.student_id && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ev.student_id}</div>}
                    </div>
                  </td>
                  <td style={{ fontSize: 13 }}>{getQuestionTitle(ev.question_id)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <strong>{ev.overall_score?.toFixed(1)}</strong>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>/ {ev.max_score || 100}</span>
                      <span style={{ fontSize: 11, color: pct >= 70 ? '#16A34A' : '#DC2626', fontWeight: 600 }}>({pct.toFixed(0)}%)</span>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: 12 }}>
                      <span style={{ color: '#16A34A', fontWeight: 600 }}>{passedChecks}</span>
                      <span style={{ color: 'var(--text-muted)' }}>/</span>
                      <span style={{ color: checks.length === passedChecks ? '#16A34A' : '#DC2626', fontWeight: 600 }}>{checks.length}</span>
                    </span>
                  </td>
                  <td>{ev.passed ? <span className="badge badge-pass">PASS</span> : <span className="badge badge-fail">FAIL</span>}</td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{ev.evaluated_at ? new Date(ev.evaluated_at).toLocaleDateString() : ''}</td>
                  <td><button className="btn btn-sm btn-secondary" onClick={e => { e.stopPropagation(); navigate(`/results/${ev.id}`); }}>Details →</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
