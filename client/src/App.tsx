import { appUrl } from './app-url';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Progression,
  Eva,
  type EvaProfile,
  type EvaBattleRecord,
  type LoadoutPreset,
  type BattleMode,
  Equipment,
  type Character,
  type Profile,
  type GameState,
  type InputState,
  type Loadout,
} from '@dawn/simulation';
import { createGame, type GameRuntime } from './game';
import {
  request,
  listRooms,
  getActiveRoom,
  type ApiAction,
  type ApiResults,
  type RequestBody,
  type User,
  type PublicRoom,
} from './services/api';
import { RoomClient, type Lobby, type StartMessage } from './services/room-client';
import { AudioService } from './services/audio';
import { AuthModal } from './ui/AuthModal';
import { PasswordForm } from './ui/PasswordForm';
import { SessionController } from './services/session-controller';
import { SaveTask, type SaveStatus } from './services/save-task';
import { PilotDisplay } from './ui/PilotDisplay';
import { BattleHud } from './ui/BattleHud';
import { SkillIcon } from './ui/SkillIcon';
import { TerminalIcon } from './ui/TerminalIcon';
import { ProgressionPanels } from './ui/ProgressionPanels';
import './ui/progression-panels.css';
import {
  EvaPanels,
  EvaBriefingLoadout,
  EvaBattleReport,
  evaName,
  type EvaTab,
  type MagiLaunch,
  type MagiDraft,
} from './ui/EvaPanels';
import {
  fetchEva,
  mutateEva,
  pendingEva,
  evaPendingState,
  acceptsEvaResponse,
  type EvaIdentity,
  type EvaAction,
  type EvaSession,
} from './services/eva-api';
type View =
  | 'cover'
  | 'loading'
  | 'lobby'
  | 'briefing'
  | 'battle'
  | 'practice'
  | 'skills'
  | 'members'
  | 'shop'
  | 'supply'
  | 'records'
  | 'gallery'
  | 'magi';
