export const CONFIG = {
  distance: Number(import.meta.env.VITE_USER_DISTANCE_MM ?? 600),
  diameter: Number(import.meta.env.VITE_SCREEN_DIAGONAL_IN ?? 15.6),
  hres: Number(import.meta.env.VITE_SCREEN_HRES ?? 1920),
  vres: Number(import.meta.env.VITE_SCREEN_VRES ?? 1080),
  alpha: Number(import.meta.env.VITE_OBJECT_ALPHA_DEG ?? 2.0),

  focusRequiredMs: 3000,        // tiempo que debe el usuario mirar el objeto para cambiar de estado
  evalIntervalMs: 100,
  gazeAlpha: 0.3,
  trapboxMarginDeg: 3.0,
};