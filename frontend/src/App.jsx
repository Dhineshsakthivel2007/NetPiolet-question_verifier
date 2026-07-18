import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import StudentLayout from './components/StudentLayout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import TopicsPage from './pages/TopicsPage.jsx';
import QuestionsPage from './pages/QuestionsPage.jsx';
import QuestionDetailPage from './pages/QuestionDetailPage.jsx';
import EvaluatePage from './pages/EvaluatePage.jsx';
import ResultsPage from './pages/ResultsPage.jsx';
import ResultDetailPage from './pages/ResultDetailPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import StudentTestPage from './pages/StudentTestPage.jsx';
import StudentResultsPage from './pages/StudentResultsPage.jsx';

function ProtectedRoute({ children, allowedRoles }) {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  // No token = go to login
  if (!token) return <Navigate to="/login" replace />;

  // Token exists but no role stored = stale session, clear and go to login
  if (!role) {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    return <Navigate to="/login" replace />;
  }

  // Role check
  if (allowedRoles && !allowedRoles.includes(role)) {
    // Redirect students to student portal, others to main
    if (role === 'student') return <Navigate to="/student" replace />;
    return <Navigate to="/" replace />;
  }

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Admin/Professor Routes */}
        <Route path="/" element={<ProtectedRoute allowedRoles={['admin', 'professor']}><Layout /></ProtectedRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="topics" element={<TopicsPage />} />
          <Route path="questions" element={<QuestionsPage />} />
          <Route path="questions/:id" element={<QuestionDetailPage />} />
          <Route path="evaluate" element={<EvaluatePage />} />
          <Route path="results" element={<ResultsPage />} />
          <Route path="results/:id" element={<ResultDetailPage />} />
          <Route path="admin" element={<ProtectedRoute allowedRoles={['admin']}><AdminPage /></ProtectedRoute>} />
        </Route>

        {/* Student Routes */}
        <Route path="/student" element={<ProtectedRoute allowedRoles={['student']}><StudentLayout /></ProtectedRoute>}>
          <Route index element={<StudentTestPage />} />
          <Route path="results" element={<StudentResultsPage />} />
        </Route>

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
