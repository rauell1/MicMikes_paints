import React, { useRef, useState } from 'react';
import { fileToDataUrl, validateImageFile } from '../lib/imageToDataUrl';

type Props = {
  onAnalyzed: (payload: { analysis: any; recommendation: any; imageDataUrl: string }) => void;
  disabled?: boolean;
};

export default function RoomPhotoUpload({ onAnalyzed, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateImageFile(file);
    if (validationError) { setError(validationError); return; }

    setError('');
    setLoading(true);

    try {
      const imageDataUrl = await fileToDataUrl(file);
      setPreview(imageDataUrl);

      const res = await fetch('/api/ai/analyze-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Analysis failed');

      onAnalyzed({ ...json, imageDataUrl });
    } catch (err: any) {
      setError(err.message || 'Failed to analyze room. Please try again.');
      setPreview('');
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      {preview && !loading && (
        <div style={{ marginBottom: 8, borderRadius: 12, overflow: 'hidden', border: '1px solid #e7d9c3' }}>
          <img src={preview} alt="Room preview" style={{ width: '100%', maxHeight: 140, objectFit: 'cover', display: 'block' }} />
        </div>
      )}
      <button
        type="button"
        disabled={loading || disabled}
        onClick={() => inputRef.current?.click()}
        style={{
          width: '100%',
          padding: '9px 14px',
          borderRadius: 12,
          border: '1.5px dashed #d4c4a8',
          background: loading ? '#f5f0e8' : '#fffdf8',
          color: loading ? '#9b9589' : '#B84A32',
          fontSize: 13,
          fontWeight: 600,
          cursor: loading || disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          transition: 'background 0.15s',
        }}
      >
        {loading ? (
          <>
            <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #B84A32', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            Analyzing your room…
          </>
        ) : (
          <>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            Upload room photo for AI analysis
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleChange}
      />
      {error && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#B84A32', padding: '6px 10px', background: '#fdf0ee', borderRadius: 8 }}>
          {error}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
