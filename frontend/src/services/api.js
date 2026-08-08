/** API service — handles all HTTP calls to the backend. */

const API_BASE = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(url, options = {}) {
  const headers = { ...getAuthHeaders(), ...options.headers };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  if (res.status === 204) return null;
  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    if (data && data.detail && data.detail.includes('Concurrent login')) {
      alert('⚠️ Session Finished: Another device or browser logged into this account. Your test session has been completed.');
      window.location.href = '/student/results';
    } else {
      window.location.href = '/login';
    }
    throw new Error(data?.detail || 'Unauthorized');
  }
  if (!res.ok) throw new Error(data.detail || 'Request failed');
  return data;
}

export const api = {
  // Auth
  login: (username, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  register: (username, email, password, role = 'student') => request('/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password, role }) }),
  googleLogin: (idToken) => request('/auth/google', { method: 'POST', body: JSON.stringify({ id_token: idToken }) }),
  getMe: () => request('/auth/me'),

  // Admin: User Management
  getUsers: () => request('/auth/users'),
  approveUser: (id, isActive) => request(`/auth/users/${id}/approve`, { method: 'PUT', body: JSON.stringify({ is_active: isActive }) }),
  changeUserRole: (id, role) => request(`/auth/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
  deleteUser: (id) => request(`/auth/users/${id}`, { method: 'DELETE' }),
  bulkDeactivateUsers: (userIds) => request('/auth/users/bulk-deactivate', { method: 'POST', body: JSON.stringify({ user_ids: userIds }) }),
  bulkActivateUsers: (userIds) => request('/auth/users/bulk-activate', { method: 'POST', body: JSON.stringify({ user_ids: userIds }) }),
  bulkDeleteUsers: (userIds) => request('/auth/users/bulk-delete', { method: 'POST', body: JSON.stringify({ user_ids: userIds }) }),
  adminCreateUser: (data) => request('/auth/users/create', { method: 'POST', body: JSON.stringify(data) }),
  adminBulkUploadUsers: (formData) => request('/auth/users/bulk-upload', { method: 'POST', body: formData, headers: {} }),
  downloadSampleTemplate: () => window.open(`${API_BASE}/auth/sample-template`, '_blank'),
  getSampleTemplateUrl: () => `${API_BASE}/auth/sample-template`,
  getSampleTemplateExcelUrl: () => `${API_BASE}/auth/sample-template-excel`,
  updateUserAttendance: (userId, attendance) => request(`/auth/users/${userId}/attendance`, { method: 'PUT', body: JSON.stringify({ attendance }) }),
  bulkUpdateAttendance: (sessionSlot, attendance) => request('/auth/users/bulk-attendance', { method: 'POST', body: JSON.stringify({ session_slot: sessionSlot, attendance }) }),

  // Levels
  getLevels: () => request('/levels'),
  createLevel: (data) => request('/levels', { method: 'POST', body: JSON.stringify(data) }),
  updateLevel: (id, data) => request(`/levels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteLevel: (id) => request(`/levels/${id}`, { method: 'DELETE' }),

  // Topics
  getTopics: (levelId) => request(`/topics${levelId ? '?level_id=' + levelId : ''}`),
  createTopic: (data) => request('/topics', { method: 'POST', body: JSON.stringify(data) }),
  updateTopic: (id, data) => request(`/topics/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTopic: (id) => request(`/topics/${id}`, { method: 'DELETE' }),

  // Questions
  getQuestions: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v != null)).toString();
    return request(`/questions${qs ? '?' + qs : ''}`);
  },
  createQuestion: (data) => request('/questions', { method: 'POST', body: JSON.stringify(data) }),
  getQuestion: (id) => request(`/questions/${id}`),
  updateQuestion: (id, data) => request(`/questions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteQuestion: (id) => request(`/questions/${id}`, { method: 'DELETE' }),
  generatePlan: (id, topic) => request(`/questions/${id}/generate-plan`, { method: 'POST', body: JSON.stringify({ topic }) }),
  updatePlan: (id, plan) => request(`/questions/${id}/plan`, { method: 'PUT', body: JSON.stringify({ evaluation_plan: plan }) }),

  // Evaluations
  createEvaluation: (formData) => request('/evaluations', { method: 'POST', body: formData, headers: {} }),
  previewFile: (formData) => request('/evaluations/preview', { method: 'POST', body: formData, headers: {} }),
  getEvaluations: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v != null)).toString();
    return request(`/evaluations${qs ? '?' + qs : ''}`);
  },
  getEvaluation: (id) => request(`/evaluations/${id}`),
  batchEvaluate: (formData) => request('/evaluations/batch', { method: 'POST', body: formData, headers: {} }),

  // Student Portal
  getStudentQuestions: () => request('/student/questions'),
  startTest: (questionId) => request(`/student/test/${questionId}/start`, { method: 'POST' }),
  submitTest: (sessionId, formData) => request(`/student/test/${sessionId}/submit`, { method: 'POST', body: formData, headers: {} }),
  clearSubmission: (sessionId) => request(`/student/test/${sessionId}/clear`, { method: 'POST' }),
  getTestSession: (sessionId) => request(`/student/test/${sessionId}`),
  getStudentResults: () => request('/student/results'),
  lockTestSession: (sessionId) => request(`/student/test/${sessionId}/lock`, { method: 'POST' }),
  unlockTestSession: (sessionId, extendMinutes = 20) => request(`/student/test/${sessionId}/unlock`, { 
    method: 'POST', 
    body: JSON.stringify({ extend_minutes: extendMinutes }) 
  }),
  forceFinishTestSession: (sessionId) => request(`/student/test/${sessionId}/force-finish`, { method: 'POST' }),
  extendTestSessionTime: (sessionId, extraMinutes = 15) => request(`/student/test/${sessionId}/extend-time`, { method: 'POST', body: JSON.stringify({ extra_minutes: extraMinutes }) }),
  updateUserSlot: (userId, sessionSlot) => request(`/auth/users/${userId}/slot`, { method: 'PUT', body: JSON.stringify({ session_slot: sessionSlot }) }),
  deleteTestSession: (sessionId) => request(`/student/test/${sessionId}`, { method: 'DELETE' }),
  reportWarning: (questionId, warningCount, reason = 'Exited full screen') => request(`/student/test/${questionId}/report-warning`, { method: 'POST', body: JSON.stringify({ warning_count: warningCount, reason }) }),
  getAllTestSessions: () => request('/student/all-sessions'),

  // Projects
  createProject: (questionId) => request('/projects', { method: 'POST', body: JSON.stringify({ question_id: questionId }) }),
  getProjects: () => request('/projects'),
  getProject: (id) => request(`/projects/${id}`),
  saveProject: (id, state) => request(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify({ state }) }),
  submitProject: (id) => request(`/projects/${id}/submit`, { method: 'POST' }),

  // Reports
  getReport: (evalId) => request(`/reports/${evalId}`),
  getReportPdfUrl: (evalId) => `${API_BASE}/reports/${evalId}/pdf`,
  downloadReportPdf: async (evalId, studentName = 'candidate') => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}/reports/${evalId}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      let msg = 'Failed to download PDF report';
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
    const safeName = (studentName || 'candidate').replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `report_${safeName}_${evalId.slice(0, 8)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // Health
  health: () => request('/health'),

  // Audit Logs
  getAuditLogs: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v != null)).toString();
    return request(`/audit-logs${qs ? '?' + qs : ''}`);
  },
  exportAuditLogsCsv: async () => {
    const res = await fetch(`${API_BASE}/audit-logs/export-csv`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error("Failed to download CSV analytics report");
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `NetPiolet_System_Analytics_Report_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
};

export default api;
