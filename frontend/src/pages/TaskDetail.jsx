import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import {
  ArrowLeft, RefreshCw, RotateCcw, CheckCircle,
  Clock, AlertCircle, Loader, Terminal, Hash,
} from 'lucide-react';

const OP_LABELS = {
  uppercase: 'UPPERCASE',
  lowercase: 'lowercase',
  reverse: 'Reverse String',
  word_count: 'Word Count',
};

function StatusBadge({ status }) {
  const icons = {
    pending: <Clock size={11} />,
    running: <Loader size={11} className="animate-spin" />,
    success: <CheckCircle size={11} />,
    failed: <AlertCircle size={11} />,
  };
  return <span className={`badge badge-${status}`}>{icons[status]} {status}</span>;
}

function LogLine({ log }) {
  const colors = { info: 'var(--text-2)', warn: 'var(--yellow)', error: 'var(--red)' };
  const prefixes = { info: '›', warn: '⚠', error: '✕' };
  return (
    <div style={{
      display: 'flex', gap: '0.75rem', fontSize: '0.8125rem',
      fontFamily: 'var(--mono)', padding: '0.25rem 0',
      borderBottom: '1px solid var(--bg-4)',
    }}>
      <span style={{ color: 'var(--text-3)', flexShrink: 0, fontSize: '0.75rem' }}>
        {new Date(log.timestamp).toLocaleTimeString()}
      </span>
      <span style={{ color: colors[log.level] || 'var(--text-2)', flexShrink: 0 }}>
        {prefixes[log.level]}
      </span>
      <span style={{ color: colors[log.level] || 'var(--text-2)' }}>{log.message}</span>
    </div>
  );
}

