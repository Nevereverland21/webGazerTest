interface SidebarProps {
  isReady: boolean;
  gazeData: { x: number; y: number };
  radiusPx: number;
  trapboxWarning: boolean;
  following: boolean;
  metrics: { focusTime: number; selections: number; abortions: number };
  onRecalibrate: () => void;
}

export function Sidebar({ isReady, gazeData, radiusPx, trapboxWarning, following, metrics, onRecalibrate }: SidebarProps) {
  return (
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
          <p style={{ margin: 0 }}>Umbral 2° Visual: <strong>{radiusPx}px</strong></p>
          
          {trapboxWarning ? (
            <p style={{ margin: 0, fontSize: 18, color: '#FF0000', fontWeight: 'bold' }}>
              ¡CABEZA FUERA DEL TRAPBOX!
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 20, color: following ? '#00FF00' : '#FF3333' }}>
              {following ? `ENFOCANDO: ${metrics.focusTime}ms` : 'NO SIGUE'}
            </p>
          )}
          
          <button onClick={onRecalibrate} style={{
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
              <li>Selecciones (Éxitos): {metrics.selections}</li>
              <li>Abandonos (Distracción): {metrics.abortions}</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}