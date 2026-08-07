import { memo, useState, useRef, useEffect } from 'react';
import { NodeResizer } from '@xyflow/react';
import useProjectStore from '../../store/projectStore.js';
import { FaStickyNote, FaTimes } from 'react-icons/fa';

const TextNoteNode = memo(({ id, data, selected }) => {
  const selectDevice = useProjectStore(s => s.selectDevice);
  const updateDeviceConfig = useProjectStore(s => s.updateDeviceConfig);
  const removeDevice = useProjectStore(s => s.removeDevice);

  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(data.text || 'Subnet / IP Info');
  const inputRef = useRef(null);

  useEffect(() => {
    setText(data.text || 'Subnet / IP Info');
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
  const fontSize = data.fontSize || 10;

  return (
    <>
      <NodeResizer
        color="#7C5CFC"
        minWidth={50}
        minHeight={26}
        isVisible={selected}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, background: '#7C5CFC', border: '1.5px solid #FFFFFF' }}
      />
      <div
        className="text-note-node"
        onClick={() => selectDevice(id)}
        onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
        style={{
          background: bgColor,
          border: `1.5px solid ${selected ? '#7C5CFC' : borderColor}`,
          borderRadius: 5,
          padding: '3px 6px',
          width: '100%',
          height: '100%',
          minWidth: 50,
          minHeight: 26,
          cursor: 'grab',
          boxShadow: selected ? '0 0 0 2px rgba(124,92,252,0.35), 0 3px 8px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.05)',
          position: 'relative',
          userSelect: 'none',
          boxSizing: 'border-box',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 1, flexShrink: 0 }}>
          <FaStickyNote size={9} color={borderColor} />
          <span style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', color: borderColor, letterSpacing: 0.4 }}>
            NOTE
          </span>
          {selected && (
            <button
              onClick={(e) => { e.stopPropagation(); removeDevice(id); }}
              style={{
                marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 9, color: '#EF4444', padding: 0, lineHeight: 1,
                display: 'flex', alignItems: 'center',
              }}
              title="Delete Note"
            >
              <FaTimes size={9} />
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
              height: '100%',
              background: 'transparent',
              border: '1px dashed #7C5CFC',
              borderRadius: 3,
              fontSize,
              fontWeight: 600,
              color: textColor,
              fontFamily: 'inherit',
              resize: 'none',
              outline: 'none',
              padding: 1,
              boxSizing: 'border-box',
            }}
          />
        ) : (
          <div
            style={{
              fontSize,
              fontWeight: 600,
              color: textColor,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              lineHeight: 1.25,
              flex: 1,
              overflow: 'hidden',
            }}
          >
            {text}
          </div>
        )}
      </div>
    </>
  );
});

TextNoteNode.displayName = 'TextNoteNode';

export default TextNoteNode;
