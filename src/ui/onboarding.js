/** One-time welcome overlay with a brief how-to. */
export function maybeShowOnboarding() {
  if (localStorage.getItem('realEarth.onboarded') === '1') return;

  const el = document.createElement('div');
  el.id = 'onboarding';
  el.innerHTML = `
    <div class="ob-card">
      <h1>🌍 Real Earth</h1>
      <p>Explore the real planet — real terrain, satellite imagery and cities,
         all from free &amp; open data.</p>
      <ul>
        <li><b>Search</b> any place up top and fly there.</li>
        <li><b>Fly, drive or sail</b> with the buttons at the bottom.</li>
        <li><b>★</b> save places · <b>⚙</b> time, weather &amp; sound.</li>
      </ul>
      <button id="obStart">Start exploring</button>
      <p class="ob-credit">Built on CesiumJS · OpenStreetMap · Sentinel-2 · Esri</p>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('#obStart').addEventListener('click', () => {
    el.classList.add('hide');
    setTimeout(() => el.remove(), 400);
    localStorage.setItem('realEarth.onboarded', '1');
  });
}
