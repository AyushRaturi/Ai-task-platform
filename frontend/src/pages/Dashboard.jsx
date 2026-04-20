import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import {
  Plus, RefreshCw, Trash2, Eye, Play,
  CheckCircle, Clock, AlertCircle, Loader, Filter,
} from 'lucide-react';

const OPERATIONS = ['uppercase', 'lowercase', 'reverse', 'word_count'];
const STATUS_FILTERS = ['all', 'pending', 'running', 'success', 'failed'];

const OP_LABELS = {
  uppercase: 'UPPERCASE',
  lowercase: 'lowercase',
  reverse: 'Reverse String',
  word_count: 'Word Count',
};

function StatusBadge({ status }) {
  const icons = {
    pending: <Clock size={10} />,
    running: <Loader size={10} className="animate-spin" />,
    success: <CheckCircle size={10} />,
    failed: <AlertCircle size={10} />,
  };
  return (
    <span className={`badge badge-${status}`}>
      {icons[status]} {status}
    </span>
  );
}

function CreateTaskModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ title: '', inputText: '', operation: 'uppercase' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/tasks', form);
      onCreated(data.task);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create task.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modalStyle} className="animate-fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>New Task</h2>
          <button onClick={onClose} style={iconBtnStyle}>✕</button>
        </div>

        {error && <div style={inlineErrorStyle}><AlertCircle size={13} /> {error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>
          <div>
            <label style={labelStyle}>Task Title</label>
            <input
              required maxLength={100} placeholder="My text transformation task"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
          </div>

          <div>
            <label style={labelStyle}>Operation</label>
            <select
              value={form.operation}
              onChange={e => setForm(f => ({ ...f, operation: e.target.value }))}
              style={{ background: 'var(--bg-3)', color: 'var(--text)' }}
            >
              {OPERATIONS.map(op => (
                <option key={op} value={op}>{OP_LABELS[op]}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>
              Input Text
              <span style={{ color: 'var(--text-3)', fontWeight: 400, fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                ({form.inputText.length}/10000)
              </span>
            </label>
            <textarea
              required rows={5} maxLength={10000}
              placeholder="Enter text to process…"
              value={form.inputText}
              onChange={e => setForm(f => ({ ...f, inputText: e.target.value }))}
              style={{ resize: 'vertical', fontFamily: 'var(--mono)', fontSize: '0.875rem' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button type="button" onClick={onClose} style={cancelBtnStyle}>Cancel</button>
            <button type="submit" disabled={loading} style={primaryBtnStyle}>
              {loading ? <span className="animate-pulse">Creating…</span> : <><Play size={14} /> Run Task</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const pollRef = useRef(null);

  const fetchTasks = useCallback(async (page = 1) => {
    try {
      const params = { page, limit: 10 };
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await api.get('/tasks', { params });
      setTasks(data.tasks);
      setPagination(data.pagination);
    } catch (err) {
      console.error('Failed to fetch tasks', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    fetchTasks(1);
  }, [fetchTasks]);

  // Poll when there are running/pending tasks
  useEffect(() => {
    const hasActive = tasks.some(t => ['pending', 'running'].includes(t.status));
    if (hasActive) {
      pollRef.current = setInterval(() => fetchTasks(pagination.page), 2500);
    }
    return () => clearInterval(pollRef.current);
  }, [tasks, fetchTasks, pagination.page]);

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this task?')) return;
    await api.delete(`/tasks/${id}`);
    setTasks(t => t.filter(x => x._id !== id));
  };

  const handleCreated = (task) => {
    setTasks(prev => [task, ...prev]);
    setPagination(p => ({ ...p, total: p.total + 1 }));
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Tasks</h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
            {pagination.total} total task{pagination.total !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button onClick={() => fetchTasks(pagination.page)} style={iconBtnOutlineStyle} title="Refresh">
            <RefreshCw size={15} />
          </button>
          <button onClick={() => setShowModal(true)} style={primaryBtnStyle}>
            <Plus size={15} /> New Task
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <Filter size={14} style={{ color: 'var(--text-3)', alignSelf: 'center', marginRight: '0.25rem' }} />
        {STATUS_FILTERS.map(f => (
          <button key={f} onClick={() => setStatusFilter(f)} style={{
            padding: '0.3rem 0.75rem',
            borderRadius: 999,
            fontSize: '0.8125rem',
            fontWeight: 500,
            background: statusFilter === f ? 'var(--accent-glow)' : 'transparent',
            color: statusFilter === f ? 'var(--accent)' : 'var(--text-3)',
            border: `1px solid ${statusFilter === f ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
            transition: 'all 0.15s',
            textTransform: 'capitalize',
          }}>
            {f}
          </button>
        ))}
      </div>

      {/* Task list */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 80 }} />)}
        </div>
      ) : tasks.length === 0 ? (
        <div style={emptyStateStyle}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🤖</div>
          <p style={{ fontWeight: 600, color: 'var(--text-2)' }}>No tasks yet</p>
          <p style={{ color: 'var(--text-3)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Create your first task to get started
          </p>
          <button onClick={() => setShowModal(true)} style={{ ...primaryBtnStyle, marginTop: '1.25rem' }}>
            <Plus size={14} /> Create Task
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {tasks.map(task => (
            <div
              key={task._id}
              onClick={() => navigate(`/tasks/${task._id}`)}
              style={taskRowStyle}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-bright)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{task.title}</span>
                  <StatusBadge status={task.status} />
                  <span style={{
                    background: 'var(--bg-4)', border: '1px solid var(--border)',
                    borderRadius: 4, padding: '0.1rem 0.45rem',
                    fontSize: '0.75rem', fontFamily: 'var(--mono)', color: 'var(--text-2)',
                  }}>
                    {OP_LABELS[task.operation]}
                  </span>
                </div>
                <p style={{ color: 'var(--text-3)', fontSize: '0.8125rem', marginTop: '0.3rem', fontFamily: 'var(--mono)' }}>
                  {task.inputText.length > 80 ? task.inputText.slice(0, 80) + '…' : task.inputText}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                <span style={{ color: 'var(--text-3)', fontSize: '0.75rem' }}>
                  {new Date(task.createdAt).toLocaleDateString()}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); navigate(`/tasks/${task._id}`); }}
                  style={iconBtnStyle} title="View"
                >
                  <Eye size={14} />
                </button>
                <button
                  onClick={e => handleDelete(task._id, e)}
                  style={{ ...iconBtnStyle, color: 'var(--text-3)' }}
                  title="Delete"
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
          {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => fetchTasks(p)} style={{
              width: 32, height: 32, borderRadius: 6,
              background: pagination.page === p ? 'var(--accent)' : 'var(--bg-3)',
              color: pagination.page === p ? '#fff' : 'var(--text-2)',
              border: '1px solid var(--border)',
              fontSize: '0.875rem', fontWeight: 500,
            }}>{p}</button>
          ))}
        </div>
      )}

      {showModal && <CreateTaskModal onClose={() => setShowModal(false)} onCreated={handleCreated} />}
    </div>
  );
}

// Shared styles
const primaryBtnStyle = {
  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
  background: 'var(--accent)', color: '#fff', fontWeight: 600,
  padding: '0.5rem 1rem', borderRadius: 'var(--radius)',
  fontSize: '0.875rem', transition: 'opacity 0.15s',
};
const cancelBtnStyle = {
  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
  background: 'var(--bg-4)', color: 'var(--text-2)', fontWeight: 500,
  padding: '0.5rem 1rem', borderRadius: 'var(--radius)',
  fontSize: '0.875rem', border: '1px solid var(--border)',
};
const iconBtnStyle = {
  background: 'transparent', color: 'var(--text-2)',
  padding: '0.35rem', borderRadius: 6, display: 'inline-flex',
  alignItems: 'center', justifyContent: 'center',
  border: 'none', transition: 'color 0.15s',
};
const iconBtnOutlineStyle = {
  ...iconBtnStyle,
  border: '1px solid var(--border)',
  padding: '0.45rem 0.6rem',
};
const labelStyle = { display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-2)', marginBottom: '0.375rem' };
const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000, padding: '1rem', backdropFilter: 'blur(4px)',
};
const modalStyle = {
  background: 'var(--bg-2)', border: '1px solid var(--border-bright)',
  borderRadius: 'var(--radius-lg)', padding: '2rem',
  width: '100%', maxWidth: 520, boxShadow: 'var(--shadow-lg)',
  maxHeight: '90vh', overflowY: 'auto',
};
const inlineErrorStyle = {
  display: 'flex', alignItems: 'center', gap: '0.5rem',
  background: 'var(--red-dim)', border: '1px solid rgba(244,63,94,0.2)',
  borderRadius: 'var(--radius)', padding: '0.625rem 0.875rem',
  color: 'var(--red)', fontSize: '0.875rem', marginBottom: '1rem',
};
const taskRowStyle = {
  display: 'flex', alignItems: 'center', gap: '1rem',
  background: 'var(--bg-2)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)', padding: '1rem 1.25rem',
  cursor: 'pointer', transition: 'border-color 0.15s',
};
const emptyStateStyle = {
  textAlign: 'center', padding: '4rem 2rem',
  background: 'var(--bg-2)', border: '1px dashed var(--border)',
  borderRadius: 'var(--radius-lg)',
};
