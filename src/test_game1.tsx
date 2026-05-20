import { useEffect, useState, useRef } from 'react';

function App() {
  const [gazeData, setGazeData]     = useState({ x: 0, y: 0 });
  const [isReady, setIsReady]       = useState(false);
  const [following, setFollowing]   = useState(false);
  const webgazerInitialized         = useRef(false);
  const gazeRef                     = useRef({ x: 0, y: 0 });
  const logPosRef                   = useRef({ x: 400, y: 300 });
  const [logPos, setLogPos]         = useState({ x: 400, y: 300 });

  // mover el log en círculo
  useEffect(() => {
    let t = 0
    const interval = setInterval(() => {
      t += 0.02
      const x = window.innerWidth  / 2 + Math.cos(t) * 300
      const y = window.innerHeight / 2 + Math.sin(t) * 150
      logPosRef.current = { x, y }
      setLogPos({ x, y })
    }, 50)
    return () => clearInterval(interval)
  }, [])

  // evaluar smooth pursuit cada 100ms
  useEffect(() => {
    if (!isReady) return
    const interval = setInterval(() => {
      const gaze = gazeRef.current
      const log  = logPosRef.current
      const dist = Math.sqrt((gaze.x - log.x) ** 2 + (gaze.y - log.y) ** 2)
      const isFollowing = dist < 200  // umbral en px

      setFollowing(isFollowing)
    }, 100)
    return () => clearInterval(interval)
  }, [isReady])

  useEffect(() => {
    if (webgazerInitialized.current) return
    webgazerInitialized.current = true

    const initWebGazer = async () => {
      const wg = (window as any).webgazer
      if (!wg) return

      wg.setGazeListener((data: any) => {
        if (data) {
          gazeRef.current = { x: data.x, y: data.y }
          setGazeData({ x: data.x, y: data.y })
        }
      })

      try {
        await wg.begin()
        wg.showVideoPreview(true)
        wg.showPredictionPoints(true)
        setIsReady(true)
      } catch (error) {
        console.error(error)
      }
    }

    initWebGazer()

    return () => {
      const wg = (window as any).webgazer
      if (wg) { wg.pause(); wg.clearData() }
    }
  }, [])


  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: '#0D0D0D', color: '#00FF00',
      fontFamily: 'monospace', overflow: 'hidden',
      position: 'relative',
    }}>

      {/* log en movimiento */}
      {isReady && (
        <div style={{
          position: 'fixed',
          left: logPos.x, top: logPos.y,
          transform: 'translate(-50%, -50%)',
          background: following ? '#003300' : '#330000',
          border: `2px solid ${following ? '#00FF00' : '#FF3333'}`,
          padding: '8px 16px',
          fontFamily: 'monospace',
          fontSize: 18,
          color: following ? '#00FF00' : '#FF3333',
          pointerEvents: 'none',
        }}>
          Compiling...
        </div>
      )}

      {/* panel de info */}
      <div style={{
        position: 'fixed', top: 30, right: 20,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <h2 style={{ margin: 0 }}>WebGazer — Smooth Pursuit Demo</h2>

        {!isReady ? (
          <p>Cargando WebGazer...</p>
        ) : (
          <>
            <p style={{ margin: 0 }}>
              Gaze: ({Math.round(gazeData.x)}, {Math.round(gazeData.y)})
            </p>
            <p style={{ margin: 0, fontSize: 22, color: following ? '#00FF00' : '#FF3333' }}>
              {following ? 'SIGUIENDO' : 'NO sigue'}
            </p>
            <p style={{ margin: 0, color: '#555', fontSize: 11 }}>
              Haz varios clicks en distintas partes de la pantalla para calibrar
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default App