import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api.js';
import {
  FiUsers, FiUserCheck, FiUserX, FiClock, FiSearch,
  FiFilter, FiGrid, FiList, FiPlus, FiUploadCloud, FiDownload,
  FiCheckCircle, FiMoreVertical, FiUser, FiFileText, FiFile
} from 'react-icons/fi';

const AVATAR_COLORS = [
  { bg: '#FEE2E2', text: '#DC2626' },
  { bg: '#FEF3C7', text: '#D97706' },
  { bg: '#D1FAE5', text: '#059669' },
  { bg: '#E0E7FF', text: '#4F46E5' },
  { bg: '#F3E8FF', text: '#9333EA' },
  { bg: '#FCE7F3', text: '#DB2777' },
  { bg: '#E0F2FE', text: '#0369A1' },
];

function getAvatarStyle(name) {
  let hash = 0;
  const str = name || '';
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const idx = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function getSlotStatus(slotStr) {
  if (!slotStr || slotStr === 'All Slots' || slotStr === '—' || slotStr === 'any') {
    return { status: 'active', label: '🟢 Active Now', color: '#059669', bg: '#D1FAE5' };
  }

  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();

  const clean = slotStr.trim().toLowerCase();
  const match = clean.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*[-–—to]+\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/);
  if (!match) {
    return { status: 'active', label: '🟢 Active Now', color: '#059669', bg: '#D1FAE5' };
  }

  let [, h1Str, m1Str, p1, h2Str, m2Str, p2] = match;
  let h1 = parseInt(h1Str, 10);
  let m1 = parseInt(m1Str || '0', 10);
  let h2 = parseInt(h2Str, 10);
  let m2 = parseInt(m2Str || '0', 10);

  if (p1 === 'pm' && h1 < 12) h1 += 12;
  if (p1 === 'am' && h1 === 12) h1 = 0;
  if (p2 === 'pm' && h2 < 12) h2 += 12;
  if (p2 === 'am' && h2 === 12) h2 = 0;

  if (p2 && !p1) {
    if (p2 === 'pm' && h1 < 12 && h1 < h2) h1 += 12;
    if (p2 === 'am' && h1 === 12) h1 = 0;
  }
  if (h2 < h1 && h2 < 12) h2 += 12;

  const startMins = h1 * 60 + m1;
  const endMins = h2 * 60 + m2;

  if (currentMins >= startMins && currentMins <= endMins) {
    return { status: 'active', label: '🟢 Active Now', color: '#059669', bg: '#D1FAE5' };
  } else if (currentMins < startMins) {
    return { status: 'upcoming', label: '⏳ Upcoming', color: '#D97706', bg: '#FEF3C7' };
  } else {
    return { status: 'expired', label: '🛑 Expired', color: '#DC2626', bg: '#FEE2E2' };
  }
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('attendance'); // 'attendance' | 'accounts'
  const [users, setUsers] = useState([]);
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '', email: '', password: '', role: 'student',
    roll_number: '', session_slot: '09:00-11:00', level_id: ''
  });
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');

  const [selectedSlotFilter, setSelectedSlotFilter] = useState('All Slots');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('roll_number'); // 'roll_number' | 'username' | 'level'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [bulkRole, setBulkRole] = useState('student');
  const [pendingFile, setPendingFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const fileRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const [u, l] = await Promise.all([
        api.getUsers(),
        api.getLevels().catch(() => [])
      ]);
      setUsers(u || []);
      setLevels(l || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  /* ─── User Account Handlers ─── */
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedUserIds(users.map(u => u.id));
    } else {
      setSelectedUserIds([]);
    }
  };

  const handleSelectUser = (id) => {
    setSelectedUserIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleBulkDeactivate = async () => {
    if (selectedUserIds.length === 0) return;
    try {
      await api.bulkDeactivateUsers(selectedUserIds);
      setSelectedUserIds([]);
      load();
    } catch (err) {
      alert(`Bulk deactivate failed: ${err.message}`);
    }
  };

  const handleBulkActivate = async () => {
    if (selectedUserIds.length === 0) return;
    try {
      await api.bulkActivateUsers(selectedUserIds);
      setSelectedUserIds([]);
      load();
    } catch (err) {
      alert(`Bulk activate failed: ${err.message}`);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedUserIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedUserIds.length} selected user(s) and all their data? This action cannot be undone!`)) return;
    try {
      await api.bulkDeleteUsers(selectedUserIds);
      setSelectedUserIds([]);
      load();
    } catch (err) {
      alert(`Bulk delete failed: ${err.message}`);
    }
  };

  const handleApprove = async (id, active) => {
    await api.approveUser(id, active);
    load();
  };

  const handleRole = async (id, role) => {
    await api.changeUserRole(id, role);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      await api.deleteUser(id);
      load();
    } catch (err) {
      alert(`Failed to delete user: ${err.message}`);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setAddError(''); setAddSuccess('');
    try {
      await api.adminCreateUser(newUser);
      setAddSuccess(`User '${newUser.username}' created & activated!`);
      setNewUser({ username: '', email: '', password: '', role: 'student', roll_number: '', session_slot: '09:00-11:00', level_id: '' });
      load();
    } catch (err) {
      setAddError(err.message || 'Failed to create user');
    }
  };

  const handleMarkAttendance = async (userId, attendanceStatus, sessionSlot, studentName) => {
    if (sessionSlot) {
      const slotInfo = getSlotStatus(sessionSlot);
      if (slotInfo.status !== 'active') {
        const confirmMsg = `⚠️ WARNING: ${studentName}'s assigned slot (${sessionSlot}) is currently ${slotInfo.label}.\n\nAre you sure you want to mark this student as '${attendanceStatus}' outside of their active slot window?`;
        if (!confirm(confirmMsg)) return;
      }
    }
    try {
      await api.updateUserAttendance(userId, attendanceStatus);
      load();
    } catch (err) {
      alert(`Failed to update attendance: ${err.message}`);
    }
  };

  const handleBulkAttendance = async (status) => {
    const slotArg = selectedSlotFilter === 'All Slots' ? null : selectedSlotFilter;
    const targetLabel = slotArg ? `slot "${slotArg}"` : "all active students";
    if (!confirm(`Are you sure you want to mark ALL students in ${targetLabel} as '${status}'?`)) return;

    try {
      await api.bulkUpdateAttendance({ session_slot: slotArg, attendance: status });
      load();
    } catch (err) {
      alert(`Failed to bulk update: ${err.message}`);
    }
  };

  /* ─── CSV & Excel Bulk Import Handlers ─── */
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPendingFile(file);
    setUploadMsg('');
  };

  const executeBulkUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    setUploadMsg('');
    try {
      const formData = new FormData();
      formData.append('file', pendingFile);
      formData.append('role', bulkRole);
      const res = await api.adminBulkUploadUsers(formData);
      setUploadMsg(`✅ ${res.message || 'Import successful!'}`);
      setPendingFile(null);
      load();
    } catch (err) {
      setUploadMsg(`❌ Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  /* ─── Filtered Data Calculations ─── */
  const slotOptions = Array.from(new Set((users || []).filter(u => u && u.session_slot).map(u => u.session_slot)));

  const allStudents = (users || []).filter(u => u && u.role === 'student');
  const presentStudents = allStudents.filter(u => u.attendance === 'Present');
  const absentStudents = allStudents.filter(u => u.attendance === 'Absent' || !u.attendance);

  const presentPct = allStudents.length > 0 ? ((presentStudents.length / allStudents.length) * 100).toFixed(1) : 0;
  const absentPct = allStudents.length > 0 ? ((absentStudents.length / allStudents.length) * 100).toFixed(1) : 0;
  const uniqueSlotsCount = new Set(allStudents.map(u => u.session_slot).filter(Boolean)).size;

  /* Filtered, Searched & Sorted Student List for Attendance Tab */
  const filteredStudents = allStudents
    .filter(u => selectedSlotFilter === 'All Slots' || u.session_slot === selectedSlotFilter)
    .filter(u => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        (u.username && u.username.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.roll_number && u.roll_number.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      if (sortBy === 'roll_number') return (a.roll_number || '').localeCompare(b.roll_number || '');
      if (sortBy === 'username') return (a.username || '').localeCompare(b.username || '');
      if (sortBy === 'level') return (a.level_name || '').localeCompare(b.level_name || '');
      return 0;
    });

  return (
    <>
      {/* Aesthetic Top Navigation Bar */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 24, padding: 6,
        background: '#F8FAFC', borderRadius: 14, border: '1px solid #E2E8F0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        <button
          onClick={() => setActiveTab('attendance')}
          style={{
            flex: 1, padding: '13px 20px', borderRadius: 10, border: 'none',
            fontWeight: 700, fontSize: 14, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.25s ease',
            background: activeTab === 'attendance' ? '#FFFFFF' : 'transparent',
            color: activeTab === 'attendance' ? '#4F46E5' : '#64748B',
            boxShadow: activeTab === 'attendance' ? '0 4px 12px rgba(79,70,229,0.08)' : 'none'
          }}
        >
          <FiCheckCircle size={17} /> Attendance & Slot Access Control
        </button>

        <button
          onClick={() => setActiveTab('accounts')}
          style={{
            flex: 1, padding: '13px 20px', borderRadius: 10, border: 'none',
            fontWeight: 700, fontSize: 14, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.25s ease',
            background: activeTab === 'accounts' ? '#FFFFFF' : 'transparent',
            color: activeTab === 'accounts' ? '#4F46E5' : '#64748B',
            boxShadow: activeTab === 'accounts' ? '0 4px 12px rgba(79,70,229,0.08)' : 'none'
          }}
        >
          <FiUsers size={17} /> User Accounts Management
        </button>
      </div>

      {/* ─── TAB 1: ATTENDANCE & SLOT ACCESS CONTROL ─── */}
      {activeTab === 'attendance' && (
        <>
          {/* Header Row: Title & Action Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: '0 0 4px' }}>
                Student Attendance & Slot Access Control
              </h1>
              <p style={{ color: '#6B7280', fontSize: 13, margin: 0 }}>
                Select a slot timing to mark attendance. Only active students marked 'Present' are allowed to log in during their slot.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', fontWeight: 600 }}>
                <FiFilter size={15} />
                <span>Filter by Slot:</span>
                <select
                  value={selectedSlotFilter}
                  onChange={e => setSelectedSlotFilter(e.target.value)}
                  style={{
                    padding: '8px 12px', borderRadius: 8, border: '1px solid #D1D5DB',
                    fontSize: 13, fontWeight: 700, background: '#FFFFFF', color: '#111827',
                    cursor: 'pointer', outline: 'none'
                  }}
                >
                  <option value="All Slots">All Slots</option>
                  {slotOptions.map(slot => (
                    <option key={slot} value={slot}>{slot}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => handleBulkAttendance('Present')}
                style={{
                  background: '#10B981', color: '#FFFFFF', border: 'none',
                  padding: '9px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}
              >
                ✓ Mark All Present
              </button>

              <button
                onClick={() => handleBulkAttendance('Absent')}
                style={{
                  background: '#EF4444', color: '#FFFFFF', border: 'none',
                  padding: '9px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}
              >
                ✕ Mark All Absent
              </button>

              <button
                onClick={() => { setActiveTab('accounts'); setShowAddForm(true); }}
                style={{
                  background: '#4F46E5', color: '#FFFFFF', border: 'none',
                  padding: '9px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}
              >
                <FiPlus size={16} /> Add User
              </button>
            </div>
          </div>

          {/* 4 Stat Overview Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16, marginBottom: 20
          }}>
            {/* Total Active/Upcoming Students */}
            <div style={{
              background: '#FFFFFF', padding: '16px 20px', borderRadius: 14,
              border: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 14,
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, background: '#F3E8FF',
                color: '#9333EA', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <FiUsers size={22} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Students</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#111827', lineHeight: 1.2 }}>{allStudents.length}</div>
                <div style={{ fontSize: 11, color: '#9CA3AF' }}>Registered Students</div>
              </div>
            </div>

            {/* Present */}
            <div style={{
              background: '#FFFFFF', padding: '16px 20px', borderRadius: 14,
              border: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 14,
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, background: '#DCFCE7',
                color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <FiUserCheck size={22} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#16A34A', textTransform: 'uppercase', letterSpacing: 0.5 }}>Present</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#111827', lineHeight: 1.2 }}>{presentStudents.length}</div>
                <div style={{ fontSize: 11, color: '#16A34A', fontWeight: 600 }}>{presentPct}%</div>
              </div>
            </div>

            {/* Absent */}
            <div style={{
              background: '#FFFFFF', padding: '16px 20px', borderRadius: 14,
              border: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 14,
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, background: '#FEE2E2',
                color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <FiUserX size={22} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: 0.5 }}>Absent</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#111827', lineHeight: 1.2 }}>{absentStudents.length}</div>
                <div style={{ fontSize: 11, color: '#DC2626', fontWeight: 600 }}>{absentPct}%</div>
              </div>
            </div>

            {/* Slots Scheduled */}
            <div style={{
              background: '#FFFFFF', padding: '16px 20px', borderRadius: 14,
              border: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 14,
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, background: '#E0F2FE',
                color: '#0284C7', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <FiClock size={22} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#0284C7', textTransform: 'uppercase', letterSpacing: 0.5 }}>Slots Today</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#111827', lineHeight: 1.2 }}>{uniqueSlotsCount}</div>
                <div style={{ fontSize: 11, color: '#9CA3AF' }}>Scheduled</div>
              </div>
            </div>
          </div>

          {/* Search, Sort & Layout Control Bar */}
          <div style={{
            background: '#FFFFFF', padding: '12px 16px', borderRadius: 14,
            border: '1px solid #E5E7EB', marginBottom: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12
          }}>
            {/* Search Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 240, position: 'relative' }}>
              <FiSearch style={{ position: 'absolute', left: 12, color: '#9CA3AF' }} size={16} />
              <input
                type="text"
                placeholder="Search by name, email, or roll number..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px 8px 36px', borderRadius: 8,
                  border: '1px solid #E5E7EB', fontSize: 13, outline: 'none',
                  background: '#F9FAFB'
                }}
              />
            </div>

            {/* Sort & Grid/Table Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6B7280' }}>
                <span>Sort by:</span>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  style={{
                    padding: '6px 10px', borderRadius: 8, border: '1px solid #E5E7EB',
                    fontSize: 13, fontWeight: 600, background: '#FFFFFF', color: '#111827',
                    outline: 'none', cursor: 'pointer'
                  }}
                >
                  <option value="roll_number">Roll Number</option>
                  <option value="username">Student Name</option>
                  <option value="level">Level</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 2, background: '#F3F4F6', padding: 3, borderRadius: 8 }}>
                <button
                  onClick={() => setViewMode('grid')}
                  style={{
                    padding: 6, borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: viewMode === 'grid' ? '#FFFFFF' : 'transparent',
                    color: viewMode === 'grid' ? '#4F46E5' : '#6B7280',
                    boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                  }}
                  title="Grid View"
                >
                  <FiGrid size={16} />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  style={{
                    padding: 6, borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: viewMode === 'table' ? '#FFFFFF' : 'transparent',
                    color: viewMode === 'table' ? '#4F46E5' : '#6B7280',
                    boxShadow: viewMode === 'table' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                  }}
                  title="Table View"
                >
                  <FiList size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Student Grid / Table Content */}
          {loading ? (
            <div className="loader"><div className="spinner" /></div>
          ) : filteredStudents.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '40px 16px', background: '#FFFFFF',
              borderRadius: 14, border: '1px dashed #D1D5DB', color: '#6B7280'
            }}>
              <p style={{ fontSize: 32, margin: '0 0 8px' }}>🎓</p>
              <p style={{ fontWeight: 600, margin: 0 }}>No active/upcoming students matching current filter.</p>
            </div>
          ) : viewMode === 'grid' ? (
            /* ─── 4-COLUMN CARD GRID ─── */
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 16
            }}>
              {filteredStudents.map(u => {
                const avatarStyle = getAvatarStyle(u?.username);
                const isPresent = u.attendance === 'Present';
                const isAbsent = u.attendance === 'Absent';
                const slotInfo = getSlotStatus(u.session_slot);

                return (
                  <div
                    key={u.id}
                    className="attendance-card"
                    style={{
                      background: '#FFFFFF',
                      borderRadius: 14,
                      border: '1px solid #E5E7EB',
                      padding: '18px 16px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 14,
                      transition: 'all 0.25s cubic-bezier(.4,0,.2,1)',
                      cursor: 'default',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)';
                      e.currentTarget.style.borderColor = '#C7D2FE';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                      e.currentTarget.style.borderColor = '#E5E7EB';
                    }}
                  >
                    {/* Top Row: Avatar + Name + Slot Badge */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: '50%',
                          background: avatarStyle.bg, color: avatarStyle.text,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 800, fontSize: 16, flexShrink: 0
                        }}>
                          {((u?.username || 'U').charAt(0)).toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {u?.username || 'Unnamed'}
                          </div>
                          <div style={{ fontSize: 11, color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {u?.email || '—'}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        <span style={{
                          background: slotInfo.bg, color: slotInfo.color,
                          padding: '3px 8px', borderRadius: 100, fontSize: 9, fontWeight: 800,
                          whiteSpace: 'nowrap', letterSpacing: 0.2
                        }}>
                          {slotInfo.label}
                        </span>
                        <button style={{ border: 'none', background: 'transparent', color: '#9CA3AF', cursor: 'pointer', padding: 2, lineHeight: 1 }}>
                          <FiMoreVertical size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Info Rows */}
                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: 7,
                      padding: '10px 12px', background: '#F9FAFB', borderRadius: 10,
                      border: '1px solid #F3F4F6', fontSize: 12
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6B7280' }}>
                          <FiUser size={13} />
                          <span>Roll No</span>
                        </div>
                        <strong style={{ color: '#111827', fontFamily: 'monospace', fontSize: 12 }}>
                          {u.roll_number || '—'}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6B7280' }}>
                          <FiUsers size={13} />
                          <span>Level</span>
                        </div>
                        <span style={{ color: '#374151', fontWeight: 600 }}>
                          {u.level_name || 'All Levels'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6B7280' }}>
                          <FiClock size={13} />
                          <span>Slot Timing</span>
                        </div>
                        <span style={{ color: '#374151', fontWeight: 600 }}>
                          {u.session_slot || '—'}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => handleMarkAttendance(u.id, 'Present', u.session_slot, u.username)}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.transform = 'scale(1.02)'; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1)'; }}
                        style={{
                          flex: 1, padding: '8px 10px', borderRadius: 8,
                          fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                          transition: 'all 0.15s ease',
                          background: isPresent ? '#16A34A' : '#F0FDF4',
                          color: isPresent ? '#FFFFFF' : '#15803D',
                          border: isPresent ? '1px solid #16A34A' : '1px solid #BBF7D0'
                        }}
                      >
                        {isPresent ? '✓ Marked Present' : '✓ Present'}
                      </button>

                      <button
                        onClick={() => handleMarkAttendance(u.id, 'Absent', u.session_slot, u.username)}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.transform = 'scale(1.02)'; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1)'; }}
                        style={{
                          flex: 1, padding: '8px 10px', borderRadius: 8,
                          fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                          transition: 'all 0.15s ease',
                          background: isAbsent ? '#DC2626' : '#FEF2F2',
                          color: isAbsent ? '#FFFFFF' : '#DC2626',
                          border: isAbsent ? '1px solid #DC2626' : '1px solid #FECACA'
                        }}
                      >
                        {isAbsent ? '✕ Marked Absent' : '✕ Absent'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ─── TABLE VIEW ─── */
            <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', textAlign: 'left', color: '#4B5563' }}>
                    <th style={{ padding: '12px 16px' }}>Student</th>
                    <th style={{ padding: '12px 16px' }}>Roll Number</th>
                    <th style={{ padding: '12px 16px' }}>Level</th>
                    <th style={{ padding: '12px 16px' }}>Slot Timing</th>
                    <th style={{ padding: '12px 16px' }}>Slot Status</th>
                    <th style={{ padding: '12px 16px' }}>Attendance</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map(u => {
                    const avatarStyle = getAvatarStyle(u.username);
                    const slotInfo = getSlotStatus(u.session_slot);
                    const isPresent = u.attendance === 'Present';

                    return (
                      <tr key={u.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: '50%',
                              background: avatarStyle.bg, color: avatarStyle.text,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontWeight: 800, fontSize: 13
                            }}>
                              {((u?.username || 'U').charAt(0)).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: '#111827' }}>{u?.username || 'Unnamed'}</div>
                              <div style={{ fontSize: 11, color: '#6B7280' }}>{u?.email || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 700 }}>
                          {u.roll_number || '—'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ background: '#EEF2FF', color: '#4F46E5', padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: 12 }}>
                            {u.level_name || 'All Levels'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                          {u.session_slot || '—'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ background: slotInfo.bg, color: slotInfo.color, padding: '3px 8px', borderRadius: 100, fontSize: 11, fontWeight: 800 }}>
                            {slotInfo.label}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {isPresent ? (
                            <span style={{ background: '#DCFCE7', color: '#15803D', padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 700 }}>
                              ✓ Present
                            </span>
                          ) : (
                            <span style={{ background: '#FEE2E2', color: '#DC2626', padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 700 }}>
                              ✕ Absent
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                            <button
                              onClick={() => handleMarkAttendance(u.id, 'Present', u.session_slot, u.username)}
                              style={{
                                padding: '4px 10px', borderRadius: 6, border: '1px solid #86EFAC',
                                background: '#F0FDF4', color: '#15803D', fontWeight: 700, cursor: 'pointer'
                              }}
                            >
                              Present
                            </button>
                            <button
                              onClick={() => handleMarkAttendance(u.id, 'Absent', u.session_slot, u.username)}
                              style={{
                                padding: '4px 10px', borderRadius: 6, border: '1px solid #FCA5A5',
                                background: '#FEF2F2', color: '#DC2626', fontWeight: 700, cursor: 'pointer'
                              }}
                            >
                              Absent
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ─── TAB 2: USER ACCOUNTS MANAGEMENT ─── */}
      {activeTab === 'accounts' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: '0 0 4px' }}>
                User Accounts Management
              </h1>
              <p style={{ color: '#6B7280', fontSize: 13, margin: 0 }}>
                Approve, deactivate, manage roles, or bulk import student accounts via Excel or CSV.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                onClick={() => setShowAddForm(!showAddForm)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '9px 16px', borderRadius: 10, fontWeight: 700, fontSize: 13
                }}
              >
                <FiPlus size={16} />
                {showAddForm ? 'Close Form' : 'Create User'}
              </button>

              <a
                className="btn btn-secondary"
                href={api.getSampleTemplateExcelUrl ? api.getSampleTemplateExcelUrl() : '/api/auth/sample-template-excel'}
                download="sample_student_import.xlsx"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none',
                  background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0',
                  padding: '9px 14px', borderRadius: 10, fontWeight: 700, fontSize: 13
                }}
              >
                <FiDownload size={15} />
                Excel Template (.xlsx)
              </a>

              <a
                className="btn btn-secondary"
                href={api.getSampleTemplateUrl ? api.getSampleTemplateUrl() : '/api/auth/sample-template'}
                download="sample_student_import.csv"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none',
                  background: '#F8FAFC', color: '#334155', border: '1px solid #E2E8F0',
                  padding: '9px 14px', borderRadius: 10, fontWeight: 700, fontSize: 13
                }}
              >
                <FiDownload size={15} />
                CSV Template (.csv)
              </a>
            </div>
          </div>

          {/* Aesthetic Excel & CSV Bulk Import Card */}
          <div style={{
            background: '#FFFFFF', borderRadius: 16, border: '1px solid #E2E8F0',
            padding: 24, marginBottom: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#1E293B', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FiUploadCloud style={{ color: '#4F46E5' }} size={20} />
                  Bulk Student Import (Excel & CSV)
                </h3>
                <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>
                  Upload an Excel (<code>.xlsx</code> / <code>.xls</code>) or CSV file with headers: <code>roll_number, username, email, password, role, session_slot, level_name</code>.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ background: '#DCFCE7', color: '#15803D', padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 800 }}>
                  📊 Excel (.xlsx, .xls)
                </span>
                <span style={{ background: '#E0E7FF', color: '#4338CA', padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 800 }}>
                  📄 CSV (.csv)
                </span>
              </div>
            </div>

            {/* Dropzone Container */}
            <div
              onClick={() => fileRef.current && fileRef.current.click()}
              style={{
                border: '2px dashed #CBD5E1', borderRadius: 12, padding: '24px 20px',
                textAlign: 'center', background: '#F8FAFC', cursor: 'pointer',
                transition: 'all 0.2s ease', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 8
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366F1'; e.currentTarget.style.background = '#EEF2FF'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.background = '#F8FAFC'; }}
            >
              <FiUploadCloud size={32} style={{ color: '#6366F1' }} />
              <div>
                <span style={{ fontWeight: 700, color: '#1E293B', fontSize: 14 }}>Click to browse file</span>
                <span style={{ color: '#64748B', fontSize: 13 }}> or drop your Excel / CSV file here</span>
              </div>
              <span style={{ fontSize: 11, color: '#94A3B8' }}>Supports .xlsx, .xls, and .csv files</span>

              <input
                type="file"
                ref={fileRef}
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
            </div>

            {pendingFile && (
              <div style={{
                marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#F1F5F9', padding: '12px 18px', borderRadius: 12, border: '1px solid #E2E8F0',
                flexWrap: 'wrap', gap: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <FiFileText size={20} style={{ color: '#4F46E5' }} />
                  <div>
                    <strong style={{ fontSize: 13, color: '#0F172A', display: 'block' }}>{pendingFile.name}</strong>
                    <span style={{ fontSize: 11, color: '#64748B' }}>{(pendingFile.size / 1024).toFixed(1)} KB</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Default Role:</label>
                    <select
                      value={bulkRole}
                      onChange={e => setBulkRole(e.target.value)}
                      style={{
                        padding: '6px 10px', borderRadius: 8, border: '1px solid #CBD5E1',
                        fontSize: 12, fontWeight: 700, background: '#FFFFFF', color: '#0F172A'
                      }}
                    >
                      <option value="student">Student</option>
                      <option value="professor">Professor</option>
                    </select>
                  </div>

                  <button
                    onClick={executeBulkUpload}
                    disabled={uploading}
                    style={{
                      background: '#10B981', color: '#FFFFFF', border: 'none',
                      padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                      boxShadow: '0 2px 4px rgba(16,185,129,0.2)'
                    }}
                  >
                    {uploading ? 'Uploading...' : '🚀 Start Import'}
                  </button>

                  <button
                    onClick={() => setPendingFile(null)}
                    style={{
                      background: 'transparent', color: '#64748B', border: 'none',
                      fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: '6px 10px'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {uploadMsg && (
              <div style={{
                marginTop: 14, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                background: uploadMsg.startsWith('✅') ? '#ECFDF5' : '#FEF2F2',
                color: uploadMsg.startsWith('✅') ? '#047857' : '#B91C1C',
                border: uploadMsg.startsWith('✅') ? '1px solid #A7F3D0' : '1px solid #FCA5A5'
              }}>
                {uploadMsg}
              </div>
            )}
          </div>

          {/* Manual Add User Form */}
          {showAddForm && (
            <div style={{
              background: '#FFFFFF', borderRadius: 16, border: '1px solid #E2E8F0',
              padding: 24, marginBottom: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#1E293B', marginBottom: 16 }}>Create New User Account</h3>
              {addError && <div style={{ color: '#DC2626', background: '#FEE2E2', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12, fontWeight: 600 }}>❌ {addError}</div>}
              {addSuccess && <div style={{ color: '#15803D', background: '#DCFCE7', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12, fontWeight: 600 }}>✅ {addSuccess}</div>}

              <form onSubmit={handleAddUser} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, alignItems: 'end' }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Roll Number</label>
                  <input className="form-input" placeholder="e.g. 7376221EC101" value={newUser.roll_number} onChange={e => setNewUser({ ...newUser, roll_number: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Username *</label>
                  <input className="form-input" required placeholder="Full name / ID" value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Email *</label>
                  <input type="email" className="form-input" required placeholder="email@bitsathy.ac.in" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Password *</label>
                  <input type="password" className="form-input" required placeholder="Password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Slot Timing</label>
                  <input className="form-input" placeholder="09:00-11:00" value={newUser.session_slot} onChange={e => setNewUser({ ...newUser, session_slot: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Assigned Level</label>
                  <select className="form-select" value={newUser.level_id} onChange={e => setNewUser({ ...newUser, level_id: e.target.value })}>
                    <option value="">All Levels</option>
                    {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Role</label>
                  <select className="form-select" value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
                    <option value="student">Student</option>
                    <option value="professor">Professor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn btn-success btn-sm" style={{ height: 38, fontWeight: 700, flex: 1 }}>✓ Create & Activate</button>
                  <button
                    type="button"
                    onClick={() => { setShowAddForm(false); setAddError(''); setAddSuccess(''); }}
                    style={{
                      height: 38, padding: '0 14px', borderRadius: 8, border: '1px solid #CBD5E1',
                      background: '#F8FAFC', color: '#64748B', fontWeight: 600, fontSize: 13, cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Bulk Selection Floating Action Bar */}
          {selectedUserIds.length > 0 && (
            <div style={{
              background: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 100%)',
              color: '#FFFFFF', padding: '12px 20px', borderRadius: 14,
              marginBottom: 16, display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
              boxShadow: '0 8px 24px rgba(49,46,129,0.25)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  background: '#7C5CFC', color: 'white', fontWeight: 800,
                  fontSize: 12, padding: '3px 10px', borderRadius: 100
                }}>
                  {selectedUserIds.length} Selected
                </span>
                <span style={{ fontSize: 13, color: '#E0E7FF' }}>Perform bulk operation on selected user accounts:</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={handleBulkActivate}
                  style={{
                    background: '#10B981', color: 'white', border: 'none',
                    padding: '7px 14px', borderRadius: 8, fontWeight: 700, fontSize: 12,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  ✓ Activate Selected ({selectedUserIds.length})
                </button>

                <button
                  onClick={handleBulkDeactivate}
                  style={{
                    background: '#F59E0B', color: 'white', border: 'none',
                    padding: '7px 14px', borderRadius: 8, fontWeight: 700, fontSize: 12,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  ⊘ Deactivate Selected ({selectedUserIds.length})
                </button>

                <button
                  onClick={handleBulkDelete}
                  style={{
                    background: '#EF4444', color: 'white', border: 'none',
                    padding: '7px 14px', borderRadius: 8, fontWeight: 700, fontSize: 12,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  🗑 Delete Selected ({selectedUserIds.length})
                </button>
              </div>
            </div>
          )}

          {/* Registered Users Table */}
          {loading ? (
            <div className="loader"><div className="spinner" /></div>
          ) : (
            <div style={{ background: '#FFFFFF', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#475569' }}>
                    <th style={{ padding: '14px 12px 14px 18px', width: 40, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={users.length > 0 && selectedUserIds.length === users.length}
                        onChange={handleSelectAll}
                        style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#7C5CFC' }}
                      />
                    </th>
                    <th style={{ padding: '14px 18px', fontWeight: 700 }}>Roll Num</th>
                    <th style={{ padding: '14px 18px', fontWeight: 700 }}>User</th>
                    <th style={{ padding: '14px 18px', fontWeight: 700 }}>Email</th>
                    <th style={{ padding: '14px 18px', fontWeight: 700 }}>Slot Timing</th>
                    <th style={{ padding: '14px 18px', fontWeight: 700 }}>Level</th>
                    <th style={{ padding: '14px 18px', fontWeight: 700 }}>Role</th>
                    <th style={{ padding: '14px 18px', fontWeight: 700 }}>Status</th>
                    <th style={{ padding: '14px 18px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid #F1F5F9', background: selectedUserIds.includes(u.id) ? '#F5F3FF' : 'transparent' }}>
                      <td style={{ padding: '12px 12px 12px 18px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={selectedUserIds.includes(u.id)}
                          onChange={() => handleSelectUser(u.id)}
                          style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#7C5CFC' }}
                        />
                      </td>
                      <td style={{ fontWeight: 700, fontSize: 13, color: '#334155', padding: '12px 18px', fontFamily: 'monospace' }}>
                        {u.roll_number || '—'}
                      </td>
                      <td style={{ padding: '12px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="user-avatar" style={{ width: 34, height: 34, fontSize: 13, minWidth: 34 }}>
                            {((u?.username || 'U').charAt(0)).toUpperCase()}
                          </div>
                          <strong style={{ color: '#0F172A' }}>{u?.username || 'Unnamed User'}</strong>
                        </div>
                      </td>
                      <td style={{ color: '#64748B', fontSize: 13, padding: '12px 18px' }}>{u.email}</td>
                      <td style={{ padding: '12px 18px' }}>
                        <span style={{ background: '#F1F5F9', color: '#334155', padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                          {u.session_slot || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 18px' }}>
                        <span style={{ background: '#EEF2FF', color: '#4F46E5', padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                          {u.level_name || 'All Levels'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 18px' }}>
                        <select
                          className="form-select"
                          value={u.role}
                          onChange={e => handleRole(u.id, e.target.value)}
                          style={{ width: 110, padding: '4px 8px', fontSize: 12, fontWeight: 600 }}
                        >
                          <option value="student">Student</option>
                          <option value="professor">Professor</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td style={{ padding: '12px 18px' }}>
                        {u.is_active
                          ? <span style={{ background: '#DCFCE7', color: '#15803D', padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 700 }}>Active</span>
                          : <span style={{ background: '#F3F4F6', color: '#6B7280', padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 700 }}>Deactivated</span>
                        }
                      </td>
                      <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {!u.is_active ? (
                            <button className="btn btn-sm btn-success" onClick={() => handleApprove(u.id, true)} style={{ fontWeight: 700 }}>✓ Activate</button>
                          ) : (
                            <button className="btn btn-sm btn-secondary" onClick={() => handleApprove(u.id, false)} style={{ fontWeight: 700 }}>Deactivate</button>
                          )}
                          <button className="btn btn-sm btn-danger" onClick={() => handleDelete(u.id)}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
