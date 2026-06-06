/** Vehicle HUD: speed, heading/compass, altitude and throttle. */

function cardinal(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

export function createHud() {
  const el = document.createElement('div');
  el.id = 'hud';
  el.hidden = true;
  el.innerHTML = `
    <div class="hud-grid">
      <div class="hud-cell"><span class="hud-val" id="hudSpeed">0</span><span class="hud-lbl">km/h</span></div>
      <div class="hud-cell"><span class="hud-val" id="hudHeading">0°</span><span class="hud-lbl" id="hudCard">N</span></div>
      <div class="hud-cell" id="hudAltCell"><span class="hud-val" id="hudAlt">0</span><span class="hud-lbl">alt m</span></div>
    </div>
    <div class="hud-throttle" id="hudThrottleWrap">
      <div class="hud-throttle-bar"><div id="hudThrottleFill"></div></div>
      <span class="hud-lbl">throttle</span>
    </div>
    <div class="hud-hint" id="hudHint"></div>`;
  document.body.appendChild(el);

  const $ = (id) => el.querySelector(id);
  const speed = $('#hudSpeed');
  const heading = $('#hudHeading');
  const card = $('#hudCard');
  const alt = $('#hudAlt');
  const altCell = $('#hudAltCell');
  const throttleWrap = $('#hudThrottleWrap');
  const throttleFill = $('#hudThrottleFill');
  const hint = $('#hudHint');

  return {
    show(label, hintText) {
      el.hidden = false;
      hint.textContent = hintText || '';
      el.dataset.vehicle = label;
    },
    hide() {
      el.hidden = true;
    },
    update(d) {
      speed.textContent = Math.round(d.speedKmh);
      heading.textContent = `${Math.round(d.heading)}°`;
      card.textContent = cardinal(d.heading);
      if (d.altitude != null) {
        altCell.style.display = '';
        alt.textContent = Math.round(d.agl != null ? d.agl : d.altitude);
        altCell.querySelector('.hud-lbl').textContent = d.agl != null ? 'AGL m' : 'alt m';
      } else {
        altCell.style.display = 'none';
      }
      if (d.throttle != null) {
        throttleWrap.style.display = '';
        throttleFill.style.width = `${Math.round(d.throttle * 100)}%`;
      } else {
        throttleWrap.style.display = 'none';
      }
    },
  };
}
