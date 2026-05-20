import { useState, useEffect, useRef } from 'react';
import { CONFIG } from '../config/env';

export type OrbState = 'compiling' | 'success' | 'error';

export function useExperimentSession(
  isReady: boolean, 
  gazeData: { x: number, y: number }, 
  trapboxWarning: boolean, 
  radiusPx: number
) {
  const [logPos, setLogPos] = useState({ x: 400, y: 300 });
  const [orbState, setOrbState] = useState<OrbState>('compiling');
  const [visible, setVisible] = useState(true);
  const [following, setFollowing] = useState(false);
  
  const [metrics, setMetrics] = useState({ focusTime: 0, selections: 0, abortions: 0 });

  const direction = useRef(1);
  const locked = useRef(false);
  const latestGaze = useRef(gazeData);
  const latestPos = useRef(logPos);
  useEffect(() => { latestGaze.current = gazeData; }, [gazeData]);
  useEffect(() => { latestPos.current = logPos; }, [logPos]);

  // 1. Movimiento del Orb
  useEffect(() => {
    let t = 0;
    const interval = setInterval(() => {
      t += 0.02 * direction.current;
      setLogPos({
        x: window.innerWidth / 2 + Math.cos(t) * 300,
        y: window.innerHeight / 2 + Math.sin(t) * 150
      });
    }, 50);
    return () => clearInterval(interval);
  }, []);

  // 2. Evaluación de Smooth Pursuit
  useEffect(() => {
    if (!isReady) return;
    const interval = setInterval(() => {
      if (trapboxWarning) {
        setFollowing(false);
        setMetrics(m => ({ ...m, focusTime: 0 }));
        return;
      }

      const dist = Math.hypot(latestGaze.current.x - latestPos.current.x, latestGaze.current.y - latestPos.current.y);
      const isFollowing = dist < radiusPx * 2;
      
      setFollowing(isFollowing);

      setMetrics(prev => {
        if (isFollowing) {
          const newTime = prev.focusTime + CONFIG.evalIntervalMs;
          return { ...prev, focusTime: newTime, selections: newTime >= CONFIG.focusRequiredMs ? prev.selections + 1 : prev.selections };
        }
        return { ...prev, focusTime: 0, abortions: prev.focusTime > 0 ? prev.abortions + 1 : prev.abortions };
      });
    }, CONFIG.evalIntervalMs);
    
    return () => clearInterval(interval);
  }, [isReady, trapboxWarning, radiusPx]);

  // 3. Máquina de estados (Éxito / Error)
  useEffect(() => {
    if (metrics.focusTime >= CONFIG.focusRequiredMs && orbState === 'compiling' && !locked.current) {
      locked.current = true;
      const isSuccess = Math.random() > 0.5;
      
      setOrbState(isSuccess ? 'success' : 'error');

      if (isSuccess) {
        setTimeout(() => {
          direction.current *= -1;
          setOrbState('compiling');
          setMetrics(m => ({ ...m, focusTime: 0 }));
          locked.current = false;
        }, 1500);
      }
    }
  }, [metrics.focusTime, orbState]);

  // 4. Reset manual con Espacio (solo en error)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && orbState === 'error') {
        setVisible(false);
        setTimeout(() => {
          direction.current = Math.random() > 0.5 ? 1 : -1;
          setOrbState('compiling');
          setMetrics(m => ({ ...m, focusTime: 0 }));
          setVisible(true);
          locked.current = false;
        }, 500);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [orbState]);

  return { logPos, orbState, visible, following, metrics };
}