const names: Record<Character, string> = { Asuka: '明日香', Rei: '绫波丽' };
const missionNames = ['旧日清晨', '河岸防线', '纵深行动', '黎明之战'];
const emptyProfile = Progression.createProfile;
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
  const [evaProfile, setEvaProfile] = useState<EvaProfile>(() => Eva.createProfile());
  const [evaRevision, setEvaRevision] = useState(0);
  const evaIdentity = useRef<EvaIdentity>({ username: null, revision: 0, epoch: 0 });
  const [evaBusy, setEvaBusy] = useState(false);
  const [evaPendingVersion, setEvaPendingVersion] = useState(0);
  const [magiRecords, setMagiRecords] = useState<EvaBattleRecord[]>([]);
  const [magiDraft, setMagiDraft] = useState<MagiDraft | null>(null);
  const [lobbyTrialPreset, setLobbyTrialPreset] = useState<LoadoutPreset | null>(null);
  const currentMagi = useRef<
    | (MagiLaunch & {
        round: string;
        at: number;
        participants: import('@dawn/simulation').ResolvedLoadout[];
      })
    | null
  >(null);
  const [evaMission, setEvaMission] = useState('mission.campaign.1');
  const [evaMode, setEvaMode] = useState<BattleMode>('operation');
  const actionInput = useRef<InputState>({});
  const [rewardsSaved, setRewardsSaved] = useState(false);
  const [tutorialSync, setTutorialSync] = useState<{ status: SaveStatus; error: string }>({
    status: 'idle',
    error: '',
  });
  const [rewardSync, setRewardSync] = useState<{ status: SaveStatus; error: string }>({
    status: 'idle',
    error: '',
  });
  const tutorialSave = useRef(new SaveTask((status, error) => setTutorialSync({ status, error })));
  const rewardSave = useRef(new SaveTask((status, error) => setRewardSync({ status, error })));
  const [requestCount, setRequestCount] = useState(0);
  const [, setPendingVersion] = useState(0);
  const [retryingOperation, setRetryingOperation] = useState(false);
  const [loadError, setLoadError] = useState('');
  const loadingAction = useRef<() => void>(() => {});
  const transition = useRef(0);
  const battleResourcesReady = useRef(false);
  const networkSnapshot = useRef<GameState | null>(null);
  const lobbyPilot = useRef<Character | null>(null);
  const lobbyMission = useRef('');
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
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [roomsLoaded, setRoomsLoaded] = useState(false);
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
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    lastResult = useRef('');
  const latest = useRef({ view, user, profile, slot, current, paused, waiting, lobby });
  latest.current = { view, user, profile, slot, current, paused, waiting, lobby };
  const toast = useCallback((text: string) => {
    setMessage(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setMessage(''), 4200);
  }, []);
  function evaRequestIdentity(): EvaIdentity {
    const username = latest.current.user?.username ?? null,
      epoch = sessions.current?.identityEpoch ?? 0;
    if (evaIdentity.current.username !== username || evaIdentity.current.epoch !== epoch)
      evaIdentity.current = { username, epoch, revision: 0 };
    return { ...evaIdentity.current };
  }
  function applyEva(result: EvaSession, identity: EvaIdentity) {
    const current = evaRequestIdentity();
    if (!acceptsEvaResponse(current, identity, result)) return false;
    evaIdentity.current = { ...current, revision: result.user.revision };
    setEvaProfile(result.profile);
    setEvaRevision(result.user.revision);
    return true;
  }
  const refreshEva = useCallback(async () => {
    const identity = evaRequestIdentity();
    const result = await fetchEva();
    applyEva(result, identity);
    return result;
  }, []);
  async function callEva(
    action: EvaAction,
    body: Record<string, unknown> = {},
  ): Promise<EvaSession | undefined> {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    const identity = evaRequestIdentity();
    setEvaBusy(true);
    try {
      const result = await mutateEva(user.username, identity.revision, action, body);
      if (!applyEva(result, identity)) return;
      if (action === 'preset' || action === 'research' || action === 'upgrade')
        room.current?.send({ type: 'ready', ready: false });
      toast('操作已完成，档案已同步。');
      return result;
    } catch (error) {
      toast(error instanceof Error ? error.message : '操作未完成');
    } finally {
      setEvaBusy(false);
      setEvaPendingVersion((v) => v + 1);
    }
  }
  useEffect(() => {
    if (user)
      void refreshEva().catch((e) => toast(e instanceof Error ? e.message : 'EVA 档案读取失败'));
    else {
      evaIdentity.current = {
        username: null,
        revision: 0,
        epoch: sessions.current?.identityEpoch ?? 0,
      };
      setEvaProfile(Eva.createProfile());
      setEvaRevision(0);
    }
    setMagiDraft(null);
    setMagiRecords([]);
    currentMagi.current = null;
  }, [user?.username, refreshEva, toast]);
  const sessions = useRef<SessionController | null>(null);
  if (!sessions.current)
    sessions.current = new SessionController(
      request,
      (result) => {
        latest.current.user = result.user;
        latest.current.profile = result.profile;
        setUser(result.user);
        setProfile(result.profile);
      },
      sessionStorage,
      () => setPendingVersion((value) => value + 1),
    );
  const callApi = useCallback(
    async <A extends ApiAction>(action: A, body?: RequestBody): Promise<ApiResults[A]> => {
      setRequestCount((count) => count + 1);
      try {
        return await sessions.current!.run(action, body);
      } finally {
        setRequestCount((count) => count - 1);
      }
    },
    [],
  );
  const refresh = useCallback(() => sessions.current!.run('me'), []);
  const syncProfile = useCallback(async () => {
    const result = await refresh();
    if (result.user) await refreshEva();
    if (!result.user) throw new Error('档案登录已失效，请重新登录后同步。');
    return result;
  }, [refresh, refreshEva]);
  useEffect(() => {
    const resize = () => setScale(Math.min(innerWidth / 1600, innerHeight / 900));
    resize();
    window.addEventListener('resize', resize);
    void refresh().catch((e) => toast(e instanceof Error ? e.message : '存档服务未连接'));
    return () => {
      window.removeEventListener('resize', resize);
      clearTimeout(toastTimer.current);
    };
  }, [refresh, toast]);
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
      onEvents: (events) => events.forEach((kind) => audio.current.play(kind)),
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
    if (view !== 'lobby') return;
    let active = true;
    let serial = 0;
    const update = () => {
      const requestId = ++serial;
      void listRooms()
        .then((rooms) => {
          if (active && requestId === serial) {
            setPublicRooms(rooms);
            setRoomsLoaded(true);
            setRoomsError(null);
          }
        })
        .catch((error: unknown) => {
          if (active && requestId === serial) {
            setRoomsLoaded(true);
            setRoomsError(error instanceof Error ? error.message : '小队列表读取失败');
          }
        });
    };
    update();
    const t = setInterval(update, 6000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [view]);
  useEffect(() => {
    if (!snapshot) return;
    if (
      view === 'battle' &&
      (snapshot.status === 'won' || snapshot.status === 'lost') &&
      current &&
      lastResult.current !== current.round
    ) {
      lastResult.current = current.round;
      audio.current.play(snapshot.status === 'won' ? 'win' : 'boom');
    }
    if (view === 'battle' && rewardsSaved && current && rewardSave.current.status === 'idle') {
      void rewardSave.current.run(syncProfile);
    }
    if (view === 'practice' && tutorial && tutorialSave.current.status === 'idle') {
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
        if (user) void saveTutorial();
      }
    }
  }, [snapshot, view, current, tutorial, user, callApi, toast, syncProfile, rewardsSaved]);
  async function saveTutorial() {
    tutorialSave.current.reset(true);
    toast('基础操作训练完成。教学不消耗物资，也不发放正式任务收益。');
  }
  function transitionTo(next: View, prepare: () => Promise<void>, complete?: () => void) {
    const run = () => {
      const ticket = ++transition.current;
      setLoadError('');
      setProgress(0);
      setView('loading');
      void prepare()
        .then(() => {
          if (ticket !== transition.current) return;
          setProgress(1);
          setView(next);
          complete?.();
        })
        .catch((error) => {
          if (ticket === transition.current)
            setLoadError(error instanceof Error ? error.message : '资源加载失败');
        });
    };
    loadingAction.current = run;
    run();
    void audio.current.enable();
  }
  const loadInto = (next: View) => {
    if (next === 'practice') {
      practice(true);
      return;
    }
    const identity = sessions.current!.identityEpoch;
    transitionTo(
      next,
      async () => {
        await runtime.current!.prepareAssets('hangar');
      },
      () => {
        if (next === 'lobby' && latest.current.user)
          void getActiveRoom()
            .then((saved) => {
              if (saved && identity === sessions.current!.identityEpoch && !room.current)
                connect({ type: 'resume', ...saved });
            })
            .catch((error) => toast(error instanceof Error ? error.message : '席位恢复失败'));
      },
    );
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
    transition.current++;
    actionInput.current = {};
    room.current?.close();
    room.current = null;
    setLobby(null);
    setCurrent(null);
    setSnapshot(null);
    setPaused(false);
    setWaiting(false);
    setConnection('');
    setLobbyTrialPreset(null);
    setView('lobby');
  };
  function connect(initial: Record<string, unknown>) {
    if (!latest.current.user) {
      setAuthOpen(true);
      return;
    }
    if (room.current) {
      if (initial.mode && !current) {
        if (initial.mode !== latest.current.lobby?.mode) {
          toast('请先离开当前小队，再创建另一模式的小队。');
          return;
        }
        if (initial.mode === 'magi' && initial.preset) {
          setLobbyTrialPreset(initial.preset as LoadoutPreset);
          room.current.send({ type: 'choose', preset: initial.preset });
        }
      }
      setView(current ? 'battle' : 'briefing');
      return;
    }
    setLobbyTrialPreset(
      initial.mode === 'magi' && initial.preset ? (initial.preset as LoadoutPreset) : null,
    );
    setConnection('connecting');
    lobbyPilot.current = null;
    lobbyMission.current = '';
    const transport = new RoomClient(
      { ...initial, protocolVersion: 3 },
      {
        joined: (code, index) => {
          setRoomCode(code);
          latest.current.slot = index;
          setSlot(index);
          setView('briefing');
        },
        lobby: (data) => {
          latest.current.lobby = data;
          setLobby(data);
          if (data.missionId) setEvaMission(data.missionId);
          if (data.mode) setEvaMode(data.mode);
          const missionKey = `${data.mission}:${data.stage}:${data.difficulty}`;
          if (lobbyMission.current !== missionKey) {
            lobbyMission.current = missionKey;
            setMission(data.mission);
            setStage(data.stage);
            setDifficulty(data.difficulty);
          }
          const c = data.slots[latest.current.slot]?.character;
          if (c) {
            setCharacter(c);
            if (lobbyPilot.current !== c) {
              lobbyPilot.current = c;
              setWeapon(latest.current.profile.loadouts[c]);
            }
          }
        },
        start: (data) => {
          actionInput.current = {};
          setRewardsSaved(false);
          rewardSave.current.reset();
          battleResourcesReady.current = false;
          networkSnapshot.current = null;
          setCurrent(data);
          latest.current.current = data;
          setPaused(false);
          setWaiting(false);
          setTutorial(false);
          setSnapshot(null);
          transitionTo(
            'battle',
            () =>
              runtime.current!.prepareAssets(
                data.map.artSet === 'new' ? 'battle-new' : 'battle-legacy',
              ),
            () => {
              battleResourcesReady.current = true;
              if (networkSnapshot.current)
                runtime.current!.applyNetworkState(
                  networkSnapshot.current,
                  data.map,
                  latest.current.slot,
                  data.round,
                );
            },
          );
        },
        state: (state, pause, wait, saved) => {
          setRewardsSaved(saved);
          const session = latest.current.current;
          if (!session) return;
          const full = { ...state, map: session.map, practice: false };
          networkSnapshot.current = full;
          if (battleResourcesReady.current)
            runtime.current?.applyNetworkState(
              full,
              session.map,
              latest.current.slot,
              session.round,
            );
          setSnapshot(full);
          setPaused(pause);
          setWaiting(wait);
        },
        events: (events) => events.forEach((kind) => audio.current.play(kind)),
        error: toast,
        ended: (text) => {
          transition.current++;
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
      },
    );
    room.current = transport;
  }
  function launchMagi(options: MagiLaunch) {
    if (room.current) {
      toast('请先离开当前小队，再开始本地演习。');
      return;
    }
    const mission = Eva.MISSIONS.find((m) => m.id === options.missionId) ?? Eva.MISSIONS[0];
    const simulated = Eva.simulationProfile();
    let participants: import('@dawn/simulation').ResolvedLoadout[];
    try {
      const cap = mission.levelCap;
      participants = [
        Eva.resolveLoadout(simulated, options.preset, {
          entityId: 'magi-player',
          accountId: 'magi-local',
          levelCap: cap,
          simulation: true,
        }),
      ];
      if (options.simulatedAlly) {
        const ally =
          options.allyPreset ??
          Eva.defaultPreset(
            Eva.MACHINES.find((m) => m.id !== options.preset.machineId && m.type === 'defense')
              ?.id ?? Eva.MACHINES[0].id,
          );
        participants.push(
          Eva.resolveLoadout(simulated, ally, {
            entityId: 'magi-ally',
            accountId: 'magi-simulated',
            levelCap: cap,
            simulation: true,
          }),
        );
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : '演习配置不合法');
      return;
    }
    const round = `magi-${options.label}-${crypto.randomUUID()}`;
    currentMagi.current = { ...options, round, at: Date.now(), participants };
    transitionTo(
      'practice',
      () =>
        runtime.current!.prepareAssets(mission.campaignIndex < 2 ? 'battle-legacy' : 'battle-new'),
      () => {
        setTutorial(false);
        setPaused(false);
        setCurrent(null);
        setSnapshot(null);
        runtime.current!.startPractice({
          character: participants[0].legacyCharacter,
          participants,
          mode: options.mode,
          missionId: mission.id,
          seed: options.seed,
          difficulty: options.difficulty,
          roundId: round,
          phaseId: options.phaseId,
          simulatedAlly: options.simulatedAlly,
        });
      },
    );
  }
  function captureMagi() {
    const run = currentMagi.current;
    if (!run || !snapshot) return;
    const player = snapshot.players[0];
    const record: EvaBattleRecord = {
      round: run.round,
      at: run.at,
      mode: run.mode,
      missionId: run.missionId,
      ruleVersion: Eva.RULE_VERSION,
      seed: run.seed,
      difficulty: run.difficulty ?? 'normal',
      condition: Eva.MISSIONS.find((m) => m.id === run.missionId)?.condition ?? null,
      won: snapshot.status === 'won',
      elapsed: snapshot.time,
      participants: run.participants,
      entityId: player?.id ?? run.participants[0].entityId,
      events: structuredClone(snapshot.battleEvents ?? []),
      hpFraction: player ? Math.max(0, player.hp / player.maxHp) : 1,
      used: { ...(player?.used ?? {}) },
      license: false,
      completedStages:
        snapshot.status === 'won'
          ? (Eva.MISSIONS.find((m) => m.id === run.missionId)?.stages ?? 1)
          : 0,
    };
    setMagiRecords((records) =>
      records.some((r) => r.round === record.round) ? records : [...records, record],
    );
    currentMagi.current = null;
  }
  function practice(withTutorial: boolean) {
    currentMagi.current = null;
    if (room.current) {
      toast('请先离开作战小队。');
      return;
    }
    transitionTo(
      'practice',
      () => runtime.current!.prepareAssets(withTutorial ? 'battle-legacy' : 'battle-new'),
      () => {
        setTutorial(withTutorial);
        tutorialSave.current.reset(latest.current.profile.tutorialComplete);
        setPaused(false);
        setCurrent(null);
        setSnapshot(null);
        const stored = latest.current.profile;
        runtime.current!.startPractice({
          character,
          nodes: trialBuilds[character] ?? stored.characters[character].nodes,
          gear: Object.values(stored.equipment[character]).filter((id): id is string => !!id),
          loadout: stored.loadouts[character],
          noCooldown,
          tutorial: withTutorial,
        });
      },
    );
  }
  async function toggleReady() {
    if (!lobby) return;
    const transport = room.current;
    const missionKey = `${lobby.mission}:${lobby.stage}:${lobby.difficulty}`;
    if (lobby.slots[slot]?.ready) {
      room.current?.send({ type: 'ready', ready: false });
      return;
    }
    setRequestCount((count) => count + 1);
    try {
      await runtime.current!.prepareAssets(
        lobby.mission === 0 && lobby.stage < 2 ? 'battle-legacy' : 'battle-new',
      );
      if (transport !== room.current || missionKey !== lobbyMission.current) {
        toast('小队任务已变化，请核对配置后重新准备。');
        return;
      }
      transport?.send({ type: 'ready', ready: true });
    } catch (error) {
      toast(error instanceof Error ? error.message : '作战素材加载失败，请重试准备。');
    } finally {
      setRequestCount((count) => count - 1);
    }
  }
  const activePilot = lobby?.slots[slot]?.character ?? character;
  const atBattle = view === 'battle' || view === 'practice';
  const showNav = !['cover', 'loading', 'battle', 'practice'].includes(view);
  function ability(key: string) {
    if (view === 'practice') runtime.current?.usePracticeSkill(key);
    else if (key.startsWith('part:'))
      actionInput.current = {
        ...actionInput.current,
        targetPart: key.slice(5) as InputState['targetPart'],
      };
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
  const pendingState = sessions.current.pendingState();
  const evaPending = evaPendingState(user?.username ?? null);
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
            {!assetsReady && (
              <img className="cover-fallback" src={appUrl('/assets/cover-dawn.png')} alt="" />
            )}
            <div className="cover-vignette" />
            <div className="cover-title">
              <span>DAWN / PROJECT RESONANCE</span>
              <h1>
                <img
                  className="dawn-wordmark"
                  src={appUrl('/identity/dawn-wordmark.png')}
                  alt="黎明之战"
                />
              </h1>
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
                  loadInto('gallery');
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
            <h1>{loadError ? '同步暂未完成' : '同步链路建立中'}</h1>
            {loadError && (
              <>
                <p role="alert">{loadError}</p>
                <button className="primary" onClick={() => loadingAction.current()}>
                  重试加载
                </button>
                <button
                  onClick={() => {
                    transition.current++;
                    if (room.current) leaveRoom();
                    else setView(user ? 'lobby' : 'cover');
                  }}
                >
                  返回
                </button>
              </>
            )}
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
                <img
                  className="dawn-wordmark"
                  src={appUrl('/identity/dawn-wordmark.png')}
                  alt="黎明之战"
                />
                <small>BATTLE FOR THE DAWN</small>
              </button>
              <span className="system-status">
                <i /> {connection || (user ? '档案已连接' : '访客终端')}
              </span>
              <div className="wallet">
                <span>{evaProfile.wallet.silver.toLocaleString()} 作战经费</span>
                <span>{evaProfile.wallet.gold.toLocaleString()} 特务配额</span>
                <span>{evaProfile.wallet.tickets} 申请券</span>
                <button onClick={() => (user ? setProfileOpen(true) : setAuthOpen(true))}>
                  {user?.username ?? '登录档案'}
                </button>
                <button onClick={() => setSettingsOpen(true)}>设置</button>
              </div>
            </header>
            <aside className="side-nav">
              {(
                [
                  ['lobby', '作战大厅', 'HANGAR'],
                  ['skills', '机甲研究', 'RESEARCH'],
                  ['members', '成员升级', 'PERSONNEL'],
                  ['shop', '后勤整备库', 'LOGISTICS'],
                  ['supply', '补给与配额', 'SUPPLY'],
                  ['records', '作战档案', 'ARCHIVE'],
                  ['magi', 'MAGI 演习', 'SIMULATION'],
                ] as const
              ).map(([id, title, label], index) => (
                <button
                  key={id}
                  className={view === id ? 'active' : ''}
                  aria-current={view === id ? 'page' : undefined}
                  onClick={() => navigate(id)}
                >
                  <TerminalIcon kind={id} size={36} />
                  <span>
                    {title}
                    <small>{label}</small>
                  </span>
                  <em>{String(index + 1).padStart(2, '0')}</em>
                </button>
              ))}
              <button className="archive-nav" onClick={() => navigate('gallery')}>
                制作档案 / 画廊
              </button>
            </aside>
          </>
        )}
        {(['lobby', 'skills', 'members', 'shop', 'supply', 'records', 'magi'] as View[]).includes(
          view,
        ) && (
          <EvaPanels
            tab={view as EvaTab}
            profile={evaProfile}
            username={user?.username ?? null}
            busy={evaBusy}
            onAction={callEva}
            onToast={toast}
            onLogin={() => setAuthOpen(true)}
            onNavigate={navigate}
            onPractice={launchMagi}
            onConnect={connect}
            roomCode={roomCode}
            onRoomCode={setRoomCode}
            rooms={publicRooms}
            roomsError={roomsError}
            roomsLoaded={roomsLoaded}
            inRoom={!!lobby}
            onBriefing={() => setView('briefing')}
            magiRecords={magiRecords}
            magiDraft={magiDraft}
            onMagiDraft={setMagiDraft}
          />
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
                  任务模式
                  <select
                    disabled={slot !== 0}
                    value={evaMode}
                    onChange={(e) => {
                      const mode = e.target.value as BattleMode;
                      setEvaMode(mode);
                      if (mode === 'recovery') setEvaMission('mission.recovery');
                      else if (evaMission === 'mission.recovery')
                        setEvaMission('mission.campaign.1');
                    }}
                  >
                    <option value="operation">正式任务</option>
                    <option value="magi">MAGI 双人演习</option>
                    <option value="recovery">后勤整备试验</option>
                  </select>
                </label>
                <label>
                  任务目标
                  <select
                    disabled={slot !== 0}
                    value={evaMission}
                    onChange={(e) => setEvaMission(e.target.value)}
                  >
                    {Eva.MISSIONS.filter((m) =>
                      evaMode === 'recovery'
                        ? m.id === 'mission.recovery'
                        : m.id !== 'mission.recovery',
                    ).map((m) => (
                      <option
                        key={m.id}
                        value={m.id}
                        disabled={
                          evaMode === 'operation' &&
                          m.id.startsWith('mission.campaign.') &&
                          m.campaignIndex + 1 > lobby.unlocked
                        }
                      >
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p>{Eva.MISSIONS.find((m) => m.id === evaMission)?.description}</p>
                <p>
                  生效等级上限 {Eva.MISSIONS.find((m) => m.id === evaMission)?.levelCap} · 条件：
                  {Eva.MISSIONS.find((m) => m.id === evaMission)?.condition ?? '标准作战'}
                </p>
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
                    room.current?.send({
                      type: 'configure',
                      missionId: evaMission,
                      mode: evaMode,
                      difficulty,
                    })
                  }
                >
                  确认任务与条件
                </button>
                <p className="muted">
                  修改任务与配装会取消准备。双方就绪后冻结机体、成员、物资及许可状态。
                  {evaMode === 'magi' ? '演习保留真实机制，不产生正式收益。' : ''}
                </p>
              </div>
              <div className="panel loadout-panel">
                <span className="eyebrow">02 / MACHINE & CREW</span>
                <EvaBriefingLoadout
                  profile={evaProfile}
                  presetId={lobby.slots[slot]?.presetId}
                  busy={evaBusy}
                  levelCap={Eva.MISSIONS.find((m) => m.id === lobby.missionId)?.levelCap ?? 3}
                  mode={lobby.mode ?? 'operation'}
                  trialPreset={lobbyTrialPreset}
                  onChoose={(presetId) => {
                    setLobbyTrialPreset(null);
                    room.current?.send({ type: 'choose', presetId });
                  }}
                  onEdit={() => setView(lobby.mode === 'magi' ? 'magi' : 'lobby')}
                />
              </div>
              <div className="panel squad-panel">
                <span className="eyebrow">03 / SYNCHRONIZATION</span>
                <h2>小队链路</h2>
                {lobby.slots.map((seat, i) => (
                  <div key={i} className={'squad-seat ' + (seat?.ready ? 'ready' : '')}>
                    <b>
                      {seat ? evaName(seat.machineId) : '等待驾驶员'}
                      {i === slot ? ' · 你' : ''}
                    </b>
                    <span>{seat?.username || '等待连接'}</span>
                    {seat && (
                      <small>
                        {evaName(seat.driverId)} / {evaName(seat.supportId)} · 生效{' '}
                        {seat.effectiveLevel ?? 1} 级
                      </small>
                    )}
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
                  disabled={requestCount > 0}
                  onClick={() => void toggleReady()}
                >
                  {lobby.slots[slot]?.ready ? '取消准备' : '我已准备'}
                </button>
                <small>{lobby.solo ? '单人确认后开始恢复试验' : '双方确认后自动出击'}</small>
              </div>
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
                <img src={appUrl('/assets/Hello.png')} alt="2017 年原始封面" />
                <h2>原作记忆</h2>
                <p>
                  闫鑫、方铮辉于 2017
                  年一起开发的机甲游戏，带着对《新世纪福音战士》的致敬。原始工程和素材始终保留。
                </p>
              </article>
              <article>
                <img src={appUrl('/assets/hangar-dawn.png')} alt="新机库概念图" />
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
              tutorialSave.current.reset(profile.tutorialComplete);
            }}
            tutorial={tutorial}
            tutorialSync={tutorialSync}
            signedIn={!!user}
            onRetryTutorial={() => void saveTutorial()}
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
                    : (captureMagi(),
                      runtime.current?.pausePractice(true),
                      loadInto('magi'),
                      setSnapshot(null))
                }
              >
                离开作战
              </button>
            </div>
          </div>
        )}
        {view === 'battle' && snapshot && ['won', 'lost'].includes(snapshot.status) && (
          <div className="battle-modal">
            <section className="result-card eva-result-card">
              <span className="eyebrow">OPERATION REPORT</span>
              <h1>{snapshot.status === 'won' ? '任务完成' : '机体信号中断'}</h1>
              <p>
                {!rewardsSaved
                  ? '正在保存作战档案…'
                  : rewardSync.status === 'failed'
                    ? `服务器已结算，档案读取失败：${rewardSync.error}`
                    : rewardSync.status !== 'saved'
                      ? '服务器已结算，正在同步个人档案…'
                      : current?.mode === 'magi'
                        ? '演习记录已保存；正式成长、经费、库存和损伤均未改变。'
                        : current?.mode === 'recovery'
                          ? '后勤试验已结算，仅恢复作战经费，不发放培养数据。'
                          : snapshot.status === 'won'
                            ? '四项培养数据、作战经费和物资结算已写入档案。'
                            : '本次记录已保存。调整配装，再次出击。'}
              </p>
              {rewardSync.status === 'failed' && (
                <button
                  onClick={() =>
                    user ? void rewardSave.current.run(syncProfile) : setAuthOpen(true)
                  }
                >
                  {user ? '重新同步档案' : '重新登录档案'}
                </button>
              )}
              {evaProfile.battles.find((battle) => battle.round === current?.round) && (
                <EvaBattleReport
                  record={evaProfile.battles.find((battle) => battle.round === current?.round)!}
                />
              )}
              {slot === 0 && (
                <>
                  <button
                    className="primary"
                    disabled={!rewardsSaved || rewardSync.status !== 'saved'}
                    onClick={() => room.current?.send({ type: 'prepare' })}
                  >
                    返回战前准备
                  </button>
                  {snapshot.status === 'won' &&
                    current?.protocolVersion !== 3 &&
                    !(current?.mission === 3 && current?.stage === 2) && (
                      <button
                        disabled={!rewardsSaved || rewardSync.status !== 'saved'}
                        onClick={() => room.current?.send({ type: 'next' })}
                      >
                        下一小关 →
                      </button>
                    )}
                  <button
                    disabled={!rewardsSaved || rewardSync.status !== 'saved'}
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
        {view === 'practice' &&
          currentMagi.current &&
          snapshot &&
          ['won', 'lost'].includes(snapshot.status) && (
            <div className="battle-modal">
              <section className="result-card">
                <span className="eyebrow">MAGI SIMULATION</span>
                <h1>{snapshot.status === 'won' ? '演习完成' : '演习结束'}</h1>
                <p>本次用时 {snapshot.time.toFixed(1)} 秒。正式库存、损伤、成长和资历均未改变。</p>
                <button
                  className="primary"
                  onClick={() => {
                    captureMagi();
                    runtime.current?.pausePractice(true);
                    setView('records');
                  }}
                >
                  保存本次对照并复盘
                </button>
                <button
                  onClick={() => {
                    const run = currentMagi.current!;
                    captureMagi();
                    launchMagi(run);
                  }}
                >
                  相同条件重试
                </button>
                <button
                  onClick={() => {
                    captureMagi();
                    setView('magi');
                  }}
                >
                  返回 MAGI
                </button>
              </section>
            </div>
          )}
        {authOpen && (
          <AuthModal
            onApi={callApi}
            onSuccess={() => {
              setAuthOpen(false);
              if (view === 'cover') loadInto('lobby');
              toast('驾驶员档案已连接。');
            }}
            onClose={() => setAuthOpen(false)}
            onPractice={() => {
              setAuthOpen(false);
              loadInto('practice');
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
                      reducedMotion: e.target.checked,
                    }).catch((e) => toast(String(e)))
                  }
                />{' '}
                减少角色动态
              </label>
              <PasswordForm
                onApi={callApi}
                onSuccess={() => {
                  leaveRoom();
                  toast('密码已更新，其他设备的旧登录已失效。');
                }}
              />
              <button
                onClick={() => {
                  if (room.current) {
                    toast('请先离开小队。');
                    return;
                  }
                  void callApi('logout', {})
                    .then(() => {
                      setProfileOpen(false);
                      setView('cover');
                    })
                    .catch((error) => toast(error instanceof Error ? error.message : '退出失败'));
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
        {user && (evaPending.operation || evaPending.error) && !evaBusy && (
          <div className="toast eva-pending" role="status">
            <p>{evaPending.error || '有一笔 EVA 操作等待核实，重试使用原操作编号。'}</p>
            {!evaPending.error && (
              <button
                onClick={async () => {
                  const identity = evaRequestIdentity();
                  const pending = pendingEva(user.username);
                  if (!pending) return;
                  setEvaBusy(true);
                  try {
                    const result = await mutateEva(
                      user.username,
                      identity.revision,
                      pending.action,
                      pending.body,
                      pending,
                    );
                    if (applyEva(result, identity)) toast('待处理操作已核实。');
                  } catch (error) {
                    toast(error instanceof Error ? error.message : '核实失败');
                  } finally {
                    setEvaBusy(false);
                    setEvaPendingVersion((v) => v + 1);
                  }
                }}
              >
                核实待处理操作
              </button>
            )}
          </div>
        )}
        {(message ||
          pendingState.error ||
          (!['cover', 'loading', 'battle', 'practice'].includes(view) &&
            pendingState.records.length > 0 &&
            requestCount === 0)) && (
          <div className="toast" role="status">
            {message && <p>{message}</p>}
            {pendingState.error ? (
              <p>{pendingState.error}</p>
            ) : (
              pendingState.records.length > 0 &&
              requestCount === 0 &&
              !['cover', 'loading', 'battle', 'practice'].includes(view) && (
                <>
                  <p>有补给或金币操作等待核实。重试会查询同一笔交易。</p>
                  <button
                    disabled={retryingOperation}
                    onClick={async () => {
                      setRetryingOperation(true);
                      try {
                        const pending = sessions.current!.pending()[0];
                        if (pending) await callApi(pending.action, pending.body);
                        toast('交易结果已核实，个人档案已同步。');
                      } catch (error) {
                        toast(error instanceof Error ? error.message : '交易核实失败');
                      } finally {
                        setRetryingOperation(false);
                      }
                    }}
                  >
                    {retryingOperation ? '正在核实…' : '重试核实'}
                  </button>
                </>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
