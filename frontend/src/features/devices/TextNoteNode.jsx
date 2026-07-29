import { memo, useState, useRef, useEffect } from 'react';
import useProjectStore from '../../store/projectStore.js';

const TextNoteNode = memo(({ id, data, selected }) => {
  const selectDevice = useProjectStore(s => s.selectDevice);
  const updateDeviceConfig = useProjectStore(s => s.updateDeviceConfig);
  const removeDevice = useProjectStore(s => s.removeDevice);

  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(data.text || 'Place Note: Subnet / IP Info');
  const inputRef = useRef(null);

  useEffect(() => {
    setText(data.text || 'Place Note: Subnet / IP Info');
  }, [data.text]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    updateDeviceConfig(id, { text });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleBlur();
    }
  };

  const bgColor = data.bgColor || '#FEF3C7';
  const borderColor = data.borderColor || '#F59E0B';
  const textColor = data.color || '#1F2937';
  const fontSize = data.fontSize || 13;

  return (
    <div
      className="text-note-node"
      onClick={() => selectDevice(id)}
      onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
      style={{
        background: bgColor,
        border: `1.5px solid ${selected ? '#7C5CFC' : borderColor}`,
        borderRadius: 8,
        padding: '8px 12px',
        minWidth: 120,
        maxWidth: 280,
        cursor: 'grab',
        boxShadow: selected ? '0 0 0 3px rgba(124,92,252,0.2), 0 4px 12px rgba(0,0,0,0.08)' : '0 2px 6px rgba(0,0,0,0.06)',
        transition: 'all 0.15s ease',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 13 }}>📝</span>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: borderColor, letterSpacing: 0.5 }}>
          NOTE
        </span>
        {selected && (
          <button
            onClick={(e) => { e.stopPropagation(); removeDevice(id); }}
            style={{
              marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, color: '#EF4444', padding: '0 2px', lineHeight: 1,
            }}
            title="Delete Note"
          >
            ✕
          </button>
        )}
      </div>

      {isEditing ? (
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%',
            background: 'transparent',
            border: '1px dashed #7C5CFC',
            borderRadius: 4,
            fontSize,
            fontWeight: 600,
            color: textColor,
            fontFamily: 'inherit',
            resize: 'vertical',
            outline: 'none',
            padding: 4,
            minHeight: 40,
          }}
        />
      ) : (
        <div
          style={{
            fontSize,
            fontWeight: 600,
            color: textColor,
            lineHeight: 1.4,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
});

TextNoteNode.displayName = 'TextNoteNode';
export default TextNoteNode;
