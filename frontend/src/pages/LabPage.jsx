import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';
import CanvasEngine from '../features/canvas/CanvasEngine.jsx';
import DevicePalette from '../features/devices/DevicePalette.jsx';
import PropertiesPanel from '../features/properties/PropertiesPanel.jsx';
import CliTerminal from '../features/cli/Terminal.jsx';
import useProjectStore from '../store/projectStore.js';
import { api } from '../services/api.js';

export default function LabPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [termHeight, setTermHeight] = useState(250);
  const [submitError, setSubmitError] = useState('');
  const [activeTerminal, setActiveTerminal] = useState(null);

  // Feedback State
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState({ rating: 0, difficulty: '', comment: '' });
  const [feedbackDone, setFeedbackDone] = useState(false);

  // Timer State
  const [timeLeft, setTimeLeft] = useState(null);
  const [timerExpired, setTimerExpired] = useState(false);
  const timerRef = useRef(null);

  // Proctoring State
  const [warningCount, setWarningCount] = useState(0);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningReason, setWarningReason] = useState('');
  const [terminatedByProctor, setTerminatedByProctor] = useState(false);
  const [showUnlockedNotice, setShowUnlockedNotice] = useState(false);
  const violationCooldownRef = useRef(false);
  const wasLockedByProctorRef = useRef(false);

  const loadProject = useProjectStore(s => s.loadProject);
  const submitProject = useProjectStore(s => s.submitProject);
  const finishProject = useProjectStore(s => s.finishProject);
  const saving = useProjectStore(s => s.saving);
  const lastSaved = useProjectStore(s => s.lastSaved);
  const submitting = useProjectStore(s => s.submitting);
  const submitResult = useProjectStore(s => s.submitResult);
  const openTerminals = useProjectStore(s => s.openTerminals);
  const closeTerminal = useProjectStore(s => s.closeTerminal);
  const questionTitle = useProjectStore(s => s.questionTitle);
  const questionId = useProjectStore(s => s.questionId);
  const questionTimeLimit = useProjectStore(s => s.questionTimeLimit);
  const nodes = useProjectStore(s => s.nodes);

  useEffect(() => {
    if (projectId) loadProject(projectId);
  }, [projectId, loadProject]);

  // Save project state synchronously before page refresh / unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      useProjectStore.getState().saveProjectSync();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Auto-select active terminal when a new one opens
  useEffect(() => {
    if (openTerminals.length > 0 && (!activeTerminal || !openTerminals.includes(activeTerminal))) {
      setActiveTerminal(openTerminals[openTerminals.length - 1]);
    }
    if (openTerminals.length === 0) {
      setActiveTerminal(null);
    }
  }, [openTerminals, activeTerminal]);

  // Countdown Timer & Admin Unlock Sync Effect
  useEffect(() => {
    if (!questionId) {
      setTimeLeft(null);
      return;
    }

    let isMounted = true;
    let pollInterval = null;

    const checkSessionAndInitTimer = async () => {
      let expiry = null;
      let sess = null;

      try {
        sess = await api.startTest(questionId);
        if (!isMounted) return;

        if (sess) {
          if (sess.proctor_locked) {
            // Backend says session is locked
            setWarningCount(3);
            setTerminatedByProctor(true);
            setShowWarningModal(false);
            wasLockedByProctorRef.current = true;
          } else if (wasLockedByProctorRef.current) {
            // Admin explicitly unlocked this session in the backend DB!
            wasLockedByProctorRef.current = false;
            setWarningCount(0);
            setShowWarningModal(false);
            setTimerExpired(false);
            setShowUnlockedNotice(true);
            setTerminatedByProctor(false);
            violationCooldownRef.current = false;
            if (!sess.is_completed) {
              useProjectStore.setState({ submitResult: null });
            }
          }

          if (sess.is_completed) {
            setTimerExpired(true);
            setTimeLeft(0);
            return;
          }

          if (sess.expires_at) {
            const rawStr = String(sess.expires_at).trim();
            const utcStr = (rawStr.endsWith('Z') || rawStr.includes('+')) ? rawStr : rawStr + 'Z';
            const parsed = new Date(utcStr).getTime();
            if (!isNaN(parsed) && parsed > Date.now()) {
              expiry = parsed;
              setTimerExpired(false);
            } else {
              setTimerExpired(true);
              setTimeLeft(0);
              return;
            }
          }
        }
      } catch (err) {
        console.warn('Student test session fetch:', err.message);
      }

      // Fallback only if no server session (standalone offline mode)
      if (!sess && !expiry && questionTimeLimit > 0) {
        const username = localStorage.getItem('username') || 'user';
        const sessionKey = `lab_start_${username}_${questionId}`;
        let startTs = parseInt(sessionStorage.getItem(sessionKey) || '0');
        if (!startTs || isNaN(startTs)) {
          startTs = Date.now();
          sessionStorage.setItem(sessionKey, startTs.toString());
        }
        expiry = startTs + questionTimeLimit * 60 * 1000;
      }

      if (!isMounted || !expiry) return;

      const tick = () => {
        const remaining = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
        setTimeLeft(remaining);
        if (remaining <= 0) {
          setTimerExpired(true);
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
          const store = useProjectStore.getState();
          if (!store.submitResult) {
            store.submitProject().catch((err) => {
              console.error("Auto-submit failed on timer expiration:", err);
              useProjectStore.setState({ 
                submitResult: { 
                  passed: false, 
                  score: 0, 
                  max_score: 100,
                  passed_count: 0,
                  check_count: 0,
                  error: 'Evaluation failed or incomplete' 
                },
                submitting: false 
              });
            });
          }
        } else {
          setTimerExpired(false);
        }
      };

      tick();
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(tick, 1000);
    };

    checkSessionAndInitTimer();

    // Poll backend every 3 seconds for admin unlock and time extension signals
    pollInterval = setInterval(checkSessionAndInitTimer, 3000);

    return () => {
      isMounted = false;
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [questionId]);

  // Fullscreen Proctoring Effect
  useEffect(() => {
    const role = localStorage.getItem('role');
    const isStudent = role === 'student';
    if (!isStudent) return;

    // Request fullscreen on mount
    const requestFS = async () => {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
      } catch (err) {}
    };
    requestFS();

    const triggerViolation = (reason) => {
      // Skip if already in cooldown, already submitted, or warning modal is showing
      if (violationCooldownRef.current) return;
      if (useProjectStore.getState().submitResult) return;

      violationCooldownRef.current = true;
      setTimeout(() => { violationCooldownRef.current = false; }, 600);

      setWarningCount((prev) => {
        const next = prev + 1;
        if (next >= 3) {
          const targetQId = questionId || useProjectStore.getState().questionId;
          if (targetQId) {
            api.reportWarning(targetQId, 3, reason).catch((err) => console.error("Report warning failed:", err));
          }
          wasLockedByProctorRef.current = true;
          setTerminatedByProctor(true);
          setShowWarningModal(false);
          // Auto-submit on 3rd violation
          const store = useProjectStore.getState();
          if (!store.submitResult) {
            store.submitProject().catch((err) => {
              console.error("Auto-submit failed after proctor termination:", err);
              useProjectStore.setState({ 
                submitResult: { 
                  passed: false, 
                  score: 0, 
                  max_score: 100,
                  passed_count: 0,
                  check_count: 0,
                  error: 'Evaluation failed or incomplete' 
                },
                submitting: false 
              });
            });
          }
          return 3;
        } else {
          setWarningReason(reason);
          setShowWarningModal(true);
          return next;
        }
      });
    };

    const handleFSChange = () => {
      if (!document.fullscreenElement && !useProjectStore.getState().submitResult) {
        triggerViolation('Exited Full Screen mode');
      }
    };
    const handleVisChange = () => {
      if (document.hidden && !useProjectStore.getState().submitResult) {
        triggerViolation('Switched tabs or minimized browser window');
      }
    };
    const handleKeyDown = (e) => {
      // Intercept Ctrl+R, Cmd+R, F5 refresh keys to return to Exam Guidelines page
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') || e.key === 'F5') {
        e.preventDefault();
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        window.location.href = '/student';
        return;
      }
    };

    document.addEventListener('fullscreenchange', handleFSChange);
    document.addEventListener('visibilitychange', handleVisChange);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', handleFSChange);
      document.removeEventListener('visibilitychange', handleVisChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const returnToFullScreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch (err) {
      console.warn("Failed to request fullscreen:", err);
    }
    setShowWarningModal(false);
    violationCooldownRef.current = false;
  };

  const fmtTime = (s) => {
    if (s === null) return null;
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    return `${h}:${m}:${sec}`;
  };
  const timerColor = timeLeft !== null && timeLeft <= 60 ? '#EF4444' : timeLeft !== null && timeLeft <= 300 ? '#F59E0B' : '#10B981';
  const timerPulse = timeLeft !== null && timeLeft <= 60;

  const handleSubmit = async () => {
    setSubmitError('');
    setShowFeedback(false);
    try {
      await submitProject();
    } catch (err) {
      setSubmitError(err.message);
    }
  };

  const handleCloseTerminal = (devId) => {
    closeTerminal(devId);
    if (activeTerminal === devId) {
      const remaining = openTerminals.filter(id => id !== devId);
      setActiveTerminal(remaining.length > 0 ? remaining[remaining.length - 1] : null);
    }
  };

  const [feedbackError, setFeedbackError] = useState('');

  const handleFeedbackSubmit = async () => {
    if (!feedback.rating || !feedback.difficulty) {
      setFeedbackError('⚠️ Please select both a star rating and difficulty level to submit feedback.');
      return;
    }
    setFeedbackError('');
    try {
      await finishProject();
    } catch (err) {
      console.error('Failed to commit final evaluation:', err);
    }
    setFeedbackDone(true);
    setTimeout(() => {
      useProjectStore.setState({ submitResult: null });
      setShowFeedback(false);
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
    }, 1200);
  };

  const hasTerminals = openTerminals.length > 0;
  const evalResult = submitResult?.evaluation || (submitResult?.passed !== undefined || submitResult?.overall_score !== undefined ? submitResult : null);

  // Extract check results for hidden test case view
  const rawResults = evalResult?.results || evalResult?.check_results || {};
  const checks = Array.isArray(rawResults) ? rawResults : (rawResults.check_results || (evalResult?.check_results || []));
  const passedCount = checks.filter(c => c.passed).length;
  const totalCount = checks.length;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#F5F6FA', overflow: 'hidden' }}>
      {/* Top Bar */}
      <div style={{
        height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', background: 'white', borderBottom: '1px solid #E5E7EB',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            title="Restart & Return to Exam Guidelines"
            onClick={() => {
              if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
              }
              window.location.href = '/student';
            }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 36, color: '#6B7280', padding: '4px 6px',
              borderRadius: 6, display: 'flex', alignItems: 'center',
              justifyContent: 'center', transition: 'all 0.2s',
            }}
          >
            ⟳
          </button>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg, #7C5CFC, #A78BFA)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 13, fontWeight: 800 }}>PG</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>{questionTitle || 'Lab Environment'}</div>
            <div style={{ fontSize: 11, color: '#9CA3AF' }}>{nodes.length} devices</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Timer */}
          {timeLeft !== null && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '4px 14px',
              borderRadius: 8, fontWeight: 800, fontSize: 15, fontFamily: 'monospace',
              color: timerColor, background: `${timerColor}15`,
              border: `1.5px solid ${timerColor}40`,
              animation: timerPulse ? 'pulse 1s infinite' : 'none',
            }}>
              ⏱ {fmtTime(timeLeft)}
            </div>
          )}
          {/* Proctoring badge */}
          {warningCount > 0 && (
            <span style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', background: '#FEF3C7', padding: '3px 10px', borderRadius: 6 }}>
              ⚠️ {warningCount}/3
            </span>
          )}
          <span style={{ fontSize: 12, color: saving ? '#F59E0B' : '#10B981', display: 'flex', alignItems: 'center', gap: 4 }}>
            {saving ? '⏳ Saving...' : lastSaved ? `✓ Saved ${lastSaved.toLocaleTimeString()}` : ''}
          </span>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSubmit}
            disabled={submitting || nodes.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
          >
            {submitting ? '⏳ Grading...' : '🚀 Submit for Grading'}
          </button>
        </div>
      </div>

      {/* Admin Unlocked & Extension Notice Modal */}
      {showUnlockedNotice && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'white', borderRadius: 20, padding: '36px 40px', maxWidth: 440,
            width: '90%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            animation: 'fadeIn 0.3s ease',
          }}>
            <div style={{ fontSize: 56, marginBottom: 10 }}>🎉</div>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: '#10B981', marginBottom: 8 }}>
              TEST UNLOCKED & EXTENDED
            </h2>
            <p style={{ fontSize: 15, color: '#4B5563', marginBottom: 20, lineHeight: 1.6 }}>
              Your test session has been unlocked and your time limit extended by the Administrator.
            </p>
            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%', fontSize: 15, padding: '14px 20px', fontWeight: 800, background: '#10B981', borderColor: '#10B981' }}
              onClick={async () => {
                try {
                  if (!document.fullscreenElement) {
                    await document.documentElement.requestFullscreen();
                  }
                } catch (err) {
                  console.warn("Failed to request fullscreen:", err);
                }
                setShowUnlockedNotice(false);
                violationCooldownRef.current = false;
              }}
            >
              🔒 Resume Full Screen Test
            </button>
          </div>
        </div>
      )}

      {/* Proctoring Warning Modal */}
      {showWarningModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'white', borderRadius: 20, padding: '36px 40px', maxWidth: 440,
            width: '90%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            animation: 'fadeIn 0.3s ease',
          }}>
            <div style={{ fontSize: 56, marginBottom: 10 }}>⚠️</div>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: '#DC2626', marginBottom: 8 }}>
              PROCTORING WARNING
            </h2>
            <div style={{
              display: 'inline-block', padding: '4px 16px', borderRadius: 100, fontSize: 14, fontWeight: 800,
              background: '#FEF2F2', color: '#EF4444', marginBottom: 16,
            }}>
              Warning {warningCount} of 3
            </div>
            <p style={{ fontSize: 15, color: '#4B5563', marginBottom: 8, lineHeight: 1.6 }}>
              <strong>Violation:</strong> {warningReason}
            </p>
            <p style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 24 }}>
              On your 3rd violation, your test will be <strong style={{ color: '#EF4444' }}>automatically submitted</strong>.
            </p>
            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%', fontSize: 15, padding: '14px 20px', fontWeight: 800 }}
              onClick={returnToFullScreen}
            >
              🔒 Return to Full Screen Test
            </button>
          </div>
        </div>
      )}

      {/* Timer Expired Notice */}
      {timerExpired && !evalResult && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1500,
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'white', borderRadius: 20, padding: '36px 40px', maxWidth: 400,
            textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            animation: 'fadeIn 0.3s ease',
          }}>
            <div style={{ fontSize: 56, marginBottom: 10 }}>⏰</div>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: '#EF4444', marginBottom: 8 }}>Time's Up!</h2>
            <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 20 }}>Your test duration has expired.</p>
            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%', fontSize: 15, padding: '14px 20px', fontWeight: 800 }}
              onClick={() => {
                const fallback = {
                  passed: false,
                  overall_score: 0,
                  score: 0,
                  max_score: 100,
                  passed_count: 0,
                  check_count: 5,
                  check_results: [
                    { passed: false }, { passed: false }, { passed: false }, { passed: false }, { passed: false }
                  ],
                  results: {
                    check_results: [
                      { passed: false }, { passed: false }, { passed: false }, { passed: false }, { passed: false }
                    ]
                  }
                };
                useProjectStore.setState({
                  submitResult: { ...fallback, evaluation: fallback }
                });
              }}
            >
              📊 View Results & Go to Feedback →
            </button>
          </div>
        </div>
      )}

      {/* Termination Notice */}
      {terminatedByProctor && !evalResult && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1500,
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'white', borderRadius: 20, padding: '36px 40px', maxWidth: 400,
            textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            animation: 'fadeIn 0.3s ease',
          }}>
            <div style={{ fontSize: 56, marginBottom: 10 }}>🚨</div>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: '#EF4444', marginBottom: 8 }}>Test Terminated</h2>
            <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 20 }}>Maximum proctoring warnings (3/3) exceeded.</p>
            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%', fontSize: 15, padding: '14px 20px', fontWeight: 800 }}
              onClick={() => {
                const fallback = {
                  passed: false,
                  overall_score: 0,
                  score: 0,
                  max_score: 100,
                  passed_count: 0,
                  check_count: 5,
                  check_results: [
                    { passed: false }, { passed: false }, { passed: false }, { passed: false }, { passed: false }
                  ],
                  results: {
                    check_results: [
                      { passed: false }, { passed: false }, { passed: false }, { passed: false }, { passed: false }
                    ]
                  }
                };
                useProjectStore.setState({
                  submitResult: { ...fallback, evaluation: fallback }
                });
              }}
            >
              📊 View Results & Go to Feedback →
            </button>
          </div>
        </div>
      )}

      {/* Result & Feedback Modal */}
      {evalResult && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'white', borderRadius: 20, padding: '32px 36px',
            maxWidth: 480, width: '92%', textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)', animation: 'fadeIn 0.3s ease',
            maxHeight: '90vh', overflowY: 'auto'
          }}>
            {showFeedback ? (
              /* FEEDBACK FORM */
              <>
                {feedbackDone ? (
                  <>
                    <div style={{ fontSize: 64, marginBottom: 14 }}>🎉</div>
                    <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Thank You!</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>Feedback submitted successfully.</p>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 44, marginBottom: 6 }}>📝</div>
                    <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Assesment Feedback</h2>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>How was this Assessment?</p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 20 }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <button key={n} onClick={() => setFeedback(f => ({ ...f, rating: n }))}
                          style={{ fontSize: 36, background: 'none', border: 'none', cursor: 'pointer', color: n <= feedback.rating ? '#F59E0B' : '#E5E7EB', padding: 2 }}>★</button>
                      ))}
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>Difficulty Level</p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
                      {['Easy', 'Medium', 'Hard', 'Very Hard'].map(d => (
                        <button key={d} className={`btn btn-sm ${feedback.difficulty === d ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => setFeedback(f => ({ ...f, difficulty: d }))}>{d}</button>
                      ))}
                    </div>
                    <div style={{ textAlign: 'left', marginBottom: 20 }}>
                      <label style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 6 }}>Comments (optional)</label>
                      <textarea className="form-textarea" rows={3} placeholder="Any suggestions..." value={feedback.comment}
                        onChange={e => setFeedback(f => ({ ...f, comment: e.target.value }))} style={{ minHeight: 70, fontSize: 14 }} />
                    </div>
                    {feedbackError && <p style={{ color: '#EF4444', fontSize: 13, fontWeight: 600, marginBottom: 14, textAlign: 'center' }}>{feedbackError}</p>}
                    <button className="btn btn-primary btn-lg" style={{ width: '100%', fontSize: 15 }} onClick={handleFeedbackSubmit}>
                      Submit Feedback & Exit
                    </button>
                  </>
                )}
              </>
            ) : (
              /* GRADING RESULT & HIDDEN TEST CASES */
              <>
                <div style={{ fontSize: 56, marginBottom: 6 }}>{evalResult.passed ? '🎉' : '😞'}</div>
                <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>
                  {evalResult.passed ? 'Congratulations!' : 'Evaluation Results'}
                </h2>

                <div style={{
                  width: 84, height: 84, borderRadius: '50%', margin: '14px auto',
                  border: `4px solid ${evalResult.passed ? '#10B981' : '#EF4444'}`,
                  background: evalResult.passed ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
                }}>
                  <span style={{ fontSize: 26, fontWeight: 900, color: evalResult.passed ? '#10B981' : '#EF4444' }}>
                    {evalResult.overall_score?.toFixed(0)}
                  </span>
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>/ {evalResult.max_score}</span>
                </div>

                <span style={{
                  display: 'inline-block', padding: '5px 18px', borderRadius: 100, fontSize: 13, fontWeight: 700,
                  background: evalResult.passed ? '#ECFDF5' : '#FEF2F2',
                  color: evalResult.passed ? '#10B981' : '#EF4444',
                }}>
                  {evalResult.passed ? '✅ PASSED' : '❌ NOT PASSED'}
                </span>

                {/* Hidden Test Cases Section */}
                <div style={{ margin: '18px 0 16px', textAlign: 'left' }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: '#4B5563', marginBottom: 8 }}>
                    Hidden Test Cases ({passedCount}/{totalCount})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {checks.map((c, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                        borderRadius: 8, background: c.passed ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                        border: `1px solid ${c.passed ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`
                      }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: c.passed ? '#10B981' : '#EF4444' }}>{c.passed ? '✓' : '✗'}</span>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>Hidden Test Case {i + 1}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: c.passed ? '#10B981' : '#EF4444' }}>{c.passed ? 'Passed' : 'Failed'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                  {!terminatedByProctor && !timerExpired && (
                    <button
                      className="btn btn-secondary btn-lg"
                      style={{ width: '100%', fontSize: 14, padding: '12px 18px', fontWeight: 700, border: '1.5px solid #7C5CFC', color: '#7C5CFC', background: '#F5F3FF' }}
                      onClick={() => {
                        setTimerExpired(false);
                        useProjectStore.setState({ submitResult: null });
                      }}
                    >
                      🛠️ Continue Editing
                    </button>
                  )}
                  <button
                    className="btn btn-primary btn-lg"
                    style={{ width: '100%', fontSize: 15, padding: '14px 20px', fontWeight: 800 }}
                    onClick={() => setShowFeedback(true)}
                  >
                    Finish Test & Go to Feedback →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <ReactFlowProvider>
          <DevicePalette />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Canvas */}
            <div style={{ flex: 1, position: 'relative' }}>
              <CanvasEngine />
            </div>

            {/* CLI Terminals */}
            {hasTerminals && (
              <div style={{
                height: termHeight, borderTop: '2px solid #7C5CFC',
                display: 'flex', flexDirection: 'column', background: '#1E1E2E',
              }}>
                {/* Terminal Tabs */}
                <div style={{
                  height: 36, display: 'flex', alignItems: 'center', background: '#181825',
                  padding: '0 8px', gap: 4, borderBottom: '1px solid #313244',
                }}>
                  {openTerminals.map(devId => {
                    const devNode = nodes.find(n => n.id === devId);
                    const devName = devNode?.data?.hostname || devId;
                    const isActive = activeTerminal === devId;
                    return (
                      <div
                        key={devId}
                        onClick={() => setActiveTerminal(devId)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '4px 10px', borderRadius: '6px 6px 0 0',
                          background: isActive ? '#1E1E2E' : 'transparent',
                          color: isActive ? '#CD32F4' : '#A6ADC8',
                          fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          borderTop: isActive ? '2px solid #CD32F4' : '2px solid transparent',
                        }}
                      >
                        <span>🖥️ {devName}</span>
                        <span
                          onClick={(e) => { e.stopPropagation(); handleCloseTerminal(devId); }}
                          style={{ fontSize: 12, opacity: 0.6, cursor: 'pointer', padding: '0 2px' }}
                        >✕</span>
                      </div>
                    );
                  })}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    <button
                      onClick={() => setTermHeight(h => h === 250 ? 400 : 250)}
                      style={{ background: 'none', border: 'none', color: '#A6ADC8', cursor: 'pointer', fontSize: 12 }}
                    >
                      {termHeight === 250 ? '▲ Expand' : '▼ Shrink'}
                    </button>
                  </div>
                </div>

                {/* Active Terminal Content */}
                <div style={{ flex: 1, position: 'relative' }}>
                  {openTerminals.map(devId => (
                    <div key={devId} style={{ display: activeTerminal === devId ? 'block' : 'none', height: '100%' }}>
                      <CliTerminal deviceId={devId} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <PropertiesPanel />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
