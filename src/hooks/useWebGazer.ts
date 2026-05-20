import { useState, useEffect, useRef } from 'react';
import { CONFIG } from '../config/env';

export function useWebGazer() {
  const [isReady, setIsReady] = useState(false);
  const [gazeData, setGazeData] = useState({ x: 0, y: 0 });
  const [trapboxWarning, setTrapboxWarning] = useState(false);

  const initialized = useRef(false);
  const smoothedGaze = useRef({ x: 0, y: 0 });
  
  // Referencias para Trapbox
  const initialNosePos = useRef<{ x: number, y: number } | null>(null);
  const isViolated = useRef(false);
  const framesCount = useRef(0);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const initWebGazer = async () => {
      const wg = (window as any).webgazer;
      if (!wg) return;

      wg.setGazeListener((data: any) => {
        if (!data) return;

        // Filtro EMA
        smoothedGaze.current.x = (CONFIG.gazeAlpha * data.x) + ((1 - CONFIG.gazeAlpha) * smoothedGaze.current.x);
        smoothedGaze.current.y = (CONFIG.gazeAlpha * data.y) + ((1 - CONFIG.gazeAlpha) * smoothedGaze.current.y);
        setGazeData({ x: smoothedGaze.current.x, y: smoothedGaze.current.y });

        // Evaluación de Trapbox
        const tracker = wg.getTracker();
        const positions = tracker?.getPositions?.();
        
        if (positions?.length > 0) {
          framesCount.current++;
          if (framesCount.current < 40) return;

          const xs = positions.map((p: number[]) => p[0]);
          const ys = positions.map((p: number[]) => p[1]);
          const minX = Math.min(...xs), maxX = Math.max(...xs);
          const minY = Math.min(...ys), maxY = Math.max(...ys);
          
          const faceWidthPx = Math.abs(maxX - minX);
          if (faceWidthPx <= 0) return;

          const faceCenterX = minX + faceWidthPx / 2;
          const faceCenterY = minY + (maxY - minY) / 2;
          const faceScale = faceWidthPx / 150;

          if (!initialNosePos.current) {
            initialNosePos.current = { x: faceCenterX, y: faceCenterY };
          } else {
            const headDistPx = Math.hypot(faceCenterX - initialNosePos.current.x, faceCenterY - initialNosePos.current.y);
            const allowedMoveMm = 2 * CONFIG.distance * Math.tan((CONFIG.trapboxMarginDeg * Math.PI) / 360);
            
            isViolated.current = headDistPx > (allowedMoveMm * faceScale);
            setTrapboxWarning(isViolated.current);
          }
        }
      });

      try {
        await wg.begin();
        wg.showVideoPreview(true);
        wg.showPredictionPoints(true);
        setIsReady(true);
      } catch (error) {
        console.error("Error iniciando WebGazer:", error);
      }
    };

    initWebGazer();
    return () => {
      const wg = (window as any).webgazer;
      if (wg) { wg.pause(); wg.clearData(); }
    };
  }, []);

  const recalibrate = () => {
    initialNosePos.current = null;
    framesCount.current = 0;
    isViolated.current = false;
    setTrapboxWarning(false);
  };

  return { isReady, gazeData, trapboxWarning, recalibrate };
}