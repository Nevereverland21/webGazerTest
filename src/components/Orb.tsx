import type { OrbState } from '../hooks/useExperimentSession';
import { CONFIG } from '../config/env';

interface OrbProps {
  pos: { x: number; y: number };
  radiusPx: number;
  state: OrbState;
  following: boolean;
  focusTime: number;
  trapboxWarning: boolean;
}

export function Orb({ pos, radiusPx, state, following, focusTime, trapboxWarning }: OrbProps) {
  const progressPercent = Math.min((focusTime / CONFIG.focusRequiredMs) * 100, 100);
    console.log(radiusPx)
  const getColors = () => {
    if (state === 'success') return { bg: '#003366', border: '#00AAFF', text: '#00AAFF' };
    if (state === 'error') return { bg: '#660000', border: '#FF0000', text: '#FF0000' };
    return following 
      ? { bg: '#003300', border: '#00FF00', text: '#00FF00' }
      : { bg: '#330000', border: '#FF3333', text: '#FF3333' };
  };

  const colors = getColors();

  return (
    <div style={{
      position: 'fixed', left: pos.x, top: pos.y,
      transform: 'translate(-50%, -50%)',
      width: radiusPx * 2, height: radiusPx * 2,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: colors.bg,
      border: `2px solid ${colors.border}`,
      color: colors.text,
      fontSize: 14, pointerEvents: 'none', overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute', bottom: 0, left: 0,
        height: '10%', width: `${progressPercent}%`,
        background: '#00FF00', transition: 'width 0.1s linear'
      }} />
      <span style={{ zIndex: 1, fontWeight: 'bold' }}>
        {trapboxWarning ? 'PAUSADO' : state.toUpperCase()}
      </span>
    </div>
  );
}