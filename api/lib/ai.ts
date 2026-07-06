type Json = Record<string, any>;

const NVIDIA_BASE_URL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';

function requireEnv(name: string, value?: string) {
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

async function nvidiaPost(path: string, body: Json) {
  const apiKey = requireEnv('NVIDIA_API_KEY', NVIDIA_API_KEY);
  const res = await fetch(`${NVIDIA_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NVIDIA API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function moderateImage(imageDataUrl: string) {
  const model = process.env.NVIDIA_SAFETY_MODEL || 'nemotron-3-content-safety';
  return nvidiaPost('/chat/completions', {
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Is this image safe and suitable for interior paint recommendation analysis? Return JSON only: {"allowed": true/false, "reason": "..."}' },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
    temperature: 0,
  });
}

export async function analyzeRoomImage(imageDataUrl: string) {
  const model = process.env.NVIDIA_VISION_MODEL || 'nemotron-3-nano-omni-30b-a3b-reasoning';
  return nvidiaPost('/chat/completions', {
    model,
    messages: [
      { role: 'system', content: 'You are an expert interior paint advisor. Return strict JSON only, no markdown.' },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze this room photo for paint recommendation. Return strict JSON:
{
  "room_type": string,
  "lighting": string,
  "dominant_colors": string[],
  "surface_notes": string[],
  "style": string,
  "recommended_palette": [{"name": string, "hex": string, "why": string}],
  "prep_notes": string[],
  "wall_regions": [{"label": string, "description": string}]
}`,
          },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
    temperature: 0.2,
  });
}

export async function generateRecommendationText(analysis: any, catalogContext: string) {
  const model = process.env.NVIDIA_TEXT_MODEL || 'mistral-medium-3.5-128b';
  return nvidiaPost('/chat/completions', {
    model,
    messages: [
      { role: 'system', content: 'You are a helpful paint sales assistant for MicMikes Paints Kenya. Be concise and practical. Return strict JSON only.' },
      {
        role: 'user',
        content: `Given this room analysis:\n${JSON.stringify(analysis)}\n\nAnd this catalog context:\n${catalogContext}\n\nReturn JSON:\n{"summary": string, "recommended_products": [{"name": string, "reason": string, "hex": string | null}], "tips": string[]}`,
      },
    ],
    temperature: 0.4,
  });
}

export async function visualizeRoomEdit(imageDataUrl: string, prompt: string) {
  const model = process.env.NVIDIA_IMAGE_EDIT_MODEL || 'qwen-image-edit';
  return nvidiaPost('/images/edits', {
    model,
    image: imageDataUrl,
    prompt,
    size: '1024x1024',
  });
}
