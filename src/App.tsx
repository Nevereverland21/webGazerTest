import { useMemo } from 'react';
import { CONFIG } from './config/env';
import { getFixationRadiusPx } from './utils/math';
import { useWebGazer } from './hooks/useWebGazer';
import { useExperimentSession } from './hooks/useExperimentSession';
import { Orb } from './components/Orb';
import { Sidebar } from './components/Sidebar';

export default function App() {
  console.log(CONFIG.distance)
  const radiusPx = useMemo(() => getFixationRadiusPx(
    CONFIG.distance, CONFIG.diameter, CONFIG.hres, CONFIG.vres, CONFIG.alpha
  ), []);

  const { isReady, gazeData, trapboxWarning, recalibrate } = useWebGazer();
  
  const { logPos, orbState, visible, following, metrics } = useExperimentSession(
    isReady, gazeData, trapboxWarning, radiusPx
  );

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: '#0D0D0D', color: '#00FF00',
      fontFamily: 'monospace', overflow: 'hidden',
      position: 'relative',
    }}>
      {isReady && visible && (
        <Orb 
          pos={logPos} 
          radiusPx={radiusPx} 
          state={orbState} 
          following={following} 
          focusTime={metrics.focusTime} 
          trapboxWarning={trapboxWarning} 
        />
      )}

      <Sidebar 
        isReady={isReady}
        gazeData={gazeData}
        radiusPx={radiusPx}
        trapboxWarning={trapboxWarning}
        following={following}
        metrics={metrics}
        onRecalibrate={recalibrate}
      />
    </div>
  );
}