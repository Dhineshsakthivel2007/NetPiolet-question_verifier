import { useState, useEffect } from 'react';
import { api } from '../services/api.js';

export default function StudentResultsPage() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getStudentResults()
      .then(r => { setResults(r); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="loader"><div className="spinner" /></div>;

  const totalTests = results.length;
  const passedTests = results.filter(r => r.passed).length;
  const passRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;

  return (
    <>
      <div className="page-header">
        <h2>📊 My Results</h2>
        <p>Track your lab evaluation progress</p>
      </div>

      <div className="card-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <span className="stat-icon">📝</span>
          <div className="stat-value">{totalTests}</div>
          <div className="stat-label">Tests Taken</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">✅</span>
          <div className="stat-value">{passedTests}</div>
          <div className="stat-label">Passed</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">🎯</span>
          <div className="stat-value">{passRate}%</div>
          <div className="stat-label">Pass Rate</div>
        </div>
      </div>

      {results.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-icon">📊</div>
          <h3>No results yet</h3>
          <p>Complete some tests to see your results here</p>
        </div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr><th>Question</th><th>Score</th><th>Status</th><th>Attempts</th><th>Date</th></tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td><strong>{r.question_title}</strong></td>
                  <td>
                    <span style={{ fontWeight: 700, color: r.passed ? 'var(--success)' : 'var(--danger)' }}>
                      {r.best_score?.toFixed(0)}
                    </span>
                  </td>
                  <td>
                    {r.passed
                      ? <span className="badge badge-pass">✓ Passed</span>
                      : r.is_completed
                        ? <span className="badge badge-fail">✗ Failed</span>
                        : <span className="badge badge-pending">In Progress</span>
                    }
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{r.attempts_used}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {r.started_at ? new Date(r.started_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
