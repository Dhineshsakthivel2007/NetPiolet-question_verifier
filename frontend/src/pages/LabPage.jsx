import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';
import CanvasEngine from '../features/canvas/CanvasEngine.jsx';
import DevicePalette from '../features/devices/DevicePalette.jsx';
import PropertiesPanel from '../features/properties/PropertiesPanel.jsx';
import CliTerminal from '../features/cli/Terminal.jsx';
import useProjectStore from '../store/projectStore.js';

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
  const nodes = useProjectStore(s => s.nodes);

  useEffect(() => {
    if (projectId) loadProject(projectId);
  }, [projectId, loadProject]);

  // Auto-select active terminal when a new one opens
  useEffect(() => {
    if (openTerminals.length > 0 && (!activeTerminal || !openTerminals.includes(activeTerminal))) {
      setActiveTerminal(openTerminals[openTerminals.length - 1]);
    }
    if (openTerminals.length === 0) {
      setActiveTerminal(null);
    }
  }, [openTerminals, activeTerminal]);

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

  const handleFeedbackSubmit = async () => {
    try {
      await finishProject();
    } catch (err) {
      console.error('Failed to commit final evaluation:', err);
    }
    setFeedbackDone(true);
    setTimeout(() => {
      useProjectStore.setState({ submitResult: null });
      setShowFeedback(false);
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      localStorage.removeItem('username');
      navigate('/login');
    }, 1200);
  };

  const hasTerminals = openTerminals.length > 0;
  const evalResult = submitResult?.evaluation;

  // Extract check results for hidden test case view
  const rawResults = evalResult?.results || {};
  const checks = Array.isArray(rawResults) ? rawResults : (rawResults.check_results || []);
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
          <button onClick={() => navigate('/student')} style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6B7280',
          }}>← </button>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg, #7C5CFC, #A78BFA)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 13, fontWeight: 800 }}>PG</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>{questionTitle || 'Lab Environment'}</div>
            <div style={{ fontSize: 11, color: '#9CA3AF' }}>{nodes.length} devices</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                    <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Lab Feedback</h2>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>How was this lab?</p>
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
                <div style={{ margin: '18px 0 12px', textAlign: 'left' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                    <span>🧪 Hidden Test Cases</span>
                    <span style={{ color: passedCount === totalCount && totalCount > 0 ? '#10B981' : '#EF4444' }}>
                      {passedCount} / {totalCount} Passed
                    </span>
                  </div>

                  <div style={{ background: '#F0F1F6', borderRadius: 100, height: 8, overflow: 'hidden', marginBottom: 10 }}>
                    <div style={{
                      width: `${totalCount > 0 ? (passedCount / totalCount) * 100 : 0}%`,
                      height: '100%',
                      background: passedCount === totalCount ? '#10B981' : '#F59E0B',
                      borderRadius: 100,
                      transition: 'width 0.5s ease'
                    }} />
                  </div>

                  <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 2 }}>
                    {checks.length > 0 ? (
                      checks.map((c, i) => (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '8px 12px', borderRadius: 8, fontSize: 13,
                          background: c.passed ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
                          border: `1px solid ${c.passed ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                            <span style={{ fontWeight: 800, color: c.passed ? '#10B981' : '#EF4444' }}>{c.passed ? '✓' : '✗'}</span>
                            <span style={{ fontWeight: 600, color: '#1F2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {c.check_description || `Hidden Test Case ${i + 1}`}
                            </span>
                          </div>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                            background: c.passed ? '#D1FAE5' : '#FECACA',
                            color: c.passed ? '#065F46' : '#991B1B',
                            flexShrink: 0
                          }}>
                            {c.passed ? 'Passed' : 'Failed'}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center' }}>No test cases executed</p>
                    )}
                  </div>
                </div>

                {submitError && <p style={{ color: '#EF4444', fontSize: 13, marginTop: 10 }}>{submitError}</p>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                  <button className="btn btn-primary" style={{ width: '100%', fontSize: 14 }}
                    onClick={() => useProjectStore.setState({ submitResult: null })}>
                    ✏️ Continue Editing
                  </button>
                  <button className="btn btn-secondary" style={{ width: '100%', fontSize: 14 }}
                    onClick={() => {
                      finishProject();
                      setShowFeedback(true);
                    }}>
                    🏁 Finish Test
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {submitError && !evalResult && (
        <div style={{ padding: '8px 16px', background: '#FEF2F2', borderBottom: '1px solid #FECACA', color: '#EF4444', fontSize: 13 }}>
          ⚠️ {submitError}
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
                {/* Terminal tabs */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 2, padding: '0 8px',
                  background: '#181825', borderBottom: '1px solid #313244',
                }}>
                  {openTerminals.map(devId => {
                    const n = nodes.find(nd => nd.id === devId);
                    const isActive = devId === activeTerminal;
                    return (
                      <div
                        key={devId}
                        onClick={() => setActiveTerminal(devId)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '6px 12px', fontSize: 12, fontWeight: 600,
                          color: isActive ? '#CDD6F4' : '#6C7086',
                          background: isActive ? '#313244' : 'transparent',
                          borderRadius: '8px 8px 0 0',
                          cursor: 'pointer', marginTop: 4,
                          borderBottom: isActive ? '2px solid #7C5CFC' : '2px solid transparent',
                          transition: 'all 0.15s',
                        }}
                      >
                        <span>🖥 {n?.data?.hostname || devId}</span>
                        <button onClick={(e) => { e.stopPropagation(); handleCloseTerminal(devId); }} style={{
                          background: 'none', border: 'none', color: '#6C7086',
                          cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1,
                        }}>×</button>
                      </div>
                    );
                  })}
                  {/* Resize handle */}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    <button onClick={() => setTermHeight(h => Math.min(h + 50, 500))} style={{ background: 'none', border: 'none', color: '#6C7086', cursor: 'pointer', fontSize: 14 }}>▲</button>
                    <button onClick={() => setTermHeight(h => Math.max(h - 50, 150))} style={{ background: 'none', border: 'none', color: '#6C7086', cursor: 'pointer', fontSize: 14 }}>▼</button>
                  </div>
                </div>
                {/* Terminal content */}
                <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                  {openTerminals.map(devId => (
                    <div
                      key={devId}
                      style={{
                        position: 'absolute', inset: 0,
                        display: devId === activeTerminal ? 'block' : 'none',
                      }}
                    >
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
