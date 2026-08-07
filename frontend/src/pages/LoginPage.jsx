import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api.js';
import useProjectStore from '../store/projectStore.js';

// Set your Google Client ID here or in .env
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export default function LoginPage() {
  const navigate = useNavigate();
  const googleBtnRef = useRef(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const existingToken = localStorage.getItem('token');
    const existingRole = localStorage.getItem('role');
    if (existingToken && existingRole) {
      api.getMe()
        .then((user) => {
          navigate(user.role === 'student' ? '/student' : '/');
        })
        .catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('role');
          localStorage.removeItem('username');
          useProjectStore.getState().resetStore();
        });
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      localStorage.removeItem('username');
      useProjectStore.getState().resetStore();
    }
  }, [navigate]);

  // Handle Google credential response
  const handleGoogleResponse = useCallback(async (response) => {
    setLoading(true); setError('');
    try {
      const { access_token, role: userRole, username: uname } = await api.googleLogin(response.credential);
      localStorage.setItem('token', access_token);
      localStorage.setItem('role', userRole);
      localStorage.setItem('username', uname);
      localStorage.setItem('last_login_timestamp', Date.now().toString());
      navigate(userRole === 'student' ? '/student' : '/');
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  }, [navigate]);

  // Initialize Google Sign-In
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const interval = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(interval);
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleResponse,
          auto_select: false,
        });
        if (googleBtnRef.current) {
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'outline', size: 'large', width: '100%',
            text: 'signin_with', shape: 'rectangular',
          });
        }
      }
    }, 200);
    return () => clearInterval(interval);
  }, [handleGoogleResponse]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { access_token, role: userRole, username: uname } = await api.login(username, password);
      localStorage.setItem('token', access_token);
      localStorage.setItem('role', userRole);
      localStorage.setItem('username', uname);
      localStorage.setItem('last_login_timestamp', Date.now().toString());
      navigate(userRole === 'student' ? '/student' : '/');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="card">
          <div className="logo-section">
            <div className="logo-icon">NP</div>
            <h2>NetPilot</h2>
            <p className="subtitle">AI-Powered Cisco Lab Evaluation</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Roll Number / Email / Username</label>
              <input className="form-input" value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter Roll Number, Email or Username" required />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" required />
            </div>
            {error && <p style={{ color: 'var(--danger)', fontSize: 14, marginBottom: 16, textAlign: 'center' }}>{error}</p>}
            <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading}>
              {loading ? '⏳ Please wait...' : '-> Sign In'}
            </button>
          </form>

          <div className="divider">or</div>

          {/* Owl-Shaped Google Sign-In Card Container */}
          {GOOGLE_CLIENT_ID ? (
            <div ref={googleBtnRef} style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }} />
          ) : (
            <div className="owl-card-wrapper">
              <div className="owl-ear owl-ear-left" />
              <div className="owl-ear owl-ear-right" />

              <button
                className="btn-google-custom owl-google-box"
                type="button"
                onClick={() => setError('Google OAuth requires VITE_GOOGLE_CLIENT_ID. Set it in frontend/.env')}
              >
                <div className="google-icon-wrapper owl-eye-wrapper">
                  <svg width="22" height="22" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                </div>
                <div className="owl-text-group">
                  <span className="google-btn-text">Sign in with Google</span>
                  <span className="google-domain-tag">@bitsathy.ac.in</span>
                </div>
                <span className="owl-beak-icon">🦉</span>
              </button>
            </div>
          )}

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 16, color: 'var(--text-muted)' }}>
            If any login issues Contact your administrator
          </p>
        </div>
      </div>
    </div>
  );
}
