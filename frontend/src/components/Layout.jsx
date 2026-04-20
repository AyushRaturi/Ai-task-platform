import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, Cpu, LayoutDashboard, User } from 'lucide-react';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header style={{
        background: 'var(--bg-2)',
        borderBottom: '1px solid var(--border)',
        padding: '0 1.5rem',
        height: '60px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: 32, height: 32, background: 'var(--accent)',
            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Cpu size={16} color="#fff" />
          </div>
          <span style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.02em' }}>
            AI Task Platform
          </span>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <NavLink to="/dashboard" style={({ isActive }) => navStyle(isActive)}>
            <LayoutDashboard size={15} />
            Dashboard
          </NavLink>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-2)', fontSize: '0.875rem' }}>
            <User size={14} />
            <span>{user?.username}</span>
          </div>
          <button onClick={handleLogout} style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            background: 'transparent', color: 'var(--text-3)',
            fontSize: '0.875rem', padding: '0.375rem 0.75rem',
            borderRadius: 'var(--radius)', border: '1px solid var(--border)',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.borderColor = 'var(--red)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            <LogOut size={13} />
            Logout
          </button>
        </div>
      </header>

      <main style={{ flex: 1, padding: '2rem 1.5rem', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        <Outlet />
      </main>
    </div>
  );
}

function navStyle(isActive) {
  return {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.375rem 0.75rem', borderRadius: 'var(--radius)',
    fontSize: '0.875rem', fontWeight: 500,
    color: isActive ? 'var(--accent)' : 'var(--text-2)',
    background: isActive ? 'var(--accent-glow)' : 'transparent',
    textDecoration: 'none',
    transition: 'all 0.15s',
  };
}
