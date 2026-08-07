import { useState, useEffect, useRef } from 'react';

const HOURS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
const PERIODS = ['AM', 'PM'];

export function SingleTimePicker({ value = '09:00 AM', onChange, label = 'Select Time' }) {
  const parseVal = (str) => {
    const match = (str || '').match(/(\d{1,2})[:.](\d{2})\s*(am|pm)?/i);
    if (match) {
      const h = String(parseInt(match[1], 10)).padStart(2, '0');
      const m = match[2] || '00';
      const p = (match[3] || 'AM').toUpperCase();
      return {
        hour: HOURS.includes(h) ? h : '09',
        minute: MINUTES.includes(m) ? m : '00',
        period: PERIODS.includes(p) ? p : 'AM',
      };
    }
    return { hour: '09', minute: '00', period: 'AM' };
  };

  const [selected, setSelected] = useState(parseVal(value));

  useEffect(() => {
    setSelected(parseVal(value));
  }, [value]);

  const update = (key, val) => {
    const next = { ...selected, [key]: val };
    setSelected(next);
    const newStr = `${next.hour}:${next.minute} ${next.period}`;
    if (onChange) onChange(newStr);
  };

  return (
    <div style={{ background: '#FFFFFF', borderRadius: 10, border: '1px solid #E2E8F0', padding: 10, width: 165 }}>
      {label && <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6, textAlign: 'center' }}>{label}</div>}
      
      {/* 3 Columns matching UI Image 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, textAlign: 'center' }}>
        
        {/* Hour Column */}
        <div>
          <div style={{
            background: '#007AFF', color: 'white', padding: '4px 0', borderRadius: 4,
            fontWeight: 800, fontSize: 13, marginBottom: 4
          }}>
            {selected.hour}
          </div>
          <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {HOURS.map(h => (
              <div
                key={h}
                onClick={() => update('hour', h)}
                style={{
                  padding: '3px 0', fontSize: 12, fontWeight: selected.hour === h ? 800 : 500,
                  color: selected.hour === h ? '#007AFF' : '#334155', cursor: 'pointer',
                  background: selected.hour === h ? '#EFF6FF' : 'transparent', borderRadius: 3
                }}
              >
                {h}
              </div>
            ))}
          </div>
        </div>

        {/* Minute Column */}
        <div>
          <div style={{
            background: '#007AFF', color: 'white', padding: '4px 0', borderRadius: 4,
            fontWeight: 800, fontSize: 13, marginBottom: 4
          }}>
            {selected.minute}
          </div>
          <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {MINUTES.map(m => (
              <div
                key={m}
                onClick={() => update('minute', m)}
                style={{
                  padding: '3px 0', fontSize: 12, fontWeight: selected.minute === m ? 800 : 500,
                  color: selected.minute === m ? '#007AFF' : '#334155', cursor: 'pointer',
                  background: selected.minute === m ? '#EFF6FF' : 'transparent', borderRadius: 3
                }}
              >
                {m}
              </div>
            ))}
          </div>
        </div>

        {/* AM/PM Column */}
        <div>
          <div style={{
            background: '#007AFF', color: 'white', padding: '4px 0', borderRadius: 4,
            fontWeight: 800, fontSize: 13, marginBottom: 4
          }}>
            {selected.period}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {PERIODS.map(p => (
              <div
                key={p}
                onClick={() => update('period', p)}
                style={{
                  padding: '5px 0', fontSize: 12, fontWeight: selected.period === p ? 800 : 500,
                  color: selected.period === p ? '#007AFF' : '#334155', cursor: 'pointer',
                  background: selected.period === p ? '#EFF6FF' : 'transparent', borderRadius: 3
                }}
              >
                {p}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

export default function SlotTimePicker({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const parseSlot = (str) => {
    const parts = (str || '').split(/[-–—to]+/i);
    return {
      start: (parts[0] || '09:00 AM').trim(),
      end: (parts[1] || '11:00 AM').trim(),
    };
  };

  const [slot, setSlot] = useState(parseSlot(value));

  useEffect(() => {
    setSlot(parseSlot(value));
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleStartChange = (newStart) => {
    const next = { ...slot, start: newStart };
    setSlot(next);
    if (onChange) onChange(`${next.start} - ${next.end}`);
  };

  const handleEndChange = (newEnd) => {
    const next = { ...slot, end: newEnd };
    setSlot(next);
    if (onChange) onChange(`${next.start} - ${next.end}`);
  };

  const displayVal = `${slot.start} - ${slot.end}`;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
        Slot Timing
      </label>

      {/* Trigger Button that matches form-input dropdown */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%', height: 38, padding: '0 12px',
          background: '#F8FAFC', border: isOpen ? '1px solid #007AFF' : '1px solid #CBD5E1',
          borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#0F172A',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', outline: 'none', transition: 'all 0.15s ease'
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>🕒</span> {displayVal}
        </span>
        <span style={{ fontSize: 10, color: '#64748B' }}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Floating Popover Dropdown Panel */}
      {isOpen && (
        <div style={{
          position: 'absolute', top: '105%', left: 0, zIndex: 9999,
          background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 14,
          padding: 14, boxShadow: '0 12px 36px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column', gap: 10, minWidth: 360,
          animation: 'fadeIn 0.15s ease-out'
        }}>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <SingleTimePicker label="Start Time" value={slot.start} onChange={handleStartChange} />
            <SingleTimePicker label="End Time" value={slot.end} onChange={handleEndChange} />
          </div>

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            paddingTop: 8, borderTop: '1px solid #F1F5F9'
          }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#007AFF' }}>
              Selected: {displayVal}
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{
                background: '#007AFF', color: 'white', border: 'none',
                padding: '5px 14px', borderRadius: 6, fontWeight: 700,
                fontSize: 12, cursor: 'pointer'
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
