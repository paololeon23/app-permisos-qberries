/**
 * Firmas en canvas (touch + mouse)
 */
window.AV = window.AV || {};

AV.SignaturePad = class SignaturePad {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.drawing = false;
    this.empty = true;
    this._resize();
    this._bind();
    window.addEventListener('resize', () => this._resizePreserve());
  }

  _resize() {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(rect.width || 300, 280);
    const h = Math.max(rect.height || 140, 120);
    this.canvas.width = w * ratio;
    this.canvas.height = h * ratio;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = '#12261a';
    this.ctx.lineWidth = 2.2;
  }

  _resizePreserve() {
    const data = this.empty ? null : this.toDataURL();
    this._resize();
    if (data) {
      const img = new Image();
      img.onload = () => {
        this.ctx.drawImage(img, 0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
        this.empty = false;
      };
      img.src = data;
    }
  }

  _pos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }

  _bind() {
    const start = (e) => {
      e.preventDefault();
      this.drawing = true;
      const p = this._pos(e);
      this.ctx.beginPath();
      this.ctx.moveTo(p.x, p.y);
    };
    const move = (e) => {
      if (!this.drawing) return;
      e.preventDefault();
      const p = this._pos(e);
      this.ctx.lineTo(p.x, p.y);
      this.ctx.stroke();
      this.empty = false;
    };
    const end = () => {
      this.drawing = false;
    };

    this.canvas.addEventListener('mousedown', start);
    this.canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    this.canvas.addEventListener('touchstart', start, { passive: false });
    this.canvas.addEventListener('touchmove', move, { passive: false });
    this.canvas.addEventListener('touchend', end);
  }

  clear() {
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width || this.canvas.width, rect.height || this.canvas.height);
    this.empty = true;
  }

  isEmpty() {
    return this.empty;
  }

  toDataURL() {
    return this.canvas.toDataURL('image/png');
  }
};
