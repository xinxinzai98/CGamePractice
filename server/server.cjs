'use strict';
const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');
const D = require('../packages/simulation/dist/index.js');
const { createProfiles } = require('./profiles.cjs');
const CLIENT = path.resolve(__dirname, '../client/dist');
const send = (ws, data) => {
  if (ws?.readyState === WebSocket.OPEN && ws.bufferedAmount < 262144)
    ws.send(JSON.stringify(data));
};
function createServer({
  reconnectMs = 30000,
  maxRooms = 30,
  profilesFactory = createProfiles,
  profilesFile = path.resolve(__dirname, '../data/profiles.sqlite'),
  webRoot = process.env.DAWN_CLIENT_DIR ||
    (fs.existsSync(path.join(CLIENT, 'index.html')) ? CLIENT : path.resolve(__dirname, '../web')),
} = {}) {
  const WEB = path.resolve(webRoot);
  const rooms = new Map(),
    profiles = profilesFactory(profilesFile),
    attempts = new Map();
  const equipment = () => D.Equipment;
  const progression = () => D.Progression;
  const publicUser = (u) =>
    u ? { user: { username: u.username }, profile: u.profile } : { user: null };
  const json = (res, status, body) => {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify(body));
  };
  const server = http.createServer(async (req, res) => {
    if (req.url.startsWith('/api/')) {
      try {
        if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)
          return json(res, 403, { error: '请求来源不匹配' });
        if (req.headers['sec-fetch-site'] === 'cross-site')
          return json(res, 403, { error: '请求来源不匹配' });
        if (req.url === '/api/rooms' && req.method === 'GET')
          return json(res, 200, {
            rooms: [...rooms.values()]
              .filter((r) => !r.game && r.slots[0]?.ws && r.slots[1] === null)
              .slice(0, 30)
              .map((r) => ({
                code: r.code,
                mission: r.mission,
                stage: r.stage,
                difficulty: r.difficulty,
                playersCount: r.slots.filter((s) => s?.ws).length,
              })),
          });
        if (req.url === '/api/me' && req.method === 'GET')
          return json(res, 200, publicUser(profiles.get(req)));
        if (req.method !== 'POST') return json(res, 405, { error: '请求方法不支持' });
        if (!String(req.headers['content-type'] || '').startsWith('application/json'))
          return json(res, 415, { error: '需要 JSON 请求' });
        let raw = '',
          size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 8192) return json(res, 413, { error: '请求过大' });
          raw += chunk;
        }
        let body;
        try {
          body = JSON.parse(raw);
          if (!body || Array.isArray(body) || typeof body !== 'object') throw Error();
        } catch {
          return json(res, 400, { error: 'JSON 格式无效' });
        }
        if (req.url === '/api/register' || req.url === '/api/login') {
          const key = req.socket.remoteAddress,
            now = Date.now();
          if (attempts.size > 1000)
            for (const [k, v] of attempts) if (now - v.at > 60000) attempts.delete(k);
          let a = attempts.get(key);
          if (!a || now - a.at > 60000) {
            a = { at: now, n: 0 };
            attempts.set(key, a);
          }
          if (++a.n > 15) return json(res, 429, { error: '尝试过于频繁，请稍后重试' });
          return json(
            res,
            200,
            publicUser(
              await profiles[req.url.endsWith('register') ? 'register' : 'login'](
                body.username,
                body.password,
                res,
              ),
            ),
          );
        }
        if (req.url === '/api/logout') {
          profiles.logout(req, res);
          return json(res, 200, { user: null });
        }
        const user = profiles.get(req);
        if (!user) return json(res, 401, { error: '请先登录' });
        if (req.url === '/api/build') {
          profiles.mutate(user, (p) => {
            if (!['Asuka', 'Rei'].includes(body.character)) throw Error('角色无效');
            p.characters[body.character].nodes = progression().validateBuild(
              body.character,
              body.nodes,
              p.characters[body.character].xp,
            );
          });
          return json(res, 200, publicUser(user));
        }
        if (req.url === '/api/shop') {
          profiles.mutate(user, (p) => {
            const item = equipment().ITEMS.find((i) => i.id === body.itemId);
            if (!item) throw Error('装备不存在');
            if (p.inventory.includes(item.id)) throw Error('已经拥有此装备');
            if (p.coins < item.price) throw Error('金币不足');
            p.coins -= item.price;
            p.inventory.push(item.id);
          });
          return json(res, 200, publicUser(user));
        }
        if (req.url === '/api/equip') {
          profiles.mutate(user, (p) => {
            if (!['Asuka', 'Rei'].includes(body.character)) throw Error('角色无效');
            const validSlots = new Set(equipment().ITEMS.map((i) => i.slot));
            if (!validSlots.has(body.slot)) throw Error('装备槽无效');
            if (body.itemId === null) p.equipment[body.character][body.slot] = null;
            else {
              const item = equipment().ITEMS.find((i) => i.id === body.itemId);
              if (!item || item.slot !== body.slot || !p.inventory.includes(item.id))
                throw Error('尚未拥有该槽位装备');
              p.equipment[body.character][body.slot] = item.id;
            }
          });
          return json(res, 200, publicUser(user));
        }
        if (req.url === '/api/loadout') {
          profiles.mutate(user, (p) => {
            if (
              !['Asuka', 'Rei'].includes(body.character) ||
              !['AP', 'HE', 'HESH'].includes(body.ammo) ||
              !['blade', 'spear'].includes(body.melee)
            )
              throw Error('角色、弹种或近战武器无效');
            p.loadouts[body.character] = { ammo: body.ammo, melee: body.melee };
          });
          return json(res, 200, publicUser(user));
        }
        if (req.url === '/api/appearance') {
          profiles.mutate(user, (p) => {
            if (!['Asuka', 'Rei'].includes(body.pilot) || typeof body.reducedMotion !== 'boolean')
              throw Error('看板角色或动态偏好无效');
            p.appearance = { pilot: body.pilot, reducedMotion: body.reducedMotion };
          });
          return json(res, 200, publicUser(user));
        }
        if (req.url === '/api/draw') {
          const reward = profiles.draw(user);
          return json(res, 200, { ...publicUser(user), reward });
        }
        if (req.url === '/api/tutorial') {
          if (body.complete !== true) throw Error('教学状态无效');
          profiles.mutate(user, (p) => {
            if (!p.tutorialComplete) {
              p.tutorialComplete = true;
              p.tickets += 3;
            }
          });
          return json(res, 200, publicUser(user));
        }
        return json(res, 404, { error: '接口不存在' });
      } catch (e) {
        return json(res, 400, { error: e.message });
      }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      res.end();
      return;
    }
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
      return;
    }
    let file;
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      file = path.resolve(WEB, '.' + (pathname === '/' ? '/index.html' : pathname));
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    const mime = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.png': 'image/png',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.m4a': 'audio/mp4',
      '.mp3': 'audio/mpeg',
      '.ogg': 'audio/ogg',
      '.wav': 'audio/wav',
      '.wasm': 'application/wasm',
      '.webp': 'image/webp',
    }[path.extname(file)];
    if (!file.startsWith(WEB + path.sep) || !mime) {
      res.writeHead(404);
      res.end();
      return;
    }
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': stat.size,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache',
      });
      if (req.method === 'HEAD') res.end();
      else
        fs.createReadStream(file)
          .on('error', () => res.destroy())
          .pipe(res);
    });
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32768, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    let valid = req.url === '/ws' && wss.clients.size < 100;
    if (req.headers.origin) {
      try {
        valid &&= new URL(req.headers.origin).host === req.headers.host;
      } catch {
        valid = false;
      }
    }
    if (!valid) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  function broadcast(room, data) {
    for (const s of room.slots) send(s?.ws, data);
  }
  function lobby(room) {
    broadcast(room, {
      type: 'lobby',
      code: room.code,
      mission: room.mission,
      stage: room.stage,
      difficulty: room.difficulty,
      custom: room.custom,
      map: room.map.name,
      slots: room.slots.map((s) =>
        s
          ? {
              connected: !!s.ws,
              ready: s.ready,
              character: s.character,
              username: s.username || null,
            }
          : null,
      ),
    });
  }
  function snapshot(room) {
    const g = room.game;
    return {
      type: 'state',
      round: room.round,
      rewardsSaved: !!room.awarded,
      paused: !!room.paused,
      waiting: room.slots.some((s) => !s?.ws),
      state: {
        time: g.time,
        status: room.paused ? 'paused' : g.status,
        score: g.score,
        kills: g.kills,
        players: g.players,
        enemies: g.enemies,
        bullets: g.bullets,
        effects: g.effects,
        events: g.events,
        cooperation: g.cooperation,
        difficulty: g.difficulty,
        coop: true,
      },
    };
  }
  function start(room) {
    const upgrades = Object.fromEntries(room.slots.map((s) => [s.character, s.upgrades]));
    const builds = Object.fromEntries(room.slots.map((s) => [s.character, s.nodes || []]));
    room.game = new D.Game(room.map, {
      coop: true,
      upgrades,
      nodes: builds,
      loadouts: Object.fromEntries(
        room.slots.map((s) => [
          s.character,
          s.loadout || { ammo: 'AP', melee: s.character === 'Asuka' ? 'blade' : 'spear' },
        ]),
      ),
      gear: Object.fromEntries(room.slots.map((s) => [s.character, s.gear || []])),
      characters: room.slots.map((s) => s.character),
      difficulty: room.difficulty,
      seed: crypto.randomBytes(4).readUInt32LE(),
    });
    room.paused = false;
    room.awarded = false;
    room.rewardSlots = [false, false];
    room.rewardRetryAt = 0;
    room.rewardErrors = new Set();
    room.round = crypto.randomBytes(8).toString('hex');
    broadcast(room, {
      type: 'start',
      map: room.map,
      mission: room.mission,
      stage: room.stage,
      difficulty: room.difficulty,
      custom: room.custom,
      round: room.round,
      characters: room.slots.map((s) => s.character),
    });
    broadcast(room, snapshot(room));
  }
  function destroy(room, reason) {
    broadcast(room, { type: 'ended', message: reason });
    for (const s of room.slots)
      if (s?.ws) {
        s.ws.room = null;
        s.ws.close(1000, 'Room closed');
      }
    rooms.delete(room.code);
  }
  function attach(ws, room, slot) {
    const s = room.slots[slot];
    s.ws = ws;
    s.disconnectedAt = 0;
    ws.room = room;
    ws.slot = slot;
    send(ws, { type: 'joined', code: room.code, slot, token: s.token });
    lobby(room);
    if (room.game) {
      send(ws, {
        type: 'start',
        map: room.map,
        mission: room.mission,
        stage: room.stage,
        difficulty: room.difficulty,
        custom: room.custom,
        round: room.round,
        characters: room.slots.map((s) => s.character),
      });
      if (room.slots.every((s) => s?.ws) && room.paused === 'disconnect') room.paused = false;
      broadcast(room, snapshot(room));
    }
  }
  function newSlot(ws, character) {
    return {
      username: ws.username,
      character,
      nodes: [],
      ws: null,
      ready: false,
      token: crypto.randomBytes(24).toString('hex'),
      upgrades: { power: 0, mobility: 0, support: 0 },
      input: {},
      lastInput: 0,
      disconnectedAt: 0,
    };
  }
  function cleanUpgrades(value) {
    const result = {};
    for (const k of ['power', 'mobility', 'support'])
      result[k] = D.clamp(Math.floor(Number(value?.[k]) || 0), 0, 3);
    return result;
  }
  wss.on('connection', (ws, req) => {
    ws.username = profiles.get(req)?.username || null;
    ws.alive = true;
    ws.window = Date.now();
    ws.messages = 0;
    ws.created = Date.now();
    ws.on('pong', () => (ws.alive = true));
    ws.on('error', () => {});
    ws.on('message', (raw) => {
      const now = Date.now();
      if (now - ws.window > 1000) {
        ws.messages = 0;
        ws.window = now;
      }
      if (++ws.messages > 100) {
        ws.close(1008, 'Rate limit');
        return;
      }
      let m;
      try {
        m = JSON.parse(raw);
        if (!m || typeof m !== 'object') throw Error('invalid');
      } catch {
        send(ws, { type: 'error', message: '消息格式无效' });
        return;
      }
      let room = ws.room;
      try {
        if (m.type === 'ping') {
          send(ws, { type: 'pong', stamp: m.stamp });
          return;
        }
        if (m.type === 'create') {
          if (room) throw Error('你已经在房间中');
          if (rooms.size >= maxRooms) throw Error('当前房间已满，请稍后再试');
          let code;
          do {
            code = crypto.randomBytes(3).toString('hex').toUpperCase();
          } while (rooms.has(code));
          const mission = 0,
            custom = !!m.map,
            map = custom ? D.validateMap(m.map) : D.campaign(mission);
          room = {
            code,
            mission,
            stage: 0,
            custom,
            map,
            difficulty: 'normal',
            slots: [newSlot(ws, 'Asuka'), null],
            game: null,
            created: now,
            round: null,
            paused: false,
          };
          rooms.set(code, room);
          attach(ws, room, 0);
          return;
        }
        if (m.type === 'join') {
          if (room) throw Error('你已经在房间中');
          const code = String(m.code || '').toUpperCase();
          room = rooms.get(code);
          if (!room) throw Error('房间不存在或已关闭');
          if (room.slots[1]) throw Error('房间已满');
          room.slots[1] = newSlot(ws, room.slots[0].character === 'Asuka' ? 'Rei' : 'Asuka');
          attach(ws, room, 1);
          return;
        }
        if (m.type === 'resume') {
          if (room) throw Error('你已经在房间中');
          room = rooms.get(String(m.code || ''));
          if (!room) throw Error('房间已结束，请重新创建');
          const slot = room.slots.findIndex((s) => s && s.token === m.token);
          if (slot < 0 || room.slots[slot].ws || room.slots[slot].username !== ws.username)
            throw Error('无法恢复此座位');
          attach(ws, room, slot);
          return;
        }
        if (!room) throw Error('请先创建或加入房间');
        const s = room.slots[ws.slot];
        if (m.type === 'configure') {
          if (ws.slot !== 0 || room.game) throw Error('只有房主能在战前选择关卡');
          const mission = m.mission ?? room.mission,
            stage = m.stage ?? room.stage,
            difficulty = m.difficulty ?? room.difficulty;
          if (
            !Number.isInteger(mission) ||
            mission < 0 ||
            mission > 3 ||
            !Number.isInteger(stage) ||
            stage < 0 ||
            stage > 2 ||
            !['relaxed', 'normal', 'hard'].includes(difficulty)
          )
            throw Error('关卡配置无效');
          room.mission = mission;
          room.stage = stage;
          room.difficulty = difficulty;
          room.custom = false;
          room.map = D.campaign(mission, stage);
          room.slots.forEach((s) => {
            if (s) s.ready = false;
          });
          lobby(room);
        } else if (m.type === 'choose') {
          if (room.game || !['Asuka', 'Rei'].includes(m.character)) throw Error('当前无法选择角色');
          const other = room.slots.find((x) => x && x !== s && x.character === m.character);
          if (other?.ready) throw Error('请队友先取消准备再交换角色');
          if (other) {
            other.character = s.character;
            other.ready = false;
          }
          s.character = m.character;
          s.ready = false;
          lobby(room);
        } else if (m.type === 'ready') {
          if (room.game) throw Error('战斗已经开始');
          s.ready = !!m.ready;
          const user = profiles.byName(s.username);
          s.nodes = user
            ? progression().validateBuild(
                s.character,
                user.profile.characters[s.character].nodes,
                user.profile.characters[s.character].xp,
              )
            : [];
          s.upgrades = user ? {} : cleanUpgrades(m.upgrades);
          s.loadout = user
            ? { ...user.profile.loadouts[s.character] }
            : { ammo: 'AP', melee: s.character === 'Asuka' ? 'blade' : 'spear' };
          s.gear = user
            ? Object.values(user.profile.equipment[s.character] || {}).filter(Boolean)
            : [];
          lobby(room);
          if (room.slots.every((s) => s?.ws && s.ready)) start(room);
        } else if (m.type === 'input') {
          const input = m.input || {};
          s.input = {
            dir: Number.isInteger(input.dir) && input.dir >= 0 && input.dir <= 3 ? input.dir : -1,
          };
          for (const k of ['fire', 'heal', 'speed', 'special', 'ultimate', 'melee', 'item'])
            s.input[k] = input[k] === true;
          if (['AP', 'HE', 'HESH'].includes(input.ammo)) s.input.ammo = input.ammo;
          s.lastInput = now;
        } else if (m.type === 'pause') {
          if (room.game?.status === 'playing' && room.slots.every((s) => s?.ws)) {
            room.paused = !!m.paused;
            room.slots.forEach((s) => (s.input = {}));
            broadcast(room, snapshot(room));
          }
        } else if (m.type === 'prepare') {
          if (ws.slot !== 0) throw Error('请等待房主返回战前准备');
          if (!room.game || !['won', 'lost'].includes(room.game.status))
            throw Error('当前战斗尚未结束');
          if (!room.awarded) throw Error('战绩仍在保存，请稍后再试');
          room.game = null;
          room.round = null;
          room.paused = false;
          for (const slot of room.slots)
            if (slot) {
              slot.ready = false;
              slot.input = {};
            }
          broadcast(room, { type: 'briefing' });
          lobby(room);
        } else if (m.type === 'next' || m.type === 'retry') {
          if (ws.slot !== 0) throw Error('请等待房主选择下一场战斗');
          if (!room.game || !['won', 'lost'].includes(room.game.status))
            throw Error('当前战斗尚未结束');
          if (!room.awarded) throw Error('战绩仍在保存，请稍后再试');
          if (room.slots.some((s) => !s?.ws)) throw Error('等待队友重连');
          if (m.type === 'next') {
            if (
              room.custom ||
              room.game.status !== 'won' ||
              (room.mission === 3 && room.stage === 2)
            )
              throw Error('没有下一关');
            room.stage++;
            if (room.stage > 2) {
              room.stage = 0;
              room.mission++;
            }
            room.map = D.campaign(room.mission, room.stage);
          }
          start(room);
        } else if (m.type === 'leave') destroy(room, '队友已离开房间。');
      } catch (e) {
        send(ws, { type: 'error', message: e.message });
      }
    });
    ws.on('close', () => {
      const room = ws.room;
      if (!room || rooms.get(room.code) !== room) return;
      const s = room.slots[ws.slot];
      if (s.ws !== ws) return;
      s.ws = null;
      s.input = {};
      s.disconnectedAt = Date.now();
      if (room.game && room.game.status === 'playing') room.paused = 'disconnect';
      lobby(room);
      if (room.game) broadcast(room, snapshot(room));
    });
  });
  let ticks = 0;
  const loop = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      if (room.slots.some((s) => s?.disconnectedAt && now - s.disconnectedAt > reconnectMs)) {
        destroy(room, '重连等待已超时，房间关闭。');
        continue;
      }
      if (now - room.created > 2 * 60 * 60 * 1000) {
        destroy(room, '房间已到期，请重新创建。');
        continue;
      }
      if (room.game) {
        if (!room.paused && room.game.status === 'playing')
          room.game.step(
            1 / 30,
            room.slots.map((s) => (now - s.lastInput < 300 ? s.input : {})),
          );
        if (
          !room.awarded &&
          ['won', 'lost'].includes(room.game.status) &&
          now >= room.rewardRetryAt
        ) {
          for (let index = 0; index < room.slots.length; index++) {
            if (room.rewardSlots[index]) continue;
            const s = room.slots[index];
            if (!s.username || room.custom) {
              room.rewardSlots[index] = true;
              continue;
            }
            try {
              profiles.award(s.username, s.character, room.game, room);
              room.rewardSlots[index] = true;
            } catch (e) {
              if (!room.rewardErrors.has(index)) {
                room.rewardErrors.add(index);
                send(s.ws, { type: 'error', message: '战绩暂未保存，服务器正在重试' });
                console.error('Profile save failed:', e.message);
              }
            }
          }
          room.awarded = room.rewardSlots.every(Boolean);
          room.rewardRetryAt = now + 1000;
        }
        if (ticks % 2 === 0) broadcast(room, snapshot(room));
      }
    }
    ticks++;
  }, 1000 / 30);
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) {
        ws.terminate();
        continue;
      }
      ws.alive = false;
      ws.ping();
      if (!ws.room && Date.now() - ws.created > 60000) ws.close(1000, 'Idle');
    }
  }, 10000);
  function close() {
    clearInterval(loop);
    clearInterval(heartbeat);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    return new Promise((resolve) =>
      server.close(() => {
        profiles.close();
        resolve();
      }),
    );
  }
  return { server, rooms, close };
}
if (require.main === module) {
  const app = createServer();
  const port = Number(process.env.PORT) || 8178,
    host = process.env.HOST || '127.0.0.1';
  app.server.listen(port, host, () => console.log(`Dawn multiplayer: http://${host}:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => app.close().then(() => process.exit(0)));
}
module.exports = { createServer };
