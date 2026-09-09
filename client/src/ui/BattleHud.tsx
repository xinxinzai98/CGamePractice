import type { GameState, Player } from '@dawn/simulation';
import { SkillIcon, type IconKind } from './SkillIcon';
const names = { Asuka: '明日香', Rei: '绫波丽' };
export function BattleHud({
  state,
  index,
  latency,
  onAbility,
  onPause,
  onReset,
  tutorial,
}: {
  state: GameState;
  index: number;
  latency: number;
  onAbility: (name: string) => void;
  onPause: () => void;
  onReset: () => void;
  tutorial: boolean;
}) {
  const p = state.players[index];
  if (!p) return null;
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
