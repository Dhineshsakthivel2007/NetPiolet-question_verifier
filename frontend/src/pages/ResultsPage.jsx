import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import { FaFilePdf, FaFileExcel, FaCheck, FaTimes, FaClock } from 'react-icons/fa';

export default function ResultsPage() {
  const [evaluations, setEvaluations] = useState([]);
  const [rawEvaluations, setRawEvaluations] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [filterPassed, setFilterPassed] = useState('');
  const [filterQuestion, setFilterQuestion] = useState('');
  const [filterSlot, setFilterSlot] = useState('');
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
      const raw = res.items || [];
      setRawEvaluations(raw);

      // Deduplicate per student + question + slot timing (so multiple slots show separate results)
      const seen = new Map();
      for (const ev of raw) {
        const studentKey = ev.student_id || ev.student_name || ev.created_by || 'anon';
        const slotKey = ev.session_slot || 'no_slot';
        const key = `${studentKey}__${ev.question_id}__${slotKey}`;
        if (!seen.has(key)) {
          seen.set(key, ev);
        }
      }
      setEvaluations([...seen.values()]);
      setQuestions(qs || []);
    });
  }, [filterPassed, filterQuestion]);

  const getQuestionTitle = (qid) => questions.find(q => q.id === qid)?.title || '—';

  // Available unique slot timings for dropdown filter
  const availableSlots = Array.from(new Set(rawEvaluations.map(e => e.session_slot).filter(Boolean)));

  const handleDownloadExcel = async (passedOverride) => {
    setDownloading(true);
    try {
      const params = new URLSearchParams();
      const targetPassed = passedOverride !== undefined ? passedOverride : filterPassed;
      if (targetPassed !== '') params.set('passed', targetPassed);
      if (filterQuestion) params.set('question_id', filterQuestion);
      if (filterSlot) params.set('session_slot', filterSlot);
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
      const tag = targetPassed === 'true' ? 'passed' : targetPassed === 'false' ? 'failed' : 'all';
      a.download = `evaluations_${tag}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed: ' + err.message);
    } finally { setDownloading(false); }
  };

  const filteredEvaluations = evaluations.filter(e => {
    if (filterSlot && (e.session_slot || '') !== filterSlot) return false;
    return true;
  });

  const passCount = filteredEvaluations.filter(e => e.passed).length;
  const failCount = filteredEvaluations.length - passCount;
  const avgScore = filteredEvaluations.length > 0 ? filteredEvaluations.reduce((s, e) => s + (e.overall_score || 0), 0) / filteredEvaluations.length : 0;

  return (
    <>
      <div className="page-header">
        <h2>📊 Evaluation Results & Excel Export</h2>
        <p>View final student test results grouped by slot timing, filter by date or pass/fail status, and export to Excel</p>
      </div>

      {/* Stats */}
      <div className="card-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <span className="stat-icon">📋</span>
          <div className="stat-value">{filteredEvaluations.length}</div>
          <div className="stat-label">Total Submissions</div>
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

      {/* Filters & Export Bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap', background: '#FFFFFF', padding: 16, borderRadius: 12, border: '1px solid #E2E8F0' }}>
        <select className="form-select" value={filterPassed} onChange={e => setFilterPassed(e.target.value)} style={{ width: 140 }}>
          <option value="">All Status</option>
          <option value="true">✅ Passed Only</option>
          <option value="false">❌ Failed Only</option>
        </select>

        <select className="form-select" value={filterQuestion} onChange={e => setFilterQuestion(e.target.value)} style={{ width: 200 }}>
          <option value="">All Questions</option>
          {questions.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}
        </select>

        {/* Slot Timing Filter */}
        <select className="form-select" value={filterSlot} onChange={e => setFilterSlot(e.target.value)} style={{ width: 180 }}>
          <option value="">All Slot Timings</option>
          {availableSlots.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <label style={{ fontSize: 13, color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>From:</label>
          <input type="date" className="form-input" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ width: 135, padding: '6px 10px', fontSize: 13 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 13, color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>To:</label>
          <input type="date" className="form-input" value={toDate} onChange={e => setToDate(e.target.value)} style={{ width: 135, padding: '6px 10px', fontSize: 13 }} />
        </div>

        {/* Dedicated Excel Export Options */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={() => handleDownloadExcel()} disabled={downloading}
            style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', fontWeight: 700 }}>
            📥 {downloading ? 'Exporting...' : 'Export Excel'}
          </button>
          <button className="btn btn-sm" onClick={() => handleDownloadExcel('true')} disabled={downloading}
            style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
            ✅ Pass Only (.xlsx)
          </button>
          <button className="btn btn-sm" onClick={() => handleDownloadExcel('false')} disabled={downloading}
            style={{ background: '#FEE2E2', color: '#B91C1C', border: '1px solid #FCA5A5', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
            ❌ Fail Only (.xlsx)
          </button>
        </div>
      </div>

      {filteredEvaluations.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <p style={{ fontSize: 48, marginBottom: 12 }}>📋</p>
          <h3>No final evaluations found</h3>
          <p style={{ color: 'var(--text-secondary)' }}>Final submissions will appear here after students finish their test sessions</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Roll Num</th>
              <th>Student</th>
              <th>Slot Timing</th>
              <th>Question</th>
              <th>Score</th>
              <th>Checks</th>
              <th>Result</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredEvaluations.map(ev => {
              const rawResults = ev.results || {};
              const checks = Array.isArray(rawResults) ? rawResults : (rawResults.check_results || []);
              const passedChecks = checks.filter(c => c.passed).length;
              const pct = ev.max_score ? (ev.overall_score / ev.max_score * 100) : 0;

              return (
                <tr key={ev.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/results/${ev.id}`)}>
                  <td style={{ fontWeight: 700, fontSize: 13 }}>{ev.roll_number || '—'}</td>
                  <td>
                    <div>
                      <strong>{ev.student_name || '—'}</strong>
                      {ev.student_id && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ev.student_id}</div>}
                    </div>
                  </td>
                  <td>
                    <span style={{ background: '#F3F4F6', color: '#374151', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                      {ev.session_slot || '—'}
                    </span>
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
                  <td>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button
                        className="btn btn-sm btn-secondary"
                        style={{ background: '#E0E7FF', color: '#3730A3', border: '1px solid #C7D2FE', fontWeight: 700 }}
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await api.downloadReportPdf(ev.id, ev.student_name);
                          } catch (err) {
                            alert('Failed to download PDF: ' + err.message);
                          }
                        }}
                        title="Download candidate PDF report"
                      >
                        <FaFilePdf size={12} /> PDF
                      </button>
                      <button className="btn btn-sm btn-secondary" onClick={e => { e.stopPropagation(); navigate(`/results/${ev.id}`); }}>
                        Details →
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
