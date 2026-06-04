export function launchConfetti() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999';
  document.body.appendChild(canvas);

  const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
  resize();

  const ctx = canvas.getContext('2d');
  const COLORS = ['#8b7355','#b5926a','#8fa68a','#c4867a','#7a9ab5','#9b91b8','#c9b99a','#e8c4be','#ddd5f0'];
  const COUNT  = 130;

  const particles = Array.from({ length: COUNT }, () => ({
    x:     Math.random() * canvas.width,
    y:     -20 - Math.random() * 80,
    vx:    (Math.random() - 0.5) * 4,
    vy:    2.5 + Math.random() * 3.5,
    size:  5 + Math.random() * 9,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    angle: Math.random() * Math.PI * 2,
    spin:  (Math.random() - 0.5) * 0.22,
    shape: Math.random() > 0.45 ? 'rect' : 'circle',
    alpha: 1,
  }));

  let frame = 0;
  const TOTAL_FRAMES = 140;

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => {
      p.x     += p.vx;
      p.y     += p.vy;
      p.angle += p.spin;
      p.vy    += 0.06;
      p.alpha  = Math.max(0, 1 - frame / TOTAL_FRAMES);

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;

      if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size / 3.5, p.size, p.size / 3.5);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });

    frame++;
    if (frame < TOTAL_FRAMES) requestAnimationFrame(animate);
    else canvas.remove();
  }

  requestAnimationFrame(animate);
}
