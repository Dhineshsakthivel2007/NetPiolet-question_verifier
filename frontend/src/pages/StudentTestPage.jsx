import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';

const EXAM_RULES = [
  "I will not use any unauthorized materials or resources during this test.",
  "I will not communicate with other students during the examination.",
  "I will not copy, share, or distribute the test questions in any form.",
  "I understand that my submission will be evaluated against hidden test cases.",
  "I acknowledge that malpractice will result in disqualification and zero marks.",
  "I confirm that the work I submit is entirely my own.",
];

export default function StudentTestPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState('rules');
  const [checkedRules, setCheckedRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState(null);
  const [session, setSession] = useState(null);
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState(null);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState({ rating: 0, difficulty: '', comment: '' });
  const [feedbackDone, setFeedbackDone] = useState(false);
  const fileInputRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const toggleRule = (idx) => setCheckedRules(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
  const allRulesChecked = checkedRules.length === EXAM_RULES.length;

  const handleStartTest = async () => {
    setLoading(true); setError('');
    try {
      const questions = await api.getStudentQuestions();
      if (!questions?.length) { setError('No tests available. Contact your professor.'); setLoading(false); return; }
      
      const savedQId = localStorage.getItem('activeQuestionId');
      const q = (savedQId && questions.find(x => x.id === savedQId)) || questions[0];
      
      setQuestion(q);
      localStorage.setItem('activeQuestionId', q.id);

      // Create test session for timer tracking
      try {
        const sess = await api.startTest(q.id);
        localStorage.setItem('testSessionId', sess.id || '');
        localStorage.setItem('testExpiresAt', sess.expires_at || '');
      } catch (sessErr) {
        console.warn('Test session creation skipped:', sessErr.message);
      }
      localStorage.setItem('testQuestionTitle', q.title || '');
      const proj = await api.createProject(q.id);
      navigate(`/student/lab/${proj.id}`);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  // File handling — separate from the fullscreen div
  const onFileChange = useCallback((e) => {
    const f = e.target?.files?.[0];
    if (f) { setFile(f); setFileName(f.name); setResult(null); setError(''); }
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    const f = e.dataTransfer?.files?.[0];
    if (f) { setFile(f); setFileName(f.name); setResult(null); setError(''); }
  }, []);

  const doSubmit = async () => {
    if (!file || !session || submitting) return;
    setSubmitting(true); setError('');
    try {
      const fd = new FormData();
      fd.append('pkt_file', file);
      const res = await api.submitTest(session.id, fd);
      setResult(res);
      try { const u = await api.getTestSession(session.id); setSession(u); } catch {}
      if (res.passed && timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    } catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  const doClear = () => { setFile(null); setFileName(''); setResult(null); setError(''); if (fileInputRef.current) fileInputRef.current.value = ''; };

  const endTest = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setPhase('result');
  };

  const copyQuestion = () => {
    if (question?.question_text) {
      navigator.clipboard.writeText(question.question_text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
    }
  };

  const [feedbackError, setFeedbackError] = useState('');

  const finishAndReturn = () => {
    if (!feedback.rating || !feedback.difficulty) {
      setFeedbackError('⚠️ Please select both a Star Rating and Difficulty Level to submit feedback.');
      return;
    }
    setFeedbackError('');
    setFeedbackDone(true);
    setTimeout(() => {
      const role = localStorage.getItem('role');
      if (role === 'admin') {
        navigate('/results');
      } else if (role === 'professor') {
        navigate('/questions');
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('username');
        navigate('/login');
      }
    }, 1500);
  };

  const resetAll = () => {
    setPhase('rules'); setCheckedRules([]); setQuestion(null); setSession(null);
    setFile(null); setFileName(''); setResult(null); setTimeLeft(null);
    setError(''); setFeedback({ rating: 0, difficulty: '', comment: '' }); setFeedbackDone(false);
  };

  const fmt = (s) => {
    if (s === null) return '--:--:--';
    return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  };

  /* ═══════ RESULT ═══════ */
  if (phase === 'result') {
    const passed = result?.passed ?? false;
    const score = result?.score ?? 0;
    const maxScore = result?.max_score ?? 100;
    return (
      <div style={{ maxWidth: 520, margin: '50px auto', animation: 'fadeIn 0.4s ease' }}>
        <div className="card" style={{ textAlign: 'center', padding: '44px 36px' }}>
          <div style={{ fontSize: 72, marginBottom: 14 }}>{passed ? '🎉' : '😞'}</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 6 }}>{passed ? 'Congratulations!' : 'Test Completed'}</h1>
          <div style={{ width: 110, height: 110, borderRadius: '50%', margin: '20px auto', border: `4px solid ${passed ? 'var(--success)' : 'var(--danger)'}`, background: passed ? 'var(--success-bg)' : 'var(--danger-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
            <span style={{ fontSize: 34, fontWeight: 900, color: passed ? 'var(--success)' : 'var(--danger)' }}>{score.toFixed(0)}</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>/ {maxScore}</span>
          </div>
          <span className={`badge ${passed ? 'badge-pass' : 'badge-fail'}`} style={{ padding: '8px 24px', fontSize: 15 }}>
            {passed ? '✅ PASSED' : '❌ NOT PASSED'}
          </span>
          {result?.check_count > 0 && <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 14 }}>{result.passed_count} / {result.check_count} test cases passed</p>}
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 6, marginBottom: 24 }}>{question?.title}</p>
          <button className="btn btn-primary btn-lg" style={{ width: '100%', fontSize: 16 }} onClick={() => setPhase('feedback')}>Give Feedback →</button>
        </div>
      </div>
    );
  }

  /* ═══════ FEEDBACK ═══════ */
  if (phase === 'feedback') {
    return (
      <div style={{ maxWidth: 520, margin: '50px auto', animation: 'fadeIn 0.4s ease' }}>
        <div className="card" style={{ textAlign: 'center', padding: '36px 32px' }}>
          {feedbackDone ? (
            <><div style={{ fontSize: 64, marginBottom: 14 }}>🎉</div><h2 style={{ fontSize: 24 }}>Thank You!</h2><p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>Feedback submitted.</p></>
          ) : (
            <>
              <div style={{ fontSize: 44, marginBottom: 8 }}>📝</div>
              <h2 style={{ fontSize: 22, marginBottom: 20 }}>Test Feedback</h2>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>How was the test?</p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 24 }}>
                {[1,2,3,4,5].map(n => (
                  <button key={n} onClick={() => setFeedback(f => ({...f, rating: n}))}
                    style={{ fontSize: 40, background: 'none', border: 'none', cursor: 'pointer', color: n <= feedback.rating ? '#F59E0B' : '#E5E7EB', padding: 2 }}>★</button>
                ))}
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Difficulty</p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
                {['Easy','Medium','Hard','Very Hard'].map(d => (
                  <button key={d} className={`btn btn-sm ${feedback.difficulty === d ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setFeedback(f => ({...f, difficulty: d}))}>{d}</button>
                ))}
              </div>
              <div style={{ textAlign: 'left', marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Comments (optional)</label>
                <textarea className="form-textarea" rows={3} placeholder="Any suggestions..." value={feedback.comment}
                  onChange={e => setFeedback(f => ({...f, comment: e.target.value}))} style={{ minHeight: 70, fontSize: 14 }} />
              </div>
              {feedbackError && <p style={{ color: '#EF4444', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{feedbackError}</p>}
              <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={finishAndReturn}>Submit Feedback</button>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ═══════ TEST PHASE — CSS FULLSCREEN (position:fixed covers everything) ═══════ */
  if (phase === 'test' && session && question) {
    const maxAttempts = question.max_attempts || 3;
    const attUsed = session.attempts_used || 0;
    const timerCls = timeLeft !== null && timeLeft <= 60 ? 'danger' : timeLeft !== null && timeLeft <= 300 ? 'warning' : '';
    const hasFile = !!file;
    const canSubmit = hasFile && !submitting && !session.is_completed;

    return (
      <>
        {/* Hidden file input at top level — NOT inside the fixed div prevents fullscreen exit */}
        <input ref={fileInputRef} type="file" accept=".pkt,.pka,.xml"
          style={{ position: 'fixed', top: -9999, left: -9999, opacity: 0 }}
          onChange={onFileChange} />

        {/* Fullscreen overlay */}
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: '#F5F6FA', overflow: 'auto', padding: 16 }}>
          {/* Top Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 18px', marginBottom: 14, background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span className="badge badge-topic">{question.topic_name}</span>
              <strong style={{ fontSize: 16 }}>{question.title}</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className={`timer-display ${timerCls}`} style={{ padding: '6px 18px', fontSize: 20, borderWidth: 2 }}>⏱ {fmt(timeLeft)}</div>
              <span style={{ fontSize: 14, color: '#9CA3AF' }}>Attempt {attUsed}/{maxAttempts}</span>
              <button className="btn btn-sm btn-danger" onClick={endTest}>End Test</button>
            </div>
          </div>

          {/* Two Column */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 16, alignItems: 'start', height: 'calc(100vh - 90px)' }}>

            {/* LEFT: Question */}
            <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 14, padding: 24, height: '100%', overflow: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 17, fontWeight: 700 }}>📖 Question</h3>
                <button className="btn btn-sm btn-secondary" onClick={copyQuestion}>
                  {copied ? '✅ Copied!' : '📋 Copy'}
                </button>
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 2, padding: '18px 20px', background: '#F5F6FA', borderRadius: 12, userSelect: 'text' }}>
                {question.question_text}
              </div>
            </div>

            {/* RIGHT: Upload + Test Cases */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%', overflow: 'auto' }}>
              {/* Upload */}
              <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 14, padding: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>📤 Upload .pkt File</h3>
                <div style={{ border: `2px dashed ${hasFile ? '#7C5CFC' : '#E5E7EB'}`, borderRadius: 12, padding: 24, textAlign: 'center', cursor: 'pointer', background: hasFile ? 'rgba(124,92,252,0.06)' : '#F5F6FA', transition: 'all 0.2s' }}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}>
                  <div style={{ fontSize: 36, marginBottom: 6 }}>{hasFile ? '📄' : '📤'}</div>
                  <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>{hasFile ? fileName : 'Drop .pkt file here'}</p>
                  <p style={{ fontSize: 13, color: '#9CA3AF' }}>{hasFile ? `${(file.size/1024).toFixed(1)} KB` : 'or click to browse'}</p>
                </div>

                {error && <div style={{ marginTop: 10, padding: '10px 14px', background: '#FEF2F2', borderRadius: 10, color: '#EF4444', fontSize: 14 }}>{error}</div>}

                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button className="btn btn-primary" style={{ flex: 1, fontSize: 15, padding: '12px 16px' }}
                    disabled={!canSubmit} onClick={doSubmit}>
                    {submitting ? '⏳ Evaluating...' : '🚀 Submit'}
                  </button>
                  <button className="btn btn-secondary" style={{ fontSize: 14 }} disabled={!hasFile} onClick={doClear}>🗑 Clear</button>
                </div>
              </div>

              {/* Hidden Test Cases */}
              <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 14, padding: 20, flex: 1 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>🧪 Hidden Test Cases</h3>

                {result ? (
                  <>
                    {/* Score */}
                    <div style={{ textAlign: 'center', marginBottom: 14 }}>
                      <div style={{ width: 70, height: 70, borderRadius: '50%', margin: '0 auto 8px', border: `3px solid ${result.passed ? '#10B981' : '#EF4444'}`, background: result.passed ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                        <span style={{ fontSize: 22, fontWeight: 900, color: result.passed ? '#10B981' : '#EF4444' }}>{result.score?.toFixed(0)}</span>
                        <span style={{ fontSize: 10, color: '#9CA3AF' }}>/{result.max_score}</span>
                      </div>
                      <span className={`badge ${result.passed ? 'badge-pass' : 'badge-fail'}`} style={{ fontSize: 12, padding: '4px 14px' }}>
                        {result.passed ? '✓ PASSED' : '✗ FAILED'}
                      </span>
                    </div>

                    {/* Progress */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                        <span>Passed</span>
                        <strong style={{ color: result.passed ? '#10B981' : '#EF4444' }}>{result.passed_count}/{result.check_count}</strong>
                      </div>
                      <div style={{ background: '#F0F1F6', borderRadius: 100, height: 8, overflow: 'hidden' }}>
                        <div style={{ width: `${result.check_count > 0 ? (result.passed_count/result.check_count)*100 : 0}%`, height: '100%', borderRadius: 100, transition: 'width 0.6s', background: result.passed ? '#10B981' : '#7C5CFC' }} />
                      </div>
                    </div>

                    {/* Individual test cases */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {Array.from({ length: result.check_count }).map((_, i) => {
                        const ok = i < result.passed_count;
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${ok ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                            <span style={{ fontSize: 16, fontWeight: 700, color: ok ? '#10B981' : '#EF4444' }}>{ok ? '✓' : '✗'}</span>
                            <span style={{ fontSize: 14, fontWeight: 500 }}>Hidden Test Case {i + 1}</span>
                            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: ok ? '#10B981' : '#EF4444' }}>{ok ? 'Passed' : 'Failed'}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[1,2,3,4,5].map(i => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: '#F5F6FA', border: '1px solid #E5E7EB' }}>
                        <span style={{ fontSize: 16, color: '#9CA3AF' }}>○</span>
                        <span style={{ fontSize: 14, color: '#9CA3AF' }}>Hidden Test Case {i}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9CA3AF' }}>Pending</span>
                      </div>
                    ))}
                    <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginTop: 8 }}>Submit your file to run test cases</p>
                  </div>
                )}
              </div>

              {session.is_completed && (
                <button className="btn btn-primary btn-lg" style={{ width: '100%', fontSize: 16 }} onClick={endTest}>✅ Finish Test</button>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  /* ═══════ RULES (DEFAULT) ═══════ */
  return (
    <div style={{ maxWidth: 640, margin: '40px auto', animation: 'fadeIn 0.4s ease' }}>
      <div className="card" style={{ padding: 40 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 52, marginBottom: 10 }}>📋</div>
          <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>Examination Guidelines</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>Read and accept all rules before starting your test</p>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          {EXAM_RULES.map((rule, idx) => (
            <label key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 0', cursor: 'pointer', userSelect: 'none', borderBottom: idx < EXAM_RULES.length - 1 ? '1px solid var(--border)' : 'none' }}
              onClick={() => toggleRule(idx)}>
              <div style={{ width: 24, height: 24, minWidth: 24, borderRadius: 6, marginTop: 1, border: checkedRules.includes(idx) ? 'none' : '2px solid #D1D5DB', background: checkedRules.includes(idx) ? '#7C5CFC' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 14, fontWeight: 700, transition: 'all 0.2s' }}>
                {checkedRules.includes(idx) && '✓'}
              </div>
              <span style={{ fontSize: 15, lineHeight: 1.6, color: checkedRules.includes(idx) ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{rule}</span>
            </label>
          ))}
        </div>
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
            <span>Accepted</span><span>{checkedRules.length} / {EXAM_RULES.length}</span>
          </div>
          <div style={{ background: '#F0F1F6', borderRadius: 100, height: 8, overflow: 'hidden' }}>
            <div style={{ width: `${(checkedRules.length / EXAM_RULES.length) * 100}%`, height: '100%', borderRadius: 100, background: allRulesChecked ? '#10B981' : '#7C5CFC', transition: 'width 0.3s' }} />
          </div>
        </div>
        {allRulesChecked ? (
          <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 20, fontSize: 17, padding: '14px 24px', animation: 'slideUp 0.3s ease', justifyContent: 'center'}}
            onClick={handleStartTest} disabled={loading}>
            {loading ? '⏳ Loading test...' : '-> Start Test'}
          </button>
        ) : (
          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: 'var(--text-muted)' }}>☝️ Accept all {EXAM_RULES.length} rules to proceed</p>
        )}
        {error && <div style={{ marginTop: 14, padding: '12px 16px', background: '#FEF2F2', borderRadius: 10, color: '#EF4444', fontSize: 14, textAlign: 'center' }}>{error}</div>}
      </div>
    </div>
  );
}
