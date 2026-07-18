import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';

export default function EvaluatePage() {
  const [questions, setQuestions] = useState([]);
  const [selectedQuestion, setSelectedQuestion] = useState('');
  const [studentName, setStudentName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [file, setFile] = useState(null);
  const [evaluating, setEvaluating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const fileRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.getQuestions({ is_active: true }).then(qs => {
      setQuestions(qs.filter(q => q.evaluation_plan));
    });
  }, []);

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); setPreview(null); }
  };

  const handleFileSelect = (e) => {
    setFile(e.target.files[0]);
    setPreview(null);
  };

  const handlePreview = async () => {
    if (!file) { setError('Upload a file first'); return; }
    setPreviewing(true); setError('');
    try {
      const formData = new FormData();
      formData.append('pkt_file', file);
      const data = await api.previewFile(formData);
      setPreview(data);
    } catch (err) { setError(err.message); }
    finally { setPreviewing(false); }
  };

  const handleEvaluate = async () => {
    if (!selectedQuestion || !file) { setError('Select a question and upload a file'); return; }
    setEvaluating(true); setError(''); setResult(null);
    try {
      const formData = new FormData();
      formData.append('question_id', selectedQuestion);
      formData.append('student_name', studentName);
      formData.append('student_id', studentId);
      formData.append('pkt_file', file);
      const ev = await api.createEvaluation(formData);
      setResult(ev);
    } catch (err) { setError(err.message); }
    finally { setEvaluating(false); }
  };

  const evalResults = result?.results;

  return (
    <>
      <div className="page-header">
        <h2>Evaluate Student</h2>
        <p>Upload a .pkt file and evaluate against a question</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, marginBottom: 16 }}>1️⃣ Select Question</h3>
            <select className="form-select" value={selectedQuestion} onChange={e => setSelectedQuestion(e.target.value)}>
              <option value="">Choose a question...</option>
              {questions.map(q => <option key={q.id} value={q.id}>W{q.week_number}: {q.title}</option>)}
            </select>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, marginBottom: 16 }}>2️⃣ Student Information</h3>
            <div className="form-group">
              <label className="form-label">Name</label>
              <input className="form-input" value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="Student name" />
            </div>
            <div className="form-group">
              <label className="form-label">ID</label>
              <input className="form-input" value={studentId} onChange={e => setStudentId(e.target.value)} placeholder="Student ID" />
            </div>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, marginBottom: 16 }}>3️⃣ Upload .pkt File</h3>
            <div className={`upload-zone${dragOver ? ' drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}>
              <div className="upload-icon">{file ? '📄' : '📤'}</div>
              <h3>{file ? file.name : 'Drop .pkt file here'}</h3>
              <p>{file ? `${(file.size / 1024).toFixed(1)} KB` : 'or click to browse'}</p>
              <input ref={fileRef} type="file" accept=".pkt,.pka,.xml" hidden onChange={handleFileSelect} />
            </div>
            {file && (
              <button className="btn btn-secondary" style={{ width: '100%', marginTop: 10 }}
                onClick={handlePreview} disabled={previewing}>
                {previewing ? '🔍 Parsing...' : '🔍 Preview File Contents'}
              </button>
            )}
          </div>

          {error && <p style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</p>}
          <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={handleEvaluate} disabled={evaluating || !selectedQuestion || !file}>
            {evaluating ? '⏳ Evaluating...' : '⚡ Run Evaluation'}
          </button>
        </div>

        <div>
          {/* Preview Panel */}
          {preview && !result && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h4 style={{ fontSize: 14, margin: 0 }}>🔍 File Preview</h4>
                <button className="btn btn-secondary btn-sm" onClick={() => setPreview(null)}>✕ Close</button>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                v{preview.version} — {preview.device_count} devices, {preview.link_count} links
              </p>
              <p style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 16 }}>
                <strong>Device names:</strong> {preview.device_names?.join(', ')}
              </p>

              <div style={{ maxHeight: 500, overflow: 'auto' }}>
                {preview.devices?.map((dev, i) => (
                  <div key={i} style={{ marginBottom: 16, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <strong style={{ color: 'var(--accent)', fontSize: 14 }}>📍 {dev.name}</strong>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{dev.type}/{dev.model}</span>
                    </div>

                    {dev.vlans?.length > 0 && (
                      <div style={{ fontSize: 12, marginBottom: 6 }}>
                        <strong>VLANs:</strong> {dev.vlans.map(v => `${v.id} (${v.name})`).join(', ')}
                      </div>
                    )}

                    {dev.ports_with_ip?.length > 0 && (
                      <div style={{ fontSize: 12, marginBottom: 6 }}>
                        <strong>IPs:</strong> {dev.ports_with_ip.map(p => `${p.name}: ${p.ip}/${p.subnet}`).join(', ')}
                      </div>
                    )}

                    {dev.interfaces?.length > 0 && (
                      <details style={{ fontSize: 12 }}>
                        <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>
                          Interfaces ({dev.interfaces.length})
                        </summary>
                        <div style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap', color: 'var(--text-muted)', maxHeight: 200, overflow: 'auto' }}>
                          {dev.interfaces.map(iface =>
                            `interface ${iface.name}\n${iface.commands?.map(c => `  ${c}`).join('\n') || '  (no commands)'}`
                          ).join('\n')}
                        </div>
                      </details>
                    )}

                    {dev.global_commands?.length > 0 && (
                      <details style={{ fontSize: 12, marginTop: 4 }}>
                        <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>
                          Global Config ({dev.global_commands.length} lines)
                        </summary>
                        <div style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap', color: 'var(--text-muted)', maxHeight: 200, overflow: 'auto' }}>
                          {dev.global_commands.join('\n')}
                        </div>
                      </details>
                    )}
                  </div>
                ))}

                {preview.links?.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <strong style={{ fontSize: 12 }}>Links:</strong>
                    {preview.links.map((lk, i) => (
                      <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {lk.from} ↔ {lk.to}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Result Panel */}
          {result && (
            <div className="card">
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div className={`score-circle ${result.passed ? 'pass' : 'fail'}`}>
                  <div className="score-value">{result.overall_score?.toFixed(0)}</div>
                  <div className="score-label">/ {evalResults?.max_score || 100}</div>
                </div>
                <div style={{ marginTop: 12 }}>
                  {result.passed ? <span className="badge badge-pass" style={{ fontSize: 16, padding: '8px 20px' }}>✓ PASSED</span> : <span className="badge badge-fail" style={{ fontSize: 16, padding: '8px 20px' }}>✗ FAILED</span>}
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 8 }}>{evalResults?.summary}</p>
              </div>

              <h4 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>Check Results</h4>
              <div style={{ maxHeight: 400, overflow: 'auto' }}>
                {evalResults?.check_results?.map((cr, i) => (
                  <div key={i} className="check-result">
                    <span className={`check-icon ${cr.passed ? 'pass' : 'fail'}`}>{cr.passed ? '✓' : '✗'}</span>
                    <div className="check-info">
                      <div className="check-name">{cr.check_description || cr.check_type}</div>
                      <div className="check-message">{cr.message}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/results/${result.id}`)}>View Full Report →</button>
                <a className="btn btn-secondary btn-sm" href={api.getReportPdfUrl(result.id)} target="_blank" rel="noreferrer">📥 Download PDF</a>
              </div>
            </div>
          )}

          {!result && !evaluating && !preview && (
            <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
              <p style={{ fontSize: 48, marginBottom: 12 }}>⚡</p>
              <h3>Ready to evaluate</h3>
              <p>Select a question and upload a .pkt file to begin</p>
              <p style={{ fontSize: 12, marginTop: 12, color: 'var(--text-muted)' }}>💡 Tip: Click "Preview File Contents" to see device names before evaluating</p>
            </div>
          )}

          {evaluating && (
            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
              <div className="loader"><div className="spinner" /></div>
              <p style={{ marginTop: 16, color: 'var(--text-secondary)' }}>Converting and evaluating...</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
