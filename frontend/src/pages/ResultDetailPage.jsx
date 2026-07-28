import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';

export default function ResultDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [evaluation, setEvaluation] = useState(null);
  const [showFilter, setShowFilter] = useState('all'); // all | passed | failed

  useEffect(() => { api.getEvaluation(id).then(setEvaluation); }, [id]);

  if (!evaluation) return <div className="loader"><div className="spinner" /></div>;

  // Handle both result formats: full EvaluationResult dict or flat list
  const rawResults = evaluation.results || {};
  let checks = [];
  let summary = '';
  let errors = [];

  if (Array.isArray(rawResults)) {
    // Legacy: results stored as flat list of check results
    checks = rawResults;
    summary = evaluation.passed ? 'PASSED' : 'FAILED';
  } else {
    // Current: results stored as full EvaluationResult dict
    checks = rawResults.check_results || [];
    summary = rawResults.summary || '';
    errors = rawResults.errors || [];
  }

  const passedCount = checks.filter(c => c.passed).length;
  const failedCount = checks.length - passedCount;
  const pct = evaluation.max_score > 0 ? (evaluation.overall_score / evaluation.max_score * 100) : 0;

  const filteredChecks = showFilter === 'all' ? checks
    : showFilter === 'passed' ? checks.filter(c => c.passed)
    : checks.filter(c => !c.passed);

  return (
    <>
      <div className="page-header">
        <button className="btn btn-sm btn-secondary" onClick={() => navigate('/results')} style={{ marginBottom: 12 }}>← Back to Results</button>
        <h2>Evaluation Report</h2>
        <p>{evaluation.student_name || 'Unknown Student'} — {evaluation.evaluated_at ? new Date(evaluation.evaluated_at).toLocaleString() : ''}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24 }}>
        {/* Left: Score + Info */}
        <div>
          <div className="card" style={{ textAlign: 'center', marginBottom: 20 }}>
            <div className={`score-circle ${evaluation.passed ? 'pass' : 'fail'}`}>
              <div className="score-value">{evaluation.overall_score?.toFixed(0)}</div>
              <div className="score-label">/ {evaluation.max_score || 100}</div>
            </div>
            <div style={{ marginTop: 16 }}>
              {evaluation.passed
                ? <span className="badge badge-pass" style={{ fontSize: 14, padding: '6px 16px' }}>✓ PASSED</span>
                : <span className="badge badge-fail" style={{ fontSize: 14, padding: '6px 16px' }}>✗ FAILED</span>}
            </div>
            <p style={{ fontSize: 22, fontWeight: 700, color: evaluation.passed ? 'var(--success)' : 'var(--danger)', marginTop: 8 }}>
              {pct.toFixed(1)}%
            </p>
          </div>

          {/* Stats */}
          <div className="card" style={{ marginBottom: 20 }}>
            <h4 style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>SUMMARY</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ textAlign: 'center', padding: 10, background: '#F0FDF4', borderRadius: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#16A34A' }}>{passedCount}</div>
                <div style={{ fontSize: 11, color: '#6B7280' }}>Passed</div>
              </div>
              <div style={{ textAlign: 'center', padding: 10, background: '#FEF2F2', borderRadius: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#DC2626' }}>{failedCount}</div>
                <div style={{ fontSize: 11, color: '#6B7280' }}>Failed</div>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ background: '#E5E7EB', borderRadius: 100, height: 8, overflow: 'hidden' }}>
                <div style={{ width: `${checks.length > 0 ? (passedCount / checks.length * 100) : 0}%`, height: '100%', background: passedCount === checks.length ? '#16A34A' : '#F59E0B', borderRadius: 100, transition: 'width 0.3s ease' }} />
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{passedCount}/{checks.length} checks passed</p>
            </div>
          </div>

          {/* Student Info */}
          <div className="card" style={{ marginBottom: 20 }}>
            <h4 style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>STUDENT INFO</h4>
            <p><strong>Name:</strong> {evaluation.student_name || '—'}</p>
            <p><strong>ID:</strong> {evaluation.student_id || '—'}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Attempt: #{evaluation.attempt_number || 1}
            </p>
          </div>

          <a className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
            href={api.getReportPdfUrl(evaluation.id)} target="_blank" rel="noreferrer">
            📥 Download PDF Report
          </a>
        </div>

        {/* Right: Detailed Check Results */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ fontSize: 16, margin: 0 }}>Detailed Check Results</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className={`btn btn-sm ${showFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setShowFilter('all')}>All ({checks.length})</button>
              <button className={`btn btn-sm ${showFilter === 'passed' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setShowFilter('passed')} style={{ color: showFilter === 'passed' ? undefined : '#16A34A' }}>✓ Passed ({passedCount})</button>
              <button className={`btn btn-sm ${showFilter === 'failed' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setShowFilter('failed')} style={{ color: showFilter === 'failed' ? undefined : '#DC2626' }}>✗ Failed ({failedCount})</button>
            </div>
          </div>

          {summary && <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16, padding: '8px 12px', background: 'var(--bg-input)', borderRadius: 8 }}>{summary}</p>}

          {/* Failed checks always first when showing all */}
          {filteredChecks.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>No checks matching this filter</p>
          ) : (
            filteredChecks.map((cr, i) => (
              <div key={i} style={{
                padding: '14px 16px', marginBottom: 8, borderRadius: 10,
                border: `1px solid ${cr.passed ? '#D1FAE5' : '#FECACA'}`,
                background: cr.passed ? '#F0FDF4' : '#FEF2F2',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  {/* Pass/Fail icon */}
                  <span style={{
                    width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: cr.passed ? '#16A34A' : '#DC2626', color: 'white', fontSize: 14, fontWeight: 700, flexShrink: 0, marginTop: 2,
                  }}>
                    {cr.passed ? '✓' : '✗'}
                  </span>

                  <div style={{ flex: 1 }}>
                    {/* Check title */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <strong style={{ fontSize: 14, color: '#1F2937' }}>{cr.check_description || cr.check_type}</strong>
                      <span style={{
                        fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                        background: cr.passed ? '#D1FAE5' : '#FECACA',
                        color: cr.passed ? '#065F46' : '#991B1B',
                      }}>
                        {(cr.score * 100).toFixed(0)}%
                      </span>
                    </div>

                    {/* Check type badge */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#E5E7EB', color: '#4B5563' }}>
                        {cr.check_type}
                      </span>
                      {cr.weight && cr.weight !== 1 && (
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#DBEAFE', color: '#1E40AF' }}>
                          Weight: {cr.weight}
                        </span>
                      )}
                      {cr.required && (
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#FEF3C7', color: '#92400E' }}>
                          Required
                        </span>
                      )}
                    </div>

                    {/* Message (failure reason) */}
                    <div style={{
                      fontSize: 13, color: cr.passed ? '#065F46' : '#991B1B',
                      padding: '6px 10px', borderRadius: 6,
                      background: cr.passed ? '#ECFDF5' : '#FFF1F2',
                      lineHeight: 1.5,
                    }}>
                      {cr.passed ? '✅ ' : '❌ '}{cr.message}
                    </div>

                    {/* Details (expected vs found) */}
                    {cr.details && Object.keys(cr.details).length > 0 && (
                      <details style={{ marginTop: 6 }}>
                        <summary style={{ cursor: 'pointer', fontSize: 12, color: '#6B7280', fontWeight: 600 }}>
                          📋 Technical Details
                        </summary>
                        <div style={{ marginTop: 6, padding: 10, background: 'white', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 12 }}>
                          {cr.details.expected !== undefined && (
                            <p style={{ marginBottom: 4 }}><strong>Expected:</strong> <code style={{ background: '#F3F4F6', padding: '1px 4px', borderRadius: 3 }}>{String(cr.details.expected)}</code></p>
                          )}
                          {cr.details.found !== undefined && (
                            <p style={{ marginBottom: 4 }}><strong>Found:</strong> <code style={{ background: '#F3F4F6', padding: '1px 4px', borderRadius: 3 }}>{String(cr.details.found)}</code></p>
                          )}
                          {/* Show all other detail keys */}
                          {Object.entries(cr.details)
                            .filter(([k]) => k !== 'expected' && k !== 'found')
                            .map(([key, val]) => (
                              <p key={key} style={{ marginBottom: 2 }}>
                                <strong>{key}:</strong>{' '}
                                <code style={{ background: '#F3F4F6', padding: '1px 4px', borderRadius: 3 }}>
                                  {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                </code>
                              </p>
                            ))}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}

          {/* Required check failures summary */}
          {errors && errors.length > 0 && (
            <div style={{ marginTop: 16, padding: 14, background: '#FEF2F2', borderRadius: 10, border: '1px solid #FECACA' }}>
              <h4 style={{ color: '#DC2626', fontSize: 14, marginBottom: 8 }}>⚠ Required Check Failures</h4>
              {errors.map((err, i) => <p key={i} style={{ fontSize: 13, color: '#991B1B', marginBottom: 4 }}>• {err}</p>)}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
