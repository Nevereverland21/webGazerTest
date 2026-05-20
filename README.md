# Visual Fatigue Tracker - Test

Un prototipo de investigación basado en web para medir la fatiga visual mediante **Smooth Pursuit** (seguimiento ocular continuo). Utiliza la cámara web estándar para rastrear la mirada del usuario por el seguimiento de un objeto dinamico a los factores pasados por ".env".

## Tecnologías

* **Frontend:** React + TypeScript.
* **Eye-Tracking:** WebGazer.js (procesamiento en el cliente).
---

##  Cómo arrancar el proyecto

1. **Clona el repositorio e instala las dependencias:**
   ```bash
   git clone https://github.com/Nevereverland21/webGazerTest.git
   cd webGazerTest
   npm install
   ```

2. **Configura tus variables de entorno:**
Crea un archivo .env en la raíz del proyecto (usa el archivo .env.example como referencia, ver sección de calibración abajo).

3. **Inicia el servidor de desarrollo:**
   ```bash
    npm run dev
   ```

## Calibración de Pantallas (Archivo `.env`)
El sistema **debe conocer las dimensiones físicas de tu hardware** para calcular los píxeles correctos.

Crea un archivo `.env` en la raíz y ajusta los valores. Aquí tienes un ejemplo y la explicación de cada variable:

```env
VITE_USER_DISTANCE_MM=600
VITE_SCREEN_DIAGONAL_IN=15.6
VITE_SCREEN_HRES=1920
VITE_SCREEN_VRES=1080
VITE_OBJECT_ALPHA_DEG=2.0
```
## ¿Cómo setear estos valores para diferentes pantallas?

| Variable | Descripción | Cómo medirlo / obtenerlo |
|---|---|---|
| `VITE_USER_DISTANCE_MM` | Distancia desde el ojo hasta la pantalla en milímetros. | Usa una cinta métrica. `600mm (60cm)` es el estándar para laptops/escritorio. |
| `VITE_SCREEN_DIAGONAL_IN` | Tamaño físico en pulgadas de la pantalla. | Busca el modelo de tu monitor/laptop en internet (ej. `14`, `15.6`, `24`, `27`). |
| `VITE_SCREEN_HRES` | Resolución Horizontal (Ancho). | Revisa la configuración de pantalla de tu SO (ej. `1920`, `2560`). |
| `VITE_SCREEN_VRES` | Resolución Vertical (Alto). | Revisa la configuración de pantalla de tu SO (ej. `1080`, `1440`). |
| `VITE_OBJECT_ALPHA_DEG` | Ángulo visual a evaluar en grados. | Se mantiene en `2.0` por defecto. |