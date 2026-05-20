import { useEffect, useState, useRef, useMemo } from 'react';

// ─────────────────────────────────────────────
// Convierte un ángulo visual (grados) a píxeles
// usando las specs físicas del monitor y la distancia del usuario.
//
// Geometría:
//   pixelSizeMm = tamaño físico de un píxel en mm
//   radio_mm    = distance × tan(alpha)   ← proyección del ángulo a esa distancia
//   radio_px    = radio_mm / pixelSizeMm
//
// No depende de la cara — usa el monitor como regla física real.
// ─────────────────────────────────────────────
function visualAngleToPx(
  angleDeg: number,   // ángulo visual en grados (radio del cono)
  distanceMm: number, // distancia usuario-pantalla en mm
  diagonalIn: number, // diagonal del monitor en pulgadas
  hRes: number,       // resolución horizontal en píxeles
  vRes: number        // resolución vertical en píxeles
): number {
  const angleRad = (angleDeg * Math.PI) / 180;
  // Tamaño físico de un píxel: diagonal física / diagonal en píxeles
  const diagPx = Math.sqrt(hRes ** 2 + vRes ** 2);
  const diagMm = diagonalIn * 25.4;
  const pixelSizeMm = diagMm / diagPx;
  // Radio en mm a esa distancia para ese ángulo
  const radiusMm = distanceMm * Math.tan(angleRad);
  return Math.round((radiusMm / pixelSizeMm) * 100) / 100;
}

// ─────────────────────────────────────────────
// Convierte desplazamiento en píxeles (de la cámara) a ángulo visual.
//
// La cámara tiene su propia distancia focal (focalLengthPx).
// Si no la conocemos, la estimamos desde el tamaño de cara en cámara:
//   faceWidthPx en cámara ≈ faceWidthMm_real / distanceMm × focalLengthPx
//   → focalLengthPx ≈ faceWidthPx × distanceMm / faceWidthMm_real
//
// Luego: angle = atan(dispPx / focalLengthPx)
// ─────────────────────────────────────────────
function cameraDispToAngleDeg(
  dispPx: number,       // desplazamiento en píxeles de cámara
  focalLengthPx: number // distancia focal estimada de la cámara
): number {
  return (Math.atan(dispPx / focalLengthPx) * 180) / Math.PI;
}

// Tamaño anatómico promedio de una cara adulta (ancho bicigomático)
const FACE_WIDTH_MM = 150;

