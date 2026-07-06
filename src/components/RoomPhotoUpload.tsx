import React, { useState } from 'react';
import { fileToDataUrl } from '../lib/imageToDataUrl';

type Props = {
  onAnalyzed: (payload: any) => void;
  compact?: boolean;
};

export default function RoomPhotoUpload({ onAnalyzed, compact = false }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxMb = Number(import.meta.env.VITE_AI_MAX_UPLOAD_MB || 8);
    if (file.size > maxMb * 1024 * 1024) {
      setError(`Image must be under ${maxMb}MB`);
      return;
    }

    setError('');
    setFileName(file.name);
    setLoading(true);

    try {
      const imageDataUrl = await fileToDataUrl(file);

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
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginBottom: compact ? 0 : '0.5rem' }}>
      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          cursor: loading ? 'not-allowed' : 'pointer',
          padding: compact ? '0.4rem 0.75rem' : '0.5rem 1rem',
          borderRadius: 999,
          background: loading ? '#e7d9c3' : '#fff',
          border: '1px solid #e2d3b7',
          fontSize: 12.5,
          fontWeight: 600,
          color: '#2B2B2E',
          opacity: loading ? 0.7 : 1,
          transition: 'background 0.15s',
          whiteSpace: 'nowrap',
        }}
        title="Upload a photo of your room for AI paint recommendations"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        {loading ? 'Analysing…' : fileName ? fileName.slice(0, 18) + (fileName.length > 18 ? '…' : '') : 'Upload room photo'}
        <input
          type="file"
          accept="image/*"
          onChange={handleChange}
          disabled={loading}
          style={{ display: 'none' }}
        />
      </label>
      {error && (
        <div style={{ marginTop: '0.35rem', fontSize: 11.5, color: '#B84A32', paddingLeft: '0.25rem' }}>
          {error}
        </div>
      )}
    </div>
  );
}
