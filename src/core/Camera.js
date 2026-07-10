export class Camera {
  constructor() {
    this._video = null;
    this._stream = null;
    this._ready = false;
  }

  async init(container) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera API not supported in this browser.');
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Camera permission denied. Please allow camera access and reload.');
      }
      if (err.name === 'NotFoundError') {
        throw new Error('No camera found on this device.');
      }
      throw new Error(`Camera error: ${err.message}`);
    }

    this._stream = stream;

    const video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.setAttribute('autoplay', '');
    video.setAttribute('muted', '');
    video.muted = true;

    Object.assign(video.style, {
      position: 'absolute',
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      transform: 'scaleX(-1)',
      zIndex: '0',
    });

    video.srcObject = stream;

    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => video.play().then(resolve).catch(reject);
      video.onerror = () => reject(new Error('Video element failed to load.'));
    });

    container.appendChild(video);
    this._video = video;
    this._ready = true;

    return video;
  }

  get isReady() {
    return this._ready;
  }

  /** Returns the underlying HTMLVideoElement (null before init). */
  get videoElement() {
    return this._video;
  }

  destroy() {
    this._ready = false;
    if (this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
      this._stream = null;
    }
    if (this._video) {
      this._video.srcObject = null;
      this._video.remove();
      this._video = null;
    }
  }
}
