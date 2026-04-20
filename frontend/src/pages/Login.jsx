import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Cpu, AlertCircle } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={authPageStyle}>
      <div style={authCardStyle} className="animate-fade-in">
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={logoStyle}><Cpu size={24} color="#fff" /></div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '1rem', letterSpacing: '-0.02em' }}>
            Welcome back
          </h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Sign in to your account
          </p>
        </div>

        {error && (
          <div style={errorStyle}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Email</label>
            <input
              name="email" type="email" required
              value={form.email} onChange={handleChange}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input
              name="password" type="password" required
              value={form.password} onChange={handleChange}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          <button type="submit" style={submitBtnStyle} disabled={loading}>
            {loading ? <span className="animate-pulse">Signing in…</span> : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', color: 'var(--text-2)', fontSize: '0.875rem' }}>
          Don't have an account?{' '}
          <Link to="/register">Create one</Link>
        </p>
      </div>
    </div>
  );
}

const authPageStyle = {
  minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--bg)', padding: '1.5rem',
};
const authCardStyle = {
  background: 'var(--bg-2)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)', padding: '2.5rem', width: '100%', maxWidth: 420,
  boxShadow: 'var(--shadow-lg)',
};
const logoStyle = {
  width: 48, height: 48, background: 'var(--accent)', borderRadius: 12,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};
const labelStyle = {
  display: 'block', fontSize: '0.875rem', fontWeight: 500,
  color: 'var(--text-2)', marginBottom: '0.375rem',
};
const errorStyle = {
  display: 'flex', alignItems: 'center', gap: '0.5rem',
  background: 'var(--red-dim)', border: '1px solid rgba(244,63,94,0.2)',
  borderRadius: 'var(--radius)', padding: '0.75rem 1rem',
  color: 'var(--red)', fontSize: '0.875rem', marginBottom: '1rem',
};
const submitBtnStyle = {
  background: 'var(--accent)', color: '#fff', fontWeight: 600,
  padding: '0.75rem 1rem', borderRadius: 'var(--radius)',
  fontSize: '0.9375rem', transition: 'opacity 0.15s', marginTop: '0.5rem',
  opacity: 1,
};
