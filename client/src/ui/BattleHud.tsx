import { appUrl } from '../app-url';
import { Eva, type GameState, type Player } from '@dawn/simulation';
import './battle-terminal.css';
import { evaName, typeNames, portraitArt } from './EvaPanels';
import { SkillIcon, type IconKind } from './SkillIcon';
import { TerminalIcon, type TerminalIconKind } from './TerminalIcon';
import type { SaveStatus } from '../services/save-task';
const names = { Asuka: '明日香', Rei: '绫波丽' };
export function BattleHud({
  state,
  index,
  latency,
  onAbility,
  onPause,
  onReset,
  tutorial,
  tutorialSync,
  signedIn,
  onRetryTutorial,
}: {
  state: GameState;
  index: number;
  latency: number;
  onAbility: (name: string) => void;
  onPause: () => void;
  onReset: () => void;
  tutorial: boolean;
  tutorialSync: { status: SaveStatus; error: string };
  signedIn: boolean;
  onRetryTutorial: () => void;
}) {
  const p = state.players[index];
  if (!p) return null;
  if (p.resolved)
    return (
      <EvaHud
        state={state}
        index={index}
        latency={latency}
        onAbility={onAbility}
        onPause={onPause}
      />
    );
  const ally = state.players.find((a) => a !== p),
    defs: {
      key: keyof Player['cd'];
      name: string;
      keycap: string;
      icon: IconKind;
      duration: number;
    }[] = [
      { key: 'fire', name: '主武器', keycap: '空格', icon: 'fire', duration: 1 },
      { key: 'speed', name: '推进', keycap: 'Q', icon: 'speed', duration: 15 },
      {
        key: 'special',
        name: p.character === 'Asuka' ? '双炮压制' : '相位跃迁',
        keycap: 'W',
        icon: p.character === 'Asuka' ? 'special' : 'blink',
        duration: 5,
      },
      { key: 'heal', name: '修复', keycap: 'E', icon: 'heal', duration: 20 },
      {
        key: 'ultimate',
        name: p.character === 'Asuka' ? 'A.T. 觉醒' : 'N² 打击',
        keycap: 'R',
        icon: p.character === 'Asuka' ? 'ultimate' : 'missile',
        duration: 10,
      },
      { key: 'melee', name: '近战', keycap: 'F', icon: 'melee', duration: 1.25 },
      { key: 'item', name: '主动配件', keycap: 'C', icon: 'item', duration: 30 },
    ];
  const steps = [
    { title: '机体响应', text: '使用方向键移动，熟悉镜头跟随。', done: p.stats.moved > 80 },
    { title: '主武器校准', text: '按空格向木桩射击，累计发射 3 次。', done: p.stats.shots >= 3 },
    {
      title: '推进测试',
      text: '按 Q 激活推进，观察技能图标冷却。',
      done: p.stats.skillUses.speed > 0,
    },
    {
      title: '核心技能',
      text: '按 W 使用双炮压制或相位跃迁。',
      done: p.stats.skillUses.special > 0,
    },
    {
      title: '同步爆发',
      text: '按 R 释放 A.T. 力场或 N² 导弹。',
      done: p.stats.skillUses.ultimate > 0,
    },
    {
      title: '近战与维护',
      text: '接近目标按 F 近战，按 E 修复机体。',
      done: p.stats.melee > 0 && p.stats.heals > 0,
    },
  ];
  const step = steps.findIndex((s) => !s.done);
  return (
    <>
      <SquadRail state={state} index={index} />
      <div className="battle-topbar">
        <div>
          <span className="eyebrow">{state.practice ? 'SIMULATION' : 'SQUAD COMBAT'}</span>
          <b>{state.map.name}</b>
        </div>
        <div className="battle-metrics">
          {Math.floor(state.time / 60)
            .toString()
            .padStart(2, '0')}
          :
          {Math.floor(state.time % 60)
            .toString()
            .padStart(2, '0')}
          <span>敌机 {state.enemies.filter((a) => a.hp > 0).length}</span>
          <span>伤害 {Math.round(p.stats.damage)}</span>
          {state.practice ? (
            <span>DPS {(p.stats.damage / Math.max(state.time, 1)).toFixed(1)}</span>
          ) : (
            <span>{latency} ms</span>
          )}
        </div>
        <div>
          {state.practice && <button onClick={onReset}>重置训练</button>}
          <button onClick={onPause}>暂停 · Esc</button>
        </div>
      </div>
      {!p.resolved && (
        <aside className="battle-field-guide">
          <span className="eyebrow">TACTICAL SITUATION</span>
          <h3>{state.practice ? '机体模拟训练' : '双人协同作战'}</h3>
          <p>{state.cooperation?.objective?.text ?? '清除敌机，保持队员协同。'}</p>
          <TerrainLegend />
        </aside>
      )}
      {tutorial && (
        <aside className="tutorial-box">
          <span className="eyebrow">{step < 0 ? 'SYNCHRONIZED' : `0${step + 1} / 06`}</span>
          <h3>{step < 0 ? '同步训练完成' : steps[step].title}</h3>
          <p>
            {step < 0
              ? '继续自由练习，或回大厅组队。双人作战中可接力破甲、共享支援与近身救援。'
              : steps[step].text}
          </p>
          {step === 0 && <small>移动距离 {Math.min(80, Math.floor(p.stats.moved))} / 80</small>}
          {step === 1 && <small>射击次数 {Math.min(3, p.stats.shots)} / 3</small>}
          {step < 0 && (
            <div role="status">
              {!signedIn ? (
                <small>本次为访客练习，登录档案后可保存训练奖励。</small>
              ) : tutorialSync.status === 'saved' ? (
                <small>训练完成与奖励已保存。</small>
              ) : tutorialSync.status === 'failed' ? (
                <>
                  <p>存档未完成：{tutorialSync.error}</p>
                  <button onClick={onRetryTutorial}>重试保存训练</button>
                </>
              ) : (
                <small>正在保存训练结果…</small>
              )}
            </div>
          )}
        </aside>
      )}
      <footer className="battle-hud">
        <div className="hud-status">
          <strong>{names[p.character]}</strong>
          <span>
            HP {Math.ceil(p.hp)} / {p.maxHp}
          </span>
          <div className={'health ' + (p.character === 'Rei' ? 'blue' : '')}>
            <i style={{ width: `${(p.hp / p.maxHp) * 100}%` }} />
          </div>
          <div className="energy">
            <i style={{ width: `${p.energy}%` }} />
          </div>
          <small>同步能量 {Math.floor(p.energy)} / 100</small>
        </div>
        <div className="ability-bar">
          {defs.map((d) => (
            <div key={d.key}>
              <button
                className={'ability ' + (p.cd[d.key] <= 0 ? 'ready' : '')}
                onClick={() => onAbility(d.key)}
                disabled={p.hp <= 0 || (d.key === 'item' && !p.activeItem)}
                title={`${d.name} · ${d.keycap}`}
                aria-label={`${d.name}，快捷键 ${d.keycap}`}
              >
                <SkillIcon kind={d.icon} size={54} />
                {p.cd[d.key] > 0 && (
                  <>
                    <i
                      className="cooldown-veil"
                      style={{ height: `${Math.min(100, (p.cd[d.key] / d.duration) * 100)}%` }}
                    />
                    <strong className="cooldown-number">{Math.ceil(p.cd[d.key])}</strong>
                  </>
                )}
                <kbd>{d.keycap}</kbd>
              </button>
              <small>{d.name}</small>
            </div>
          ))}
        </div>
        <div className="hud-ammo">
          <b>
            {p.loadout.ammo === 'AP'
              ? '阳电子穿甲'
              : p.loadout.ammo === 'HE'
                ? 'N² 高爆'
                : '共振碎甲'}
          </b>
          <small>1 / 2 / 3 切换弹种</small>
          {ally && (
            <>
              <span>
                {names[ally.character]} · {ally.hp > 0 ? '在线' : '需要救援'}
              </span>
              <div className="health blue">
                <i style={{ width: `${(ally.hp / ally.maxHp) * 100}%` }} />
              </div>
            </>
          )}
        </div>
      </footer>
    </>
  );
}

