import { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import { FaHandSparkles } from "react-icons/fa6";
import { MdDashboard } from "react-icons/md";
import { MdRocketLaunch, MdFactCheck } from "react-icons/md";
import { FaFolderOpen, FaQuestionCircle } from "react-icons/fa";
import { FaClipboardCheck } from "react-icons/fa6";
import { TbTargetArrow } from "react-icons/tb";

const samplePlan = `{
  "topic": "VLAN",
  "description": "Verify VLAN 10 configuration on Switch",
  "total_points": 100,
  "pass_threshold": 0.7,
  "checks": [
    {
      "type": "vlan_exists",
      "params": { "device": "Switch0", "vlan_id": 10 },
      "description": "VLAN 10 exists on Switch0",
      "weight": 1.0, "required": true
    },
    {
      "type": "vlan_assignment",
      "params": { "device": "Switch0", "interface": "Fa0/1", "vlan_id": 10 },
      "description": "Fa0/1 assigned to VLAN 10",
      "weight": 1.0, "required": true
    },
    {
      "type": "trunk_mode",
      "params": { "device": "Switch0", "interface": "Fa0/24" },
      "description": "Fa0/24 is trunk",
      "weight": 1.0, "required": true
    }
  ]
}`;

function PerformanceLineChart({ data }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const width = 450;
  const height = 160;
  const padding = 28;

  if (!data || data.length === 0) return <p style={{ color: '#94A3B8', fontSize: 13 }}>No evaluation data available</p>;

  const points = data.map((d, i) => {
    const x = padding + (i * (width - padding * 2)) / Math.max(1, data.length - 1);
    const y = height - padding - (d.score / 100) * (height - padding * 2);
    return { x, y, ...d };
  });

  const pathD = points.reduce((acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`), '');
  const areaD = points.length > 0 ? `${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z` : '';

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        <defs>
          <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7C5CFC" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#7C5CFC" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].map(val => {
          const y = height - padding - (val / 100) * (height - padding * 2);
          return (
            <g key={val}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#E2E8F0" strokeDasharray="3 3" />
              <text x={6} y={y + 3} fontSize="9" fill="#94A3B8" fontWeight="600">{val}%</text>
            </g>
          );
        })}
        <path d={areaD} fill="url(#scoreGrad)" />
        <path d={pathD} fill="none" stroke="#7C5CFC" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i} onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)} style={{ cursor: 'pointer' }}>
            <circle cx={p.x} cy={p.y} r={hoveredIdx === i ? 7 : 5} fill={p.passed ? '#10B981' : '#EF4444'} stroke="white" strokeWidth="2" />
          </g>
        ))}
      </svg>
      {hoveredIdx !== null && (
        <div style={{
          position: 'absolute', top: -30, left: `${(hoveredIdx / Math.max(1, data.length - 1)) * 80 + 10}%`,
          background: '#1E293B', color: 'white', padding: '4px 10px', borderRadius: 6,
          fontSize: 11, fontWeight: 700, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', pointerEvents: 'none',
        }}>
          {data[hoveredIdx].label}: {data[hoveredIdx].score}% ({data[hoveredIdx].passed ? 'PASS' : 'FAIL'})
        </div>
      )}
    </div>
  );
}

function PassFailDonutChart({ passed, failed, total }) {
  const passPct = total > 0 ? Math.round((passed / total) * 100) : 0;
  const radius = 48;
  const circum = 2 * Math.PI * radius;
  const strokeDashoffset = circum - (passPct / 100) * circum;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: 16 }}>
      <div style={{ position: 'relative', width: 120, height: 120 }}>
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#EF4444" strokeWidth="12" />
          <circle
            cx="60" cy="60" r={radius} fill="none" stroke="#10B981" strokeWidth="12"
            strokeDasharray={circum}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform="rotate(-90 60 60)"
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 20, fontWeight: 900, color: '#1E293B' }}>{passPct}%</span>
          <span style={{ fontSize: 9, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Pass Rate</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#1E293B' }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: '#10B981' }} />
          <span>Passed: {passed}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#1E293B' }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: '#EF4444' }} />
          <span>Failed: {failed}</span>
        </div>
        <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>
          Total Submissions: {total}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState({ topics: 0, questions: 0, evaluations: 0, passed: 0 });
  const [health, setHealth] = useState(null);
  const [recentEvals, setRecentEvals] = useState([]);
  const [showSample, setShowSample] = useState(false);
  const username = localStorage.getItem('username') || 'Professor';

  useEffect(() => {
    Promise.all([
      api.getTopics().catch(() => []),
      api.getQuestions().catch(() => []),
      api.getEvaluations({ latest_only: true }).catch(() => ({ items: [], total: 0 })),
      api.health().catch(() => null),
    ]).then(([topics, questions, evaluations, h]) => {
      const rawEvals = evaluations.items || [];

      // Deduplicate: Keep only the latest submission per candidate per question
      const latestMap = new Map();
      rawEvals.forEach(e => {
        const key = `${e.student_id || e.student_name || e.created_by || 'anon'}_${e.question_id}`;
        if (!latestMap.has(key)) {
          latestMap.set(key, e);
        } else {
          const existing = latestMap.get(key);
          const timeExisting = new Date(existing.evaluated_at || existing.created_at || 0).getTime();
          const timeCurrent = new Date(e.evaluated_at || e.created_at || 0).getTime();
          if (timeCurrent > timeExisting) {
            latestMap.set(key, e);
          }
        }
      });
      const finalEvals = Array.from(latestMap.values());

      setStats({
        topics: topics.length,
        questions: questions.length,
        evaluations: finalEvals.length,
        passed: finalEvals.filter(e => e.passed).length,
      });
      setRecentEvals(finalEvals.slice(0, 10));
      setHealth(h);
    });
  }, []);

  const passRate = stats.evaluations > 0 ? Math.round((stats.passed / stats.evaluations) * 100) : 0;
  const failCount = Math.max(0, stats.evaluations - stats.passed);

  const trendData = recentEvals.slice().reverse().map((e, idx) => ({
    label: e.student_name ? e.student_name.slice(0, 8) : `Ex ${idx+1}`,
    score: Math.round(e.overall_score || 0),
    passed: e.passed,
  }));

  return (
    <>
      {/* Welcome Banner */}
      <div className="welcome-banner">
        <h1>
          <MdDashboard size={36} style={{ marginRight: "10px", verticalAlign: "middle" }} /> Welcome back, {username}!
        </h1>
        <p>Here's an overview of your Packet Tracer lab evaluation system</p>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { icon: <FaFolderOpen size={30} />, value: stats.topics, label: 'Topics' },
          { icon: <FaQuestionCircle size={30} />, value: stats.questions, label: 'Questions' },
          { icon: <MdFactCheck size={30} />, value: stats.evaluations, label: 'Evaluations' },
          { icon: <TbTargetArrow size={30} />, value: `${passRate}%`, label: 'Pass Rate' },
        ].map((s, i) => (
          <div key={i} className="stat-card card-3d">
            <span className="stat-icon">{s.icon}</span>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Analytics Graphs Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, marginBottom: 24 }}>
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📈</span>
            <span>Performance Score Trend</span>
          </h3>
          <PerformanceLineChart data={trendData} />
        </div>
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📊</span>
            <span>Pass vs Fail Breakdown</span>
          </h3>
          <PassFailDonutChart passed={stats.passed} failed={failCount} total={stats.evaluations} />
        </div>
      </div>

      {/* Two Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Quick Actions */}
        <div>
          <h3 style={{
            display: "flex", alignItems: "center", gap: "8px",
            fontSize: 15, fontWeight: 700, marginBottom: 14, color: "var(--text-secondary)",
          }}>
            <MdRocketLaunch size={20} /> Quick Actions
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { href: "/topics", icon: <FaFolderOpen size={22} />, title: "Topics", desc: "Manage topics" },
              { href: "/questions", icon: <FaQuestionCircle size={22} />, title: "Questions", desc: "Create lab questions" },
              { href: "/evaluate", icon: <MdFactCheck size={22} />, title: "Evaluate", desc: "Grade student work" },
              { href: "/results", icon: <FaClipboardCheck size={22} />, title: "Results", desc: "View all results" },
            ].map((a, i) => (
              <a key={i} href={a.href} className="action-card">
                <span className="action-icon">{a.icon}</span>
                <h3>{a.title}</h3>
                <p>{a.desc}</p>
              </a>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: 'var(--text-secondary)' }}>📋 Recent Evaluations</h3>
          <div className="card" style={{ padding: 16 }}>
            {recentEvals.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24, fontSize: 14 }}>No evaluations yet</p>
            ) : (
              recentEvals.slice(0, 5).map((ev, i) => (
                <div key={i} className="activity-item">
                  <div className={`activity-dot ${ev.passed ? 'pass' : 'fail'}`} />
                  <div className="activity-info">
                    <strong>{ev.student_name || 'Anonymous'}</strong>
                    <span>{ev.overall_score?.toFixed(0)} pts · {new Date(ev.evaluated_at || ev.created_at).toLocaleDateString()}</span>
                  </div>
                  <span className={`badge ${ev.passed ? 'badge-pass' : 'badge-fail'}`}>{ev.passed ? 'PASS' : 'FAIL'}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* System Status */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ marginBottom: 12, fontSize: 15, fontWeight: 700 }}>⚙️ System Status</h3>
          {health ? (
            <>
              <p style={{ color: 'var(--success)', fontWeight: 600, fontSize: 14 }}>● {health.status}</p>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
                {health.validators_loaded} validators loaded · v{health.version}
              </p>
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading...</p>
          )}
        </div>

        {/* Evaluation Plan Sample */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>📘 Evaluation Plan Sample</h3>
            <button className="btn btn-sm btn-secondary" onClick={() => setShowSample(!showSample)}>
              {showSample ? 'Hide' : 'Show Example'}
            </button>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            AI generates these automatically from your questions.
          </p>
          {showSample && (
            <div className="sample-plan" style={{ marginTop: 12 }}>
              <div className="sample-plan-header">
                <h4>VLAN Configuration Example</h4>
                <button className="btn btn-sm btn-secondary" onClick={() => navigator.clipboard.writeText(samplePlan)}>📋 Copy</button>
              </div>
              <div className="sample-plan-body">{samplePlan}</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
