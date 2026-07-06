export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function validateImageFile(file: File, maxMb = 8): string | null {
  if (!file.type.startsWith('image/')) return 'Please upload an image file.';
  if (file.size > maxMb * 1024 * 1024) return `Image must be smaller than ${maxMb}MB.`;
  return null;
}
