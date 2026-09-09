import Phaser from 'phaser';
import type { Actor, Effect, InputState, Player } from '@dawn/simulation';
import type { Session } from './index';
const TILE = 60;
interface ActorVisual {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  hp: number;
}
export class BattleScene extends Phaser.Scene {
  private session: Session;
  private actors = new Map<string, ActorVisual>();
  private terrain: Phaser.GameObjects.Image[] = [];
  private overlay!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private bossLabel!: Phaser.GameObjects.Text;
  private padLabels: Phaser.GameObjects.Text[] = [];
  private version = -1;
  private lastSnapshot = 0;
  private lastInput = 0;
  private taps: string[] = [];
  private previousView = '';
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private effectSeen = new Set<string>();
  private wasVisible = false;
  constructor(session: Session) {
    super('Battle');
    this.session = session;
  }
  create() {
    this.cameras.main.setViewport(0, 70, 1600, 690).setBackgroundColor('#101b24');
    this.overlay = this.add.graphics().setDepth(20);
    this.hud = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.bossLabel = this.add
      .text(800, 18, '', { fontFamily: 'sans-serif', fontSize: '20px', color: '#f6ddd5' })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(101);
    const names: Record<string, string> = {
      up: 'UP',
      right: 'RIGHT',
      down: 'DOWN',
      left: 'LEFT',
      fire: 'SPACE',
      speed: 'Q',
      special: 'W',
      heal: 'E',
      ultimate: 'R',
      melee: 'F',
      item: 'C',
      ammo1: 'ONE',
      ammo2: 'TWO',
      ammo3: 'THREE',
      pause: 'ESC',
    };
    for (const [name, code] of Object.entries(names)) {
      const key = this.input.keyboard?.addKey(code, false);
      if (key) {
        this.keys[name] = key;
        key.on(Phaser.Input.Keyboard.Events.DOWN, () => {
          if (
            ['battle', 'practice'].includes(this.session.view) &&
            !this.session.blurred &&
            !this.typing()
          ) {
            if (name === 'pause') this.session.callbacks.onPauseRequest?.();
            else if (!this.session.paused) this.taps.push(name);
          }
        });
      }
    }
    const stopBrowser = (event: KeyboardEvent) => {
      if (
        ['battle', 'practice'].includes(this.session.view) &&
        !this.typing() &&
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)
      )
        event.preventDefault();
    };
    window.addEventListener('keydown', stopBrowser, { passive: false });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', stopBrowser);
      this.input.keyboard?.removeAllKeys(true);
      this.tweens.killAll();
      this.actors.clear();
      this.terrain = [];
      this.effectSeen.clear();
      this.taps = [];
    });
  }
  private typing() {
    const e = document.activeElement;
    return (
      e instanceof HTMLInputElement ||
      e instanceof HTMLTextAreaElement ||
      e instanceof HTMLSelectElement ||
      (e instanceof HTMLElement && e.isContentEditable)
    );
  }
  public clearInput() {
    this.taps = [];
    for (const key of Object.values(this.keys)) key.reset();
  }
  private readInput(): InputState {
    if (this.session.blurred || this.session.paused || this.typing()) {
      this.clearInput();
      return {};
    }
    const k = this.keys;
    const input: InputState = {};
    if (k.up?.isDown) input.dir = 0;
    else if (k.right?.isDown) input.dir = 1;
    else if (k.down?.isDown) input.dir = 2;
    else if (k.left?.isDown) input.dir = 3;
    for (const key of ['fire', 'speed', 'special', 'heal', 'ultimate', 'melee', 'item'] as const)
      if (k[key]?.isDown) input[key] = true;
    if (k.ammo1?.isDown) input.ammo = 'AP';
    else if (k.ammo2?.isDown) input.ammo = 'HE';
    else if (k.ammo3?.isDown) input.ammo = 'HESH';
    // Key.onUp clears Phaser JustDown within the same frame; retain DOWN edges
    // until one simulation step (or outgoing network input) consumes each tap.
    const tap = this.taps.shift();
    if (tap) {
      const directions = ['up', 'right', 'down', 'left'];
      if (directions.includes(tap)) input.dir = directions.indexOf(tap);
      else if (tap.startsWith('ammo'))
        input.ammo = ({ ammo1: 'AP', ammo2: 'HE', ammo3: 'HESH' } as const)[
          tap as 'ammo1' | 'ammo2' | 'ammo3'
        ];
      else if (tap === 'pause') this.session.callbacks.onPauseRequest?.();
      else if (['fire', 'speed', 'special', 'heal', 'ultimate', 'melee', 'item'].includes(tap))
        input[tap as 'fire'] = true;
    }
    return input;
  }
  private buildMap() {
    const map = this.session.map;
    if (!map) return;
    this.terrain.forEach((t) => t.destroy());
    this.terrain = [];
    this.actors.forEach((v) => {
      v.sprite.destroy();
      v.label.destroy();
    });
    this.actors.clear();
    this.padLabels.forEach((t) => t.destroy());
    this.padLabels = [];
    this.effectSeen.clear();
    const tiles =
      map.artSet === 'legacy'
        ? ['map_1_18', 'map_1_01', 'dawn-barricade', 'map_1_14', 'map_1_54', 'dawn-courtyard']
        : [
            'terrain-ash',
            'terrain-coolant',
            'dawn-barricade',
            'dawn-courtyard',
            'terrain-bridge',
            'dawn-courtyard',
          ];
    map.tiles.forEach((row, y) =>
      row.forEach((t, x) => {
        const tile = this.add
          .image(x * TILE + 30, y * TILE + 30, tiles[t] || tiles[0])
          .setDisplaySize(TILE, TILE)
          .setDepth(-10);
        this.terrain.push(tile);
      }),
    );
    const cam = this.cameras.main;
    const zoom = Math.min(1.3, 1600 / (map.width * TILE), 690 / (map.height * TILE));
    const z = Math.max(0.8, zoom);
    cam.setZoom(z);
    const padX = Math.max(0, (1600 / z - map.width * TILE) / 2),
      padY = Math.max(0, (690 / z - map.height * TILE) / 2);
    cam.setBounds(-padX, -padY, map.width * TILE + padX * 2, map.height * TILE + padY * 2);
    cam.centerOn((map.width * TILE) / 2, (map.height * TILE) / 2);
    this.hud.setScale(1 / z).setPosition((800 * (z - 1)) / z, (345 * (z - 1)) / z);
    this.bossLabel.setScale(1 / z).setPosition(800, (18 - 345 * (1 - z)) / z);
    this.version = this.session.version;
  }
  private texture(actor: Actor) {
    const p = actor as Player;
    if (this.session.map?.artSet === 'legacy') {
      const dir = actor.dir === 0 ? 'W' : actor.dir === 2 ? 'S' : 'A';
      return actor.team
        ? `TankPlayer${p.character}_M${dir}`
        : `TankEnemy_M${dir}_${Math.min(3, actor.type || 1)}`;
    }
    return actor.team
      ? `combat-${p.character.toLowerCase()}`
      : actor.boss
        ? 'boss-core'
        : actor.type === 4
          ? 'enemy-support'
          : actor.type === 2 || actor.type === 3
            ? 'enemy-artillery'
            : 'enemy-stalker';
  }
  private renderActor(actor: Actor, delta: number) {
    const key = this.texture(actor);
    let visual = this.actors.get(actor.id);
    if (!visual) {
      visual = {
        sprite: this.add.sprite(actor.x, actor.y, key).setDepth(10),
        label: this.add
          .text(actor.x, actor.y - 43, '', {
            fontFamily: 'sans-serif',
            fontSize: '12px',
            color: '#c7e5e9',
          })
          .setOrigin(0.5)
          .setDepth(30),
        hp: actor.hp,
      };
      this.actors.set(actor.id, visual);
    }
    const { sprite, label } = visual;
    const smooth = this.session.simulation ? 1 : Math.min(1, delta / 70);
    sprite.x += (actor.x - sprite.x) * smooth;
    sprite.y += (actor.y - sprite.y) * smooth;
    if (sprite.texture.key !== key) sprite.setTexture(key);
    const size = actor.boss ? 160 : this.session.map?.artSet === 'new' && actor.team ? 80 : 60;
    sprite.setDisplaySize(size, size);
    sprite.setAlpha(actor.hp <= 0 ? 0.2 : actor.flash > 0 ? 0.6 : 1);
    if (this.session.map?.artSet === 'legacy') {
      sprite.setRotation(0).setFlipX(actor.dir === 1);
      if (actor.moving && this.anims.exists(key)) {
        if (sprite.anims.currentAnim?.key !== key || !sprite.anims.isPlaying) sprite.play(key);
      } else {
        sprite.stop();
        sprite.setFrame(0);
      }
    } else if (actor.team) {
      sprite
        .setFlipX(false)
        .setRotation(0)
        .setFrame([2, 1, 0, 3][actor.dir] || 0);
    } else sprite.setFlipX(false).setRotation((actor.dir * Math.PI) / 2);
    const p = actor as Player;
    label
      .setPosition(sprite.x, sprite.y - (actor.boss ? 78 : 43))
      .setText(
        actor.team
          ? `${p.character === 'Asuka' ? '明日香' : '绫波丽'}${actor.hp <= 0 ? ' · 待救援' : ''}`
          : '',
      );
    if (visual.hp > actor.hp && actor.hp > 0 && !this.session.reducedMotion) {
      const damage = Math.round(visual.hp - actor.hp);
      const text = this.add
        .text(sprite.x, sprite.y - 35, `−${damage}`, {
          fontFamily: 'sans-serif',
          fontSize: actor.boss ? '24px' : '18px',
          color: actor.team ? '#ff7777' : '#ffe9a8',
          stroke: '#131921',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(45);
      this.tweens.add({
        targets: text,
        y: text.y - 35,
        alpha: 0,
        duration: 700,
        onComplete: () => text.destroy(),
      });
    }
    visual.hp = actor.hp;
    if (actor.hp <= 0) return;
    this.overlay
      .fillStyle(0x101821, 0.9)
      .fillRect(sprite.x - 22, sprite.y + 31, 44, 4)
      .fillStyle(actor.team ? 0x7de1d5 : 0xd47961)
      .fillRect(sprite.x - 22, sprite.y + 31, (44 * actor.hp) / actor.maxHp, 4);
    if ((p.shield || 0) > 0)
      this.overlay.lineStyle(2, 0x91e8ff, 0.8).strokeCircle(sprite.x, sprite.y, 36);
    if (actor.boss) {
      const c = this.session.state?.cooperation;
      if (c && !c.puzzle && c.openFor <= 0)
        this.overlay.lineStyle(4, 0xa1cbff, 0.8).strokeCircle(sprite.x, sprite.y, 76);
    }
  }
  private effects() {
    const state = this.session.state;
    if (!state) return;
    for (const effect of state.effects) {
      const id = `${effect.kind}:${effect.x.toFixed(1)}:${effect.y.toFixed(1)}:${Math.round((state.time + effect.life) * 10) / 10}`;
      if (this.effectSeen.has(id)) continue;
      this.effectSeen.add(id);
      this.spawnEffect(effect);
    }
    if (this.effectSeen.size > 1500) this.effectSeen.clear();
  }
  private spawnEffect(effect: Effect) {
    const color =
      effect.kind === 'heal'
        ? 0x82ecc2
        : effect.kind === 'warning'
          ? 0xff8565
          : effect.kind === 'shield'
            ? 0x85d8ff
            : 0xffc487;
    if (effect.kind === 'warning') return;
    const ring = this.add
      .circle(effect.x, effect.y, Math.max(5, effect.radius * 0.2), color, 0.12)
      .setStrokeStyle(2, color, 0.8)
      .setDepth(24);
    this.tweens.add({
      targets: ring,
      scale: this.session.reducedMotion ? 1 : 3,
      alpha: 0,
      duration: Math.max(180, effect.max * 1000),
      onComplete: () => ring.destroy(),
    });
    if (
      !this.session.reducedMotion &&
      ['boom', 'missile', 'melee', 'hit', 'impact'].includes(effect.kind)
    )
      for (let i = 0; i < 6; i++) {
        const spark = this.add.rectangle(effect.x, effect.y, 4, 2, color).setDepth(25);
        const a = (i * Math.PI) / 3;
        this.tweens.add({
          targets: spark,
          x: effect.x + Math.cos(a) * 30,
          y: effect.y + Math.sin(a) * 30,
          alpha: 0,
          duration: 300,
          onComplete: () => spark.destroy(),
        });
      }
  }
  private cooperation() {
    const c = this.session.state?.cooperation;
    if (!c) return;
    const pads = c.puzzle ? [c.puzzle.redPad, c.puzzle.bluePad] : c.pads;
    pads.forEach((p, i) => {
      const color = i === 0 ? 0xff9077 : 0x8adcff;
      this.overlay
        .fillStyle(color, 0.12)
        .fillCircle(p.x, p.y, 28)
        .lineStyle(3, color, 0.8)
        .strokeCircle(p.x, p.y, 28);
      const charge = c.puzzle ? c.puzzle.charge : c.openFor > 0 ? 1 : c.charge / c.required;
      this.overlay
        .lineStyle(5, 0xffe7a2, 1)
        .beginPath()
        .arc(p.x, p.y, 33, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge, false)
        .strokePath();
      if (!this.padLabels[i])
        this.padLabels[i] = this.add
          .text(p.x, p.y + 45, '', {
            fontFamily: 'sans-serif',
            fontSize: '14px',
            color: '#e7eeee',
            backgroundColor: '#111d29',
            padding: { x: 6, y: 4 },
          })
          .setOrigin(0.5)
          .setDepth(30);
      this.padLabels[i].setText(
        c.puzzle
          ? c.puzzle.solved
            ? '同步完成'
            : i === 0
              ? '明日香 · 持续供能'
              : '绫波丽 · 同步激活'
          : c.openFor > 0
            ? '屏障解除'
            : '同步站位 ' + (i + 1),
      );
    });
  }
  update(time: number, delta: number) {
    const s = this.session;
    const visible = ['battle', 'practice'].includes(s.view);
    this.cameras.main.setVisible(visible);
    if (this.previousView !== s.view) {
      this.clearInput();
      this.previousView = s.view;
    }
    if (!visible) {
      this.wasVisible = false;
      return;
    }
    if (!this.wasVisible) this.wasVisible = true;
    if (!s.state || !s.map) return;
    if (this.version !== s.version) this.buildMap();
    const consume = !!s.simulation || time - this.lastInput >= 40;
    const input = consume ? { ...this.readInput(), ...s.input } : {};
    if (consume) s.input = {};
    if (s.simulation && !s.paused && !s.blurred)
      s.simulation.step(Math.min(delta / 1000, 0.05), [input]);
    else if (!s.simulation && time - this.lastInput >= 40) {
      s.callbacks.onInput?.(input);
      this.lastInput = time;
    }
    if (time - this.lastSnapshot >= 100) {
      s.callbacks.onSnapshot?.(s.state);
      this.lastSnapshot = time;
    }
    this.overlay.clear();
    this.hud.clear();
    const living = new Set<string>();
    for (const actor of [...s.state.players, ...s.state.enemies]) {
      living.add(actor.id);
      this.renderActor(actor, delta);
    }
    for (const [id, v] of this.actors)
      if (!living.has(id)) {
        v.sprite.destroy();
        v.label.destroy();
        this.actors.delete(id);
      }
    for (const b of s.state.bullets) {
      this.overlay
        .fillStyle(
          b.team
            ? b.ammo === 'HE'
              ? 0xffba6a
              : b.ammo === 'HESH'
                ? 0xc09bff
                : 0xdffaff
            : 0xff795c,
        )
        .fillCircle(b.x, b.y, b.missile ? 7 : 4);
      this.overlay
        .lineStyle(2, b.team ? 0xc3f1ff : 0xff7055, 0.6)
        .lineBetween(b.x - b.dx * 15, b.y - b.dy * 15, b.x, b.y);
    }
    for (const e of s.state.enemies)
      if (e.warning > 0 && e.hp > 0) {
        const a = (e.dir * Math.PI) / 2 - Math.PI / 2;
        this.overlay
          .lineStyle(e.boss ? 16 : 10, 0xff8260, 0.24)
          .lineBetween(e.x, e.y, e.x + Math.cos(a) * 300, e.y + Math.sin(a) * 300);
        this.overlay.lineStyle(2, 0xffb49c, 0.9).strokeCircle(e.x, e.y, e.boss ? 85 : 45);
      }
    this.cooperation();
    this.effects();
    const boss = s.state.enemies.find((e) => e.boss && e.hp > 0);
    this.bossLabel.setVisible(!!boss);
    if (boss) {
      this.bossLabel.setText(`异相核心  ·  ${Math.ceil(boss.hp)} / ${boss.maxHp}`);
      this.hud
        .fillStyle(0x141720, 0.95)
        .fillRoundedRect(490, 47, 620, 12, 6)
        .fillStyle(0xe29375)
        .fillRoundedRect(492, 49, (616 * boss.hp) / boss.maxHp, 8, 4);
    }
    const player = s.state.players[s.localIndex];
    if (player) {
      const visual = this.actors.get(player.id);
      if (visual)
        this.cameras.main.pan(
          visual.sprite.x,
          visual.sprite.y,
          s.reducedMotion ? 0 : 80,
          'Linear',
          false,
        );
    }
  }
}
