'use strict';
const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');
const D = require('../packages/simulation/dist/index.js');
const { createProfiles } = require('./profiles.cjs');
const { RequestError } = require('./errors.cjs');
const CLIENT = path.resolve(__dirname, '../client/dist');
const send = (ws, data) => {
  if (ws?.readyState === WebSocket.OPEN && ws.bufferedAmount < 262144)
    return (ws.send(JSON.stringify(data)), true);
  return false;
};
function createServer({
  reconnectMs = 30000,
  maxRooms = 30,
  secureCookies = process.env.DAWN_SECURE_COOKIES === '1',
  trustedProxies = (process.env.DAWN_TRUST_PROXY || '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean),
  profilesFactory = createProfiles,
  profilesFile = process.env.DAWN_PROFILES_FILE ||
    path.resolve(__dirname, '../data/profiles.sqlite'),
  webRoot = process.env.DAWN_CLIENT_DIR || CLIENT,
} = {}) {
  const WEB = path.resolve(webRoot);
  const pendingResults = new Map();
  const rooms = new Map(),
    profiles = profilesFactory(profilesFile, { secureCookies }),
    attempts = new Map();
  const equipment = () => D.Equipment;
  const progression = () => D.Progression;
  const publicUser = (u) =>
    u
      ? { user: { username: u.username, revision: u.revision }, profile: u.profile }
      : { user: null };
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
        if (req.url === '/api/room' && req.method === 'GET') {
          const user = profiles.get(req);
          if (!user) return json(res, 401, { error: '请先登录' });
          const seat = accountSeat(user.username);
          return json(res, 200, {
            room: seat ? { code: seat.room.code, token: seat.slot.token } : null,
          });
        }
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
          const peer = req.socket.remoteAddress;
          const forwarded = String(req.headers['x-forwarded-for'] || '')
            .split(',')
            .at(-1)
            .trim();
          const address =
            trustedProxies.includes(peer) && require('node:net').isIP(forwarded) ? forwarded : peer;
          const key = `${address}:${String(body.username).toLowerCase()}`,
            now = Date.now();
          if (attempts.size > 1000)
            for (const [k, v] of attempts) if (now - v.at > 60000) attempts.delete(k);
          let a = attempts.get(key);
          if (!a || now - a.at > 60000) {
            a = { at: now, n: 0 };
            attempts.set(key, a);
          }
          let source = attempts.get(`ip:${address}`);
          if (!source || now - source.at > 60000) {
            source = { at: now, n: 0 };
            attempts.set(`ip:${address}`, source);
          }
          if (++a.n > 15 || ++source.n > 120)
            return json(res, 429, { error: '尝试过于频繁，请稍后重试' });
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
          revokeInvalidConnections();
          return json(res, 200, { user: null });
        }
        const user = profiles.get(req);
        if (!user) return json(res, 401, { error: '请先登录' });
        if (req.url === '/api/password') {
          await profiles.changePassword(user, body.currentPassword, body.newPassword, res);
          revokeInvalidConnections();
          return json(res, 200, publicUser(user));
        }
        if (req.url === '/api/build') {
          profiles.mutate(user, (p) => {
            if (!['Asuka', 'Rei'].includes(body.character)) throw new RequestError('角色无效');
            p.characters[body.character].nodes = progression().validateBuild(
              body.character,
              body.nodes,
              p.characters[body.character].xp,
            );
          });
          invalidateReady(user.username);
          return json(res, 200, publicUser(user));
        }
        if (req.url === '/api/shop') {
          profiles.purchase(user, body.itemId, body.operationId);
          return json(res, 200, publicUser(user));
        }
        if (req.url === '/api/equip') {
          profiles.mutate(user, (p) => {
            if (!['Asuka', 'Rei'].includes(body.character)) throw new RequestError('角色无效');
            const validSlots = new Set(equipment().ITEMS.map((i) => i.slot));
            if (!validSlots.has(body.slot)) throw new RequestError('装备槽无效');
            if (body.itemId === null) p.equipment[body.character][body.slot] = null;
            else {
              const item = equipment().ITEMS.find((i) => i.id === body.itemId);
              if (!item || item.slot !== body.slot || !p.inventory.includes(item.id))
                throw new RequestError('尚未拥有该槽位装备');
              p.equipment[body.character][body.slot] = item.id;
            }
          });
          invalidateReady(user.username);
          return json(res, 200, publicUser(user));
        }
        if (req.url === '/api/loadout') {
          profiles.mutate(user, (p) => {
            if (
              !['Asuka', 'Rei'].includes(body.character) ||
              !['AP', 'HE', 'HESH'].includes(body.ammo) ||
              !['blade', 'spear'].includes(body.melee)
            )
              throw new RequestError('角色、弹种或近战武器无效');
            p.loadouts[body.character] = { ammo: body.ammo, melee: body.melee };
          });
          invalidateReady(user.username);
          return json(res, 200, publicUser(user));
        }
        if (req.url === '/api/appearance') {
          profiles.mutate(user, (p) => {
            const hasPilot = Object.hasOwn(body, 'pilot'),
              hasMotion = Object.hasOwn(body, 'reducedMotion');
            if (
              (!hasPilot && !hasMotion) ||
              (hasPilot && !['Asuka', 'Rei'].includes(body.pilot)) ||
              (hasMotion && typeof body.reducedMotion !== 'boolean')
            )
              throw new RequestError('看板角色或动态偏好无效');
            if (hasPilot) p.appearance.pilot = body.pilot;
            if (hasMotion) p.appearance.reducedMotion = body.reducedMotion;
          });
          return json(res, 200, publicUser(user));
        }
        if (req.url === '/api/draw') {
          const reward = profiles.draw(user, body.operationId);
          return json(res, 200, { ...publicUser(user), reward });
        }
        if (req.url === '/api/tutorial') {
          if (body.complete !== true) throw new RequestError('教学状态无效');
          profiles.completeTutorial(user, body.operationId);
          return json(res, 200, publicUser(user));
        }
        return json(res, 404, { error: '接口不存在' });
      } catch (e) {
        if (e instanceof RequestError || e instanceof D.ValidationError)
          return json(res, 400, { error: e.message });
        console.error('API request failed:', e);
        return json(res, 500, { error: '服务器暂时无法完成请求，请稍后重试' });
      }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      res.end();
      return;
    }
    if (req.url === '/ready') {
      const build = fs.existsSync(path.join(WEB, 'index.html'));
      let storage = true;
      try {
        profiles.health();
      } catch {
        storage = false;
      }
      json(res, build && storage ? 200 : 503, { ok: build && storage, build, storage });
      return;
    }
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
      return;
    }
    if (!fs.existsSync(path.join(WEB, 'index.html'))) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('客户端尚未构建。请先构建 client/dist，或显式设置 DAWN_CLIENT_DIR。');
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
    if (!profiles.get(req)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  function accountSeat(username) {
    for (const room of rooms.values())
      for (const slot of room.slots)
        if (slot && slot.username.toLowerCase() === username.toLowerCase()) return { room, slot };
    return null;
  }
  function invalidateReady(username) {
    const seat = accountSeat(username);
    if (!seat || seat.room.game) return;
    seat.slot.ready = false;
    lobby(seat.room);
  }
  function revokeInvalidConnections() {
    for (const ws of wss.clients) {
      if (profiles.sessionValid(ws.request)) continue;
      if (ws.room) destroy(ws.room, '登录已失效，请重新登录。');
      else {
        send(ws, { type: 'ended', message: '登录已失效，请重新登录。' });
        ws.close(4003, 'Session expired');
      }
    }
  }
  function loadBuild(slot) {
    const user = profiles.byName(slot.username);
    if (!user) throw Error('Room account does not exist');
    const character = slot.character;
    slot.nodes = progression().validateBuild(
      character,
      user.profile.characters[character].nodes,
      user.profile.characters[character].xp,
    );
    slot.loadout = { ...user.profile.loadouts[character] };
    slot.gear = Object.values(user.profile.equipment[character]).filter(Boolean);
  }
  function resetInput(slot) {
    slot.input = {};
    slot.commands = [];
    slot.commandAck = slot.commandSeq;
    if (slot.ws && slot.ws.room?.round)
      send(slot.ws, { type: 'input-ack', round: slot.ws.room.round, seq: slot.commandAck });
  }
  function flushEvents(room) {
    for (const slot of room.slots) {
      if (!slot?.ws) continue;
      const events = room.events.filter((event) => event.seq > slot.eventCursor);
      if (events.length && send(slot.ws, { type: 'events', round: room.round, events }))
        slot.eventCursor = events.at(-1).seq;
    }
  }
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
      unlocked: profiles.byName(room.slots[0].username).profile.unlocked,
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
        events: [],
        cooperation: g.cooperation,
        difficulty: g.difficulty,
        coop: true,
      },
    };
  }
  function start(room) {
    room.slots.forEach(loadBuild);
    for (const slot of room.slots) {
      slot.input = {};
      slot.commands = [];
      slot.commandAck = 0;
      slot.commandSeq = 0;
      slot.eventCursor = 0;
    }
    room.events = [];
    room.eventSeq = 0;
    const builds = Object.fromEntries(room.slots.map((s) => [s.character, s.nodes]));
    room.game = new D.Game(room.map, {
      coop: true,
      nodes: builds,
      loadouts: Object.fromEntries(room.slots.map((s) => [s.character, s.loadout])),
      gear: Object.fromEntries(room.slots.map((s) => [s.character, s.gear])),
      characters: room.slots.map((s) => s.character),
      difficulty: room.difficulty,
      seed: crypto.randomBytes(4).readUInt32LE(),
    });
    room.paused = false;
    room.awarded = false;
    room.rewardRecorded = false;
    room.rewardRetryAt = 0;
    room.rewardError = false;
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
  function roundResult(room) {
    return {
      round: room.round,
      mission: room.mission,
      stage: room.stage,
      status: room.game.status,
      score: room.game.score,
      time: room.game.time,
      participants: room.slots.map((slot) => ({
        username: slot.username,
        character: slot.character,
        stats: { ...room.game.players.find((player) => player.character === slot.character).stats },
      })),
    };
  }
  function retainResult(room) {
    if (
      !room.custom &&
      room.game &&
      ['won', 'lost'].includes(room.game.status) &&
      !room.rewardRecorded &&
      !pendingResults.has(room.round)
    )
      pendingResults.set(room.round, roundResult(room));
  }
  function destroy(room, reason) {
    retainResult(room);
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
    if (s.ws && s.ws !== ws) {
      const previous = s.ws;
      previous.room = null;
      send(previous, { type: 'ended', message: '房间已在另一页面恢复。' });
      previous.close(4001, 'Seat replaced');
    }
    s.ws = ws;
    s.eventCursor = room.eventSeq;
    s.disconnectedAt = 0;
    ws.room = room;
    ws.slot = slot;
    send(ws, { type: 'joined', code: room.code, slot, token: s.token, commandSeq: s.commandSeq });
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
      input: {},
      commands: [],
      commandSeq: 0,
      commandAck: 0,
      eventCursor: 0,
      lastInput: 0,
      disconnectedAt: 0,
    };
  }
  wss.on('connection', (ws, req) => {
    ws.username = profiles.get(req).username;
    ws.request = req;
    ws.alive = true;
    ws.window = Date.now();
    ws.messages = 0;
    ws.created = Date.now();
    ws.on('pong', () => (ws.alive = true));
    ws.on('error', () => {});
    ws.on('message', (raw) => {
      if (!profiles.sessionValid(req)) {
        revokeInvalidConnections();
        return;
      }
      if (ws.room && ws.room.slots[ws.slot].ws !== ws) return;
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
        if (!m || typeof m !== 'object') throw new RequestError('invalid');
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
          if (room || accountSeat(ws.username))
            throw new RequestError('账号已经在房间中，请恢复原房间或先退出');
          if (rooms.size >= maxRooms) throw new RequestError('当前房间已满，请稍后再试');
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
            events: [],
            eventSeq: 0,
          };
          rooms.set(code, room);
          attach(ws, room, 0);
          return;
        }
        if (m.type === 'join') {
          if (room || accountSeat(ws.username))
            throw new RequestError('账号已经在房间中，请恢复原房间或先退出');
          const code = String(m.code || '').toUpperCase();
          room = rooms.get(code);
          if (!room) throw new RequestError('房间不存在或已关闭');
          if (room.slots[1]) throw new RequestError('房间已满');
          room.slots[1] = newSlot(ws, room.slots[0].character === 'Asuka' ? 'Rei' : 'Asuka');
          attach(ws, room, 1);
          return;
        }
        if (m.type === 'resume') {
          if (room) throw new RequestError('你已经在房间中');
          room = rooms.get(String(m.code || ''));
          if (!room) throw new RequestError('房间已结束，请重新创建');
          const slot = room.slots.findIndex((s) => s && s.token === m.token);
          if (slot < 0 || room.slots[slot].username !== ws.username)
            throw new RequestError('无法恢复此座位');
          attach(ws, room, slot);
          return;
        }
        if (!room) throw new RequestError('请先创建或加入房间');
        const s = room.slots[ws.slot];
        if (m.type === 'configure') {
          if (ws.slot !== 0 || room.game) throw new RequestError('只有房主能在战前选择关卡');
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
            throw new RequestError('关卡配置无效');
          if (mission * 3 + stage + 1 > profiles.byName(s.username).profile.unlocked)
            throw new RequestError('房主尚未解锁此关卡');
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
          if (room.game || !['Asuka', 'Rei'].includes(m.character))
            throw new RequestError('当前无法选择角色');
          const other = room.slots.find((x) => x && x !== s && x.character === m.character);
          if (other?.ready) throw new RequestError('请队友先取消准备再交换角色');
          if (other) {
            other.character = s.character;
            other.ready = false;
          }
          s.character = m.character;
          s.ready = false;
          lobby(room);
        } else if (m.type === 'ready') {
          if (room.game) throw new RequestError('战斗已经开始');
          if (typeof m.ready !== 'boolean') throw new RequestError('准备状态无效');
          loadBuild(s);
          s.ready = m.ready;
          lobby(room);
          if (room.slots.every((s) => s?.ws && s.ready)) start(room);
        } else if (m.type === 'input') {
          if (!room.game || m.round !== room.round) return;
          const input = m.input;
          if (
            !input ||
            typeof input !== 'object' ||
            !Number.isInteger(input.dir) ||
            input.dir < -1 ||
            input.dir > 3 ||
            typeof input.fire !== 'boolean' ||
            !Array.isArray(m.commands) ||
            m.commands.length > 64
          )
            throw new RequestError('输入格式无效');
          const accepted = [];
          let nextSeq = s.commandSeq;
          for (const command of m.commands) {
            if (
              !command ||
              !Number.isSafeInteger(command.seq) ||
              command.seq < 1 ||
              !['fire', 'heal', 'speed', 'special', 'ultimate', 'melee', 'item', 'ammo'].includes(
                command.key,
              ) ||
              (command.key === 'ammo' && !['AP', 'HE', 'HESH'].includes(command.value))
            )
              throw new RequestError('技能命令无效');
            if (command.seq <= nextSeq) continue;
            if (command.seq !== nextSeq + 1) throw new RequestError('技能命令序号不连续');
            accepted.push(command);
            nextSeq = command.seq;
          }
          if (s.commands.length + accepted.length > 128)
            throw new RequestError('待执行技能命令过多');
          s.commandSeq = nextSeq;
          s.lastInput = now;
          if (room.paused || room.game.status !== 'playing') {
            resetInput(s);
          } else {
            s.input = { dir: input.dir, fire: input.fire };
            s.commands.push(...accepted);
          }
          send(ws, { type: 'input-ack', round: room.round, seq: s.commandAck });
        } else if (m.type === 'pause') {
          if (room.game?.status === 'playing' && room.slots.every((s) => s?.ws)) {
            room.paused = !!m.paused;
            room.slots.forEach(resetInput);
            broadcast(room, snapshot(room));
          }
        } else if (m.type === 'prepare') {
          if (ws.slot !== 0) throw new RequestError('请等待房主返回战前准备');
          if (!room.game || !['won', 'lost'].includes(room.game.status))
            throw new RequestError('当前战斗尚未结束');
          if (!room.awarded) throw new RequestError('战绩仍在保存，请稍后再试');
          room.game = null;
          room.round = null;
          room.paused = false;
          for (const slot of room.slots)
            if (slot) {
              slot.ready = false;
              resetInput(slot);
            }
          broadcast(room, { type: 'briefing' });
          lobby(room);
        } else if (m.type === 'next' || m.type === 'retry') {
          if (ws.slot !== 0) throw new RequestError('请等待房主选择下一场战斗');
          if (!room.game || !['won', 'lost'].includes(room.game.status))
            throw new RequestError('当前战斗尚未结束');
          if (!room.awarded) throw new RequestError('战绩仍在保存，请稍后再试');
          if (room.slots.some((s) => !s?.ws)) throw new RequestError('等待队友重连');
          if (m.type === 'next') {
            if (
              room.custom ||
              room.game.status !== 'won' ||
              (room.mission === 3 && room.stage === 2)
            )
              throw new RequestError('没有下一关');
            room.stage++;
            if (room.stage > 2) {
              room.stage = 0;
              room.mission++;
            }
            room.map = D.campaign(room.mission, room.stage);
          }
          if (
            !room.custom &&
            room.mission * 3 + room.stage + 1 > profiles.byName(s.username).profile.unlocked
          )
            throw new RequestError('房主尚未解锁此关卡');
          start(room);
        } else if (m.type === 'leave') destroy(room, '队友已离开房间。');
      } catch (e) {
        if (e instanceof RequestError || e instanceof D.ValidationError)
          send(ws, { type: 'error', message: e.message });
        else {
          console.error('Room message failed:', e);
          send(ws, { type: 'error', message: '服务器暂时无法完成房间操作' });
        }
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
      if (room.game && room.game.status === 'playing' && !room.paused) room.paused = 'disconnect';
      lobby(room);
      if (room.game) broadcast(room, snapshot(room));
    });
  });
  let ticks = 0;
  const loop = setInterval(() => {
    const now = Date.now();
    revokeInvalidConnections();
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
        if (!room.paused && room.game.status === 'playing') {
          room.game.step(
            1 / 30,
            room.slots.map((slot) => {
              const input = now - slot.lastInput < 300 ? { ...slot.input } : {};
              const command = slot.commands.shift();
              if (command) {
                input[command.key] = command.key === 'ammo' ? command.value : true;
                slot.commandAck = command.seq;
              }
              return input;
            }),
          );
          for (const name of room.game.events) room.events.push({ seq: ++room.eventSeq, name });
          room.events = room.events.slice(-256);
          for (const slot of room.slots)
            send(slot.ws, { type: 'input-ack', round: room.round, seq: slot.commandAck });
        }
        if (
          !room.awarded &&
          ['won', 'lost'].includes(room.game.status) &&
          now >= room.rewardRetryAt
        ) {
          try {
            if (!room.custom) {
              if (!room.rewardRecorded) {
                retainResult(room);
                profiles.recordRound(pendingResults.get(room.round) || roundResult(room));
                pendingResults.delete(room.round);
                room.rewardRecorded = true;
              }
              profiles.settleRound(room.round);
            }
            room.awarded = true;
          } catch (error) {
            if (!room.rewardError) {
              room.rewardError = true;
              broadcast(room, { type: 'error', message: '战绩暂未保存，服务器正在重试' });
              console.error('Round save failed:', error.message);
            }
          }
          room.rewardRetryAt = now + 1000;
        }
        if (ticks % 2 === 0) {
          broadcast(room, snapshot(room));
          flushEvents(room);
        }
      }
    }
    ticks++;
  }, 1000 / 30);
  let pendingSaveError = false;
  const settlementLoop = setInterval(() => {
    try {
      for (const [round, result] of pendingResults) {
        profiles.recordRound(result);
        pendingResults.delete(round);
      }
      profiles.settlePending();
      pendingSaveError = false;
    } catch (error) {
      if (!pendingSaveError)
        console.error('Pending round save failed; results remain unconfirmed:', error.message);
      pendingSaveError = true;
    }
  }, 1000);
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
    clearInterval(settlementLoop);
    for (const room of rooms.values()) retainResult(room);
    for (const [round, result] of pendingResults) {
      try {
        profiles.recordRound(result);
        pendingResults.delete(round);
      } catch (error) {
        console.error('Shutdown could not persist round:', round, error.message);
      }
    }
    rooms.clear();
    for (const ws of wss.clients) {
      ws.room = null;
      ws.terminate();
    }
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
