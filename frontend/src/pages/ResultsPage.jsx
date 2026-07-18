import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';

export default function ResultsPage() {
  const [evaluations, setEvaluations] = useState([]);
  const [filterPassed, setFilterPassed] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [downloading, setDownloading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const params = {};
    if (filterPassed !== '') params.passed = filterPassed === 'true';
    api.getEvaluations(params).then(res => setEvaluations(res.items || []));
  }, [filterPassed]);

  const handleDownloadExcel = async () => {
    setDownloading(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from_date', fromDate);
      if (toDate) params.set('to_date', toDate);
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/evaluations/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `evaluations_${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed: ' + err.message);
    } finally { setDownloading(false); }
  };

  return (
    <>
      <div className="page-header">
        <h2>Evaluation Results</h2>
        <p>View all student evaluation results and export to Excel</p>
      </div>

      {/* Filters & Export */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <select className="form-select" value={filterPassed} onChange={e => setFilterPassed(e.target.value)} style={{ width: 160 }}>
          <option value="">All Results</option>
          <option value="true">Passed Only</option>
          <option value="false">Failed Only</option>
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <label style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>From:</label>
          <input type="date" className="form-input" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ width: 160, padding: '6px 10px', fontSize: 13 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>To:</label>
          <input type="date" className="form-input" value={toDate} onChange={e => setToDate(e.target.value)} style={{ width: 160, padding: '6px 10px', fontSize: 13 }} />
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
          <p style={{ color: 'var(--text-secondary)' }}>Evaluate student files to see results here</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>Student</th><th>ID</th><th>Score</th><th>Result</th><th>Date</th><th></th></tr>
          </thead>
          <tbody>
            {evaluations.map(ev => (
              <tr key={ev.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/results/${ev.id}`)}>
                <td><strong>{ev.student_name || '—'}</strong></td>
                <td>{ev.student_id || '—'}</td>
                <td>{ev.overall_score?.toFixed(1)}</td>
                <td>{ev.passed ? <span className="badge badge-pass">PASS</span> : <span className="badge badge-fail">FAIL</span>}</td>
                <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{new Date(ev.evaluated_at).toLocaleDateString()}</td>
                <td><button className="btn btn-sm btn-secondary" onClick={e => { e.stopPropagation(); navigate(`/results/${ev.id}`); }}>Details →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
