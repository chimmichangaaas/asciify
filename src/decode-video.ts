export async function decodeVideoFile(
  file: File,
  opts: { maxFrames: number; sampleFps: number },
): Promise<ImageData[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';

  try {
    await waitFor(video, 'loadedmetadata');
    if (!isFinite(video.duration) || video.duration <= 0) {
      throw new Error('Video has no measurable duration');
    }

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) throw new Error('Video has no decoded dimensions');

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D canvas context unavailable');

    const totalByFps = Math.max(1, Math.floor(video.duration * opts.sampleFps));
    const frameCount = Math.min(opts.maxFrames, totalByFps);
    const step = video.duration / frameCount;

    const out: ImageData[] = [];
    for (let i = 0; i < frameCount; i++) {
      const t = Math.min(video.duration - 0.001, i * step);
      video.currentTime = t;
      await waitFor(video, 'seeked');
      ctx.drawImage(video, 0, 0, width, height);
      out.push(ctx.getImageData(0, 0, width, height));
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function waitFor(el: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onEvent = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error(`Video error during ${event}`)); };
    function cleanup() {
      el.removeEventListener(event, onEvent);
      el.removeEventListener('error', onError);
    }
    el.addEventListener(event, onEvent, { once: true });
    el.addEventListener('error', onError, { once: true });
  });
}
