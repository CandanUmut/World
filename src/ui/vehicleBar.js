/**
 * Bottom vehicle selector. "Get in" the chosen vehicle at the current location;
 * shows an Exit button while one is active. Vehicle classes are passed in so the
 * bar grows naturally as phases add the car and ship.
 */
export function createVehicleBar(manager, vehicles) {
  const bar = document.createElement('div');
  bar.id = 'vehicleBar';
  document.body.appendChild(bar);

  function render() {
    const active = manager.isActive();
    bar.innerHTML = '';
    if (active) {
      const exit = document.createElement('button');
      exit.className = 'veh-btn veh-exit';
      exit.innerHTML = `Exit ${manager.current()} ✕`;
      exit.addEventListener('click', () => {
        manager.exit();
        render();
      });
      bar.appendChild(exit);
    } else {
      for (const v of vehicles) {
        const btn = document.createElement('button');
        btn.className = 'veh-btn';
        btn.innerHTML = `<span class="veh-icon">${v.icon}</span><span>${v.label}</span>`;
        btn.title = `Get in the ${v.label.toLowerCase()} here`;
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          await manager.enter(v.cls); // resolves after the descend transition
          render();
        });
        bar.appendChild(btn);
      }
    }
  }

  // Re-sync the bar if the vehicle is exited via keyboard (V/Esc).
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyV' || e.code === 'Escape') setTimeout(render, 0);
  });

  render();
  return { render };
}
