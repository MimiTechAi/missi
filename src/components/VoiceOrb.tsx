"use client";

import { useRef, useEffect, useCallback } from "react";

type VoiceState = "idle" | "listening" | "thinking" | "speaking";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
}

const STATE_CONFIGS: Record<VoiceState, { hue: number; sat: number; light: number; pulseSpeed: number; rings: number; particleCount: number }> = {
  idle: { hue: 210, sat: 50, light: 55, pulseSpeed: 1.2, rings: 2, particleCount: 3 },
  listening: { hue: 0, sat: 75, light: 55, pulseSpeed: 1.5, rings: 3, particleCount: 12 },
  thinking: { hue: 38, sat: 85, light: 55, pulseSpeed: 0.6, rings: 3, particleCount: 10 },
  speaking: { hue: 210, sat: 75, light: 50, pulseSpeed: 1.8, rings: 3, particleCount: 15 },
};

export default function VoiceOrb({
  state,
  audioLevel = 0,
  size = 200,
  onClick,
}: {
  state: VoiceState;
  audioLevel?: number;
  size?: number;
  onClick?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const prevStateRef = useRef<VoiceState>(state);
  const transitionRef = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = size * dpr;
    const h = size * dpr;
    canvas.width = w;
    canvas.height = h;

    const config = STATE_CONFIGS[state];
    const cx = w / 2;
    const cy = h / 2;
    const baseRadius = w * 0.2;
    const time = timeRef.current;
    const al = Math.min(audioLevel, 1);

    // State transition
    if (prevStateRef.current !== state) {
      prevStateRef.current = state;
      transitionRef.current = 0;
    }
    transitionRef.current = Math.min(1, transitionRef.current + 0.03);

    ctx.clearRect(0, 0, w, h);

    // ── Outer ambient glow ──
    const glowRadius = baseRadius * (2.0 + al * 1.0);
    const glow = ctx.createRadialGradient(cx, cy, baseRadius * 0.3, cx, cy, glowRadius);
    glow.addColorStop(0, `hsla(${config.hue}, ${config.sat}%, ${config.light}%, ${0.08 + al * 0.05})`);
    glow.addColorStop(0.5, `hsla(${config.hue}, ${config.sat}%, ${config.light}%, ${0.02 + al * 0.02})`);
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // ── Pulsing rings ──
    for (let i = 0; i < config.rings; i++) {
      const phase = (time * config.pulseSpeed + i * 0.7) % (Math.PI * 2);
      const expand = Math.sin(phase) * 0.12 + al * 0.25;
      const ringR = baseRadius * (1.25 + i * 0.22) * (1 + expand);
      const alpha = Math.max(0, 0.12 - i * 0.025 + al * 0.08);

      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${config.hue}, ${config.sat}%, ${config.light + 15}%, ${alpha})`;
      ctx.lineWidth = (1.5 - i * 0.15) * dpr;
      ctx.stroke();
    }

    // ── Waveform ring (listening/speaking) ──
    if ((state === "speaking" || state === "listening") && al > 0.005) {
      const waveR = baseRadius * 1.12;
      const segs = 80;
      ctx.beginPath();
      for (let i = 0; i <= segs; i++) {
        const angle = (i / segs) * Math.PI * 2;
        const n1 = Math.sin(angle * 6 + time * 4) * al * baseRadius * 0.35;
        const n2 = Math.sin(angle * 11 + time * 2.5) * al * baseRadius * 0.18;
        const n3 = Math.sin(angle * 17 + time * 6) * al * baseRadius * 0.08;
        const r = waveR + n1 + n2 + n3;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = `hsla(${config.hue}, ${config.sat}%, ${config.light + 20}%, ${0.35 + al * 0.4})`;
      ctx.lineWidth = 1.8 * dpr;
      ctx.stroke();

      // Inner waveform
      ctx.beginPath();
      for (let i = 0; i <= segs; i++) {
        const angle = (i / segs) * Math.PI * 2;
        const n = Math.sin(angle * 9 - time * 3) * al * baseRadius * 0.2;
        const r = baseRadius * 1.05 + n;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = `hsla(${config.hue}, ${config.sat}%, ${config.light + 10}%, ${0.15 + al * 0.2})`;
      ctx.lineWidth = 1 * dpr;
      ctx.stroke();
    }

    // ── Main orb ──
    const orbR = baseRadius * (1 + al * 0.15 + Math.sin(time * config.pulseSpeed) * 0.03);

    // Orb shadow
    const shadow = ctx.createRadialGradient(cx, cy + orbR * 0.1, orbR * 0.8, cx, cy, orbR * 1.4);
    shadow.addColorStop(0, `hsla(${config.hue}, ${config.sat}%, ${Math.max(0, config.light - 20)}%, 0.3)`);
    shadow.addColorStop(1, "transparent");
    ctx.fillStyle = shadow;
    ctx.fillRect(0, 0, w, h);

    // Main gradient
    const orbGrad = ctx.createRadialGradient(
      cx - orbR * 0.25, cy - orbR * 0.25, 0,
      cx, cy, orbR
    );
    orbGrad.addColorStop(0, `hsla(${config.hue}, ${config.sat}%, ${config.light + 25}%, 0.95)`);
    orbGrad.addColorStop(0.4, `hsla(${config.hue}, ${config.sat}%, ${config.light + 10}%, 0.9)`);
    orbGrad.addColorStop(0.8, `hsla(${config.hue}, ${config.sat}%, ${config.light}%, 0.85)`);
    orbGrad.addColorStop(1, `hsla(${config.hue}, ${config.sat}%, ${Math.max(0, config.light - 15)}%, 0.8)`);

    ctx.beginPath();
    ctx.arc(cx, cy, orbR, 0, Math.PI * 2);
    ctx.fillStyle = orbGrad;
    ctx.fill();

    // Glass highlight
    ctx.beginPath();
    ctx.ellipse(cx - orbR * 0.1, cy - orbR * 0.35, orbR * 0.5, orbR * 0.25, -0.3, 0, Math.PI * 2);
    const hlGrad = ctx.createRadialGradient(
      cx - orbR * 0.1, cy - orbR * 0.35, 0,
      cx - orbR * 0.1, cy - orbR * 0.35, orbR * 0.5
    );
    hlGrad.addColorStop(0, "rgba(255,255,255,0.3)");
    hlGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = hlGrad;
    ctx.fill();

    // ── Thinking spinner ──
    if (state === "thinking") {
      const spinR = orbR * 1.2;
      const arcLen = 0.4 + Math.sin(time * 2) * 0.15;
      const startAngle = time * 3;
      
      ctx.beginPath();
      ctx.arc(cx, cy, spinR, startAngle, startAngle + Math.PI * arcLen);
      ctx.strokeStyle = `hsla(${config.hue}, ${config.sat}%, ${config.light + 20}%, 0.5)`;
      ctx.lineWidth = 2.5 * dpr;
      ctx.lineCap = "round";
      ctx.stroke();

      // Counter-rotating arc
      ctx.beginPath();
      ctx.arc(cx, cy, spinR * 0.95, -startAngle * 0.7, -startAngle * 0.7 + Math.PI * 0.3);
      ctx.strokeStyle = `hsla(${config.hue + 20}, ${config.sat}%, ${config.light + 10}%, 0.25)`;
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();
      ctx.lineCap = "butt";
    }

    // ── Particles ──
    const particles = particlesRef.current;
    // Spawn
    while (particles.length < config.particleCount) {
      const angle = Math.random() * Math.PI * 2;
      const dist = orbR * (1.1 + Math.random() * 0.5);
      particles.push({
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 0.5 * dpr,
        vy: (Math.random() - 0.5) * 0.5 * dpr - 0.3 * dpr,
        life: 1,
        maxLife: 60 + Math.random() * 90,
        size: (1 + Math.random() * 2) * dpr,
        hue: config.hue + (Math.random() - 0.5) * 30,
      });
    }
    // Remove excess
    while (particles.length > config.particleCount + 5) particles.shift();

    // Update & draw
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx + Math.sin(time * 2 + i) * 0.2 * dpr;
      p.y += p.vy;
      p.life -= 1 / p.maxLife;

      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      const alpha = p.life * 0.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, ${config.sat}%, ${config.light + 20}%, ${alpha})`;
      ctx.fill();
    }

    // ── State label ──
    const labels: Record<VoiceState, string> = {
      idle: "TAP OR SAY 'HEY MISSI'",
      listening: "LISTENING…",
      thinking: "THINKING…",
      speaking: "TAP TO STOP",
    };
    ctx.font = `600 ${9 * dpr}px ui-monospace, 'SF Mono', monospace`;
    ctx.textAlign = "center";
    ctx.letterSpacing = `${1.5 * dpr}px`;
    ctx.fillStyle = `hsla(${config.hue}, 20%, 50%, 0.4)`;
    ctx.fillText(labels[state], cx, cy + orbR + 24 * dpr);
    ctx.letterSpacing = "0px";

    timeRef.current += 0.016;
    animRef.current = requestAnimationFrame(draw);
  }, [state, audioLevel, size]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      onClick={onClick}
      className="cursor-pointer select-none"
      style={{ width: size, height: size }}
      role="button"
      aria-label={`Voice control: ${state}`}
    />
  );
}
