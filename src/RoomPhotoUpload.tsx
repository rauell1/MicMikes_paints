import { useRef, useState } from "react";

type AnalysisResult = {
  dominantColors?: string[];
  suggestedShades?: string[];
  roomType?: string;
  lighting?: string;
  recommendation?: string;
};

type Props = {
  onResult: (result: AnalysisResult) => void;
};

export default function RoomPhotoUpload({ onResult }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) { setError("Please upload an image file."); return; }
    if (file.size > 8 * 1024 * 1024) { setError("Image must be under 8 MB."); return; }
    setError("");
    const url = URL.createObjectURL(file);
    setPreview(url);
    setLoading(true);
    try {
      const base64 = await toBase64(file);
      const res = await fetch("/api/analyse-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      onResult(data as AnalysisResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
        style={{
          border: "1.5px dashed #d4a08a",
          borderRadius: 14,
          padding: preview ? 0 : "14px 10px",
          textAlign: "center",
          cursor: loading ? "default" : "pointer",
          background: preview ? "transparent" : "#fff9f7",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {preview ? (
          <img src={preview} alt="Room preview" style={{ width: "100%", borderRadius: 13, display: "block", maxHeight: 160, objectFit: "cover" }} />
        ) : (
          <div style={{ color: "#B84A32", fontSize: 13, fontWeight: 600 }}>
            <span style={{ fontSize: 20 }}>📷</span>
            <div>Upload room photo</div>
            <div style={{ fontWeight: 400, color: "#9b8a7a", fontSize: 11.5 }}>for AI colour suggestions</div>
          </div>
        )}
        {loading && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center",
            justifyContent: "center", background: "rgba(248,244,239,0.82)", borderRadius: 13,
          }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "#B84A32" }}>Analysing…</span>
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
      {error && <div style={{ color: "#B84A32", fontSize: 11.5, marginTop: 5 }}>{error}</div>}
    </div>
  );
}
