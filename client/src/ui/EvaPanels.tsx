import { appUrl } from '../app-url';
import { useEffect, useMemo, useState } from 'react';
import {
  Eva,
  BOSSES,
  campaign,
  type EvaProfile,
  type LoadoutPreset,
  type EvaBattleRecord,
  type EvaLevel,
  type BattleMode,
  type ProgressionNode,
  type EvaDrawRecord,
} from '@dawn/simulation';
import {
  fetchEvaLedger,
  type EvaLedgerEntry,
  type EvaAction,
  type EvaSession,
} from '../services/eva-api';
import type { PublicRoom } from '../services/api';
import './eva-panels.css';

export const typeNames = { attack: '进攻', defense: '防御', balance: '平衡', support: '支援' };
export function evaName(id?: string) {
  if (!id) return '待选择';
  return (
    [
      ...Eva.MACHINES,
      ...Eva.MEMBERS,
      ...Eva.WEAPONS,
      ...Eva.EQUIPMENT,
      ...Eva.AMMO,
      ...Eva.CONSUMABLES,
      ...Eva.NODES,
      ...Eva.MISSIONS,
      ...Eva.COSMETICS,
    ].find((entry) => entry.id === id)?.name ??
    Eva.NODES.find((node) => node.effect === id)?.name ??
    id ??
    '未选择'
  );
}
export function machineArt(id: string) {
  return id.includes('eva00')
    ? appUrl('/assets/mecha-rei.png')
    : id.includes('eva02')
      ? appUrl('/assets/mecha-asuka.png')
      : id.includes('eva08')
        ? appUrl('/eva/mecha-unit08.png')
        : appUrl('/eva/mecha-unit01.png');
}
export function portraitArt(id: string) {
  const slug = id.includes('asuka') ? 'asuka' : id.split('.').at(-1);
  return slug === 'asuka' || slug === 'rei'
    ? appUrl(`/assets/pilot-${slug}.png`)
    : appUrl(`/eva/portrait-${slug}.png`);
}
export type EvaTab = 'lobby' | 'skills' | 'members' | 'shop' | 'supply' | 'records' | 'magi';
export interface MagiLaunch {
  preset: LoadoutPreset;
  label: string;
  missionId: string;
  seed: number;
  phaseId?: string;
  difficulty?: 'relaxed' | 'normal' | 'hard';
  mode: BattleMode;
  simulatedAlly: boolean;
  allyPreset?: LoadoutPreset;
}
export interface MagiDraft {
  a: LoadoutPreset;
  b: LoadoutPreset;
  missionId: string;
  seed: number;
  phaseId: string;
  difficulty: 'relaxed' | 'normal' | 'hard';
}
interface Props {
  tab: EvaTab;
  profile: EvaProfile;
  username: string | null;
  busy: boolean;
  onAction: (action: EvaAction, body?: Record<string, unknown>) => Promise<EvaSession | undefined>;
  onToast: (message: string) => void;
  onLogin: () => void;
  onNavigate: (tab: EvaTab) => void;
  onPractice: (options: MagiLaunch) => void;
  onConnect: (message: Record<string, unknown>) => void;
  roomCode: string;
  onRoomCode: (code: string) => void;
  rooms: PublicRoom[];
  roomsError: string | null;
  roomsLoaded: boolean;
  inRoom: boolean;
  onBriefing: () => void;
  magiRecords: EvaBattleRecord[];
  magiDraft: MagiDraft | null;
  onMagiDraft: (draft: MagiDraft) => void;
}
const clone = <T,>(value: T): T => structuredClone(value);
const num = (value: number) => value.toLocaleString('zh-CN');
const activePreset = (profile: EvaProfile) =>
  profile.presets.find((p) => p.id === profile.activePresetId) ??
  profile.presets[0] ??
  Eva.defaultPreset();
