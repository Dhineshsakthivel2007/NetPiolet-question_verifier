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
  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (res.status === 204) return null;
  const data = await res.json();
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
  adminCreateUser: (data) => request('/auth/users/create', { method: 'POST', body: JSON.stringify(data) }),
  adminBulkUploadUsers: (formData) => request('/auth/users/bulk-upload', { method: 'POST', body: formData, headers: {} }),

  // Topics
  getTopics: () => request('/topics'),
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
  unlockTestSession: (sessionId) => request(`/student/test/${sessionId}/unlock`, { method: 'POST' }),
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

  // Health
  health: () => request('/health'),
};
