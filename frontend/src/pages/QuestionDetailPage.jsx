import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import { FaFlask, FaListCheck, FaCode, FaPlus, FaWandMagicSparkles, FaFloppyDisk, FaTrash, FaPenToSquare } from 'react-icons/fa6';

export default function QuestionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [question, setQuestion] = useState(null);
  const [levels, setLevels] = useState([]);
  const [planJson, setPlanJson] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [viewMode, setViewMode] = useState('visual'); // 'visual' | 'code'
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Modal for adding a new check
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCheck, setNewCheck] = useState({
    type: 'ospf_process',
    description: '',
    weight: 10,
    required: true,
    paramsText: '{\n  "device": "R1",\n  "process_id": 1\n}'
  });

  // Editable question fields
  const [editForm, setEditForm] = useState({
    title: '', question_text: '', week_number: 1,
    semester: '', academic_year: '', is_active: true,
    time_limit_minutes: 60, max_attempts: 3, level_id: '',
  });
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const load = async () => {
    const [q, l] = await Promise.all([
      api.getQuestion(id),
      api.getLevels().catch(() => []),
    ]);
    setQuestion(q);
    setLevels(l);
    setEditForm({
      title: q.title || '',
      question_text: q.question_text || '',
      week_number: q.week_number || 1,
      semester: q.semester || '',
      academic_year: q.academic_year || '',
      is_active: q.is_active ?? true,
      time_limit_minutes: q.time_limit_minutes ?? 60,
      max_attempts: q.max_attempts ?? 3,
      level_id: q.level_id || '',
    });
    setHasChanges(false);
    if (q.evaluation_plan) setPlanJson(JSON.stringify(q.evaluation_plan, null, 2));
  };
  useEffect(() => { load(); }, [id]);

  const handleFieldChange = useCallback((field, value) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
    setSuccess('');
  }, []);

  const handleSaveQuestion = async () => {
    setSavingQuestion(true); setError(''); setSuccess('');
    try {
      const payload = { ...editForm };
      if (!payload.level_id) payload.level_id = null;
      const q = await api.updateQuestion(id, payload);
      setQuestion(q);
      setHasChanges(false);
      setSuccess('Question updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err.message); }
    finally { setSavingQuestion(false); }
  };

  const handleTestLab = async () => {
    try {
      const proj = await api.createProject(id);
      navigate(`/student/lab/${proj.id}`);
    } catch (err) { alert(err.message); }
  };

  const handleGeneratePlan = async () => {
    setGenerating(true); setError(''); setSuccess('');
    try {
      const updated = await api.generatePlan(id);
      setQuestion(updated);
      if (updated.evaluation_plan) setPlanJson(JSON.stringify(updated.evaluation_plan, null, 2));
      setSuccess('Evaluation plan generated with AI!');
    } catch (err) { setError(err.message); }
    finally { setGenerating(false); }
  };

  const handleSavePlan = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const parsed = JSON.parse(planJson);
      const updated = await api.updatePlan(id, parsed);
      setQuestion(updated);
      setSuccess('Evaluation plan saved successfully!');
    } catch (err) {
      setError(err instanceof SyntaxError ? 'Invalid JSON syntax' : err.message);
    } finally { setSaving(false); }
  };

  // Helper to parse plan JSON
  let parsedPlan = null;
  try {
    parsedPlan = planJson ? JSON.parse(planJson) : null;
  } catch (err) {}
  const checksList = parsedPlan?.checks || [];

  const handleDeleteCheck = (index) => {
    if (!parsedPlan) return;
    const updatedChecks = [...checksList];
    updatedChecks.splice(index, 1);
    const updatedPlan = { ...parsedPlan, checks: updatedChecks };
    setPlanJson(JSON.stringify(updatedPlan, null, 2));
  };

  const handleAddCheckSubmit = () => {
    let paramsObj = {};
    try {
      paramsObj = JSON.parse(newCheck.paramsText);
    } catch (err) {
      alert('Invalid JSON parameters: ' + err.message);
      return;
    }
    const checkItem = {
      type: newCheck.type,
      description: newCheck.description || `Verify ${newCheck.type}`,
      weight: Number(newCheck.weight) || 10,
      required: Boolean(newCheck.required),
      params: paramsObj,
    };

    const currentPlan = parsedPlan || {
      topic: question?.title || 'Network',
      description: 'Evaluation plan',
      pass_threshold: 0.7,
      total_points: 100,
      checks: [],
    };

    const updatedPlan = {
      ...currentPlan,
      checks: [...(currentPlan.checks || []), checkItem],
    };

    setPlanJson(JSON.stringify(updatedPlan, null, 2));
    setShowAddModal(false);
    setNewCheck({
      type: 'ospf_process',
      description: '',
      weight: 10,
      required: true,
      paramsText: '{\n  "device": "R1",\n  "process_id": 1\n}'
    });
  };

  if (!question) return <div className="loader"><div className="spinner" /></div>;

  const handleDeleteQuestion = () => {
    setShowDeleteModal(true);
  };

  const confirmDeleteQuestion = async () => {
    try {
      await api.deleteQuestion(id);
      navigate('/questions');
    } catch (err) {
      alert(err.message || 'Failed to delete question');
    }
  };

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <button className="btn btn-sm btn-secondary" onClick={() => navigate('/questions')} style={{ marginBottom: 8 }}>← Back to Questions</button>
          <h2 style={{ margin: 0 }}>{question.title}</h2>
          <p style={{ margin: '4px 0 0 0' }}>Configure question details, lab environment, and evaluation rules</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={handleTestLab} style={{ fontSize: 14, padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <FaFlask /> Test Lab Canvas
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleDeleteQuestion}
            style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FCA5A5', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, padding: '8px 16px' }}
          >
            <FaTrash /> Delete Question
          </button>
        </div>
      </div>

      {error && <div className="badge badge-fail" style={{ padding: 12, width: '100%', marginBottom: 16, display: 'block' }}>{error}</div>}
      {success && <div className="badge badge-pass" style={{ padding: 12, width: '100%', marginBottom: 16, display: 'block' }}>{success}</div>}

      {/* Editable Question Details */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FaPenToSquare style={{ color: '#7C5CFC' }} /> Question Details
          </h3>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSaveQuestion}
            disabled={!hasChanges || savingQuestion}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <FaFloppyDisk /> {savingQuestion ? 'Saving...' : 'Save Question Changes'}
          </button>
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Title</label>
          <input
            className="form-input"
            value={editForm.title}
            onChange={e => handleFieldChange('title', e.target.value)}
            style={{ fontWeight: 600 }}
          />
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Question Text (Instructions given to students)</label>
          <textarea
            className="form-textarea"
            rows={6}
            value={editForm.question_text}
            onChange={e => handleFieldChange('question_text', e.target.value)}
            style={{ minHeight: 120, fontSize: 14, lineHeight: 1.6 }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Level</label>
            <select
              className="form-select"
              value={editForm.level_id}
              onChange={e => handleFieldChange('level_id', e.target.value)}
            >
              <option value="">No Level</option>
              {levels.map(lvl => <option key={lvl.id} value={lvl.id}>{lvl.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Week</label>
            <input
              className="form-input"
              type="number"
              min="1"
              value={editForm.week_number}
              onChange={e => handleFieldChange('week_number', parseInt(e.target.value) || 1)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Semester</label>
            <input
              className="form-input"
              value={editForm.semester}
              onChange={e => handleFieldChange('semester', e.target.value)}
              placeholder="Fall 2026"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Academic Year</label>
            <input
              className="form-input"
              value={editForm.academic_year}
              onChange={e => handleFieldChange('academic_year', e.target.value)}
              placeholder="2025-2026"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select
              className="form-select"
              value={editForm.is_active ? 'true' : 'false'}
              onChange={e => handleFieldChange('is_active', e.target.value === 'true')}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Duration (min)</label>
            <input
              className="form-input"
              type="number"
              min="0"
              value={editForm.time_limit_minutes}
              onChange={e => handleFieldChange('time_limit_minutes', parseInt(e.target.value) || 0)}
            />
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>0 = unlimited</span>
          </div>
          <div className="form-group">
            <label className="form-label">Max Attempts</label>
            <input
              className="form-input"
              type="number"
              min="1"
              max="10"
              value={editForm.max_attempts}
              onChange={e => handleFieldChange('max_attempts', parseInt(e.target.value) || 1)}
            />
          </div>
        </div>
      </div>

      {/* Evaluation Plan & Visual Test Cases */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FaFlask style={{ color: '#7C5CFC' }} /> Evaluation Test Cases
            </h3>
            {/* View Mode Toggle */}
            <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 8, padding: 3 }}>
              <button
                className={`btn btn-sm ${viewMode === 'visual' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 6, fontSize: 13, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => setViewMode('visual')}
              >
                <FaListCheck /> Visual Test Cases ({checksList.length})
              </button>
              <button
                className={`btn btn-sm ${viewMode === 'code' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 6, fontSize: 13, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => setViewMode('code')}
              >
                <FaCode /> JSON Schema
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {viewMode === 'visual' && (
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAddModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FaPlus /> Add Test Case
              </button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={handleGeneratePlan} disabled={generating} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <FaWandMagicSparkles /> {generating ? 'Generating...' : 'Generate with AI'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleSavePlan} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <FaFloppyDisk /> {saving ? 'Saving...' : 'Save Plan'}
            </button>
          </div>
        </div>

        {/* Overview Stats Bar */}
        {parsedPlan && (
          <div style={{
            display: 'flex', gap: 20, padding: '12px 18px', background: '#F9FAFB',
            border: '1px solid #E5E7EB', borderRadius: 10, marginBottom: 20, fontSize: 13
          }}>
            <div><strong>Topic:</strong> <span style={{ color: '#7C5CFC', fontWeight: 600 }}>{parsedPlan.topic || 'General'}</span></div>
            <div><strong>Total Checks:</strong> <span>{checksList.length}</span></div>
            <div><strong>Pass Threshold:</strong> <span>{(parsedPlan.pass_threshold ? Math.round(parsedPlan.pass_threshold * 100) : 70)}%</span></div>
            <div><strong>Total Points:</strong> <span>{parsedPlan.total_points || 100} pts</span></div>
          </div>
        )}

        {/* VISUAL MODE */}
        {viewMode === 'visual' && (
          <div>
            {checksList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', background: '#F9FAFB', borderRadius: 12, border: '2px dashed #E5E7EB' }}>
                <div style={{ fontSize: 36, marginBottom: 10, color: '#7C5CFC' }}><FaFlask /></div>
                <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>No Test Cases Defined</h4>
                <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>Generate evaluation checks with AI or add test cases manually.</p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
                  <button className="btn btn-secondary btn-sm" onClick={handleGeneratePlan} disabled={generating} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FaWandMagicSparkles /> Generate with AI
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FaPlus /> Add Test Case
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {checksList.map((check, idx) => (
                  <div key={idx} style={{
                    background: 'white', border: '1px solid #E5E7EB', borderRadius: 12,
                    padding: '16px 20px', display: 'flex', justifyContent: 'space-between',
                    alignItems: 'flex-start', boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                    transition: 'border-color 0.2s',
                  }}>
                    <div style={{ flex: 1, paddingRight: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{
                          background: '#7C5CFC', color: 'white', fontWeight: 800,
                          fontSize: 12, padding: '2px 8px', borderRadius: 6
                        }}>
                          #{idx + 1}
                        </span>
                        <span style={{
                          background: '#EEF2FF', color: '#4F46E5', fontWeight: 700,
                          fontSize: 12, padding: '3px 10px', borderRadius: 100, border: '1px solid #C7D2FE'
                        }}>
                          {check.type}
                        </span>
                        <span style={{
                          fontSize: 12, fontWeight: 700,
                          color: check.required ? '#EF4444' : '#6B7280',
                          background: check.required ? '#FEF2F2' : '#F3F4F6',
                          padding: '2px 8px', borderRadius: 6
                        }}>
                          {check.required ? 'Mandatory' : 'Optional'}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#059669', marginLeft: 'auto' }}>
                          Weight: {check.weight || 10} pts
                        </span>
                      </div>

                      <p style={{ fontSize: 14, fontWeight: 600, color: '#1F2937', marginBottom: 10 }}>
                        {check.description || `Validate ${check.type}`}
                      </p>

                      {/* Params Tags */}
                      {check.params && Object.keys(check.params).length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {Object.entries(check.params).map(([k, v]) => (
                            <span key={k} style={{
                              background: '#F3F4F6', color: '#374151', fontSize: 12,
                              padding: '2px 8px', borderRadius: 6, border: '1px solid #E5E7EB'
                            }}>
                              <strong style={{ color: '#4B5563' }}>{k}:</strong> {String(v)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      className="btn btn-sm btn-ghost"
                      style={{ color: '#EF4444', display: 'flex', alignItems: 'center', gap: 4 }}
                      title="Delete Test Case"
                      onClick={() => handleDeleteCheck(idx)}
                    >
                      <FaTrash size={12} /> Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CODE JSON MODE */}
        {viewMode === 'code' && (
          <div>
            <textarea
              className="form-textarea"
              rows={16}
              value={planJson}
              onChange={e => setPlanJson(e.target.value)}
              placeholder='{"pass_threshold": 0.7, "total_points": 100, "checks": [...]}'
              style={{ fontFamily: 'monospace', fontSize: 13, minHeight: 300 }}
            />
          </div>
        )}
      </div>

      {/* Add Test Case Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="card" style={{ maxWidth: 500, width: '92%', padding: 28, animation: 'fadeIn 0.2s ease' }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FaPlus style={{ color: '#7C5CFC' }} /> Add New Test Case
            </h3>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Validator Type</label>
              <select
                className="form-select"
                value={newCheck.type}
                onChange={e => setNewCheck(c => ({ ...c, type: e.target.value }))}
              >
                <option value="ospf_process">ospf_process (OSPF Process Check)</option>
                <option value="vlan_exists">vlan_exists (VLAN Existence)</option>
                <option value="vlan_assignment">vlan_assignment (VLAN Port Assignment)</option>
                <option value="trunk_mode">trunk_mode (Trunk Interface)</option>
                <option value="ip_address">ip_address (Interface IP Address)</option>
                <option value="hostname_check">hostname_check (Hostname Verification)</option>
                <option value="static_route">static_route (Static Route)</option>
                <option value="nat_inside">nat_inside (NAT Inside Interface)</option>
                <option value="dhcp_pool">dhcp_pool (DHCP Server Pool)</option>
                <option value="stp_mode">stp_mode (Spanning Tree Protocol)</option>
                <option value="acl_rule">acl_rule (Access Control List)</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Description</label>
              <input
                className="form-input"
                placeholder="e.g. Verify OSPF process 1 on R1"
                value={newCheck.description}
                onChange={e => setNewCheck(c => ({ ...c, description: e.target.value }))}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div className="form-group">
                <label className="form-label">Weight (Points)</label>
                <input
                  className="form-input"
                  type="number"
                  value={newCheck.weight}
                  onChange={e => setNewCheck(c => ({ ...c, weight: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Required</label>
                <select
                  className="form-select"
                  value={newCheck.required ? 'true' : 'false'}
                  onChange={e => setNewCheck(c => ({ ...c, required: e.target.value === 'true' }))}
                >
                  <option value="true">Mandatory</option>
                  <option value="false">Optional</option>
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 20 }}>
              <label className="form-label">Parameters (JSON)</label>
              <textarea
                className="form-textarea"
                rows={4}
                style={{ fontFamily: 'monospace', fontSize: 13 }}
                value={newCheck.paramsText}
                onChange={e => setNewCheck(c => ({ ...c, paramsText: e.target.value }))}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddCheckSubmit}>Add Test Case</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Question Confirmation Card Modal */}
      {showDeleteModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }} onClick={() => setShowDeleteModal(false)}>
          <div className="card" style={{
            maxWidth: 440, width: '100%', padding: 28, borderRadius: 16,
            background: '#FFFFFF', border: '1px solid #E2E8F0',
            boxShadow: '0 20px 45px rgba(0,0,0,0.2)', animation: 'fadeIn 0.2s ease-out'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <FaTrash size={22} style={{ color: '#EF4444' }} />
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', margin: 0 }}>Delete Question</h3>
            </div>
            <p style={{ color: '#475569', fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
              Are you sure you want to delete question <strong>"{editForm.title || 'this question'}"</strong>?<br /><br />
              This will permanently delete the question and all associated test sessions and evaluation reports.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDeleteQuestion} style={{ background: '#EF4444', color: 'white' }}>Delete Question</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