function EvaHud({
  state,
  index,
  latency,
  onAbility,
  onPause,
}: {
  state: GameState;
  index: number;
  latency: number;
  onAbility: (key: string) => void;
  onPause: () => void;
}) {
  const p = state.players[index],
    ally = state.players.find((player) => player.id !== p.id);
  const mission = Eva.MISSIONS.find((m) => m.id === state.missionId);
  const boss = state.enemies.find((enemy) => enemy.hp > 0 && enemy.parts?.length);
  const basics = [
    { key: 'fire', name: '主武器', cap: '空格', icon: 'fire' },
    { key: 'speed', name: '基础推进', cap: 'Q', icon: 'speed' },
    { key: 'heal', name: '基础维修', cap: 'E', icon: 'heal' },
    { key: 'melee', name: '近战/救援', cap: 'F', icon: 'melee' },
  ] as const;
  const supplies = Object.entries(p.resolved!.preset.consumables).filter(([, count]) => count > 0);
  const iconFor = (effect: string): TerminalIconKind =>
    effect.includes('barrier') || effect.includes('guard')
      ? 'barrier'
      : effect.includes('rescue')
        ? 'heal'
        : effect.includes('energy')
          ? 'energy'
          : effect.includes('mark') || effect.includes('coordinate')
            ? 'magi'
            : effect.includes('counter')
              ? 'melee'
              : 'special';
  return (
    <>
      <SquadRail state={state} index={index} />
      <div className="battle-topbar">
        <div>
          <span className="eyebrow">
            {state.mode === 'magi'
              ? 'MAGI / NO PERSISTENT REWARDS'
              : state.mode === 'recovery'
                ? 'LOGISTICS RECOVERY'
                : 'SQUAD COMBAT'}
          </span>
          <b>{mission?.name ?? state.map.name}</b>
        </div>
        <div className="battle-metrics">
          <span>
            {Math.floor(state.time / 60)
              .toString()
              .padStart(2, '0')}
            :
            {Math.floor(state.time % 60)
              .toString()
              .padStart(2, '0')}
          </span>
          <span>有效伤害 {Math.round(p.stats.damage)}</span>
          <span>存活敌机 {state.enemies.filter((e) => e.hp > 0).length}</span>
          {state.mode !== 'magi' && <span>{latency} ms</span>}
        </div>
        <button onClick={onPause}>暂停 · Esc</button>
      </div>
      <aside className="eva-battle-objectives">
        <span className="eyebrow">MISSION / 作战目标</span>
        {state.objective && (
          <>
            <p>
              {state.objective.label} · {Math.floor(state.objective.progress)}/
              {Math.ceil(state.objective.required)}
            </p>
            <progress value={state.objective.progress} max={state.objective.required} />
            {state.objective.kind !== 'assault' && (
              <p>
                目标耐久 {Math.ceil(state.objective.hp)} / {state.objective.maxHp}
              </p>
            )}
          </>
        )}
        {mission?.condition && (
          <p>
            本局条件：
            {mission.condition === 'limited-power'
              ? '区域供能受限'
              : mission.condition === 'dense-enemies'
                ? '敌群密集'
                : '增援频繁'}
          </p>
        )}
        {state.coopActions?.map((action) => (
          <p key={action.id}>
            <img
              width={20}
              height={20}
              src={appUrl(`/eva/sync-${action.id === 'crossfire' ? 'crossfire' : 'cover'}.svg`)}
              alt=""
            />{' '}
            {action.id === 'crossfire' ? '交叉火力' : '屏障掩护'} ·{' '}
            {action.state === 'ready'
              ? '可协同'
              : action.state === 'primed'
                ? '等待不同队员接续'
                : `冷却 ${Math.ceil(Math.max(0, action.cooldownUntil - state.time))} 秒`}
          </p>
        ))}
        {boss && (
          <>
            <p>目标部位 · Tab 循环选择</p>
            <div className="eva-battle-parts">
              {boss.parts!.map((part) => (
                <button
                  key={part.id}
                  className={(p.targetPart ?? 'core') === part.id ? 'active' : ''}
                  onClick={() => onAbility(`part:${part.id}`)}
                >
                  {{ weapon: '武装', generator: '防护发生器', core: '核心' }[part.id]}{' '}
                  {part.state === 'disabled'
                    ? '停机'
                    : `${Math.round((part.hp / part.maxHp) * 100)}%`}
                </button>
              ))}
            </div>
          </>
        )}
        <TerrainLegend />
        {!!state.powerZones?.length && (
          <p>发光区域恢复同步能量；黄色为备用点。断电仍可移动和标准射击。</p>
        )}
      </aside>
      <footer className="battle-hud eva-modern-hud">
        <div className="hud-status">
          <strong>
            {evaName(p.machineId)} · {typeNames[p.resolved!.type]}
          </strong>
          <span className="eva-hud-name">
            {evaName(p.driverId)} / {evaName(p.supportId)}
          </span>
          <span>
            HP {Math.ceil(p.hp)} / {p.maxHp}
          </span>
          <div className="health">
            <i style={{ width: `${Math.max(0, (p.hp / p.maxHp) * 100)}%` }} />
          </div>
          <div className="energy">
            <i style={{ width: `${(p.energy / p.maxEnergy) * 100}%` }} />
          </div>
          <small>
            同步能量 {Math.floor(p.energy)} / {p.maxEnergy}
          </small>
        </div>
        <div className="ability-bar eva-tactical-bar">
          {basics.map((ability) => (
            <div key={ability.key}>
              <button
                className={`ability ${p.cd[ability.key] <= 0 ? 'ready' : ''}`}
                disabled={p.hp <= 0}
                onClick={() => onAbility(ability.key)}
                title={ability.name}
              >
                <SkillIcon kind={ability.icon} size={44} />
                {p.cd[ability.key] > 0 && (
                  <strong className="cooldown-number">{Math.ceil(p.cd[ability.key])}</strong>
                )}
                <kbd>{ability.cap}</kbd>
              </button>
              <small>{ability.name}</small>
            </div>
          ))}
          {[0, 1, 2].map((slot) => {
            const id = p.resolved!.preset.skills[slot],
              effect = p.resolved!.skills[slot] ?? '',
              cooldown = p.tacticalCd[slot] ?? 0;
            return (
              <div key={slot}>
                <button
                  className={`ability ${cooldown <= 0 && id ? 'ready' : ''}`}
                  disabled={p.hp <= 0 || !id}
                  onClick={() => onAbility(`tactical${slot + 1}`)}
                  title={id ? evaName(id) : '未开放或未配置的战术槽'}
                >
                  {id ? <TerminalIcon kind={iconFor(effect)} size={44} /> : <span>—</span>}
                  {cooldown > 0 && (
                    <strong className="cooldown-number">{Math.ceil(cooldown)}</strong>
                  )}
                  <kbd>{['W', 'R', 'C'][slot]}</kbd>
                </button>
                <small>{id ? evaName(id) : '战术槽空闲'}</small>
              </div>
            );
          })}
        </div>
        <div className="hud-ammo">
          <b>{p.selectedAmmoId ? evaName(p.selectedAmmoId) : '标准弹 · 持续可用'}</b>
          <small>
            1 / 2 / 3 特殊弹药 ·{' '}
            {p.selectedAmmoId ? `余量 ${p.stock[p.selectedAmmoId] ?? 0}` : '已耗尽时自动回退'}
          </small>
          <div className="eva-supply-hud">
            {[0, 1].map((slot) => {
              const item = supplies[slot];
              return (
                <button
                  key={slot}
                  disabled={!item || !(p.stock[item[0]] > 0) || p.hp <= 0}
                  onClick={() => onAbility(`consumable${slot + 1}`)}
                >
                  {['Z', 'X'][slot]}{' '}
                  {item ? `${evaName(item[0])} ×${p.stock[item[0]] ?? 0}` : '无物资'}
                </button>
              );
            })}
          </div>
          {ally && (
            <>
              <span>
                {evaName(ally.machineId)} · {ally.hp > 0 ? '已连接' : '靠近救援'}
              </span>
              <div className="health blue">
                <i style={{ width: `${Math.max(0, (ally.hp / ally.maxHp) * 100)}%` }} />
              </div>
            </>
          )}
        </div>
      </footer>
    </>
  );
}

