/**
 * Living sky: real sun position via the Cesium clock (time-of-day + optional
 * day/night cycle) and light, mood-over-realism weather presets.
 */
import { JulianDate } from 'cesium';
import { audio } from '../audio/audio.js';

function createRainOverlay() {
  const el = document.createElement('div');
  el.id = 'rainOverlay';
  el.style.opacity = '0';
  document.body.appendChild(el);
  return el;
}

export function createEnvironment(viewer) {
  const { scene, clock } = viewer;
  const rainEl = createRainOverlay();
  let weather = 'clear';

  // Remember the default fog density so "clear" restores it exactly.
  const baseFog = scene.fog.density;

  function setTimeOfDay(hours) {
    const d = new Date();
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    clock.currentTime = JulianDate.fromDate(
      new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m)),
    );
  }

  function setDayCycle(on, multiplier = 1800) {
    clock.shouldAnimate = on;
    clock.multiplier = multiplier;
  }

  function setWeather(w) {
    weather = w;
    const atm = scene.skyAtmosphere;
    if (w === 'cloudy') {
      scene.fog.density = baseFog * 3;
      atm.brightnessShift = -0.22;
      rainEl.style.opacity = '0';
      document.body.classList.add('overcast');
      audio.setRain(0);
    } else if (w === 'rain') {
      scene.fog.density = baseFog * 4.5;
      atm.brightnessShift = -0.38;
      rainEl.style.opacity = '1';
      document.body.classList.add('overcast');
      audio.setRain(1);
    } else {
      scene.fog.density = baseFog;
      atm.brightnessShift = 0;
      rainEl.style.opacity = '0';
      document.body.classList.remove('overcast');
      audio.setRain(0);
    }
  }

  return { setTimeOfDay, setDayCycle, setWeather, getWeather: () => weather };
}