export function EvaPanels(props: Props) {
  const { tab, profile, onNavigate } = props;
  return (
    <section className={`content-screen eva-screen eva-page-${tab} screen-enter`}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            NERV / {tab === 'magi' ? 'MAGI SIMULATION' : 'OPERATIONS V3.1'}
          </span>
          <h1>
            {
              {
                lobby: '作战大厅',
                skills: '机甲研究',
                members: '成员升级',
                shop: '后勤整备库',
                supply: '补给与特务配额',
                records: '作战档案',
                magi: 'MAGI 演习',
              }[tab]
            }
          </h1>
        </div>
        <div className="eva-heading-actions">
          <span className="eva-license">
            {profile.licenseExpiresAt > Date.now()
              ? `特别支援许可至 ${new Date(profile.licenseExpiresAt).toLocaleDateString()}`
              : '标准作战账号'}
          </span>
          {props.inRoom && <button onClick={props.onBriefing}>返回战前准备</button>}
        </div>
      </div>
      <div className="eva-content">
        {tab === 'lobby' && <Hangar {...props} />}
        {tab === 'skills' && <Research key="machines" {...props} />}
        {tab === 'members' && <Research key="members" {...props} personnel />}
        {(tab === 'shop' || tab === 'supply') && <Logistics {...props} />}
        {tab === 'magi' && <Magi {...props} />}
        {tab === 'records' && <Records {...props} />}
      </div>
      {!props.username && (
        <div className="eva-guest">
          <span>访客可使用完整 MAGI 演习。登录后保存研究与正式战绩。</span>
          <button onClick={props.onLogin}>连接档案</button>
          <button onClick={() => onNavigate('magi')}>进入 MAGI</button>
        </div>
      )}
    </section>
  );
}
function Hangar(props: Props) {
  const { profile, busy, onAction, onNavigate, onConnect, onToast } = props;
  const selected = activePreset(profile),
    machine = Eva.MACHINES.find((m) => m.id === selected.machineId)!;
  const progress = profile.machines[selected.machineId];
  const [editing, setEditing] = useState(false);
  return (
    <>
      <div className="eva-hangar-grid">
        <article className="eva-machine-hero">
          <span className="eyebrow">UNIT STANDBY / {typeNames[machine.type]}</span>
          <h2>{machine.name}</h2>
          <p>{machine.description}</p>
          <span className="eva-unit-watermark" aria-hidden="true">
            {machine.id.includes('eva00')
              ? '00'
              : machine.id.includes('eva02')
                ? '02'
                : machine.id.includes('eva08')
                  ? '08'
                  : '01'}
          </span>
          <img src={machineArt(machine.id)} alt={machine.name} />
          <div className="eva-machine-readout">
            <b>整备等级 {progress?.level ?? 1}</b>
            <span>耐久 {Math.round((1 - (progress?.damage ?? 0)) * 100)}%</span>
            <span>机体作战数据 {num(progress?.data ?? 0)}</span>
          </div>
        </article>
        <div className="eva-hangar-actions">
          <article className="panel">
            <span className="eyebrow">SORTIE PRESET</span>
            <h2>{selected.name}</h2>
            <div className="eva-crew">
              {[selected.driverId, selected.supportId].map((id, i) => (
                <div key={id}>
                  <img src={portraitArt(id)} alt="" />
                  <span>
                    <small>{i ? '远程支援' : '驾驶员'}</small>
                    <b>{evaName(id)}</b>
                  </span>
                </div>
              ))}
            </div>
            <p>
              {selected.branch ? `已选路线：${evaName(selected.branch)}` : '基础整备路线'} ·{' '}
              {evaName(selected.weaponId)}
            </p>
            <div className="eva-row">
              <select
                aria-label="当前出战预设"
                value={profile.activePresetId}
                disabled={busy}
                onChange={(e) => {
                  const preset = profile.presets.find((p) => p.id === e.target.value);
                  if (preset) void onAction('preset', { preset });
                }}
              >
                {profile.presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                    {preset.target ? ' · MAGI 目标' : ''}
                  </option>
                ))}
              </select>
              <button onClick={() => setEditing(true)}>编辑配装</button>
              <button onClick={() => onNavigate('skills')}>机甲研究</button>
              <button onClick={() => onNavigate('members')}>成员培养</button>
            </div>
          </article>
          <article className="panel">
            <span className="eyebrow">SQUAD LINK</span>
            <h2>双机作战小队</h2>
            <div className="eva-row">
              <input
                aria-label="房间码"
                placeholder="六位房间码"
                maxLength={6}
                value={props.roomCode}
                onChange={(e) => props.onRoomCode(e.target.value.toUpperCase())}
              />
              <button
                onClick={() =>
                  /^[A-F0-9]{6}$/.test(props.roomCode)
                    ? onConnect({ type: 'join', code: props.roomCode })
                    : onToast('请输入六位房间码。')
                }
              >
                加入小队
              </button>
            </div>
            <div className="eva-room-list">
              {props.roomsError && <p role="status">小队列表暂不可用：{props.roomsError}</p>}
              {props.rooms.slice(0, 3).map((room) => (
                <button
                  key={room.code}
                  onClick={() => onConnect({ type: 'join', code: room.code })}
                >
                  <span>
                    {room.code} · 任务 {room.mission + 1}-{room.stage + 1}
                  </span>
                  <span>{room.playersCount}/2 →</span>
                </button>
              ))}
              {!props.rooms.length && !props.roomsError && (
                <p className="muted">
                  {props.roomsLoaded ? '当前没有等待中的小队，可创建一支。' : '正在读取小队…'}
                </p>
              )}
            </div>
            <button
              className="primary"
              onClick={() => (props.inRoom ? props.onBriefing() : onConnect({ type: 'create' }))}
            >
              {props.inRoom ? '返回作战小队' : '组建作战小队'} →
            </button>
          </article>
          <div className="eva-row">
            <button onClick={() => onNavigate('magi')}>MAGI 配装对照与试用</button>
            <button onClick={() => onNavigate('shop')}>维修与补给</button>
            <button onClick={() => onNavigate('records')}>复盘与资历</button>
          </div>
        </div>
      </div>
      {editing && (
        <div className="modal-shade">
          <div className="eva-editor-dialog">
            <div className="eva-row">
              <h2>出战预设</h2>
              <button onClick={() => setEditing(false)}>关闭</button>
            </div>
            <PresetEditor
              profile={profile}
              initial={selected}
              busy={busy}
              onSave={async (preset) => {
                if (await onAction('preset', { preset })) setEditing(false);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

export function PresetEditor({
  profile,
  initial,
  busy,
  simulation = false,
  onSave,
  saveLabel = '保存并设为出战预设',
}: {
  profile: EvaProfile;
  initial: LoadoutPreset;
  busy: boolean;
  simulation?: boolean;
  onSave: (preset: LoadoutPreset) => void | Promise<void>;
  saveLabel?: string;
}) {
  const [preset, setPreset] = useState(() => clone(initial));
  useEffect(() => setPreset(clone(initial)), [initial.id]);
  const all = simulation ? Eva.simulationProfile() : profile;
  const machine = Eva.MACHINES.find((m) => m.id === preset.machineId)!;
  const level = Math.min(
    all.machines[preset.machineId]?.level ?? 1,
    preset.levelCap ?? 3,
  ) as EvaLevel;
  const capacity = Eva.CAPACITIES[level];
  const unlocked = (owner: string) => (all.machines[owner] ?? all.members[owner])?.unlocked ?? [];
  const known = [
    ...unlocked(preset.machineId),
    ...unlocked(preset.driverId),
    ...unlocked(preset.supportId),
  ];
  const options = Eva.NODES.filter(
    (node) =>
      known.includes(node.id) &&
      (node.ownerId !== preset.machineId || !node.branch || node.branch === preset.branch),
  );
  const convertingTarget = preset.target === true && !simulation;
  const saveCandidate = convertingTarget ? { ...preset, target: false } : preset;
  const missingOwnership = convertingTarget
    ? [
        ...[preset.machineId].filter((id) => !profile.owned.machines.includes(id)),
        ...[preset.driverId, preset.supportId].filter((id) => !profile.owned.members.includes(id)),
        ...preset.equipment.filter((id) => !profile.owned.equipment.includes(id)),
        ...(preset.cosmeticId && !profile.owned.cosmetics.includes(preset.cosmeticId)
          ? [preset.cosmeticId]
          : []),
      ]
    : [];
  const missingResearch = convertingTarget
    ? [...preset.skills, ...preset.driverSkills, ...preset.supportSkills].filter((id) => {
        const ownerId = Eva.NODES.find((node) => node.id === id)?.ownerId;
        return !ownerId || !unlocked(ownerId).includes(id);
      })
    : [];
  let error = '';
  try {
    Eva.resolveLoadout(all, saveCandidate, { simulation });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const set = <K extends keyof LoadoutPreset>(key: K, value: LoadoutPreset[K]) =>
    setPreset((p) => ({ ...p, [key]: value }));
  function toggle(key: 'equipment' | 'skills' | 'driverSkills' | 'supportSkills', id: string) {
    setPreset((p) => ({
      ...p,
      [key]: p[key].includes(id) ? p[key].filter((entry) => entry !== id) : [...p[key], id],
    }));
  }
  function changeMachine(id: string) {
    const defaults = Eva.defaultPreset(id, preset.driverId, preset.supportId);
    setPreset({
      ...defaults,
      id: preset.id,
      name: preset.name,
      levelCap: preset.levelCap,
      target: preset.target,
    });
  }
  const labels = [
    { key: 'skills', title: '战术技能', slot: 'tactical', cap: capacity.skills },
    { key: 'driverSkills', title: '驾驶员特长', slot: 'driver', cap: capacity.driverSkills },
    { key: 'supportSkills', title: '支援专长', slot: 'support', cap: capacity.supportSkills },
  ] as const;
  return (
    <div className="eva-preset-editor">
      <div className="eva-form-grid">
        <label>
          预设名称
          <input value={preset.name} maxLength={48} onChange={(e) => set('name', e.target.value)} />
        </label>
        <label>
          机体型号
          <select value={preset.machineId} onChange={(e) => changeMachine(e.target.value)}>
            {!all.owned.machines.includes(preset.machineId) && (
              <option value={preset.machineId} disabled>
                {evaName(preset.machineId)} · 尚未拥有
              </option>
            )}
            {Eva.MACHINES.filter((m) => all.owned.machines.includes(m.id)).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {typeNames[m.type]}
              </option>
            ))}
          </select>
        </label>
        <label>
          驾驶员
          <select
            value={preset.driverId}
            onChange={(e) => {
              set('driverId', e.target.value);
              set('driverSkills', []);
            }}
          >
            {!all.owned.members.includes(preset.driverId) && (
              <option value={preset.driverId} disabled>
                {evaName(preset.driverId)} · 尚未拥有
              </option>
            )}
            {Eva.MEMBERS.filter((m) => m.role === 'driver' && all.owned.members.includes(m.id)).map(
              (m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          远程支援
          <select
            value={preset.supportId}
            onChange={(e) => {
              set('supportId', e.target.value);
              set('supportSkills', []);
            }}
          >
            {!all.owned.members.includes(preset.supportId) && (
              <option value={preset.supportId} disabled>
                {evaName(preset.supportId)} · 尚未拥有
              </option>
            )}
            {Eva.MEMBERS.filter(
              (m) => m.role === 'support' && all.owned.members.includes(m.id),
            ).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          当前生效路线
          <select
            value={preset.branch}
            onChange={(e) => {
              set('branch', e.target.value);
              set(
                'skills',
                preset.skills.filter((id) => !Eva.NODES.find((n) => n.id === id)?.branch),
              );
            }}
          >
            <option value="">基础路线</option>
            {machine.branches.map((branch) => (
              <option key={branch} value={branch}>
                {Eva.NODES.find((n) => n.ownerId === machine.id && n.branch === branch)?.name ??
                  branch}
              </option>
            ))}
          </select>
        </label>
        <label>
          任务等级预设
          <select
            value={preset.levelCap ?? 3}
            onChange={(e) => set('levelCap', Number(e.target.value) as EvaLevel)}
          >
            <option value={1}>1 级容量</option>
            <option value={2}>2 级容量</option>
            <option value={3}>完整等级</option>
          </select>
        </label>
        <label>
          主武器
          <select value={preset.weaponId} onChange={(e) => set('weaponId', e.target.value)}>
            {Eva.WEAPONS.filter((w) => w.kind === 'primary' && machine.weapons.includes(w.id)).map(
              (w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          近战武器
          <select value={preset.meleeId} onChange={(e) => set('meleeId', e.target.value)}>
            {Eva.WEAPONS.filter((w) => w.kind === 'melee' && machine.melee.includes(w.id)).map(
              (w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ),
            )}
          </select>
        </label>
      </div>
      <p className="eva-capacity">
        实际生效等级 {level} · 装备 {preset.equipment.length}/{capacity.equipment} · 战术{' '}
        {preset.skills.length}/{capacity.skills} · 驾驶员 {preset.driverSkills.length}/
        {capacity.driverSkills} · 支援 {preset.supportSkills.length}/{capacity.supportSkills}
      </p>
      <fieldset>
        <legend>被动装备 · {capacity.equipment} 槽</legend>
        <div className="eva-chip-grid">
          {convertingTarget &&
            preset.equipment
              .filter((id) => !all.owned.equipment.includes(id))
              .map((id) => (
                <label key={id}>
                  <input type="checkbox" checked disabled />
                  {evaName(id)} · 尚未拥有
                </label>
              ))}
          {Eva.EQUIPMENT.filter((item) => all.owned.equipment.includes(item.id)).map((item) => (
            <label key={item.id} title={item.description}>
              <input
                type="checkbox"
                checked={preset.equipment.includes(item.id)}
                onChange={() => toggle('equipment', item.id)}
              />
              {item.name}
            </label>
          ))}
        </div>
      </fieldset>
      {labels.map(({ key, title, slot, cap }) => (
        <fieldset key={key}>
          <legend>
            {title} · {cap} 槽
          </legend>
          <div className="eva-chip-grid">
            {convertingTarget &&
              preset[key]
                .filter((id) => !options.some((node) => node.id === id && node.slot === slot))
                .map((id) => (
                  <label key={id}>
                    <input type="checkbox" checked disabled />
                    {evaName(id)} · 当前未满足研究或路线条件
                  </label>
                ))}
            {options
              .filter((n) => n.slot === slot)
              .map((node) => (
                <label key={node.id} title={node.description}>
                  <input
                    type="checkbox"
                    checked={preset[key].includes(node.id)}
                    onChange={() => toggle(key, node.id)}
                  />
                  {node.name}
                </label>
              ))}
            {!options.some((n) => n.slot === slot) && <small>研究对应节点后可装入。</small>}
          </div>
        </fieldset>
      ))}
      <div className="eva-form-grid">
        <fieldset>
          <legend>特殊弹药 · 最多两种</legend>
          {Eva.AMMO.map((item) => (
            <label className="eva-stock-line" key={item.id}>
              <span>
                {item.name}
                <small>库存 {profile.stock[item.id] ?? 0}</small>
              </span>
              <input
                aria-label={`${item.name}携带数量`}
                type="number"
                min={0}
                max={item.carryLimit}
                value={preset.ammo[item.id] ?? 0}
                onChange={(e) =>
                  set(
                    'ammo',
                    Object.fromEntries(
                      Object.entries({
                        ...preset.ammo,
                        [item.id]: Math.max(0, Number(e.target.value)),
                      }).filter(([, count]) => count > 0),
                    ),
                  )
                }
              />
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>消耗品 · 最多两种 · Z / X</legend>
          {Eva.CONSUMABLES.map((item) => (
            <label className="eva-stock-line" key={item.id}>
              <span>
                {item.name}
                <small>库存 {profile.stock[item.id] ?? 0}</small>
              </span>
              <input
                aria-label={`${item.name}携带数量`}
                type="number"
                min={0}
                max={item.carryLimit}
                value={preset.consumables[item.id] ?? 0}
                onChange={(e) =>
                  set(
                    'consumables',
                    Object.fromEntries(
                      Object.entries({
                        ...preset.consumables,
                        [item.id]: Math.max(0, Number(e.target.value)),
                      }).filter(([, count]) => count > 0),
                    ),
                  )
                }
              />
            </label>
          ))}
        </fieldset>
      </div>
      <label>
        外观
        <select
          value={preset.cosmeticId ?? ''}
          onChange={(e) => set('cosmeticId', e.target.value || null)}
        >
          <option value="">标准涂装</option>
          {preset.cosmeticId && !all.owned.cosmetics.includes(preset.cosmeticId) && (
            <option value={preset.cosmeticId} disabled>
              {evaName(preset.cosmeticId)} · 尚未拥有
            </option>
          )}
          {all.owned.cosmetics.map((id) => (
            <option key={id} value={id}>
              {evaName(id)}
            </option>
          ))}
        </select>
      </label>
      {convertingTarget && (
        <div className="eva-capacity">
          <p>
            目标方案转为正式配置时，将按真实所有权、研究、整备等级和容量完整校验；不额外授予内容。
          </p>
          {missingOwnership.length > 0 && (
            <p>尚未拥有：{missingOwnership.map(evaName).join('、')}</p>
          )}
          {missingResearch.length > 0 && <p>尚未研究：{missingResearch.map(evaName).join('、')}</p>}
        </div>
      )}
      {error && (
        <p className="eva-error" role="alert">
          配置冲突：{error}
        </p>
      )}
      <div className="eva-row">
        <button
          className="primary"
          disabled={busy || !!error}
          onClick={() => {
            // Validate again at the action boundary; the server applies the same real-profile rules.
            Eva.resolveLoadout(all, saveCandidate, { simulation });
            void onSave(clone(saveCandidate));
          }}
        >
          {convertingTarget ? '转为正式预设' : saveLabel}
        </button>
        <button
          onClick={() =>
            setPreset((p) => ({
              ...p,
              id: `preset-${crypto.randomUUID()}`,
              name: `${p.name} 副本`,
            }))
          }
        >
          复制为新预设
        </button>
        <small>换配免费；战斗中不会改变开局快照。</small>
      </div>
    </div>
  );
}

function Research({ profile, busy, onAction, personnel = false }: Props & { personnel?: boolean }) {
  const [ownerId, setOwner] = useState(
    personnel
      ? profile.owned.members.includes(activePreset(profile).driverId)
        ? activePreset(profile).driverId
        : profile.owned.members[0]
      : profile.owned.machines.includes(activePreset(profile).machineId)
        ? activePreset(profile).machineId
        : profile.owned.machines[0],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const machine = Eva.MACHINES.find((m) => m.id === ownerId),
    member = Eva.MEMBERS.find((m) => m.id === ownerId);
  const progress = profile.machines[ownerId] ?? profile.members[ownerId];
  const nodes = Eva.NODES.filter((node) => node.ownerId === ownerId);
  const node = nodes.find((n) => n.id === selected) ?? nodes[0];
  const groups = [
    ...new Set(nodes.map((n) => (n.kind === 'branch' ? (n.branch ?? 'branch') : n.kind))),
  ];
  function state(item: ProgressionNode) {
    if (progress?.unlocked.includes(item.id)) return '已解锁';
    const copy = {
      ...profile,
      wallet: { ...profile.wallet },
      machines: clone(profile.machines),
      members: clone(profile.members),
    };
    try {
      Eva.research(copy, ownerId, item.id);
      return '可解锁';
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return message.includes('数据') || message.includes('不足') ? '资源不足' : '前置未满足';
    }
  }
  const required = node ? Math.max(0, node.cost - (progress?.data ?? 0)) : 0;
  return (
    <div
      className={`eva-research-layout ${personnel ? 'eva-personnel-layout' : 'eva-mecha-layout'}`}
    >
      <aside className="panel eva-owner-list">
        <span className="eyebrow">{personnel ? 'PERSONNEL' : 'EVANGELION'}</span>
        <h2>{personnel ? '驾驶员 / 支援' : '机体选择'}</h2>
        {(personnel
          ? Eva.MEMBERS.filter((m) => profile.owned.members.includes(m.id))
          : Eva.MACHINES.filter((m) => profile.owned.machines.includes(m.id))
        ).map((entry) => (
          <button
            key={entry.id}
            className={ownerId === entry.id ? 'active' : ''}
            onClick={() => {
              setOwner(entry.id);
              setSelected(null);
            }}
          >
            <img src={personnel ? portraitArt(entry.id) : machineArt(entry.id)} alt="" />
            <b>{entry.name}</b>
            <small>
              {profile.machines[entry.id]
                ? `机体 · ${profile.machines[entry.id].level} 级`
                : '人员研修'}{' '}
              · {num((profile.machines[entry.id] ?? profile.members[entry.id])?.data ?? 0)} 数据
            </small>
          </button>
        ))}
      </aside>
      <article className="eva-research-portrait">
        <span className="eyebrow">
          {personnel ? 'PERSONNEL DEVELOPMENT' : 'RESEARCH & DEVELOPMENT'}
        </span>
        <img
          src={personnel ? portraitArt(ownerId) : machineArt(ownerId)}
          alt={machine?.name ?? member?.name}
        />
        <div>
          <h2>{machine?.name ?? member?.name}</h2>
          <p>
            {machine
              ? `${typeNames[machine.type]}型 · 整备 ${profile.machines[ownerId].level} 级`
              : member?.role === 'driver'
                ? '驾驶员'
                : '远程支援成员'}
          </p>
          <span className="eyebrow">NERV / TOKYO-3</span>
        </div>
      </article>
      <div className="eva-research-main">
        <div className="panel eva-row">
          <div>
            <h2>{machine?.name ?? member?.name}</h2>
            <p>
              可用 {num(progress?.data ?? 0)} · 累计实战 {num(progress?.totalData ?? 0)}
              {machine && ` · 通用战术数据 ${num(profile.wallet.generalData)}`}
            </p>
          </div>
          {machine && (
            <button
              disabled={
                busy ||
                profile.machines[ownerId].level >= 3 ||
                !nodes.some(
                  (n) =>
                    n.grantsLevel === profile.machines[ownerId].level + 1 &&
                    progress.unlocked.includes(n.id),
                )
              }
              onClick={() => void onAction('upgrade', { machineId: ownerId })}
            >
              {profile.machines[ownerId].level >= 3
                ? '三级整备已完成'
                : `${nodes.some((n) => n.grantsLevel === profile.machines[ownerId].level + 1 && progress.unlocked.includes(n.id)) ? '待整备' : '需研究晋阶资格'} · ${Eva.BALANCE.upgrade[(profile.machines[ownerId].level + 1) as 2 | 3]} 经费 → ${profile.machines[ownerId].level + 1} 级`}
            </button>
          )}
        </div>
        {member && (
          <div className="panel eva-personnel-summary">
            <div className="eva-personnel-metrics">
              <div>
                <small>已研究能力</small>
                <b>
                  {nodes.filter((n) => progress?.unlocked.includes(n.id)).length}
                  <em> / {nodes.length}</em>
                </b>
              </div>
              <div>
                <small>有效实战</small>
                <b>
                  {Object.values(profile.members[ownerId]?.sorties ?? {}).reduce(
                    (total, count) => total + count,
                    0,
                  )}
                  <em> 次</em>
                </b>
              </div>
            </div>
            <p>{member.description}</p>
            <div className="eva-proficiency">
              {Object.entries(typeNames).map(([type, name]) => (
                <span key={type}>
                  {name}熟练度{' '}
                  <b>
                    {profile.members[ownerId]?.proficiency[type as keyof typeof typeNames] ?? 0}
                  </b>
                </span>
              ))}
              <small>共鸣适配：{evaName(member.resonanceMachineId)} · 同类型熟练度跨机体生效</small>
            </div>
          </div>
        )}
        <div className="eva-research-graph">
          {groups.map((group) => (
            <div className="eva-node-column" key={group}>
              <h3>
                {(
                  {
                    main: '特殊主线',
                    general: '通用分支',
                    resonance: '共鸣',
                    mastery: '有限精通',
                  } as Record<string, string>
                )[group] ??
                  nodes.find((n) => n.branch === group)?.name ??
                  '特殊路线'}
              </h3>
              {nodes
                .filter((n) => (n.kind === 'branch' ? n.branch : n.kind) === group)
                .map((n) => (
                  <button
                    key={n.id}
                    className={`eva-node ${state(n) === '已解锁' ? 'unlocked' : ''} ${node?.id === n.id ? 'selected' : ''}`}
                    onClick={() => setSelected(n.id)}
                  >
                    <small>{n.kind === 'branch' ? '◇ 搭配互斥' : '↓ 永久研究'}</small>
                    <b>{n.name}</b>
                    <span>
                      {state(n)} · {n.cost} 数据
                    </span>
                    {(n.requires.length > 0 || n.requiresAny.length > 0) && (
                      <small>
                        {n.requires.length ? `全部 ${n.requires.length} 项前置` : ''}
                        {n.requiresAny.length ? ` · 任一 ${n.requiresAny.length} 项` : ''}
                      </small>
                    )}
                  </button>
                ))}
            </div>
          ))}
        </div>
        <small className="muted">
          具体前置以右侧详情为准；◇ 表示装备路线互斥，两条路线均可永久研究。
        </small>
      </div>
      <aside className="panel eva-node-detail">
        {node && (
          <>
            <img
              className="eva-detail-art"
              src={personnel ? portraitArt(ownerId) : machineArt(ownerId)}
              alt=""
            />
            <span className="eyebrow">{personnel ? 'PERSONNEL ABILITY' : 'RESEARCH DETAIL'}</span>
            <h2>{node.name}</h2>
            <p>{node.description}</p>
            <p>
              {machine ? `要求实际等级 ${node.level} · ` : '成员培养 · '}
              {node.cost} 数据
            </p>
            {node.requires.length > 0 && <p>全部前置：{node.requires.map(evaName).join('、')}</p>}
            {node.requiresAny.length > 0 && (
              <p>任一前置：{node.requiresAny.map(evaName).join('、')}</p>
            )}
            {node.activationRequires.length > 0 && (
              <p>激活前置：{node.activationRequires.map(evaName).join('、')}</p>
            )}
            {node.machineId && (
              <p>
                指定机体：{evaName(node.machineId)} · 实战 {node.sorties ?? 0} 次 · 类型熟练度{' '}
                {node.proficiency ?? 0}
              </p>
            )}
            {machine && required > 0 && <p>需补充通用战术数据 {required} 点</p>}
            <button
              className="primary"
              disabled={busy || state(node) !== '可解锁'}
              onClick={() => void onAction('research', { ownerId, nodeId: node.id })}
            >
              {state(node) === '已解锁' ? '研究已永久保留' : '研究解锁'}
            </button>
            <p className="muted">
              {personnel
                ? '使用成员实战获得的培养数据研究能力；技能装入驾驶员或支援槽后生效。'
                : '研究资格和经费整备分开；技能须装入合法槽位后生效。'}
            </p>
          </>
        )}
      </aside>
    </div>
  );
}

function Logistics({ tab, profile, busy, onAction, onToast, onConnect }: Props) {
  const [section, setSection] = useState(tab === 'shop' ? 'ordinary' : 'draw');
  const [drawn, setDrawn] = useState<EvaDrawRecord | null>(null);
  const [code, setCode] = useState('');
  const [exchangeId, setExchangeId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [offerQuantity, setOfferQuantity] = useState(1);
  useEffect(() => setSection(tab === 'shop' ? 'ordinary' : 'draw'), [tab]);
  const categories = {
    machine: '机体',
    driver: '驾驶员',
    support: '支援成员',
    equipment: '被动装备',
    consumable: '消耗品',
    ammo: '弹药',
    cosmetic: '外观',
  };
  const exchangeEntries = [
    ...Eva.MACHINES.map((m) => ({ ...m, category: 'machine' })),
    ...Eva.MEMBERS.map((m) => ({ ...m, category: m.role })),
    ...Eva.EQUIPMENT.filter((m) => m.category === 'ordinary').map((m) => ({
      ...m,
      category: 'equipment',
    })),
    ...Eva.AMMO.map((m) => ({ ...m, category: 'ammo' })),
    ...Eva.CONSUMABLES.map((m) => ({ ...m, category: 'consumable' })),
    ...Eva.COSMETICS.slice(0, 3).map((m) => ({ ...m, category: 'cosmetic' })),
  ];
  return (
    <>
      <div className="eva-tabs">
        {[
          ['ordinary', '后勤整备'],
          ['draw', '普通补给'],
          ['exchange', '定向调拨'],
          ['special', '特务补给'],
          ['redeem', '兑换券与许可'],
        ].map(([id, title]) => (
          <button
            key={id}
            className={section === id ? 'active' : ''}
            onClick={() => setSection(id)}
          >
            {title}
          </button>
        ))}
      </div>
      {section === 'ordinary' && (
        <>
          <div className="panel eva-maintenance">
            <div>
              <h2>持久损伤与自动整备</h2>
              <button onClick={() => onConnect({ type: 'create', mode: 'recovery', solo: true })}>
                后勤整备试验 · 单人恢复
              </button>
              <p>存活机体可带伤出战；击毁后需恢复。维修与物资只使用作战经费。</p>
            </div>
            <label>
              <input
                type="checkbox"
                checked={profile.autoRepair}
                disabled={busy}
                onChange={(e) =>
                  void onAction('settings', {
                    autoRepair: e.target.checked,
                    autoSupply: profile.autoSupply,
                  })
                }
              />
              结算后自动维修
            </label>
            <label>
              <input
                type="checkbox"
                checked={profile.autoSupply}
                disabled={busy}
                onChange={(e) =>
                  void onAction('settings', {
                    autoRepair: profile.autoRepair,
                    autoSupply: e.target.checked,
                  })
                }
              />
              按预设自动补给
            </label>
          </div>
          <div className="eva-machine-maintenance">
            {Eva.MACHINES.filter((m) => profile.owned.machines.includes(m.id)).map((m) => (
              <article className="panel" key={m.id}>
                <b>{m.name}</b>
                <p>
                  耐久 {Math.round((1 - profile.machines[m.id].damage) * 100)}% · 等级{' '}
                  {profile.machines[m.id].level}
                </p>
                <p>待付维修 {Eva.repairPrice(profile, m.id)} 作战经费</p>
                <button
                  disabled={busy || profile.machines[m.id].damage <= 0}
                  onClick={() => void onAction('repair', { machineId: m.id })}
                >
                  维修机体
                </button>
              </article>
            ))}
          </div>
        </>
      )}
      {section === 'ordinary' && (
        <div className="eva-row">
          <label>
            弹药/消耗品购买数量{' '}
            <select
              value={offerQuantity}
              onChange={(e) => setOfferQuantity(Number(e.target.value))}
            >
              {[1, 5, 10, 20].map((n) => (
                <option key={n} value={n}>
                  {n} 件
                </option>
              ))}
            </select>
          </label>
          <small>永久装备每次一份。</small>
        </div>
      )}
      {(section === 'ordinary' || section === 'special') && (
        <div className="eva-catalog">
          {Eva.OFFERS.filter(
            (offer) => offer.currency === (section === 'ordinary' ? 'silver' : 'gold'),
          ).map((offer) => (
            <article className="panel eva-offer" key={offer.id}>
              <small>
                {offer.category === 'license' ? '限时收益提升' : categories[offer.category]}
              </small>
              <h3>{offer.name}</h3>
              <p>{offer.description}</p>
              <div>
                <b>
                  {num(
                    offer.price *
                      (['ammo', 'consumable'].includes(offer.category) ? offerQuantity : 1),
                  )}{' '}
                  {offer.currency === 'silver' ? '作战经费' : '特务配额'}
                </b>
                <button
                  disabled={busy}
                  onClick={() =>
                    void onAction('purchase', {
                      offerId: offer.id,
                      quantity: ['ammo', 'consumable'].includes(offer.category) ? offerQuantity : 1,
                    })
                  }
                >
                  购买{['ammo', 'consumable'].includes(offer.category) ? ` ×${offerQuantity}` : ''}
                </button>
              </div>
              {profile.stock[offer.itemId] !== undefined && (
                <small>库存 {profile.stock[offer.itemId]}</small>
              )}
            </article>
          ))}
        </div>
      )}
      {section === 'draw' && (
        <div className="eva-draw-layout">
          <article className="panel eva-draw-machine">
            <span className="eyebrow">NERV SUPPLY / SEVEN CATEGORIES</span>
            <h2>普通补给申请</h2>
            <p>机体、驾驶员、支援成员、装备、消耗品、弹药和外观，共七类常驻内容。</p>
            <div className="eva-draw-count">
              <b>{profile.wallet.tickets}</b>
              <span>补给申请券</span>
            </div>
            <p>
              联合保底进度 {profile.pity}/{Eva.BALANCE.pityThreshold} · 重复内容转换为调拨凭证
            </p>
            <div className="eva-draw-probabilities">
              {Object.entries(Eva.BALANCE.categoryProbability).map(([category, chance]) => (
                <span key={category}>
                  {categories[category as keyof typeof categories]} {(chance * 100).toFixed(0)}%
                </span>
              ))}
            </div>
            <button
              className="primary"
              disabled={busy || profile.wallet.tickets < 1}
              onClick={async () => {
                const result = await onAction('draw');
                if (result) setDrawn(result.profile.draws.at(-1) ?? null);
              }}
            >
              申请一次 · 1 券
            </button>
            {drawn && (
              <div className="eva-draw-result" role="status">
                <small>
                  {categories[drawn.category]}
                  {drawn.pityTriggered ? ' · 联合保底' : ''}
                </small>
                <h2>{evaName(drawn.itemId)}</h2>
                <p>
                  {drawn.duplicate
                    ? `重复内容 → ${drawn.credentials} 调拨凭证`
                    : `已获得 ×${drawn.quantity}`}
                </p>
                <small>
                  本次类别概率 {(drawn.categoryProbability * 100).toFixed(1)}% · 单项概率{' '}
                  {(drawn.itemProbability * 100).toFixed(2)}%
                </small>
              </div>
            )}
          </article>
          <article className="panel">
            <h2>申请记录</h2>
            <div className="eva-history-list">
              {profile.draws
                .slice(-15)
                .reverse()
                .map((draw, i) => (
                  <div key={`${draw.at}-${i}`}>
                    <span>
                      {evaName(draw.itemId)}
                      <small>
                        {new Date(draw.at).toLocaleString()} · {categories[draw.category]}
                      </small>
                    </span>
                    <b>{draw.duplicate ? `+${draw.credentials} 凭证` : `×${draw.quantity}`}</b>
                  </div>
                ))}
              {!profile.draws.length && <p>暂无申请记录。战斗可获得补给申请券。</p>}
            </div>
          </article>
        </div>
      )}
      {section === 'exchange' && (
        <article className="panel eva-exchange">
          <span className="eyebrow">DIRECT REQUISITION</span>
          <h2>指定内容调拨</h2>
          <p>
            可用调拨凭证 <b>{num(profile.wallet.credentials)}</b>。已有机体和成员不会再次创建进度。
          </p>
          <label>
            调拨对象
            <select value={exchangeId} onChange={(e) => setExchangeId(e.target.value)}>
              <option value="">请选择内容</option>
              {exchangeEntries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {categories[entry.category as keyof typeof categories]} · {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            数量
            <input
              type="number"
              min={1}
              max={99}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Math.min(99, Number(e.target.value))))}
            />
          </label>
          <button
            className="primary"
            disabled={busy || !exchangeId}
            onClick={() => {
              const item = exchangeEntries.find((entry) => entry.id === exchangeId);
              if (item)
                void onAction('exchange', { category: item.category, itemId: item.id, quantity });
            }}
          >
            调拨指定内容
          </button>
          <p className="muted">
            每件需{' '}
            {exchangeId
              ? Eva.BALANCE.exchange[
                  exchangeEntries.find((entry) => entry.id === exchangeId)!
                    .category as keyof typeof Eva.BALANCE.exchange
                ]
              : '—'}{' '}
            调拨凭证。经费与特务配额不会代付。
          </p>
        </article>
      )}
      {section === 'redeem' && (
        <div className="eva-draw-layout">
          <article className="panel">
            <span className="eyebrow">SPECIAL ALLOCATION</span>
            <h2>特务配额兑换券</h2>
            <p>人工核对订单后签发。每张券只能核销一次，同一订单不会重复入账。</p>
            <label>
              兑换码
              <input
                aria-label="特务配额兑换码"
                autoComplete="off"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="输入签发的单次兑换码"
              />
            </label>
            <button
              className="primary"
              disabled={busy || !code.trim()}
              onClick={async () => {
                if (await onAction('redeem', { code: code.trim() })) {
                  setCode('');
                  onToast('兑换券已核实，配额余额已更新。');
                }
              }}
            >
              核销兑换券
            </button>
          </article>
          <article className="panel">
            <h2>特别支援许可</h2>
            <p>
              {profile.licenseExpiresAt > Date.now()
                ? `有效至 ${new Date(profile.licenseExpiresAt).toLocaleString()}`
                : '当前没有生效的许可'}
            </p>
            <p>
              许可提高指定经费和培养收益。开局确定本局资格，购买或到期只影响后续开局；不增加技能、装备槽或特务配额。
            </p>
            {Eva.OFFERS.filter((offer) => offer.category === 'license').map((offer) => (
              <button
                key={offer.id}
                disabled={busy}
                onClick={() => void onAction('purchase', { offerId: offer.id, quantity: 1 })}
              >
                {offer.name} · {offer.price} 特务配额
              </button>
            ))}
          </article>
        </div>
      )}
    </>
  );
}

function Magi({
  profile,
  busy,
  onAction,
  onPractice,
  onConnect,
  magiRecords,
  magiDraft,
  onMagiDraft,
}: Props) {
  const [a, setA] = useState(() => clone(magiDraft?.a ?? activePreset(profile)));
  const [b, setB] = useState(() =>
    clone(magiDraft?.b ?? { ...clone(activePreset(profile)), id: 'magi-b', name: 'B 对照配置' }),
  );
  const [editing, setEditing] = useState<'A' | 'B' | null>(null);
  const [missionId, setMission] = useState(
    magiDraft?.missionId ?? Eva.MISSIONS.find((m) => m.bossParts)?.id ?? 'mission.campaign.1',
  );
  const [seed, setSeed] = useState(magiDraft?.seed ?? 3101);
  const [phaseId, setPhase] = useState(magiDraft?.phaseId ?? '');
  const [difficulty, setDifficulty] = useState<'relaxed' | 'normal' | 'hard'>(
    magiDraft?.difficulty ?? 'normal',
  );
  useEffect(
    () => onMagiDraft({ a, b, missionId, seed, phaseId, difficulty }),
    [a, b, missionId, seed, phaseId, difficulty, onMagiDraft],
  );
  const mission = Eva.MISSIONS.find((m) => m.id === missionId)!;
  const map = useMemo(
    () => campaign(Math.floor(mission.campaignIndex / 3), mission.campaignIndex % 3),
    [mission.campaignIndex],
  );
  const bossId = map.enemies.find((enemy) => enemy.boss)?.encounterId;
  const phases = bossId ? (BOSSES[bossId]?.phases ?? []) : [];
  const launch = (preset: LoadoutPreset, label: string) =>
    onPractice({
      preset,
      label,
      missionId,
      seed,
      difficulty,
      phaseId: phaseId || undefined,
      mode: 'magi',
      simulatedAlly: true,
    });
  return (
    <>
      <div className="panel eva-magi-intro">
        <div>
          <span className="eyebrow">FIXED CONDITIONS / A–B COMPARISON</span>
          <h2>在同一战场，比较两种打法。</h2>
          <p>
            全部已发布内容可试用。保留真实冷却、受击、供能和库存消耗机制；不写入正式库存、成长、维修或资历。模拟队友采用固定策略。
          </p>
        </div>
        <button
          onClick={() =>
            onConnect({ type: 'create', mode: 'magi', missionId, preset: a, seed, difficulty })
          }
        >
          创建双人演习小队
        </button>
      </div>
      <div className="panel eva-form-grid">
        <label>
          固定任务
          <select
            value={missionId}
            onChange={(e) => {
              setMission(e.target.value);
              setPhase('');
            }}
          >
            {Eva.MISSIONS.filter((m) => m.id !== 'mission.recovery').map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.power ? ' · 供能实验' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          随机种子
          <input
            type="number"
            min={1}
            max={2147483647}
            value={seed}
            onChange={(e) => setSeed(Math.max(1, Math.floor(Number(e.target.value))))}
          />
        </label>
        <label>
          固定难度
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
          >
            <option value="relaxed">回忆 · 轻松体验</option>
            <option value="normal">标准 · 协同挑战</option>
            <option value="hard">危机 · 高压作战</option>
          </select>
        </label>
        <label>
          阶段复习
          <select value={phaseId} onChange={(e) => setPhase(e.target.value)}>
            <option value="">完整任务</option>
            {phases.slice(1).map((phase) => (
              <option key={phase.id} value={phase.id}>
                {phase.name} · 阶段复习
              </option>
            ))}
          </select>
        </label>
        <div>
          <b>任务等级上限 {mission.levelCap}</b>
          <p>
            {mission.description} {mission.condition ? `· 条件：${mission.condition}` : ''}
          </p>
        </div>
      </div>
      <div className="eva-ab-grid">
        {(
          [
            ['A', a],
            ['B', b],
          ] as const
        ).map(([label, preset]) => (
          <article className="panel eva-ab-card" key={label}>
            <span className="eyebrow">CONFIGURATION {label}</span>
            <h2>{preset.name}</h2>
            <img src={machineArt(preset.machineId)} alt={evaName(preset.machineId)} />
            <p>
              {evaName(preset.machineId)} / {evaName(preset.driverId)} / {evaName(preset.supportId)}
            </p>
            <p>
              {evaName(preset.weaponId)} · {preset.skills.map(evaName).join(' / ')}
            </p>
            <div className="eva-row">
              <button onClick={() => setEditing(label)}>编辑 {label} 配置</button>
              <button className="primary" onClick={() => launch(preset, label)}>
                开始 {label} 演习
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void onAction('preset', {
                    preset: {
                      ...preset,
                      id: `target-${crypto.randomUUID()}`,
                      name: `${label} 目标：${preset.name}`,
                      target: true,
                    },
                  })
                }
              >
                保存为研究目标
              </button>
            </div>
          </article>
        ))}
      </div>
      {magiRecords.length > 0 && (
        <article className="panel">
          <h2>本次对照记录</h2>
          <div className="eva-history-list">
            {magiRecords
              .slice(-4)
              .reverse()
              .map((record) => {
                const review = Eva.reviewBattle(record);
                return (
                  <div key={record.round}>
                    <span>
                      {record.round.includes('-B-') ? 'B' : 'A'} ·{' '}
                      {evaName(record.participants[0]?.machineId)}
                      <small>
                        种子 {record.seed} · {record.elapsed.toFixed(1)} 秒 ·{' '}
                        {record.won ? '完成' : '中止/失败'}
                      </small>
                    </span>
                    <span>
                      伤害 {Math.round(review.metrics.damage)} · 防护{' '}
                      {Math.round(review.metrics.protection)} · 支援{' '}
                      {Math.round(review.metrics.support)}
                    </span>
                  </div>
                );
              })}
          </div>
        </article>
      )}
      {editing && (
        <div className="modal-shade">
          <div className="eva-editor-dialog">
            <div className="eva-row">
              <h2>MAGI {editing} 配置 · 全内容试用</h2>
              <button onClick={() => setEditing(null)}>关闭</button>
            </div>
            <PresetEditor
              simulation
              profile={profile}
              busy={false}
              initial={editing === 'A' ? a : b}
              saveLabel="应用到本次演习"
              onSave={(preset) => {
                if (editing === 'A') setA(preset);
                else setB(preset);
                setEditing(null);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

const eventNames: Record<string, string> = {
  'battle-start': '作战开始',
  'battle-end': '作战结束',
  deploy: '机体出击',
  damage: '有效伤害',
  'damage-taken': '受到伤害',
  'part-damage': '部位伤害',
  protection: '有效防护',
  support: '有效支援',
  rescue: '成功救援',
  healing: '有效治疗',
  participation: '参与作战',
  skill: '战术技能',
  'energy-spent': '能量消耗',
  'passive-trigger': '被动触发',
  'stage-complete': '阶段完成',
  phase: '阶段变化',
  'phase-practice-complete': '阶段复习完成',
  'core-exposed': '核心暴露',
  'core-protected': '核心防护',
  'part-recovery-warning': '部位恢复预警',
  'power-state': '供能变化',
  'ammo-used': '消耗弹药',
  consumable: '使用物资',
  mark: '目标标记',
  objective: '推进目标',
  downed: '机体倒地',
  kill: '消除威胁',
  reinforcement: '敌方增援',
  'form-enter': '形态启动',
  'form-exit': '形态结束',
  crossfire: '交叉火力',
  'barrier-cover': '屏障掩护',
};
export function EvaBattleReport({ record }: { record: EvaBattleRecord }) {
  const [filter, setFilter] = useState('important');
  const review = useMemo(() => Eva.reviewBattle(record), [record]);
  const [focus, setFocus] = useState<string[]>([]);
  const r = record.reward;
  const events = record.events.filter((event) =>
    focus.length
      ? focus.includes(event.id)
      : filter === 'all' || !['damage', 'shot', 'move'].includes(event.kind),
  );
  return (
    <div className="eva-battle-report">
      {r && (
        <>
          <div className="eva-reward-grid">
            {[
              ['机体作战数据', r.machineData],
              ['驾驶员研修数据', r.driverData],
              ['支援研修数据', r.supportData],
              ['通用战术数据', r.generalData],
            ].map(([name, amount]) => (
              <div key={String(name)}>
                <small>{name}</small>
                <b>+{num(Number(amount))}</b>
              </div>
            ))}
          </div>
          <div className="eva-ledger">
            <span>基础经费 {num(r.silverBase)}</span>
            <span>许可额外 +{num(r.licenseBonus)}</span>
            <b>毛收入 {num(r.silverGross)}</b>
            <span>维修 −{num(r.repairCost)}</span>
            <span>补给 −{num(r.supplyCost)}</span>
            <strong>
              经费净变化 {r.silverNet >= 0 ? '+' : ''}
              {num(r.silverNet)}
            </strong>
          </div>
          {!r.eligible && <p>{r.reason}</p>}
          {r.maintenanceShortfall > 0 && (
            <p className="eva-error">
              整备缺口 {r.maintenanceShortfall} 作战经费；未使用特务配额。
            </p>
          )}
        </>
      )}
      <div className="eva-review-metrics">
        <span>有效伤害 {Math.round(review.metrics.damage)}</span>
        <span>部位贡献 {Math.round(review.metrics.partDamage)}</span>
        <span>防护 {Math.round(review.metrics.protection)}</span>
        <span>支援 {Math.round(review.metrics.support)}</span>
        <span>救援 {review.metrics.rescues}</span>
        <span>能量消耗 {Math.round(review.metrics.energySpent)}</span>
      </div>
      <div className="eva-observations">
        {review.observations.map((observation, i) => (
          <button key={i} onClick={() => setFocus(observation.eventIds)}>
            <span>{observation.text}</span>
            <small>定位 {observation.eventIds.length} 条事件 →</small>
          </button>
        ))}
      </div>
      <div className="eva-row">
        <h3>战斗事件</h3>
        <select
          aria-label="复盘事件筛选"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setFocus([]);
          }}
        >
          <option value="important">机制与技能</option>
          <option value="all">全部事件</option>
        </select>
        {focus.length > 0 && <button onClick={() => setFocus([])}>清除观察定位</button>}
        <small>
          规则 {record.ruleVersion} · 难度{' '}
          {{ relaxed: '回忆', normal: '标准', hard: '危机' }[record.difficulty ?? 'normal']} · 种子{' '}
          {record.seed} · {record.condition ?? '标准条件'}
        </small>
      </div>
      <div className="eva-event-list">
        {events.slice(-100).map((event) => (
          <div key={event.id}>
            <time>{event.time.toFixed(1)}s</time>
            <b>{eventNames[event.kind] ?? event.kind}</b>
            <span>
              {event.sourceId
                ? evaName(event.sourceId)
                : record.participants.some((p) => p.entityId === event.actorId)
                  ? evaName(
                      record.participants.find((p) => p.entityId === event.actorId)!.machineId,
                    )
                  : event.actorId === 'system'
                    ? '作战系统'
                    : '敌方目标'}
              {event.partId
                ? ` → ${({ weapon: '武装', generator: '防护发生器', core: '核心' } as Record<string, string>)[event.partId] ?? event.partId}`
                : ''}
            </span>
            <span>{event.amount === undefined ? '' : Math.round(event.amount)}</span>
            <small>
              {Object.values(BOSSES)
                .flatMap((boss) => boss.phases)
                .find((phase) => phase.id === event.phaseId)?.name ?? ''}{' '}
              #{event.seq}
            </small>
          </div>
        ))}
        {!events.length && <p>当前筛选下没有事件。</p>}
      </div>
    </div>
  );
}
function Records({ profile, magiRecords, onPractice, username }: Props) {
  const [recordId, setRecord] = useState(profile.battles.at(-1)?.round ?? '');
  const [section, setSection] = useState('battles');
  const all = [...profile.battles, ...magiRecords];
  const record = all.find((battle) => battle.round === recordId) ?? all.at(-1);
  return (
    <>
      <div className="eva-tabs">
        <button
          className={section === 'battles' ? 'active' : ''}
          onClick={() => setSection('battles')}
        >
          结算与复盘
        </button>
        <button
          className={section === 'service' ? 'active' : ''}
          onClick={() => setSection('service')}
        >
          作战资历
        </button>
        <button
          className={section === 'ledger' ? 'active' : ''}
          onClick={() => setSection('ledger')}
        >
          全部经费与物资流水
        </button>
      </div>
      {section === 'ledger' ? (
        <Ledger username={username} />
      ) : section === 'battles' ? (
        <div className="eva-record-layout">
          <aside className="panel eva-owner-list">
            <h2>局次记录</h2>
            {all
              .slice(-30)
              .reverse()
              .map((battle) => (
                <button
                  key={battle.round}
                  className={record?.round === battle.round ? 'active' : ''}
                  onClick={() => setRecord(battle.round)}
                >
                  <b>
                    {battle.mode === 'magi' ? 'MAGI · ' : ''}
                    {evaName(battle.missionId)}
                  </b>
                  <small>
                    {new Date(battle.at).toLocaleString()} · {battle.won ? '完成' : '有序退场'}
                  </small>
                </button>
              ))}
            {!all.length && <p>完成一次任务后，可在这里查看账目、技能和机制事件。</p>}
          </aside>
          <article className="panel">
            {record ? (
              <>
                <h2>
                  {evaName(record.missionId)} · {record.won ? '任务完成' : '作战记录'}
                </h2>
                <p>
                  {record.participants
                    .map((p) => `${evaName(p.machineId)} / ${evaName(p.driverId)}`)
                    .join(' ＋ ')}
                </p>
                <div className="eva-row">
                  <button
                    onClick={() => {
                      const participant =
                        record.participants.find((p) => p.entityId === record.entityId) ??
                        record.participants[0];
                      onPractice({
                        preset: participant.preset,
                        label: '复盘',
                        missionId: record.missionId,
                        seed: record.seed,
                        difficulty: record.difficulty ?? 'normal',
                        mode: 'magi',
                        simulatedAlly: true,
                        allyPreset: record.participants.find(
                          (p) => p.entityId !== participant.entityId,
                        )?.preset,
                      });
                    }}
                  >
                    按本局条件进入 MAGI
                  </button>
                  {[
                    ...new Set(
                      record.events.flatMap((event) => (event.phaseId ? [event.phaseId] : [])),
                    ),
                  ].map((phaseId) => (
                    <button
                      key={phaseId}
                      onClick={() => {
                        const participant =
                          record.participants.find((p) => p.entityId === record.entityId) ??
                          record.participants[0];
                        onPractice({
                          preset: participant.preset,
                          label: '阶段复习',
                          missionId: record.missionId,
                          seed: record.seed,
                          difficulty: record.difficulty ?? 'normal',
                          phaseId,
                          mode: 'magi',
                          simulatedAlly: true,
                          allyPreset: record.participants.find(
                            (p) => p.entityId !== participant.entityId,
                          )?.preset,
                        });
                      }}
                    >
                      {Object.values(BOSSES)
                        .flatMap((boss) => boss.phases)
                        .find((phase) => phase.id === phaseId)?.name ?? phaseId}{' '}
                      复习
                    </button>
                  ))}
                </div>
                <EvaBattleReport record={record} />
              </>
            ) : (
              <p>尚无作战记录。</p>
            )}
          </article>
        </div>
      ) : (
        <div className="eva-catalog">
          {Eva.CHALLENGES.map((challenge) => {
            const done = profile.service.completed.includes(challenge.id);
            const current =
              challenge.kind === 'rescue'
                ? profile.service.rescues
                : challenge.kind === 'protection'
                  ? profile.service.protection
                  : challenge.kind === 'routes'
                    ? Math.max(
                        0,
                        ...Object.values(profile.service.routes).map((routes) => routes.length),
                      )
                    : done
                      ? challenge.target
                      : 0;
            return (
              <article
                className={`panel eva-challenge ${done ? 'complete' : ''}`}
                key={challenge.id}
              >
                <small>{done ? '✓ 已领取资历奖励' : '进行中'}</small>
                <h2>{challenge.name}</h2>
                <p>{challenge.description}</p>
                <progress value={Math.min(challenge.target, current)} max={challenge.target} />
                <p>
                  {Math.min(challenge.target, current)} / {challenge.target} · 奖励{' '}
                  {evaName(challenge.rewardId)}
                </p>
                <small>{challenge.archive}</small>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

export function EvaBriefingLoadout({
  profile,
  presetId,
  busy,
  onChoose,
  onEdit,
  levelCap = 3,
  mode = 'operation',
  trialPreset,
}: {
  profile: EvaProfile;
  presetId?: string;
  busy: boolean;
  onChoose: (presetId: string) => void;
  onEdit: () => void;
  levelCap?: EvaLevel;
  mode?: BattleMode;
  trialPreset?: LoadoutPreset | null;
}) {
  const preset =
    mode === 'recovery'
      ? Eva.defaultPreset()
      : (mode === 'magi' && trialPreset) ||
        profile.presets.find((p) => p.id === presetId) ||
        activePreset(profile);
  const machine = profile.machines[preset.machineId];
  const effectiveLevel = Math.min(
    mode === 'recovery' ? 1 : mode === 'magi' ? 3 : (machine?.level ?? 1),
    levelCap,
    preset.levelCap ?? 3,
  ) as EvaLevel;
  const capacity = Eva.CAPACITIES[effectiveLevel];
  let error = '';
  try {
    Eva.resolveLoadout(profile, preset, {
      simulation: mode !== 'operation',
      levelCap: effectiveLevel,
    });
  } catch (problem) {
    error = problem instanceof Error ? problem.message : '当前配置不可出战';
  }
  const missingCost =
    mode === 'operation'
      ? Object.entries({ ...preset.ammo, ...preset.consumables }).reduce(
          (total, [id, count]) =>
            total +
            Math.max(0, count - (profile.stock[id] ?? 0)) *
              ([...Eva.AMMO, ...Eva.CONSUMABLES].find((item) => item.id === id)?.price ?? 0),
          0,
        )
      : 0;
  return (
    <div className="eva-briefing-loadout">
      <h2>出战快照</h2>
      <label>
        预设
        <select
          value={trialPreset && mode === 'magi' ? ':magi-trial' : preset.id}
          disabled={busy || mode === 'recovery'}
          onChange={(e) => {
            if (e.target.value !== ':magi-trial') onChoose(e.target.value);
          }}
        >
          {trialPreset && mode === 'magi' && (
            <option value=":magi-trial">{trialPreset.name} · MAGI 试配</option>
          )}
          {profile.presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.target ? ' · 演习目标' : ''}
            </option>
          ))}
        </select>
      </label>
      <img src={machineArt(preset.machineId)} alt={evaName(preset.machineId)} />
      <h3>
        {evaName(preset.machineId)} · 生效 {effectiveLevel} 级
      </h3>
      <p>
        {mode === 'recovery'
          ? '临时基础试验机 · 不使用个人损伤和物资'
          : mode === 'magi'
            ? `MAGI 全内容试用 / 任务上限 ${levelCap} 级${machine ? ` · 实际拥有 ${machine.level} 级` : ' · 此机体尚未拥有'}`
            : `真实整备 ${machine?.level ?? 1} 级 / 任务上限 ${levelCap} 级`}
        <br />
        装备 {preset.equipment.length}/{capacity.equipment} · 战术 {preset.skills.length}/
        {capacity.skills}
      </p>
      <p>
        驾驶员 {evaName(preset.driverId)}
        <br />
        远程支援 {evaName(preset.supportId)}
      </p>
      <p>
        {evaName(preset.weaponId)} / {evaName(preset.meleeId)}
      </p>
      <p>
        战术 {preset.skills.map(evaName).join(' / ') || '无'}
        <br />
        被动装备 {preset.equipment.map(evaName).join(' / ') || '无'}
      </p>
      <p>
        耐久 {mode === 'operation' ? Math.round((1 - (machine?.damage ?? 0)) * 100) : 100}% ·{' '}
        {mode !== 'operation'
          ? '本模式不写入个人损伤'
          : machine?.damage === 1
            ? '已击毁，需维修或进入后勤整备试验'
            : '可以带伤出战'}
      </p>
      <div className="eva-stock-preview">
        {Object.entries({ ...preset.ammo, ...preset.consumables })
          .filter(([, count]) => count > 0)
          .map(([id, count]) => (
            <span key={id}>
              {evaName(id)} ×{count} / 库存 {profile.stock[id] ?? 0}
            </span>
          ))}
      </div>
      {mode === 'operation' ? (
        <small>
          缺少物资需 {missingCost} 作战经费
          {profile.autoSupply ? '，自动补给已开启' : '，可到后勤购买或启用自动补给'}
          。库存已拥有部分不重复收费；双方就绪后统一预留。
        </small>
      ) : (
        <small>演习与恢复试验使用临时库存，正式库存不扣除。</small>
      )}
      {error && (
        <p className="eva-error" role="alert">
          配置冲突：{error}
        </p>
      )}
      {mode !== 'recovery' && (
        <button onClick={onEdit}>
          {mode === 'magi' ? '前往 MAGI 调整试配' : '前往机库调整预设'}
        </button>
      )}
    </div>
  );
}

function Ledger({ username }: { username: string | null }) {
  const [entries, setEntries] = useState<EvaLedgerEntry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    if (!username) {
      setLoading(false);
      setEntries([]);
      return;
    }
    void fetchEvaLedger()
      .then((rows) => {
        if (active) setEntries(rows);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : '交易流水读取失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [username, attempt]);
  const labels: Record<string, string> = {
    research: '永久研究',
    upgrade: '机体整备晋阶',
    preset: '出战预设',
    purchase: '物资购买',
    draw: '补给申请',
    exchange: '定向调拨',
    repair: '机体维修',
    settings: '整备设置',
    redeem: '兑换券核销',
    battle: '作战结算',
    reserve: '开局物资预留',
    settlement: '作战结算',
  };
  const walletNames: Record<string, string> = {
    silver: '作战经费',
    gold: '特务配额',
    generalData: '通用战术数据',
    tickets: '补给申请券',
    credentials: '调拨凭证',
  };
  return (
    <article className="panel">
      <div className="eva-row">
        <h2>个人交易流水</h2>
        <button disabled={loading} onClick={() => setAttempt((n) => n + 1)}>
          刷新流水
        </button>
      </div>
      {error && (
        <p className="eva-error" role="alert">
          {error}
        </p>
      )}
      {loading && <p>正在核实流水…</p>}
      {!loading && !error && !entries.length && <p>暂无已完成的交易。</p>}
      <div className="eva-ledger-entries">
        {entries.map((entry) => {
          const changes = Object.entries(entry.delta.eva?.wallet ?? {}).filter(
            ([, amount]) => amount !== 0,
          );
          const items = Object.entries(entry.delta.eva?.stock ?? {}).filter(
            ([, amount]) => amount !== 0,
          );
          const before = entry.balance.before?.eva?.wallet,
            after = entry.balance.after?.eva?.wallet;
          return (
            <div key={entry.operation_id}>
              <div>
                <b>{labels[entry.kind.replace('eva:', '')] ?? '档案操作'}</b>
                <small>
                  {new Date(entry.at).toLocaleString()} · 档案版本 {entry.revision}
                </small>
              </div>
              <div>
                {changes.map(([key, amount]) => (
                  <span key={key}>
                    {walletNames[key] ?? key} {amount! > 0 ? '+' : ''}
                    {num(amount!)}
                  </span>
                ))}
                {items.map(([id, amount]) => (
                  <span key={id}>
                    {evaName(id)} {amount > 0 ? '+' : ''}
                    {amount}
                  </span>
                ))}
                {!changes.length && !items.length && <span>余额与物资无变化</span>}
              </div>
              {before && after && (
                <small>
                  经费 {num(before.silver)} → {num(after.silver)} · 配额 {num(before.gold)} →{' '}
                  {num(after.gold)}
                </small>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}