function App() {
  const [gazeData, setGazeData]           = useState({ x: 0, y: 0 });
  const [isReady, setIsReady]             = useState(false);
  const [following, setFollowing]         = useState(false);
  const [focusTime, setFocusTime]         = useState(0);
  const [selections, setSelections]       = useState(0);
  const [abortions, setAbortions]         = useState(0);
  const [trapboxWarning, setTrapboxWarning] = useState(false);
  const [headAngleDeg, setHeadAngleDeg]   = useState(0); // debug visual

  const webgazerInitialized = useRef(false);
  const gazeRef             = useRef({ x: 0, y: 0 });
  const smoothedGaze        = useRef({ x: 0, y: 0 });
  const logPosRef           = useRef({ x: 400, y: 300 });
  const [logPos, setLogPos] = useState({ x: 400, y: 300 });

  // Trapbox — ahora en ángulos visuales puros
  const initialFaceCenter = useRef<{ x: number; y: number } | null>(null);
  const focalLengthPxRef  = useRef<number | null>(null); // estimada desde cara
  const isTrapboxViolated = useRef<boolean>(false);
  const framesCountRef    = useRef(0);

  // ── Constantes ──────────────────────────────
  const FOCUS_REQUIRED_MS  = 800;
  const EVAL_INTERVAL_MS   = 100;
  const EMA_ALPHA          = 0.3;
  const TRAPBOX_ANGLE_DEG  = 3.0; // tolerancia de movimiento de cabeza en °
  const OBJECT_ALPHA_DEG   = 2.0; // radio del umbral de fixation en °

  const envConfig = useMemo(() => {
    const env = import.meta.env;
    return {
      distance: parseFloat(env.VITE_USER_DISTANCE_MM)   || 600,
      diameter: parseFloat(env.VITE_SCREEN_DIAGONAL_IN) || 15.6,
      hres:     parseFloat(env.VITE_SCREEN_HRES)        || 1920,
      vres:     parseFloat(env.VITE_SCREEN_VRES)        || 1080,
    };
  }, []);

  // Radio del umbral de fixation en píxeles de PANTALLA (correcto, usa specs del monitor)
  const fixationRadiusPx = useMemo(() => {
    return visualAngleToPx(
      OBJECT_ALPHA_DEG,
      envConfig.distance,
      envConfig.diameter,
      envConfig.hres,
      envConfig.vres
    );
  }, [envConfig]);

  // Mover el objeto en círculo
  useEffect(() => {
    let t = 0;
    const interval = setInterval(() => {
      t += 0.02;
      const x = window.innerWidth  / 2 + Math.cos(t) * 300;
      const y = window.innerHeight / 2 + Math.sin(t) * 150;
      logPosRef.current = { x, y };
      setLogPos({ x, y });
    }, 50);
    return () => clearInterval(interval);
  }, []);

  // Evaluar Smooth Pursuit
  useEffect(() => {
    if (!isReady) return;
    const interval = setInterval(() => {
      setTrapboxWarning(isTrapboxViolated.current);

      if (isTrapboxViolated.current) {
        setFollowing(false);
        setFocusTime(0);
        return;
      }

      const gaze = gazeRef.current;
      const log  = logPosRef.current;
      const dist = Math.sqrt((gaze.x - log.x) ** 2 + (gaze.y - log.y) ** 2);

      // Umbral de fixation: radio en px de PANTALLA (ángulo visual correcto)
      const isFollowing = dist < fixationRadiusPx;
      setFollowing(isFollowing);

      setFocusTime(prevTime => {
        if (isFollowing) {
          const newTime = prevTime + EVAL_INTERVAL_MS;
          if (newTime >= FOCUS_REQUIRED_MS) {
            setSelections(s => s + 1);
            return 0;
          }
          return newTime;
        } else {
          if (prevTime > 0) setAbortions(a => a + 1);
          return 0;
        }
      });
    }, EVAL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isReady, fixationRadiusPx]);

  // Inicializar WebGazer
  useEffect(() => {
    if (webgazerInitialized.current) return;
    webgazerInitialized.current = true;

    const initWebGazer = async () => {
      const wg = (window as any).webgazer;
      if (!wg) return;

      wg.setGazeListener((data: any) => {
        if (!data) return;

        // ── Suavizado EMA de la mirada ──────────
        smoothedGaze.current.x = EMA_ALPHA * data.x + (1 - EMA_ALPHA) * smoothedGaze.current.x;
        smoothedGaze.current.y = EMA_ALPHA * data.y + (1 - EMA_ALPHA) * smoothedGaze.current.y;
        gazeRef.current = { x: smoothedGaze.current.x, y: smoothedGaze.current.y };
        setGazeData({ x: smoothedGaze.current.x, y: smoothedGaze.current.y });

        // ── Trapbox en ángulos visuales puros ───
        const tracker = wg.getTracker();
        if (!tracker?.getPositions) return;

        const positions = tracker.getPositions();
        if (!positions || positions.length === 0) return;

        framesCountRef.current++;
        if (framesCountRef.current < 40) return; // descartar frames iniciales inestables

        // Bounding box de los landmarks faciales (en píxeles de CÁMARA)
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const [px, py] of positions) {
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }

        const faceWidthPx = maxX - minX;
        if (faceWidthPx <= 0) return;

        // Centro geométrico de la cara en la cámara
        const faceCenterX = minX + faceWidthPx / 2;
        const faceCenterY = minY + (maxY - minY) / 2;

        // ── Estimar distancia focal de la cámara ──
        // focalLengthPx = faceWidthPx × distance / FACE_WIDTH_MM
        // Esto asume que la cara real mide FACE_WIDTH_MM mm.
        // Solo se estima una vez (el primer frame válido) y se reutiliza.
        // Si el usuario se acerca/aleja, faceWidthPx cambia pero
        // también cambia la distancia real — se compensan mutuamente,
        // haciendo la estimación razonablemente estable.
        if (focalLengthPxRef.current === null) {
          focalLengthPxRef.current = (faceWidthPx * envConfig.distance) / FACE_WIDTH_MM;
        }

        // ── Fijar posición inicial de la cara ───
        if (!initialFaceCenter.current) {
          initialFaceCenter.current = { x: faceCenterX, y: faceCenterY };
          return;
        }

        // Desplazamiento de la cabeza en píxeles de CÁMARA
        const dispX = faceCenterX - initialFaceCenter.current.x;
        const dispY = faceCenterY - initialFaceCenter.current.y;
        const dispPx = Math.sqrt(dispX ** 2 + dispY ** 2);

        // Convertir ese desplazamiento a ángulo visual (grados)
        // usando la distancia focal estimada de la cámara
        const currentHeadAngle = cameraDispToAngleDeg(dispPx, focalLengthPxRef.current);

        setHeadAngleDeg(Math.round(currentHeadAngle * 10) / 10); // debug

        // Comparación directa en grados — sin conversiones adicionales
        isTrapboxViolated.current = currentHeadAngle > TRAPBOX_ANGLE_DEG;
      });

      try {
        await wg.begin();
        wg.showVideoPreview(true);
        wg.showPredictionPoints(true);
        setIsReady(true);
      } catch (error) {
        console.error(error);
      }
    };

    initWebGazer();

    return () => {
      const wg = (window as any).webgazer;
      if (wg) { wg.pause(); wg.clearData(); }
    };
  }, [envConfig.distance]);

  const handleRecalibrate = () => {
    initialFaceCenter.current  = null;
    focalLengthPxRef.current   = null; // re-estimar distancia focal también
    framesCountRef.current     = 0;
    isTrapboxViolated.current  = false;
    setTrapboxWarning(false);
    setHeadAngleDeg(0);
  };

  const progressPercent = Math.min((focusTime / FOCUS_REQUIRED_MS) * 100, 100);

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: '#0D0D0D', color: '#00FF00',
      fontFamily: 'monospace', overflow: 'hidden',
      position: 'relative',
    }}>
      {isReady && (
        <div style={{
          position: 'fixed', left: logPos.x, top: logPos.y,
          transform: 'translate(-50%, -50%)',
          width: fixationRadiusPx * 2, height: fixationRadiusPx * 2,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: following ? '#003300' : '#330000',
          border: `2px solid ${following ? '#00FF00' : '#FF3333'}`,
          fontSize: 14, color: following ? '#00FF00' : '#FF3333',
          pointerEvents: 'none', boxSizing: 'border-box', overflow: 'hidden',
          borderRadius: '50%', // círculo — más intuitivo para un umbral angular
        }}>
          <div style={{
            position: 'absolute', bottom: 0, left: 0,
            height: '10%', width: `${progressPercent}%`,
            background: '#00FF00', transition: 'width 0.1s linear'
          }} />
          <span style={{ zIndex: 1 }}>{trapboxWarning ? 'PAUSADO' : 'Tracking'}</span>
        </div>
      )}

      <div style={{
        position: 'fixed', top: 30, right: 20,
        display: 'flex', flexDirection: 'column', gap: 8,
        background: 'rgba(0,0,0,0.8)', padding: '15px', borderRadius: '8px',
        border: `1px solid ${trapboxWarning ? '#FF0000' : '#333'}`
      }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Fatiga Tracker</h2>

        {!isReady ? (
          <p>Cargando WebGazer...</p>
        ) : (
          <>
            <p style={{ margin: 0 }}>Gaze: ({Math.round(gazeData.x)}, {Math.round(gazeData.y)})</p>
            <p style={{ margin: 0 }}>
              Fixation {OBJECT_ALPHA_DEG}°: <strong>{fixationRadiusPx}px</strong>
            </p>
            <p style={{ margin: 0, color: trapboxWarning ? '#FF4444' : '#888' }}>
              Cabeza: <strong>{headAngleDeg}°</strong> / límite {TRAPBOX_ANGLE_DEG}°
            </p>

            {trapboxWarning ? (
              <p style={{ margin: 0, fontSize: 18, color: '#FF0000', fontWeight: 'bold' }}>
                ¡CABEZA FUERA DEL TRAPBOX!
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: 20, color: following ? '#00FF00' : '#FF3333' }}>
                {following ? `ENFOCANDO: ${focusTime}ms` : 'NO SIGUE'}
              </p>
            )}

            <button
              onClick={handleRecalibrate}
              style={{
                marginTop: '10px', padding: '8px', cursor: 'pointer',
                background: '#333', color: '#fff', border: '1px solid #555',
                borderRadius: '4px', fontFamily: 'monospace'
              }}>
              Recalibrar Postura
            </button>

            <hr style={{ width: '100%', borderColor: '#333' }} />

            <div style={{ margin: 0, color: '#00AAFF' }}>
              <strong>Métricas de Sesión:</strong>
              <ul style={{ margin: '5px 0 0 20px', padding: 0 }}>
                <li>Selecciones (Éxitos): {selections}</li>
                <li>Abandonos (Distracción): {abortions}</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;