function TerrainLegend() {
  return (
    <div className="battle-terrain-legend">
      <span className="eyebrow">FIELD GUIDE / 地形识别</span>
      <p>
        <i className="floor" />
        可通行地面
      </p>
      <p>
        <i className="obstacle" />
        障碍 · 不可通行
      </p>
      <p>
        <i className="water" />
        水域 · 不可通行
      </p>
      <p>
        <i className="danger" />
        攻击预警 · 尽快撤离
      </p>
    </div>
  );
}

function SquadRail({ state, index }: { state: GameState; index: number }) {
  return (
    <aside className="battle-squad-rail">
      <div className="battle-terminal-brand">
        <span className="eyebrow">BATTLE FOR THE DAWN</span>
        <h2>
          <img
            className="dawn-wordmark"
            src={appUrl('/identity/dawn-wordmark.png')}
            alt="黎明之战"
          />
        </h2>
        <small>作战终端 / SQUAD LINK</small>
      </div>
      {state.players.map((player, slot) => (
        <section
          key={player.id}
          className={`battle-pilot-card player-${slot + 1} ${player.hp <= 0 ? 'down' : ''}`}
        >
          <header>
            <b>{slot + 1}P</b>
            <span>
              {slot === index ? '本机' : '协同队员'} · {player.hp <= 0 ? '待救援' : '已连接'}
            </span>
          </header>
          <div className="battle-pilot-identity">
            <img
              src={
                player.driverId
                  ? portraitArt(player.driverId)
                  : appUrl(`/assets/pilot-${player.character.toLowerCase()}.png`)
              }
              alt=""
            />
            <div>
              <strong>
                {player.driverId ? evaName(player.driverId) : names[player.character]}
              </strong>
              <small>{player.machineId ? evaName(player.machineId) : '训练机体'}</small>
            </div>
          </div>
          <label>
            机体耐久{' '}
            <span>
              {Math.max(0, Math.ceil(player.hp))} / {player.maxHp}
            </span>
          </label>
          <div className="health">
            <i style={{ width: `${Math.max(0, (player.hp / player.maxHp) * 100)}%` }} />
          </div>
          <label>
            同步能量{' '}
            <span>
              {Math.floor(player.energy)} / {player.maxEnergy || 100}
            </span>
          </label>
          <div className="energy">
            <i
              style={{
                width: `${Math.max(0, (player.energy / (player.maxEnergy || 100)) * 100)}%`,
              }}
            />
          </div>
        </section>
      ))}
      <div className="battle-rail-note">
        <span>REALTIME CO-OP</span>
        <p>
          方向键移动 · 空格射击
          <br />
          靠近倒地队员按 F 救援
        </p>
      </div>
    </aside>
  );
}
