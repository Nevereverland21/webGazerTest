import { useEffect, useState, useRef, useMemo, useCallback } from 'react';

function visualAngleToPx(
  angleDeg: number,
  distanceMm: number,
  diagonalIn: number,
  hRes: number,
  vRes: number
): number {
  const angleRad = (angleDeg * Math.PI) / 180;
  const diagPx = Math.sqrt(hRes ** 2 + vRes ** 2);
  const diagMm = diagonalIn * 25.4;
  const pixelSizeMm = diagMm / diagPx;
  const radiusMm = distanceMm * Math.tan(angleRad);
  return Math.round((radiusMm / pixelSizeMm) * 100) / 100;
}

function cameraDispToAngleDeg(dispPx: number, focalLengthPx: number): number {
  return (Math.atan(dispPx / focalLengthPx) * 180) / Math.PI;
}

function screenPxToVisualAngleDeg(
  dispPx: number,
  distanceMm: number,
  diagonalIn: number,
  hRes: number,
  vRes: number
): number {
  const diagPx = Math.sqrt(hRes ** 2 + vRes ** 2);
  const diagMm = diagonalIn * 25.4;
  const pixelSizeMm = diagMm / diagPx;
  const dispMm = dispPx * pixelSizeMm;
  return (Math.atan(dispMm / distanceMm) * 180) / Math.PI;
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const FACE_WIDTH_MM = 150;

type Phase =
  | 'init'
  | 'face_position'
  | 'calibration_fixation'
  | 'calibration_pursuit'
  | 'validation'
  | 'ready'
  | 'task';

const FIXATION_POINTS: Array<[number, number]> = [
  [0.15, 0.15], [0.5, 0.15], [0.85, 0.15],
  [0.15, 0.5],  [0.5, 0.5],  [0.85, 0.5],
  [0.15, 0.85], [0.5, 0.85], [0.85, 0.85],
  [0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7],
];
const CLICKS_PER_FIXATION_POINT = 5;
const PURSUIT_DURATION_MS = 18000;
const VALIDATION_POINTS: Array<[number, number]> = [
  [0.2, 0.2], [0.8, 0.2], [0.5, 0.5], [0.2, 0.8], [0.8, 0.8],
];
const VALIDATION_TIME_PER_POINT_MS = 2000;
const VALIDATION_SACCADE_MS = 1000;
const VALIDATION_THRESHOLD_DEG = 5.0;

function App() {
  const [phase, setPhase] = useState<Phase>('init');
  const [gazeData, setGazeData] = useState({ x: 0, y: 0 });
  const [following, setFollowing] = useState(false);
  const [focusTime, setFocusTime] = useState(0);
  const [selections, setSelections] = useState(0);
  const [abortions, setAbortions] = useState(0);
  const [trapboxWarning, setTrapboxWarning] = useState(false);
  const [headAngleDeg, setHeadAngleDeg] = useState(0);

  const [fixationIdx, setFixationIdx] = useState(0);
  const [fixationClicks, setFixationClicks] = useState(0);
  const [pursuitProgress, setPursuitProgress] = useState(0);
  const [validationIdx, setValidationIdx] = useState(0);
  const [validationError, setValidationError] = useState<number | null>(null);

  const webgazerInitialized = useRef(false);
  const gazeRef = useRef({ x: 0, y: 0 });
  const smoothedGaze = useRef({ x: 0, y: 0 });
  const gazeBufferRef = useRef<Array<{ x: number; y: number }>>([]);
  const logPosRef = useRef({ x: 400, y: 300 });
  const pursuitPosRef = useRef({ x: 0, y: 0 });
  const validationSamplesRef = useRef<Array<{ gx: number; gy: number; tx: number; ty: number }>>([]);
  const [logPos, setLogPos] = useState({ x: 400, y: 300 });

  const initialFaceCenter = useRef<{ x: number; y: number } | null>(null);
  const focalLengthSamplesRef = useRef<number[]>([]);
  const focalLengthPxRef = useRef<number | null>(null);
  const isTrapboxViolated = useRef<boolean>(false);
  const framesCountRef = useRef(0);
  const facePresentRef = useRef<boolean>(false);

  const FOCUS_REQUIRED_MS = 800;
  const EVAL_INTERVAL_MS = 100;
  const EMA_ALPHA = 0.15;
  const MEDIAN_WINDOW = 5;
  const TRAPBOX_ANGLE_DEG = 3.0;
  const OBJECT_ALPHA_DEG = 4.0;
  const FOCAL_CALIBRATION_FRAMES = 60;
  const MIN_ABORTION_TIME_MS = 200;

  const envConfig = useMemo(() => {
    const env = import.meta.env;
    return {
      distance: parseFloat(env.VITE_USER_DISTANCE_MM) || 600,
      diameter: parseFloat(env.VITE_SCREEN_DIAGONAL_IN) || 15.6,
      hres: parseFloat(env.VITE_SCREEN_HRES) || 1920,
      vres: parseFloat(env.VITE_SCREEN_VRES) || 1080,
    };
  }, []);

  const fixationRadiusPx = useMemo(() => {
    return visualAngleToPx(
      OBJECT_ALPHA_DEG,
      envConfig.distance,
      envConfig.diameter,
      envConfig.hres,
      envConfig.vres
    );
  }, [envConfig]);

  useEffect(() => {
    if (phase !== 'task') return;
    let t = 0;
    const interval = setInterval(() => {
      t += 0.02;
      const x = window.innerWidth / 2 + Math.cos(t) * 300;
      const y = window.innerHeight / 2 + Math.sin(t) * 150;
      logPosRef.current = { x, y };
      setLogPos({ x, y });
    }, 50);
    return () => clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'task') return;
    const interval = setInterval(() => {
      setTrapboxWarning(isTrapboxViolated.current);

      if (isTrapboxViolated.current) {
        setFollowing(false);
        setFocusTime(0);
        return;
      }

      const gaze = gazeRef.current;
      const log = logPosRef.current;
      const dist = Math.sqrt((gaze.x - log.x) ** 2 + (gaze.y - log.y) ** 2);
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
          if (prevTime >= MIN_ABORTION_TIME_MS) setAbortions(a => a + 1);
          return 0;
        }
      });
    }, EVAL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [phase, fixationRadiusPx]);

  useEffect(() => {
    if (webgazerInitialized.current) return;
    webgazerInitialized.current = true;

    const initWebGazer = async () => {
      const wg = (window as any).webgazer;
      if (!wg) return;

      wg.setGazeListener((data: any) => {
        const tracker = wg.getTracker();
        const positions = tracker?.getPositions ? tracker.getPositions() : null;
        facePresentRef.current = !!(positions && positions.length > 0);

        if (!data) return;

        gazeBufferRef.current.push({ x: data.x, y: data.y });
        if (gazeBufferRef.current.length > MEDIAN_WINDOW) gazeBufferRef.current.shift();

        const medianX = median(gazeBufferRef.current.map(p => p.x));
        const medianY = median(gazeBufferRef.current.map(p => p.y));

        smoothedGaze.current.x = EMA_ALPHA * medianX + (1 - EMA_ALPHA) * smoothedGaze.current.x;
        smoothedGaze.current.y = EMA_ALPHA * medianY + (1 - EMA_ALPHA) * smoothedGaze.current.y;
        gazeRef.current = { x: smoothedGaze.current.x, y: smoothedGaze.current.y };
        setGazeData({ x: smoothedGaze.current.x, y: smoothedGaze.current.y });

        if (!positions || positions.length === 0) return;

        framesCountRef.current++;

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const [px, py] of positions) {
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }

        const faceWidthPx = maxX - minX;
        if (faceWidthPx <= 0) return;

        const faceCenterX = minX + faceWidthPx / 2;
        const faceCenterY = minY + (maxY - minY) / 2;

        if (focalLengthSamplesRef.current.length < FOCAL_CALIBRATION_FRAMES) {
          focalLengthSamplesRef.current.push((faceWidthPx * envConfig.distance) / FACE_WIDTH_MM);
          return;
        }

        if (focalLengthPxRef.current === null) {
          focalLengthPxRef.current = median(focalLengthSamplesRef.current);
        }

        if (!initialFaceCenter.current) {
          initialFaceCenter.current = { x: faceCenterX, y: faceCenterY };
          return;
        }

        const dispX = faceCenterX - initialFaceCenter.current.x;
        const dispY = faceCenterY - initialFaceCenter.current.y;
        const dispPx = Math.sqrt(dispX ** 2 + dispY ** 2);
        const currentHeadAngle = cameraDispToAngleDeg(dispPx, focalLengthPxRef.current);

        setHeadAngleDeg(Math.round(currentHeadAngle * 10) / 10);
        isTrapboxViolated.current = currentHeadAngle > TRAPBOX_ANGLE_DEG;
      });

      try {
        await wg.begin();
        wg.showVideoPreview(true);
        wg.showPredictionPoints(false);
        wg.showFaceOverlay(true);
        wg.showFaceFeedbackBox(true);
        setPhase('face_position');
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

  const startCalibration = useCallback(() => {
    const wg = (window as any).webgazer;
    if (wg) {
      wg.showVideoPreview(false);
      wg.showFaceOverlay(false);
      wg.showFaceFeedbackBox(false);
      if (typeof wg.removeMouseEventListeners === 'function') {
        wg.removeMouseEventListeners();
      }
      if (typeof wg.clearData === 'function') {
        wg.clearData();
      }
    }
    setPhase('calibration_fixation');
    setFixationIdx(0);
    setFixationClicks(0);
  }, []);

  const handleFixationClick = useCallback(() => {
    const wg = (window as any).webgazer;
    const [px, py] = FIXATION_POINTS[fixationIdx];
    const cx = px * window.innerWidth;
    const cy = py * window.innerHeight;
    if (wg && typeof wg.recordScreenPosition === 'function') {
      wg.recordScreenPosition(cx, cy, 'click');
    }
    const next = fixationClicks + 1;
    if (next >= CLICKS_PER_FIXATION_POINT) {
      if (fixationIdx + 1 >= FIXATION_POINTS.length) {
        setPhase('calibration_pursuit');
        setPursuitProgress(0);
      } else {
        setFixationIdx(fixationIdx + 1);
        setFixationClicks(0);
      }
    } else {
      setFixationClicks(next);
    }
  }, [fixationClicks, fixationIdx]);

  useEffect(() => {
    if (phase !== 'calibration_pursuit') return;
    const wg = (window as any).webgazer;
    if (!wg) return;

    const startTime = Date.now();
    let raf: number;
    let lastRecord = 0;
    const RECORD_INTERVAL_MS = 100;

    const lissajous = (t: number) => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const margin = 100;
      const cx = W / 2;
      const cy = H / 2;
      const ax = (W - margin * 2) / 2;
      const ay = (H - margin * 2) / 2;
      const x = cx + ax * Math.sin(3 * t);
      const y = cy + ay * Math.sin(2 * t + Math.PI / 2);
      return { x, y };
    };

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / PURSUIT_DURATION_MS, 1);
      setPursuitProgress(progress);

      const t = (elapsed / 1000) * 0.8;
      const pos = lissajous(t);
      pursuitPosRef.current = pos;

      if (elapsed - lastRecord >= RECORD_INTERVAL_MS) {
        lastRecord = elapsed;
        if (typeof wg.recordScreenPosition === 'function') {
          wg.recordScreenPosition(pos.x, pos.y, 'click');
        }
      }

      if (progress >= 1) {
        setPhase('validation');
        setValidationIdx(0);
        validationSamplesRef.current = [];
        return;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'validation') return;

    const point = VALIDATION_POINTS[validationIdx];
    const tx = point[0] * window.innerWidth;
    const ty = point[1] * window.innerHeight;

    const saccadeTimer = setTimeout(() => {
      const sampleInterval = setInterval(() => {
        const g = gazeRef.current;
        validationSamplesRef.current.push({ gx: g.x, gy: g.y, tx, ty });
      }, 50);

      const endTimer = setTimeout(() => {
        clearInterval(sampleInterval);
        if (validationIdx + 1 >= VALIDATION_POINTS.length) {
          const errors = validationSamplesRef.current.map(s => {
            const dispPx = Math.sqrt((s.gx - s.tx) ** 2 + (s.gy - s.ty) ** 2);
            return screenPxToVisualAngleDeg(
              dispPx,
              envConfig.distance,
              envConfig.diameter,
              envConfig.hres,
              envConfig.vres
            );
          });
          const meanError = errors.reduce((a, b) => a + b, 0) / errors.length;
          setValidationError(meanError);
          setPhase('ready');
        } else {
          setValidationIdx(validationIdx + 1);
        }
      }, VALIDATION_TIME_PER_POINT_MS);

      return () => {
        clearInterval(sampleInterval);
        clearTimeout(endTimer);
      };
    }, VALIDATION_SACCADE_MS);

    return () => clearTimeout(saccadeTimer);
  }, [phase, validationIdx, envConfig]);

  const startTask = useCallback(() => {
    const wg = (window as any).webgazer;
    if (wg && typeof wg.removeMouseEventListeners === 'function') {
      wg.removeMouseEventListeners();
    }
    if (wg) {
      wg.showVideoPreview(false);
      wg.showFaceOverlay(false);
      wg.showFaceFeedbackBox(false);
    }
    framesCountRef.current = 0;
    initialFaceCenter.current = null;
    isTrapboxViolated.current = false;
    setTrapboxWarning(false);
    setSelections(0);
    setAbortions(0);
    setPhase('task');
  }, []);

  const recalibrate = useCallback(() => {
    const wg = (window as any).webgazer;
    if (wg) {
      wg.clearData();
      wg.showVideoPreview(true);
      wg.showFaceOverlay(true);
      wg.showFaceFeedbackBox(true);
    }
    focalLengthSamplesRef.current = [];
    focalLengthPxRef.current = null;
    initialFaceCenter.current = null;
    framesCountRef.current = 0;
    isTrapboxViolated.current = false;
    setTrapboxWarning(false);
    setHeadAngleDeg(0);
    setValidationError(null);
    setPhase('face_position');
  }, []);

  const handlePostureRecalibrate = useCallback(() => {
    initialFaceCenter.current = null;
    isTrapboxViolated.current = false;
    setTrapboxWarning(false);
    setHeadAngleDeg(0);
  }, []);

  const progressPercent = Math.min((focusTime / FOCUS_REQUIRED_MS) * 100, 100);

  const containerStyle: React.CSSProperties = {
    width: '100vw', height: '100vh',
    background: '#0D0D0D', color: '#00FF00',
    fontFamily: 'monospace', overflow: 'hidden',
    position: 'relative',
    cursor: phase === 'task' ? 'none' : 'default',
  };

  if (phase === 'init') {
    return (
      <div style={containerStyle}>
        <div style={centeredPanel}>
          <h1>Cargando WebGazer...</h1>
        </div>
      </div>
    );
  }

  if (phase === 'face_position') {
    return (
      <div style={containerStyle}>
        <div style={centeredPanel}>
          <h1>Posiciona tu rostro</h1>
          <p>Mira al recuadro de la cámara y asegúrate de que tu cara está bien centrada y bien iluminada.</p>
          <p>Mantén la cabeza quieta a unos {Math.round(envConfig.distance / 10)} cm de la pantalla.</p>
          <p style={{ color: '#00FFAA' }}>Esperando estabilizar landmarks faciales: {Math.min(focalLengthSamplesRef.current.length, FOCAL_CALIBRATION_FRAMES)}/{FOCAL_CALIBRATION_FRAMES}</p>
          <button
            onClick={startCalibration}
            disabled={focalLengthSamplesRef.current.length < FOCAL_CALIBRATION_FRAMES}
            style={buttonStyle}>
            Comenzar Calibración
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'calibration_fixation') {
    const [px, py] = FIXATION_POINTS[fixationIdx];
    const cx = px * window.innerWidth;
    const cy = py * window.innerHeight;
    const clickRatio = fixationClicks / CLICKS_PER_FIXATION_POINT;

    return (
      <div style={containerStyle}>
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          fontSize: 14, color: '#888', textAlign: 'center',
          background: 'rgba(0,0,0,0.8)', padding: '8px 16px', borderRadius: 6,
        }}>
          Calibración 1/3 — Punto {fixationIdx + 1}/{FIXATION_POINTS.length} — Clicks {fixationClicks}/{CLICKS_PER_FIXATION_POINT}
          <div style={{ fontSize: 12, marginTop: 4 }}>Mira el punto y haz click {CLICKS_PER_FIXATION_POINT} veces</div>
        </div>
        <div
          onClick={handleFixationClick}
          style={{
            position: 'fixed', left: cx, top: cy,
            transform: 'translate(-50%, -50%)',
            width: 30, height: 30, borderRadius: '50%',
            background: `conic-gradient(#00FF00 ${clickRatio * 360}deg, #003300 0)`,
            border: '2px solid #00FF00',
            cursor: 'pointer',
          }} />
      </div>
    );
  }

  if (phase === 'calibration_pursuit') {
    return (
      <div style={containerStyle}>
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          fontSize: 14, color: '#888', textAlign: 'center',
          background: 'rgba(0,0,0,0.8)', padding: '8px 16px', borderRadius: 6,
        }}>
          Calibración 2/3 — Sigue el punto con la mirada
          <div style={{ fontSize: 12, marginTop: 4 }}>{Math.round(pursuitProgress * 100)}%</div>
        </div>
        <div style={{
          position: 'fixed', left: pursuitPosRef.current.x, top: pursuitPosRef.current.y,
          transform: 'translate(-50%, -50%)',
          width: 24, height: 24, borderRadius: '50%',
          background: '#00FFAA', border: '2px solid #FFFFFF',
          boxShadow: '0 0 20px #00FFAA',
        }} />
        <div style={{
          position: 'fixed', bottom: 20, left: '10%', width: '80%',
          height: 6, background: '#222', borderRadius: 3,
        }}>
          <div style={{ width: `${pursuitProgress * 100}%`, height: '100%', background: '#00FFAA', borderRadius: 3 }} />
        </div>
      </div>
    );
  }

  if (phase === 'validation') {
    const [px, py] = VALIDATION_POINTS[validationIdx];
    const cx = px * window.innerWidth;
    const cy = py * window.innerHeight;

    return (
      <div style={containerStyle}>
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          fontSize: 14, color: '#888', textAlign: 'center',
          background: 'rgba(0,0,0,0.8)', padding: '8px 16px', borderRadius: 6,
        }}>
          Calibración 3/3 — Validación — Punto {validationIdx + 1}/{VALIDATION_POINTS.length}
          <div style={{ fontSize: 12, marginTop: 4 }}>Mira el punto sin hacer click</div>
        </div>
        <div style={{
          position: 'fixed', left: cx, top: cy,
          transform: 'translate(-50%, -50%)',
          width: 20, height: 20, borderRadius: '50%',
          background: '#FFAA00', border: '2px solid #FFFFFF',
        }} />
      </div>
    );
  }

  if (phase === 'ready') {
    const errorOk = validationError !== null && validationError < VALIDATION_THRESHOLD_DEG;
    return (
      <div style={containerStyle}>
        <div style={centeredPanel}>
          <h1>Calibración completada</h1>
          <p>Error medio de validación: <strong style={{ color: errorOk ? '#00FF00' : '#FF8800' }}>
            {validationError !== null ? validationError.toFixed(2) : '?'}°
          </strong></p>
          <p style={{ color: '#888' }}>Umbral aceptable: &lt; {VALIDATION_THRESHOLD_DEG}°</p>
          {!errorOk && <p style={{ color: '#FF8800' }}>La calibración es marginal. Considera recalibrar.</p>}
          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <button onClick={startTask} style={buttonStyle}>Comenzar Tarea</button>
            <button onClick={recalibrate} style={{ ...buttonStyle, background: '#553300' }}>Recalibrar</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={{
        position: 'fixed', left: logPos.x, top: logPos.y,
        transform: 'translate(-50%, -50%)',
        width: fixationRadiusPx * 2, height: fixationRadiusPx * 2,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: following ? '#003300' : '#330000',
        border: `2px solid ${following ? '#00FF00' : '#FF3333'}`,
        fontSize: 14, color: following ? '#00FF00' : '#FF3333',
        pointerEvents: 'none', boxSizing: 'border-box', overflow: 'hidden',
        borderRadius: '50%',
      }}>
        <div style={{
          position: 'absolute', bottom: 0, left: 0,
          height: '10%', width: `${progressPercent}%`,
          background: '#00FF00', transition: 'width 0.1s linear'
        }} />
        <span style={{ zIndex: 1 }}>{trapboxWarning ? 'PAUSADO' : 'Tracking'}</span>
      </div>

      <div style={{
        position: 'fixed', top: 30, right: 20,
        display: 'flex', flexDirection: 'column', gap: 8,
        background: 'rgba(0,0,0,0.8)', padding: '15px', borderRadius: '8px',
        border: `1px solid ${trapboxWarning ? '#FF0000' : '#333'}`,
        cursor: 'default',
      }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Fatiga Tracker</h2>
        <p style={{ margin: 0 }}>Gaze: ({Math.round(gazeData.x)}, {Math.round(gazeData.y)})</p>
        <p style={{ margin: 0 }}>Objeto: ({Math.round(logPos.x)}, {Math.round(logPos.y)})</p>
        <p style={{ margin: 0 }}>Distancia: {Math.round(Math.sqrt((gazeData.x - logPos.x) ** 2 + (gazeData.y - logPos.y) ** 2))}px</p>
        <p style={{ margin: 0 }}>Fixation {OBJECT_ALPHA_DEG}°: <strong>{fixationRadiusPx}px</strong></p>
        <p style={{ margin: 0 }}>Error validación: <strong>{validationError?.toFixed(2)}°</strong></p>
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

        <button onClick={handlePostureRecalibrate} style={buttonStyle}>
          Recalibrar Postura
        </button>
        <button onClick={recalibrate} style={{ ...buttonStyle, background: '#553300' }}>
          Recalibrar TODO
        </button>

        <hr style={{ width: '100%', borderColor: '#333' }} />

        <div style={{ margin: 0, color: '#00AAFF' }}>
          <strong>Métricas de Sesión:</strong>
          <ul style={{ margin: '5px 0 0 20px', padding: 0 }}>
            <li>Selecciones: {selections}</li>
            <li>Abandonos: {abortions}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

const centeredPanel: React.CSSProperties = {
  position: 'absolute', top: '50%', left: '50%',
  transform: 'translate(-50%, -50%)',
  textAlign: 'center', maxWidth: 600,
};

const buttonStyle: React.CSSProperties = {
  marginTop: '10px', padding: '10px 20px', cursor: 'pointer',
  background: '#333', color: '#fff', border: '1px solid #555',
  borderRadius: '4px', fontFamily: 'monospace', fontSize: 14,
};

export default App;