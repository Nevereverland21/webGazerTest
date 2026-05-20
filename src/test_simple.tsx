import { useEffect, useState, useRef } from 'react';

function App() {
  const [gazeData, setGazeData] = useState({ x: 0, y: 0 });
  const [isReady, setIsReady] = useState(false);
  const webgazerInitialized = useRef(false);

  useEffect(() => {
    if (webgazerInitialized.current) return;
    webgazerInitialized.current = true;

const initWebGazer = async () => {
      const wg = (window as any).webgazer;

      if (!wg) {
        console.error("WebGazer no cargó desde el index.html");
        return;
      }

      // Configuramos el listener
      wg.setGazeListener((data: any) => {
        if (data) {
          setGazeData({ x: data.x, y: data.y });
        }
      });

      try {
        // Iniciamos el motor
        await wg.begin();
        wg.showVideoPreview(true);
        wg.showPredictionPoints(true);
        setIsReady(true);
      } catch (error) {
        console.error("Error crítico al iniciar WebGazer:", error);
      }
    };

    initWebGazer();

    return () => {
      const wg = (window as any).webgazer;
      if (wg) {
        wg.pause();
        wg.clearData();
      }
    };
  }, []);

  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      backgroundColor: '#0D0D0D', 
      color: '#00FF00', 
      fontFamily: 'monospace' 
    }}>
      <h1>Test de WebGazer (MediaPipe Engine)</h1>
      
      {!isReady ? (
        <p>Cargando WebGazer...</p>
      ) : (
        <>
          <div style={{ border: '1px solid #00FF00', padding: '20px', marginTop: '20px', textAlign: 'center' }}>
            <h2>Datos en Vivo</h2>
            <p style={{ fontSize: '24px' }}>X: {Math.round(gazeData.x)}px</p>
            <p style={{ fontSize: '24px' }}>Y: {Math.round(gazeData.y)}px</p>
          </div>
        </>
      )}
    </div>
  );
}

export default App;