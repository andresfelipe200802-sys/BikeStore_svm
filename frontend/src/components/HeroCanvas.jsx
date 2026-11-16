import { useEffect, useRef, useState } from 'react';
import { Icono } from './Iconos.jsx';

/**
 * Fondo <canvas> 2D orgánico ligero (estilo dinamosites) totalmente aislado de API/negocio.
 * Respeta prefers-reduced-motion, pausa fuera del viewport / en pestaña oculta y ofrece botón WCAG 2.2.2.
 */
export function HeroCanvas() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [pausadoManual, setPausadoManual] = useState(false);
  const pausadoManualRef = useRef(false);
  const sincronizarRef = useRef(null);

  pausadoManualRef.current = pausadoManual;

  useEffect(() => {
    sincronizarRef.current?.();
  }, [pausadoManual]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    if (!ctx) return undefined;

    const reduceMotionQuery =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;

    let enViewport = true;
    let rafId = 0;
    let tiempo = 0.8;

    const ajustarTamano = () => {
      const ancho = canvas.clientWidth || 1200;
      const alto = canvas.clientHeight || 640;
      canvas.width = ancho;
      canvas.height = alto;
    };

    const dibujarCuadro = (fase) => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = '#141414';
      ctx.fillRect(0, 0, w, h);

      const curvas = [
        { color: 'rgba(184, 255, 103, 0.24)', amplitud: h * 0.12, baseY: h * 0.42, freq: 0.0045, vel: 1 },
        { color: 'rgba(103, 232, 249, 0.12)', amplitud: h * 0.09, baseY: h * 0.56, freq: 0.0036, vel: 0.7 },
        { color: 'rgba(184, 255, 103, 0.1)', amplitud: h * 0.15, baseY: h * 0.68, freq: 0.0028, vel: -0.5 },
      ];

      for (const curva of curvas) {
        ctx.beginPath();
        ctx.strokeStyle = curva.color;
        ctx.lineWidth = 2;
        for (let x = 0; x <= w; x += 24) {
          const y = curva.baseY + Math.sin(x * curva.freq + fase * curva.vel) * curva.amplitud;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };

    ajustarTamano();
    dibujarCuadro(tiempo);

    const debeAnimar = () =>
      !pausadoManualRef.current &&
      enViewport &&
      !(typeof document !== 'undefined' && document.hidden) &&
      !reduceMotionQuery?.matches;

    const ciclo = () => {
      if (!debeAnimar()) return;
      tiempo += 0.014;
      dibujarCuadro(tiempo);
      rafId = requestAnimationFrame(ciclo);
    };

    const sincronizarCiclo = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (debeAnimar()) {
        rafId = requestAnimationFrame(ciclo);
      }
    };

    sincronizarRef.current = sincronizarCiclo;

    const observer =
      typeof IntersectionObserver !== 'undefined' && containerRef.current
        ? new IntersectionObserver((entries) => {
            enViewport = Boolean(entries[0]?.isIntersecting);
            sincronizarCiclo();
          })
        : null;

    if (observer && containerRef.current) observer.observe(containerRef.current);

    window.addEventListener('resize', ajustarTamano);
    document.addEventListener('visibilitychange', sincronizarCiclo);
    reduceMotionQuery?.addEventListener?.('change', sincronizarCiclo);
    sincronizarCiclo();

    return () => {
      sincronizarRef.current = null;
      if (rafId) cancelAnimationFrame(rafId);
      observer?.disconnect();
      window.removeEventListener('resize', ajustarTamano);
      document.removeEventListener('visibilitychange', sincronizarCiclo);
      reduceMotionQuery?.removeEventListener?.('change', sincronizarCiclo);
    };
  }, []);

  return (
    <div ref={containerRef} className="hero-fondo">
      <canvas ref={canvasRef} className="hero-lienzo" aria-hidden="true" />
      <button
        type="button"
        className="boton-pausa"
        onClick={() => setPausadoManual((prev) => !prev)}
      >
        <Icono tipo={pausadoManual ? 'reproducir' : 'pausa'} size={15} />
        <span>{pausadoManual ? 'Reanudar fondo animado' : 'Pausar fondo animado'}</span>
      </button>
    </div>
  );
}
