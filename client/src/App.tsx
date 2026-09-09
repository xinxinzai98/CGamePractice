import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Progression,
  Equipment,
  type Character,
  type Profile,
  type GameState,
  type InputState,
  type Loadout,
} from '@dawn/simulation';
import { createGame, type GameRuntime } from './game';
import { request, listRooms, type ApiResponse, type User, type PublicRoom } from './services/api';
import { RoomClient, type Lobby, type StartMessage } from './services/room-client';
import { AudioService } from './services/audio';
import { AuthModal } from './ui/AuthModal';
import { PilotDisplay } from './ui/PilotDisplay';
import { BattleHud } from './ui/BattleHud';
import { SkillIcon } from './ui/SkillIcon';
import { ProgressionPanels } from './ui/ProgressionPanels';
import './ui/progression-panels.css';
type View =
  | 'cover'
  | 'loading'
  | 'lobby'
  | 'briefing'
  | 'battle'
  | 'practice'
  | 'skills'
  | 'shop'
  | 'supply'
  | 'records'
  | 'gallery';
const names: Record<Character, string> = { Asuka: '明日香', Rei: '绫波丽' };
const missionNames = ['旧日清晨', '河岸防线', '纵深行动', '黎明之战'];
const emptyProfile = () => Progression.normalizeProfile({});
export function App() {
  const host = useRef<HTMLDivElement>(null),
    runtime = useRef<GameRuntime | null>(null),
    room = useRef<RoomClient | null>(null),
    audio = useRef(new AudioService());
  const [view, setView] = useState<View>('cover'),
    [user, setUser] = useState<User | null>(null),
    [profile, setProfile] = useState<Profile>(emptyProfile),
    [authOpen, setAuthOpen] = useState(false),
    [profileOpen, setProfileOpen] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false);
  const actionInput = useRef<InputState>({});
  const [rewardsSaved, setRewardsSaved] = useState(false);
  const rewardRefresh = useRef('');
  const [assetsReady, setAssetsReady] = useState(false),
    [progress, setProgress] = useState(0),
    [scale, setScale] = useState(1),
    [message, setMessage] = useState(''),
    [muted, setMuted] = useState(false),
    [reducedMotion, setReducedMotion] = useState(
      matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
  const [lobby, setLobby] = useState<Lobby | null>(null),
    [roomCode, setRoomCode] = useState(new URLSearchParams(location.search).get('room') || ''),
    [slot, setSlot] = useState(0),
    [current, setCurrent] = useState<StartMessage | null>(null),
    [snapshot, setSnapshot] = useState<GameState | null>(null),
    [paused, setPaused] = useState(false),
    [waiting, setWaiting] = useState(false),
    [latency, setLatency] = useState(0),
    [connection, setConnection] = useState('');
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([]),
    [mission, setMission] = useState(0),
    [stage, setStage] = useState(0),
    [difficulty, setDifficulty] = useState<'relaxed' | 'normal' | 'hard'>('normal');
  const [character, setCharacter] = useState<Character>('Asuka'),
    [trialBuilds, setTrialBuilds] = useState<Partial<Record<Character, string[]>>>({}),
    [noCooldown, setNoCooldown] = useState(false),
    [tutorial, setTutorial] = useState(false),
    [weapon, setWeapon] = useState<Loadout>({ ammo: 'AP', melee: 'blade' });
  const [volume, setVolume] = useState(0.022);
  const afterLoading = useRef<View>('lobby'),
    toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    lastResult = useRef(''),
    tutorialSaved = useRef(false);
  const latest = useRef({ view, user, profile, slot, current, paused, waiting });
  latest.current = { view, user, profile, slot, current, paused, waiting };
  const toast = useCallback((text: string) => {
    setMessage(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setMessage(''), 4200);
  }, []);
  const apply = useCallback((result: ApiResponse) => {
    setUser(result.user);
    setProfile(result.profile);
  }, []);
  const callApi = useCallback(
    async (action: string, body: Record<string, unknown>) => {
      const result = await request(action, body);
      apply(result);
      return result;
    },
    [apply],
  );
  const refresh = useCallback(async () => {
    try {
      apply(await request('me'));
    } catch (e) {
      toast(e instanceof Error ? e.message : '存档服务未连接');
    }
  }, [apply, toast]);
  useEffect(() => {
    const resize = () => setScale(Math.min(innerWidth / 1600, innerHeight / 900));
    resize();
    window.addEventListener('resize', resize);
    void refresh();
    return () => {
      window.removeEventListener('resize', resize);
      clearTimeout(toastTimer.current);
    };
  }, [refresh]);
  const togglePause = useCallback(() => {
    const state = latest.current;
    if (state.view === 'battle') room.current?.send({ type: 'pause', paused: !state.paused });
    else if (state.view === 'practice') {
      runtime.current?.pausePractice(!state.paused);
      setPaused(!state.paused);
    }
  }, []);
  useEffect(() => {
    if (!host.current) return;
    let active = true;
    const game = createGame(host.current, {
      onReady: () => {
        if (active) setAssetsReady(true);
      },
      onProgress: (value) => {
        if (active) setProgress(value);
      },
      onSnapshot: (state) => {
        if (active && latest.current.view === 'practice') setSnapshot({ ...state });
      },
      onInput: (input) => {
        if (latest.current.view === 'battle') {
          room.current?.input({ ...input, ...actionInput.current });
          actionInput.current = {};
        }
      },
      onPauseRequest: togglePause,
      onError: toast,
    });
    runtime.current = game;
    return () => {
      active = false;
      room.current?.close();
      game.destroy();
      audio.current.destroy();
      runtime.current = null;
    };
  }, [toast, togglePause]);
  useEffect(() => {
    const scene =
      view === 'cover' || view === 'loading'
        ? 'cover'
        : view === 'battle'
          ? 'battle'
          : view === 'practice'
            ? 'practice'
            : view === 'briefing'
              ? 'briefing'
              : 'lobby';
    runtime.current?.setView(scene);
  }, [view]);
  useEffect(() => {
    runtime.current?.setPilot(profile.appearance.pilot);
    runtime.current?.setReducedMotion(reducedMotion || profile.appearance.reducedMotion);
  }, [profile.appearance, reducedMotion]);
  useEffect(() => {
    audio.current.muted = muted;
    audio.current.volume = volume;
  }, [muted, volume]);
  useEffect(() => {
    if (view === 'loading' && assetsReady) {
      const t = setTimeout(() => setView(afterLoading.current), 350);
      return () => clearTimeout(t);
    }
  }, [view, assetsReady]);
  useEffect(() => {
    if (view !== 'lobby') return;
    let active = true;
    const update = () =>
      void listRooms()
        .then((rooms) => {
          if (active) setPublicRooms(rooms);
        })
        .catch(() => {});
    update();
    const t = setInterval(update, 6000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [view]);
  useEffect(() => {
    if (!snapshot) return;
    snapshot.events.slice(0, 3).forEach((kind) => {
      if (kind === 'noenergy') return;
      audio.current.play(kind);
    });
    if (
      view === 'battle' &&
      (snapshot.status === 'won' || snapshot.status === 'lost') &&
      current &&
      lastResult.current !== current.round
    ) {
      lastResult.current = current.round;
      audio.current.play(snapshot.status === 'won' ? 'win' : 'boom');
    }
    if (view === 'battle' && rewardsSaved && current && rewardRefresh.current !== current.round) {
      rewardRefresh.current = current.round;
      void refresh();
    }
    if (view === 'practice' && tutorial && !tutorialSaved.current) {
      const stats = snapshot.players[0]?.stats;
      if (
        stats &&
        stats.moved > 80 &&
        stats.shots >= 3 &&
        stats.skillUses.speed &&
        stats.skillUses.special &&
        stats.skillUses.ultimate &&
        stats.melee &&
        stats.heals
      ) {
        tutorialSaved.current = true;
        if (user)
          void callApi('tutorial', { complete: true })
            .then(() => toast('首次同步完成，补给券已存入档案。'))
            .catch((e) => toast(String(e)));
      }
    }
  }, [snapshot, view, current, tutorial, user, callApi, toast, refresh, rewardsSaved]);
  const loadInto = (next: View) => {
    afterLoading.current = next;
    setView('loading');
    void audio.current.enable();
  };
  const enter = () => {
    if (view !== 'cover') return;
    void audio.current.enable();
    if (user) loadInto('lobby');
    else setAuthOpen(true);
  };
  const navigate = (next: View) => {
    if (view === 'battle' || view === 'practice') {
      toast('请先暂停并离开当前作战。');
      return;
    }
    setView(next);
  };
  const leaveRoom = () => {
    room.current?.close();
    room.current = null;
    setLobby(null);
    setCurrent(null);
    setSnapshot(null);
    setPaused(false);
    setWaiting(false);
    setConnection('');
    setView('lobby');
  };
  function connect(initial: Record<string, unknown>) {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (room.current) {
      setView(current ? 'battle' : 'briefing');
      return;
    }
    setConnection('connecting');
    const transport = new RoomClient(initial, {
      joined: (code, index) => {
        setRoomCode(code);
        latest.current.slot = index;
        setSlot(index);
        setView('briefing');
      },
      lobby: (data) => {
        setLobby(data);
        setMission(data.mission);
        setStage(data.stage);
        setDifficulty(data.difficulty);
        const c = data.slots[latest.current.slot]?.character;
        if (c) {
          setCharacter(c);
          setWeapon(latest.current.profile.loadouts[c]);
        }
      },
      start: (data) => {
        setRewardsSaved(false);
        setCurrent(data);
        latest.current.current = data;
        setPaused(false);
        setWaiting(false);
        setTutorial(false);
        setSnapshot(null);
        setView('battle');
        void audio.current.enable();
      },
      state: (state, pause, wait, saved) => {
        setRewardsSaved(saved);
        const session = latest.current.current;
        if (!session) return;
        const full = { ...state, map: session.map, practice: false };
        runtime.current?.applyNetworkState(full, session.map, latest.current.slot, session.round);
        setSnapshot(full);
        setPaused(pause);
        setWaiting(wait);
      },
      error: toast,
      ended: (text) => {
        room.current = null;
        setLobby(null);
        setCurrent(null);
        setSnapshot(null);
        setView('lobby');
        toast(text);
      },
      latency: setLatency,
      connection: (status) => {
        setConnection(status);
        if (status === 'reconnecting') {
          setWaiting(true);
          setPaused(true);
        }
      },
      briefing: () => {
        setCurrent(null);
        latest.current.current = null;
        setSnapshot(null);
        setPaused(false);
        setView('briefing');
      },
    });
    room.current = transport;
  }
  function practice(withTutorial: boolean) {
    if (!assetsReady) {
      toast('资源仍在载入，请稍候。');
      return;
    }
    if (room.current) {
      toast('请先离开作战小队。');
      return;
    }
    setTutorial(withTutorial);
    tutorialSaved.current = false;
    setPaused(false);
    setCurrent(null);
    setSnapshot(null);
    runtime.current?.startPractice({
      character,
      nodes: trialBuilds[character] ?? profile.characters[character].nodes,
      gear: Object.values(profile.equipment[character]).filter((id): id is string => !!id),
      loadout: profile.loadouts[character],
      noCooldown,
      tutorial: withTutorial,
    });
    setView('practice');
    void audio.current.enable();
  }
  const activePilot = lobby?.slots[slot]?.character ?? character;
  const atBattle = view === 'battle' || view === 'practice';
  const showNav = !['cover', 'loading', 'battle', 'practice'].includes(view);
  function ability(key: string) {
    if (view === 'practice') runtime.current?.usePracticeSkill(key);
    else actionInput.current = { ...actionInput.current, [key]: true };
  }
  async function saveWeapon() {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    try {
      await callApi('loadout', { character: activePilot, ...weapon });
      room.current?.send({ type: 'ready', ready: false });
      toast('武器配置已保存。');
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败');
    }
  }
  return (
    <div
      className={
        'viewport ' + (reducedMotion || profile.appearance.reducedMotion ? 'reduced-motion' : '')
      }
      style={{ width: 1600 * scale, height: 900 * scale }}
    >
      <div className="phaser-host" ref={host} />
      <div className="ui-stage" style={{ transform: `scale(${scale})` }}>
        {view === 'cover' && (
          <section
            className="cover-screen"
            role="button"
            tabIndex={0}
            aria-label="进入黎明之战"
            onClick={enter}
            onWheel={(e) => {
              if (Math.abs(e.deltaY) > 15) enter();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') enter();
            }}
          >
            {!assetsReady && <img className="cover-fallback" src="/assets/cover-dawn.png" alt="" />}
            <div className="cover-vignette" />
            <div className="cover-title">
              <span>DAWN / PROJECT RESONANCE</span>
              <h1>黎明之战</h1>
              <p>BATTLE FOR THE DAWN</p>
            </div>
            <div className="cover-enter">
              <i />
              <span>点击或滑动，建立连接</span>
              <small>PRESS TO CONNECT</small>
            </div>
            <div className="cover-corner">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setView('gallery');
                }}
              >
                制作档案
              </button>
              <small>WEB CLIENT · 16:9</small>
            </div>
          </section>
        )}
        {view === 'loading' && (
          <section className="loading-screen">
            <span className="eyebrow">SYNCHRONIZATION</span>
            <h1>同步链路建立中</h1>
            <div className="loading-track">
              <i style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <span>{Math.round(progress * 100)}%</span>
          </section>
        )}
        {showNav && (
          <>
            <header className="topbar">
              <button className="brand" onClick={() => navigate('lobby')}>
                黎明之战<small>BATTLE FOR THE DAWN</small>
              </button>
              <span className="system-status">
                <i /> 指挥链路在线
              </span>
              <div className="wallet">
                <span>{profile.coins} 金币</span>
                <span>{profile.tickets} 补给券</span>
                <button onClick={() => (user ? setProfileOpen(true) : setAuthOpen(true))}>
                  {user?.username ?? '登录档案'}
                </button>
                <button onClick={() => setSettingsOpen(true)}>设置</button>
              </div>
            </header>
            <aside className="side-nav">
              {(
                [
                  ['lobby', '作战大厅', 'special'],
                  ['skills', '机体技能树', 'blink'],
                  ['shop', '配件仓库', 'item'],
                  ['supply', '补给招募', 'ultimate'],
                  ['records', '作战档案', 'fire'],
                ] as const
              ).map(([id, title, kind]) => (
                <button
                  key={id}
                  className={view === id ? 'active' : ''}
                  onClick={() => navigate(id)}
                >
                  <SkillIcon kind={kind} size={27} />
                  <span>{title}</span>
                </button>
              ))}
              <button className="archive-nav" onClick={() => navigate('gallery')}>
                制作档案 / 画廊
              </button>
            </aside>
          </>
        )}
        {view === 'lobby' && (
          <section className="lobby-screen screen-enter">
            <div className="lobby-shade" />
            <div className="lobby-heading">
              <span className="eyebrow">OPERATIONS // HANGAR</span>
              <h1>{user ? `${user.username}，欢迎归队。` : '欢迎来到黎明之战。'}</h1>
            </div>
            <div className="mecha-art">
              <img
                src={`/assets/mecha-${profile.appearance.pilot.toLowerCase()}.png`}
                alt="待命机体"
              />
            </div>
            <PilotDisplay
              pilot={profile.appearance.pilot}
              reducedMotion={reducedMotion || profile.appearance.reducedMotion}
            />
            <div className="lobby-slogan">
              <span>SYNCHRONIZATION READY</span>
              <h2>
                同步启动。
                <br />
                向黎明出击。
              </h2>
            </div>
            <aside className="lobby-panels">
              <div className="glass-panel">
                <span className="eyebrow">SQUAD LINK</span>
                <h2>加入作战小队</h2>
                <div className="join-row">
                  <input
                    aria-label="房间码"
                    placeholder="六位房间码"
                    value={roomCode}
                    maxLength={6}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  />
                  <button
                    onClick={() =>
                      /^[A-F0-9]{6}$/.test(roomCode)
                        ? connect({ type: 'join', code: roomCode })
                        : toast('请输入六位房间码。')
                    }
                  >
                    加入
                  </button>
                </div>
                <div className="public-rooms">
                  {publicRooms.length ? (
                    publicRooms.slice(0, 3).map((r) => (
                      <button key={r.code} onClick={() => connect({ type: 'join', code: r.code })}>
                        <span>
                          {r.code} · {r.mission + 1}-{r.stage + 1}
                        </span>
                        <small>{r.playersCount}/2 加入 →</small>
                      </button>
                    ))
                  ) : (
                    <p>当前没有等待中的小队</p>
                  )}
                </div>
              </div>
              <div className="glass-panel pilot-summary">
                {(['Asuka', 'Rei'] as Character[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setCharacter(c);
                      navigate('skills');
                    }}
                  >
                    <span
                      className="unit-avatar"
                      aria-hidden="true"
                      style={{ backgroundImage: `url(/assets/combat-${c.toLowerCase()}.png)` }}
                    />
                    <span>
                      <b>
                        {names[c]} · Lv.{1 + Math.floor(profile.characters[c].xp / 300)}
                      </b>
                      <small>熟练度 {profile.characters[c].xp}</small>
                    </span>
                  </button>
                ))}
              </div>
              <div className="glass-panel training-entry">
                <span className="eyebrow">SIMULATION</span>
                <div className="pilot-toggle">
                  {(['Asuka', 'Rei'] as Character[]).map((c) => (
                    <button
                      key={c}
                      className={character === c ? 'active' : ''}
                      onClick={() => setCharacter(c)}
                    >
                      {names[c]}
                    </button>
                  ))}
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={noCooldown}
                    onChange={(e) => setNoCooldown(e.target.checked)}
                  />{' '}
                  无限冷却 / 能量
                </label>
                <div>
                  <button onClick={() => practice(true)}>新手教学</button>
                  <button onClick={() => practice(false)}>自由训练 →</button>
                </div>
              </div>
            </aside>
            <div className="launch-control">
              <div>
                <span className="status-dot" /> 机体状态就绪
                <small>选择任务与配置后，双方同步出击</small>
              </div>
              <button
                className="primary"
                disabled={connection === 'connecting'}
                onClick={() => connect({ type: 'create' })}
              >
                {lobby ? '返回作战小队' : '组建作战小队'} →
              </button>
            </div>
            <div className="campaign-strip">
              {missionNames.map((name, i) => (
                <div key={name}>
                  <b>0{i + 1}</b>
                  <span>
                    {name}
                    <small>
                      {i + 1}-1 — {i + 1}-3
                    </small>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
        {view === 'briefing' && lobby && (
          <section className="content-screen screen-enter">
            <div className="section-heading">
              <div>
                <span className="eyebrow">SORTIE BRIEFING</span>
                <h1>战前准备</h1>
              </div>
              <div>
                <b className="room-label">小队 {lobby.code}</b>
                <button onClick={leaveRoom}>离开小队</button>
              </div>
            </div>
            <div className="briefing-grid">
              <div className="panel">
                <span className="eyebrow">01 / MISSION</span>
                <h2>作战任务</h2>
                <label>
                  战役
                  <select
                    aria-label="战役"
                    disabled={slot !== 0}
                    value={mission}
                    onChange={(e) => setMission(Number(e.target.value))}
                  >
                    {missionNames.map((name, i) => (
                      <option key={name} value={i}>
                        第 {i + 1} 战役 · {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  小关卡
                  <select
                    aria-label="小关卡"
                    disabled={slot !== 0}
                    value={stage}
                    onChange={(e) => setStage(Number(e.target.value))}
                  >
                    {[0, 1, 2].map((i) => (
                      <option key={i} value={i}>
                        {mission + 1}-{i + 1} · {i === 2 ? '使徒核心' : '战术行动'}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  作战难度
                  <select
                    disabled={slot !== 0}
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
                  >
                    <option value="relaxed">回忆 · 轻松体验</option>
                    <option value="normal">标准 · 协同挑战</option>
                    <option value="hard">危机 · 高压作战</option>
                  </select>
                </label>
                <button
                  disabled={slot !== 0}
                  onClick={() =>
                    room.current?.send({ type: 'configure', mission, stage, difficulty })
                  }
                >
                  确认任务与难度
                </button>
                <p className="muted">
                  {stage === 2
                    ? '同步装置破除力场后，集中火力攻击核心。'
                    : '留意敌方预警与双方支援。'}
                  变更任务后需要重新准备。
                </p>
                <small>分享房间码，让另一位驾驶员加入。</small>
              </div>
              <div className="panel loadout-panel">
                <span className="eyebrow">02 / PILOT & LOADOUT</span>
                <h2>出战配置</h2>
                <div className="character-options">
                  {(['Asuka', 'Rei'] as Character[]).map((c) => (
                    <button
                      key={c}
                      className={activePilot === c ? 'active' : ''}
                      onClick={() => room.current?.send({ type: 'choose', character: c })}
                    >
                      <span
                        className="unit-avatar large"
                        aria-hidden="true"
                        style={{ backgroundImage: `url(/assets/combat-${c.toLowerCase()}.png)` }}
                      />
                      <span>{names[c]}</span>
                      <small>
                        {c === 'Asuka' ? '重装爆发 / A.T. 力场' : '相位机动 / 共鸣支援'}
                      </small>
                    </button>
                  ))}
                </div>
                <p className="loadout-summary">
                  {profile.characters[activePilot].nodes
                    .map((id) => Progression.TREES[activePilot].find((n) => n.id === id)?.name)
                    .filter(Boolean)
                    .join(' / ') || '基础同步配置'}
                </p>
                <div className="loadout-actions">
                  <button
                    onClick={() => {
                      setCharacter(activePilot);
                      setView('skills');
                    }}
                  >
                    技能树配置
                  </button>
                  <button
                    onClick={() => {
                      setCharacter(activePilot);
                      setView('shop');
                    }}
                  >
                    装备配置
                  </button>
                </div>
                <label>
                  远程弹种
                  <select
                    value={weapon.ammo}
                    onChange={(e) =>
                      setWeapon({ ...weapon, ammo: e.target.value as Loadout['ammo'] })
                    }
                  >
                    <option value="AP">阳电子穿甲弹</option>
                    <option value="HE">N² 高爆弹</option>
                    <option value="HESH">共振碎甲弹</option>
                  </select>
                </label>
                <label>
                  近战武器
                  <select
                    value={weapon.melee}
                    onChange={(e) =>
                      setWeapon({ ...weapon, melee: e.target.value as Loadout['melee'] })
                    }
                  >
                    <option value="blade">高振动刀刃</option>
                    <option value="spear">相位长矛</option>
                  </select>
                </label>
                <button onClick={() => void saveWeapon()}>保存武器配置</button>
                <p className="muted">装扮扩展位 · 个人展示可在档案中切换</p>
              </div>
              <div className="panel squad-panel">
                <span className="eyebrow">03 / SYNCHRONIZATION</span>
                <h2>小队链路</h2>
                {lobby.slots.map((seat, i) => (
                  <div key={i} className={'squad-seat ' + (seat?.ready ? 'ready' : '')}>
                    <b>
                      {seat ? names[seat.character] : '等待驾驶员'}
                      {i === slot ? ' · 你' : ''}
                    </b>
                    <span>{seat?.username || '等待连接'}</span>
                    <small>
                      {!seat
                        ? '空闲席位'
                        : !seat.connected
                          ? '等待重连'
                          : seat.ready
                            ? '同步就绪'
                            : '正在配置'}
                    </small>
                  </div>
                ))}
                <div className="squad-description">
                  <b>双机共鸣</b>
                  <p>
                    接力命中 · 共享支援
                    <br />
                    近身救援 · 同步破盾
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() =>
                    room.current?.send({ type: 'ready', ready: !lobby.slots[slot]?.ready })
                  }
                >
                  {lobby.slots[slot]?.ready ? '取消准备' : '我已准备'}
                </button>
                <small>双方确认后自动出击</small>
              </div>
            </div>
          </section>
        )}
        {(['skills', 'shop', 'supply', 'records'] as View[]).includes(view) && (
          <section className="content-screen progression-screen screen-enter">
            <div className="section-heading">
              <div>
                <span className="eyebrow">PILOT ARCHIVE</span>
                <h1>
                  {view === 'skills'
                    ? '机体技能树'
                    : view === 'shop'
                      ? '配件仓库'
                      : view === 'supply'
                        ? '补给招募'
                        : '作战档案'}
                </h1>
              </div>
              {lobby && <button onClick={() => setView('briefing')}>返回战前准备</button>}
            </div>
            <div className="progression-body">
              <ProgressionPanels
                view={view as 'skills' | 'shop' | 'supply' | 'records'}
                profile={profile}
                username={user?.username ?? null}
                character={character}
                onCharacter={setCharacter}
                onApi={callApi}
                onToast={toast}
                onLogin={() => setAuthOpen(true)}
                onTrial={(c, nodes) => {
                  setTrialBuilds((v) => ({ ...v, [c]: nodes }));
                  setCharacter(c);
                  toast('试配已保存到本次模拟训练。');
                }}
              />
            </div>
          </section>
        )}
        {view === 'gallery' && (
          <section className="content-screen gallery-screen screen-enter">
            <div className="section-heading">
              <div>
                <span className="eyebrow">ARCHIVE / 2017 — 2026</span>
                <h1>从这里，向黎明</h1>
              </div>
              <button onClick={() => setView(user ? 'lobby' : 'cover')}>返回</button>
            </div>
            <div className="gallery-grid">
              <article>
                <img src="/assets/Hello.png" alt="2017 年原始封面" />
                <h2>原作记忆</h2>
                <p>
                  闫鑫、方铮辉于 2017
                  年一起开发的机甲游戏，带着对《新世纪福音战士》的致敬。原始工程和素材始终保留。
                </p>
              </article>
              <article>
                <img src="/assets/hangar-dawn.png" alt="新机库概念图" />
                <h2>双机共鸣</h2>
                <p>
                  新客户端延续机体、角色与合作主题。新增概念画、战斗素材及图标独立保存，来源见仓库素材记录。
                </p>
              </article>
            </div>
          </section>
        )}
        {atBattle && snapshot && (
          <BattleHud
            state={snapshot}
            index={view === 'practice' ? 0 : slot}
            latency={latency}
            onAbility={ability}
            onPause={togglePause}
            onReset={() => {
              if (tutorial) practice(true);
              else runtime.current?.resetPractice();
              tutorialSaved.current = false;
            }}
            tutorial={tutorial}
          />
        )}
        {atBattle && paused && snapshot?.status !== 'won' && snapshot?.status !== 'lost' && (
          <div className="battle-modal">
            <div className="dialog-card">
              <span className="eyebrow">{waiting ? 'LINK INTERRUPTED' : 'PAUSED'}</span>
              <h1>{waiting ? '等待同步链路恢复' : '作战暂停'}</h1>
              <p>{waiting ? '系统正在重连，服务器保留席位。' : '准备好后继续。'}</p>
              {!waiting && (
                <button className="primary" onClick={togglePause}>
                  继续作战
                </button>
              )}
              <button
                onClick={() =>
                  view === 'battle'
                    ? leaveRoom()
                    : (runtime.current?.pausePractice(true), setView('lobby'), setSnapshot(null))
                }
              >
                离开作战
              </button>
            </div>
          </div>
        )}
        {view === 'battle' && snapshot && ['won', 'lost'].includes(snapshot.status) && (
          <div className="battle-modal">
            <section className="result-card">
              <span className="eyebrow">OPERATION REPORT</span>
              <h1>{snapshot.status === 'won' ? '任务完成' : '机体信号中断'}</h1>
              <p>
                {!rewardsSaved
                  ? '正在保存作战档案…'
                  : snapshot.status === 'won'
                    ? '熟练度、金币与补给券已写入驾驶员档案。'
                    : '本次记录已保存。调整配装，再次出击。'}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>驾驶员</th>
                    <th>伤害</th>
                    <th>命中率</th>
                    <th>救援</th>
                    <th>协同</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.players.map((p) => (
                    <tr key={p.id}>
                      <td>{names[p.character]}</td>
                      <td>{Math.round(p.stats.damage)}</td>
                      <td>
                        {p.stats.shots ? Math.round((p.stats.hits / p.stats.shots) * 100) : 0}%
                      </td>
                      <td>{p.stats.rescues}</td>
                      <td>{p.stats.assists}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {slot === 0 && (
                <>
                  <button
                    className="primary"
                    disabled={!rewardsSaved}
                    onClick={() => room.current?.send({ type: 'prepare' })}
                  >
                    返回战前准备
                  </button>
                  {snapshot.status === 'won' &&
                    !(current?.mission === 3 && current?.stage === 2) && (
                      <button
                        disabled={!rewardsSaved}
                        onClick={() => room.current?.send({ type: 'next' })}
                      >
                        下一小关 →
                      </button>
                    )}
                  <button
                    disabled={!rewardsSaved}
                    onClick={() => room.current?.send({ type: 'retry' })}
                  >
                    重新挑战
                  </button>
                </>
              )}
              <button onClick={leaveRoom}>离开小队</button>
              {slot !== 0 && <small>等待房主选择下一步</small>}
            </section>
          </div>
        )}
        {authOpen && (
          <AuthModal
            onSuccess={(result) => {
              apply(result);
              setAuthOpen(false);
              if (view === 'cover') loadInto('lobby');
              toast('驾驶员档案已连接。');
            }}
            onClose={() => setAuthOpen(false)}
            onPractice={() => {
              setAuthOpen(false);
              loadInto('lobby');
            }}
          />
        )}
        {profileOpen && (
          <div className="modal-shade">
            <div className="dialog-card">
              <button className="modal-close" onClick={() => setProfileOpen(false)}>
                ×
              </button>
              <span className="eyebrow">PILOT PROFILE</span>
              <h1>{user?.username}</h1>
              <p>角色展示、熟练度与出战配置随档案保存。</p>
              <label>
                主页看板
                <select
                  value={profile.appearance.pilot}
                  onChange={(e) => {
                    void callApi('appearance', {
                      pilot: e.target.value,
                      reducedMotion: profile.appearance.reducedMotion,
                    }).catch((e) => toast(String(e)));
                  }}
                >
                  <option value="Asuka">明日香</option>
                  <option value="Rei">绫波丽</option>
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={profile.appearance.reducedMotion}
                  onChange={(e) =>
                    void callApi('appearance', {
                      pilot: profile.appearance.pilot,
                      reducedMotion: e.target.checked,
                    }).catch((e) => toast(String(e)))
                  }
                />{' '}
                减少角色动态
              </label>
              <button
                onClick={() => {
                  if (room.current) {
                    toast('请先离开小队。');
                    return;
                  }
                  void callApi('logout', {}).then(() => {
                    setProfileOpen(false);
                    setView('cover');
                  });
                }}
              >
                退出档案
              </button>
            </div>
          </div>
        )}
        {settingsOpen && (
          <div className="modal-shade">
            <div className="dialog-card">
              <button className="modal-close" onClick={() => setSettingsOpen(false)}>
                ×
              </button>
              <h1>客户端设置</h1>
              <label>
                <input
                  type="checkbox"
                  checked={muted}
                  onChange={(e) => setMuted(e.target.checked)}
                />{' '}
                关闭音效与音乐
              </label>
              <label>
                配乐音量
                <input
                  type="range"
                  min={0}
                  max={50}
                  value={volume * 1000}
                  onChange={(e) => setVolume(Number(e.target.value) / 1000)}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={reducedMotion}
                  onChange={(e) => setReducedMotion(e.target.checked)}
                />{' '}
                减少动态与屏幕反馈
              </label>
              <p className="muted">画布与界面保持 16:9 等比缩放。</p>
            </div>
          </div>
        )}
        {message && (
          <div className="toast" role="status">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
