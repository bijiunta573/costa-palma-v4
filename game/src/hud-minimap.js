// Costa Palma — the HUD: minimap, stars, cash, health, objective, prompts,
// dialogue banners and the menu/pause/toast overlays. Pure DOM and 2D
// canvas; the game loop feeds it numbers, it owns no game state.

import { AXES_X, AXES_Z, ROAD_HALF, BEACH_START, BEACH_END } from './config.js';
import { money } from './util.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), minimap: $('minimap'), stars: $('stars'), cash: $('cash'),
      healthFill: $('health-fill'), objective: $('objective'), prompt: $('prompt'),
      speed: $('speed'), timer: $('timer'), banner: $('banner'), bannerWho: $('banner-who'),
      bannerText: $('banner-text'), menu: $('menu'), pause: $('pause'),
      toast: $('toast'), toastTitle: $('toast-title'), toastSub: $('toast-sub'),
      crosshair: $('crosshair'), vignette: $('vignette'), btnContinue: $('btn-continue'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.bannerT = 0;
    this.toastT = 0;
    this.vignetteT = 0;
    this.lastStars = -1;
  }

  setCash(n) {
    this.el.cash.textContent = money(n);
  }

  setHealth(frac) {
    this.el.healthFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    this.el.healthFill.style.background = frac < 0.3 ? '#e53935' : frac < 0.6 ? '#ffb300' : '#66bb6a';
  }

  setStars(n) {
    if (n === this.lastStars) return;
    this.lastStars = n;
    this.el.stars.textContent = '★'.repeat(n) + '☆'.repeat(5 - n);
    this.el.stars.style.opacity = n > 0 ? '1' : '0.25';
  }

  setObjective(text) {
    if (this.el.objective.textContent !== text) this.el.objective.textContent = text;
  }

  setPrompt(text) {
    this.el.prompt.style.opacity = text ? '1' : '0';
    if (text && this.el.prompt.textContent !== text) this.el.prompt.textContent = text;
  }

  setSpeed(kmh) {
    if (kmh === null) {
      this.el.speed.style.opacity = '0';
    } else {
      this.el.speed.style.opacity = '1';
      this.el.speed.textContent = `${Math.round(kmh)} km/h`;
    }
  }

  setTimer(seconds) {
    if (seconds === null || seconds === undefined) {
      this.el.timer.style.opacity = '0';
      return;
    }
    this.el.timer.style.opacity = '1';
    const s = Math.max(0, Math.ceil(seconds));
    this.el.timer.textContent = `⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.el.timer.style.color = s < 20 ? '#ff7043' : '#ffe082';
  }

  showBanner(who, text, seconds = 5) {
    this.el.bannerWho.textContent = who;
    this.el.bannerText.textContent = text;
    this.el.banner.style.opacity = '1';
    this.bannerT = seconds;
  }

  showToast(title, sub, seconds = 2.6) {
    this.el.toastTitle.textContent = title;
    this.el.toastSub.textContent = sub || '';
    this.el.toast.style.opacity = '1';
    this.toastT = seconds;
  }

  flashDamage() {
    this.vignetteT = 0.35;
    this.el.vignette.style.opacity = '0.55';
  }

  setCrosshair(on) {
    this.el.crosshair.style.opacity = on ? '1' : '0';
  }

  showMenu(canContinue) {
    this.el.menu.style.display = 'flex';
    this.el.btnContinue.style.display = canContinue ? 'block' : 'none';
    this.el.hud.style.opacity = '0';
  }

  hideMenu() {
    this.el.menu.style.display = 'none';
    this.el.hud.style.opacity = '1';
  }

  setPause(on) {
    this.el.pause.style.display = on ? 'flex' : 'none';
  }

  tick(dt) {
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.el.banner.style.opacity = '0';
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.el.toast.style.opacity = '0';
    }
    if (this.vignetteT > 0) {
      this.vignetteT -= dt;
      if (this.vignetteT <= 0) this.el.vignette.style.opacity = '0';
    }
  }

  // Player-centred minimap: roads, water, blips for police, traffic, the
  // objective and any gunmen, and Leo's arrow in the middle.
  drawMinimap(game) {
    const ctx = this.mapCtx;
    const S = 216;
    const C = S / 2;
    const scale = C / 130; // 130 world units to the edge
    const p = game.player.pos;
    const wx = (x) => C + (x - p.x) * scale;
    const wz = (z) => C + (z - p.z) * scale;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#232a31';
    ctx.fillRect(0, 0, S, S);
    // Beach and sea.
    ctx.fillStyle = '#c9ae76';
    ctx.fillRect(wx(BEACH_START), 0, (BEACH_END - BEACH_START) * scale, S);
    ctx.fillStyle = '#1d5f7a';
    ctx.fillRect(wx(BEACH_END), 0, S - wx(BEACH_END), S);
    // Roads.
    ctx.fillStyle = '#454e58';
    for (const ax of AXES_X) ctx.fillRect(wx(ax - ROAD_HALF), 0, ROAD_HALF * 2 * scale, S);
    for (const az of AXES_Z) ctx.fillRect(0, wz(az - ROAD_HALF), S, ROAD_HALF * 2 * scale);
    const dot = (x, z, r, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(wx(x), wz(z), r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const car of game.cars) {
      if (car.driver === 'traffic') dot(car.x, car.z, 2, '#8d99a6');
    }
    for (const g of game.combat.gunmen) {
      if (g.state !== 'down') dot(g.x, g.z, 3, '#ff1744');
    }
    game.police.cars.forEach((car, i) => {
      dot(car.x, car.z, 3.4, Math.floor(performance.now() / 280 + i) % 2 ? '#ff5252' : '#448aff');
    });
    // Objective: gold, clamped to the rim when far away.
    const target = game.missions.target;
    if (target) {
      let dx = (target.x - p.x) * scale;
      let dz = (target.z - p.z) * scale;
      const d = Math.hypot(dx, dz);
      if (d > C - 12) {
        dx *= (C - 12) / d;
        dz *= (C - 12) / d;
      }
      ctx.fillStyle = '#ffd740';
      ctx.beginPath();
      ctx.arc(C + dx, C + dz, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff8e1';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    // Leo's arrow.
    const heading = game.player.inCar ? game.player.inCar.heading : game.player.heading;
    ctx.save();
    ctx.translate(C, C);
    ctx.rotate(-heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(-5.5, -5);
    ctx.lineTo(0, -2);
    ctx.lineTo(5.5, -5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Rim.
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(C, C, C - 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}
