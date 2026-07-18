import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';

export default function ResultDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [evaluation, setEvaluation] = useState(null);

  useEffect(() => { api.getEvaluation(id).then(setEvaluation); }, [id]);

  if (!evaluation) return <div className="loader"><div className="spinner" /></div>;

  const results = evaluation.results || {};
  const checks = results.check_results || [];
  const passedCount = checks.filter(c => c.passed).length;

  return (
    <>
      <div className="page-header">
        <button className="btn btn-sm btn-secondary" onClick={() => navigate('/results')} style={{ marginBottom: 12 }}>← Back to Results</button>
        <h2>Evaluation Report</h2>
        <p>{evaluation.student_name || 'Unknown Student'} — {new Date(evaluation.evaluated_at).toLocaleString()}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24 }}>
        {/* Left: Score + Info */}
        <div>
          <div className="card" style={{ textAlign: 'center', marginBottom: 20 }}>
            <div className={`score-circle ${evaluation.passed ? 'pass' : 'fail'}`}>
              <div className="score-value">{evaluation.overall_score?.toFixed(0)}</div>
              <div className="score-label">/ {results.max_score || 100}</div>
            </div>
            <div style={{ marginTop: 16 }}>
              {evaluation.passed
                ? <span className="badge badge-pass" style={{ fontSize: 14, padding: '6px 16px' }}>✓ PASSED</span>
                : <span className="badge badge-fail" style={{ fontSize: 14, padding: '6px 16px' }}>✗ FAILED</span>}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 12 }}>
              {passedCount}/{checks.length} checks passed
            </p>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <h4 style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>STUDENT INFO</h4>
            <p><strong>Name:</strong> {evaluation.student_name || '—'}</p>
            <p><strong>ID:</strong> {evaluation.student_id || '—'}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
              {results.percentage !== undefined ? `Score: ${(results.percentage * 100).toFixed(1)}%` : ''}
            </p>
          </div>

          <a className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
            href={api.getReportPdfUrl(evaluation.id)} target="_blank" rel="noreferrer">
            📥 Download PDF Report
          </a>
        </div>

        {/* Right: Check Results */}
        <div className="card">
          <h3 style={{ fontSize: 16, marginBottom: 16 }}>Detailed Check Results</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>{results.summary}</p>

          {checks.map((cr, i) => (
            <div key={i} className="check-result">
              <span className={`check-icon ${cr.passed ? 'pass' : 'fail'}`}>{cr.passed ? '✓' : '✗'}</span>
              <div className="check-info" style={{ flex: 1 }}>
                <div className="check-name">{cr.check_description || cr.check_type}</div>
                <div className="check-message">{cr.message}</div>
                {cr.details && Object.keys(cr.details).length > 0 && (
                  <details style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                    <summary style={{ cursor: 'pointer' }}>Details</summary>
                    <pre style={{ marginTop: 4, padding: 8, background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', overflow: 'auto', maxHeight: 120 }}>
                      {JSON.stringify(cr.details, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
              <span style={{ fontSize: 12, color: cr.passed ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                {(cr.score * 100).toFixed(0)}%
              </span>
            </div>
          ))}

          {results.errors && results.errors.length > 0 && (
            <div style={{ marginTop: 16, padding: 12, background: 'var(--danger-bg)', borderRadius: 'var(--radius-md)' }}>
              <h4 style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 4 }}>⚠ Required Check Failures</h4>
              {results.errors.map((err, i) => <p key={i} style={{ fontSize: 13, color: 'var(--danger)' }}>{err}</p>)}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