function WordCountResult({ result }) {
  const items = [
    { label: 'Total Words', value: result.total_words },
    { label: 'Unique Words', value: result.unique_words },
    { label: 'Characters', value: result.character_count },
    { label: 'Chars (no spaces)', value: result.character_count_no_spaces },
    { label: 'Sentences', value: result.sentence_count },
  ];
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {items.map(({ label, value }) => (
          <div key={label} style={{
            background: 'var(--bg-4)', borderRadius: 'var(--radius)', padding: '0.875rem 1rem',
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>
              {value?.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: '0.2rem' }}>{label}</div>
          </div>
        ))}
      </div>
      {result.top_words && Object.keys(result.top_words).length > 0 && (
        <div>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-3)', marginBottom: '0.5rem', fontFamily: 'var(--mono)' }}>
            Top words
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {Object.entries(result.top_words).map(([word, count]) => (
              <span key={word} style={{
                background: 'var(--bg-3)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '0.2rem 0.6rem',
                fontSize: '0.8125rem', fontFamily: 'var(--mono)',
              }}>
                {word} <span style={{ color: 'var(--accent)' }}>×{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rerunning, setRerunning] = useState(false);
  const pollRef = useRef(null);

  const fetchTask = useCallback(async () => {
    try {
      const { data } = await api.get(`/tasks/${id}`);
      setTask(data.task);
    } catch (err) {
      if (err.response?.status === 404) navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { fetchTask(); }, [fetchTask]);

  useEffect(() => {
    if (task && ['pending', 'running'].includes(task.status)) {
      pollRef.current = setInterval(fetchTask, 2000);
    }
    return () => clearInterval(pollRef.current);
  }, [task, fetchTask]);

  const handleRerun = async () => {
    setRerunning(true);
    try {
      const { data } = await api.post(`/tasks/${id}/rerun`);
      setTask(data.task);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to rerun task');
    } finally {
      setRerunning(false);
    }
  };

  if (loading) return (
    <div style={{ padding: '2rem' }}>
      <div className="skeleton" style={{ height: 200, borderRadius: 12 }} />
    </div>
  );

  if (!task) return null;

  const isWordCount = task.operation === 'word_count';
  const hasResult = task.result !== null && task.result !== undefined;
  const duration = task.startedAt && task.completedAt
    ? ((new Date(task.completedAt) - new Date(task.startedAt)) / 1000).toFixed(2) + 's'
    : null;

  return (
    <div className="animate-fade-in">
      {/* Breadcrumb */}
      <button
        onClick={() => navigate('/dashboard')}
        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', color: 'var(--text-3)', fontSize: '0.875rem', marginBottom: '1.5rem', transition: 'color 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
      >
        <ArrowLeft size={14} /> Back to Dashboard
      </button>

      {/* Task header */}
      <div style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '1.5rem',
        marginBottom: '1rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em' }}>{task.title}</h1>
              <StatusBadge status={task.status} />
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
              <span style={metaStyle}>
                <Hash size={12} /> {OP_LABELS[task.operation]}
              </span>
              <span style={metaStyle}>
                <Clock size={12} /> {new Date(task.createdAt).toLocaleString()}
              </span>
              {duration && <span style={metaStyle}>⚡ {duration}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={fetchTask} style={outlineBtnStyle} title="Refresh">
              <RefreshCw size={14} />
            </button>
            {task.status === 'failed' && (
              <button onClick={handleRerun} disabled={rerunning} style={outlineBtnStyle}>
                <RotateCcw size={14} />
                {rerunning ? 'Requeueing…' : 'Rerun'}
              </button>
            )}
          </div>
        </div>

        {/* Input */}
        <div style={{ marginTop: '1.25rem' }}>
          <p style={sectionLabel}>Input</p>
          <div style={codeBlockStyle}>{task.inputText}</div>
        </div>
      </div>

      {/* Result */}
      {hasResult && (
        <div style={{
          background: 'var(--bg-2)', border: '1px solid rgba(34,211,160,0.2)',
          borderRadius: 'var(--radius-lg)', padding: '1.5rem',
          marginBottom: '1rem',
        }}>
          <p style={{ ...sectionLabel, color: 'var(--green)', marginBottom: '1rem' }}>
            <CheckCircle size={13} style={{ display: 'inline', marginRight: '0.3rem' }} />
            Result
          </p>
          {isWordCount ? (
            <WordCountResult result={task.result} />
          ) : (
            <div style={codeBlockStyle}>{String(task.result)}</div>
          )}
        </div>
      )}

      {/* Error */}
      {task.errorMessage && (
        <div style={{
          background: 'var(--red-dim)', border: '1px solid rgba(244,63,94,0.2)',
          borderRadius: 'var(--radius-lg)', padding: '1.25rem',
          marginBottom: '1rem', color: 'var(--red)', fontSize: '0.875rem',
          fontFamily: 'var(--mono)',
        }}>
          <AlertCircle size={13} style={{ display: 'inline', marginRight: '0.4rem' }} />
          {task.errorMessage}
        </div>
      )}

      {/* Logs */}
      <div style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '1.5rem',
      }}>
        <p style={sectionLabel}>
          <Terminal size={13} style={{ display: 'inline', marginRight: '0.3rem' }} />
          Execution Logs
        </p>
        <div style={{
          background: 'var(--bg)', borderRadius: 'var(--radius)',
          padding: '0.875rem 1rem', marginTop: '0.75rem',
          maxHeight: 300, overflowY: 'auto',
          border: '1px solid var(--border)',
        }}>
          {task.logs && task.logs.length > 0 ? (
            task.logs.map((log, i) => <LogLine key={i} log={log} />)
          ) : (
            <p style={{ color: 'var(--text-3)', fontSize: '0.8125rem', fontFamily: 'var(--mono)' }}>
              No logs yet
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const metaStyle = {
  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
  color: 'var(--text-3)', fontSize: '0.8125rem', fontFamily: 'var(--mono)',
};
const codeBlockStyle = {
  background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', padding: '0.875rem 1rem',
  fontFamily: 'var(--mono)', fontSize: '0.875rem', color: 'var(--text)',
  whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflowY: 'auto',
};
const sectionLabel = {
  fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-3)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem',
};
const outlineBtnStyle = {
  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
  background: 'var(--bg-3)', color: 'var(--text-2)', fontWeight: 500,
  padding: '0.45rem 0.875rem', borderRadius: 'var(--radius)',
  fontSize: '0.875rem', border: '1px solid var(--border)',
  transition: 'all 0.15s',
};
