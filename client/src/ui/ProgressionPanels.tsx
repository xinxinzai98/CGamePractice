/// <reference types="vite/client" />
import { useState } from 'react';
import { Equipment, Progression, type Profile, type Character, type Slot } from '@dawn/simulation';
import { SkillIcon, type IconKind } from './SkillIcon';
import './progression-panels.css';
import type { ApiClient, ApiAction, ApiResults, RequestBody, Reward } from '../services/api';

interface Props {
  view: 'skills' | 'shop' | 'supply' | 'records';
  profile: Profile;
  username: string | null;
  character: Character;
  onCharacter: (character: Character) => void;
  onApi: ApiClient;
  onToast: (message: string) => void;
  onLogin: () => void;
  onTrial: (character: Character, nodes: string[]) => void;
}
const names: Record<Character, string> = { Asuka: '明日香', Rei: '绫波丽' };
const slotNames: Record<Slot, string> = { weapon: '主武器', armor: '防护装甲', module: '辅助模组' };
const slots: Slot[] = ['weapon', 'armor', 'module'];
const itemById = Object.fromEntries(Equipment.ITEMS.map((item) => [item.id, item]));
function icon(value: string): IconKind {
  return [
    'fire',
    'heal',
    'speed',
    'special',
    'ultimate',
    'blink',
    'missile',
    'melee',
    'item',
  ].includes(value)
    ? (value as IconKind)
    : 'item';
}
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '操作未完成，请稍后重试。';
}

export function ProgressionPanels(props: Props) {
  return <ProgressionPanelContent key={props.username ?? 'guest'} {...props} />;
}

function ProgressionPanelContent(props: Props) {
  const { view, profile, username, character, onCharacter, onApi, onToast, onLogin, onTrial } =
    props;
  const [busy, setBusy] = useState(false);
  const [trial, setTrial] = useState(false);
  const [drafts, setDrafts] = useState<Partial<Record<Character, string[]>>>({});
  const [trials, setTrials] = useState<Record<Character, string[]>>({ Asuka: [], Rei: [] });
  const [selected, setSelected] = useState<string | null>(null);
  const [reward, setReward] = useState<Reward | null>(null);
  const [rewardSerial, setRewardSerial] = useState(0);
  const draft = trial
    ? trials[character]
    : (drafts[character] ?? profile.characters[character].nodes);
  const xp = trial ? 3000 : profile.characters[character].xp;
  const level = 1 + Math.floor(xp / 300);
  const definitions = Progression.TREES[character];
  const selectedNode = definitions.find((node) => node.id === selected);
  function changeDraft(nodes: string[]) {
    if (trial) setTrials((current) => ({ ...current, [character]: nodes }));
    else setDrafts((current) => ({ ...current, [character]: nodes }));
  }
  function lockReason(id: string): string {
    if (draft.includes(id)) return '';
    try {
      Progression.validateBuild(character, [...draft, id], xp);
      return '';
    } catch (error) {
      return errorText(error);
    }
  }
  async function act<A extends ApiAction>(
    action: A,
    body: RequestBody,
    success: string,
  ): Promise<ApiResults[A] | undefined> {
    if (!username) {
      onLogin();
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const result = await onApi(action, body);
      onToast(success);
      return result;
    } catch (error) {
      onToast(errorText(error));
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  const switcher = (
    <div className="pp-character-tabs" aria-label="选择驾驶员">
      {(['Asuka', 'Rei'] as Character[]).map((c) => (
        <button
          key={c}
          className={character === c ? 'is-selected' : ''}
          aria-pressed={character === c}
          onClick={() => {
            onCharacter(c);
            setSelected(null);
          }}
        >
          <span className={`pp-pilot-dot ${c.toLowerCase()}`} />
          {names[c]}
          <small>Lv.{1 + Math.floor(profile.characters[c].xp / 300)}</small>
        </button>
      ))}
    </div>
  );

  return (
    <section
      className={`progression-panel pp-${view}${profile.appearance.reducedMotion ? ' pp-reduced-motion' : ''}`}
    >
      <header className="pp-header">
        <div>
          <small>DAWN / PILOT DEVELOPMENT</small>
          <h1>
            {
              { skills: '同步技能树', shop: '机体配件', supply: '轨道补给', records: '作战记录' }[
                view
              ]
            }
          </h1>
        </div>
        <div className="pp-balance">
          <b>
            {profile.coins.toLocaleString()} <small>金币</small>
          </b>
          <span>
            {username || '访客档案'} · {username ? '服务器存档' : '登录后保存成长'}
          </span>
        </div>
      </header>
      {(view === 'skills' || view === 'shop') && switcher}
      {view === 'skills' && (
        <>
          <div className="pp-toolbar">
            <div>
              <b>{trial ? '自由试配' : `${names[character]} · 熟练 Lv.${level}`}</b>
              <span>
                可用技能点 {Math.max(0, level - draft.length)} / {level}
              </span>
            </div>
            <label>
              <input
                type="checkbox"
                checked={trial}
                onChange={(event) => {
                  setTrial(event.target.checked);
                  setSelected(null);
                }}
              />
              练习试配 · 不写入档案
            </label>
            <button onClick={() => changeDraft([])}>重置配置</button>
            <button
              className="pp-primary"
              disabled={busy}
              onClick={() => {
                if (trial) {
                  onTrial(character, [...draft]);
                  onToast('试配已应用到个人练习。');
                } else void act('build', { character, nodes: draft }, '出战技能树已保存。');
              }}
            >
              {trial ? '带入个人练习' : busy ? '保存中…' : '保存出战配置'}
            </button>
          </div>
          <div className="pp-tree-layout">
            <div className="pp-tree">
              {[...new Set(definitions.map((node) => node.branch))].map((branch) => (
                <div className="pp-branch" key={branch}>
                  <h2>{branch}</h2>
                  {definitions
                    .filter((node) => node.branch === branch)
                    .map((node) => {
                      const learned = draft.includes(node.id),
                        reason = lockReason(node.id);
                      return (
                        <button
                          key={node.id}
                          className={`pp-node ${learned ? 'is-learned' : ''} ${reason ? 'is-locked' : ''} ${selected === node.id ? 'is-selected' : ''}`}
                          onClick={() => setSelected(node.id)}
                          aria-pressed={selected === node.id}
                        >
                          <SkillIcon kind={icon(node.icon)} size={58} />
                          <div>
                            <small>
                              {node.tier === 3 ? '终极 · 路线互斥' : `阶段 0${node.tier}`} / Lv.
                              {node.level}
                            </small>
                            <b>{node.name}</b>
                            <span>{learned ? '已点亮' : reason || '可解锁 · 1 点'}</span>
                          </div>
                        </button>
                      );
                    })}
                </div>
              ))}
            </div>
            <aside className="pp-node-detail">
              {selectedNode ? (
                <>
                  <SkillIcon kind={icon(selectedNode.icon)} size={88} />
                  <small>{selectedNode.branch}</small>
                  <h2>{selectedNode.name}</h2>
                  <p>{selectedNode.description}</p>
                  <dl>
                    <dt>熟练等级</dt>
                    <dd>Lv.{selectedNode.level}</dd>
                    <dt>前置技能</dt>
                    <dd>
                      {selectedNode.requires
                        .map((id) => definitions.find((node) => node.id === id)?.name)
                        .join('、') || '无'}
                    </dd>
                    <dt>消耗</dt>
                    <dd>1 技能点</dd>
                  </dl>
                  <p className="pp-hint">
                    {draft.includes(selectedNode.id)
                      ? '当前配置已点亮此节点。'
                      : lockReason(selectedNode.id) || '下一次作战生效。'}
                  </p>
                  <button
                    className="pp-primary"
                    disabled={draft.includes(selectedNode.id) || !!lockReason(selectedNode.id)}
                    onClick={() => {
                      try {
                        changeDraft(
                          Progression.validateBuild(character, [...draft, selectedNode.id], xp),
                        );
                      } catch (error) {
                        onToast(errorText(error));
                      }
                    }}
                  >
                    {draft.includes(selectedNode.id) ? '已点亮' : '点亮技能'}
                  </button>
                </>
              ) : (
                <>
                  <SkillIcon kind="special" size={88} />
                  <h2>选择你的同步路线</h2>
                  <p>点选节点查看能力。每条路线逐级解锁，三种终极能力只能选择一种。</p>
                  <p className="pp-hint">
                    配置可免费重置。试配模式可测试尚未通过熟练度解锁的能力。
                  </p>
                </>
              )}
            </aside>
          </div>
        </>
      )}
      {view === 'shop' && (
        <div className="pp-shop-layout">
          <aside className="pp-equipped">
            <h2>当前出战配置</h2>
            {slots.map((slot) => {
              const id = profile.equipment[character][slot],
                item = Equipment.ITEMS.find((entry) => entry.id === id);
              return (
                <div className="pp-slot" key={slot}>
                  <SkillIcon kind={icon(item?.icon || 'item')} size={50} />
                  <div>
                    <small>{slotNames[slot]}</small>
                    <b>{item?.name || '基础配置'}</b>
                  </div>
                  {id && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act('equip', { character, slot, itemId: null }, '已卸下配件。')
                      }
                    >
                      卸下
                    </button>
                  )}
                </div>
              );
            })}
            <p className="pp-hint">
              每个部位仅装配一个配件。购买后永久保留，可供两位驾驶员分别配置。
            </p>
          </aside>
          <div className="pp-items">
            {Equipment.ITEMS.map((item) => {
              const owned = profile.inventory.includes(item.id),
                equipped = profile.equipment[character][item.slot] === item.id;
              return (
                <article className={`pp-item ${equipped ? 'is-equipped' : ''}`} key={item.id}>
                  <div className="pp-item-top">
                    <SkillIcon kind={icon(item.icon)} size={68} />
                    <small>
                      {slotNames[item.slot]} / {item.price >= 180 ? '稀有' : '标准'}
                    </small>
                  </div>
                  <h2>{item.name}</h2>
                  <p>{item.description}</p>
                  <footer>
                    <b>{owned ? '已拥有' : `${item.price} 金币`}</b>
                    <button
                      className={owned ? '' : 'pp-primary'}
                      disabled={
                        busy || equipped || (!!username && !owned && profile.coins < item.price)
                      }
                      onClick={() =>
                        void act(
                          owned ? 'equip' : 'shop',
                          owned
                            ? { character, slot: item.slot, itemId: item.id }
                            : { itemId: item.id },
                          owned ? '配件已装配。' : '购买成功，可立即装配。',
                        )
                      }
                    >
                      {equipped ? '已装配' : owned ? '装配' : '购买'}
                    </button>
                  </footer>
                </article>
              );
            })}
          </div>
        </div>
      )}
      {view === 'supply' && (
        <div className="pp-supply-layout">
          <div className="pp-supply-main">
            <small>ORBITAL SUPPLY / 免费补给</small>
            <h2>接收下一份战备支援</h2>
            <p>补给券通过作战获得。无付费入口，所有配件也可使用作战金币直接购买。</p>
            <div className="pp-supply-orbit" aria-hidden="true">
              <SkillIcon kind="item" size={112} />
            </div>
            <div className="pp-pity">
              <span>
                保底进度 <b>{profile.pity} / 10</b>
              </span>
              <progress max={10} value={profile.pity} />
              <small>连续 9 次未出稀有，第 10 次必得稀有配件。</small>
            </div>
            <button
              className="pp-primary pp-draw"
              disabled={busy || (!!username && profile.tickets < 1)}
              onClick={async () => {
                const result = await act('draw', {}, '补给已到达。');
                if (result !== undefined) {
                  setReward(result.reward);
                  setRewardSerial((value) => value + 1);
                }
              }}
            >
              {busy ? '正在接收信号…' : `接收补给 · 1 张券`}
            </button>
            <span className="pp-ticket-count">当前持有 {profile.tickets} 张补给券</span>
          </div>
          <aside className="pp-supply-side">
            <div className="pp-reward-area" aria-live="polite">
              {reward ? (
                <div
                  key={rewardSerial}
                  className={`pp-reward ${reward.rarity === 'rare' ? 'is-rare' : ''}`}
                >
                  <SkillIcon kind={icon(itemById[reward.itemId].icon)} size={70} />
                  <small>
                    {reward.pityTriggered
                      ? '保底支援已抵达'
                      : reward.rarity === 'rare'
                        ? '稀有信号'
                        : '支援已抵达'}
                  </small>
                  <h2>{itemById[reward.itemId].name}</h2>
                  <p>
                    {reward.duplicate
                      ? `重复配件已转换为 ${reward.coins} 金币`
                      : '已加入仓库，可在机体配件中装配。'}
                  </p>
                </div>
              ) : (
                <div className="pp-reward-empty">
                  <h2>等待补给信号</h2>
                  <p>接收后在此查看奖励。</p>
                </div>
              )}
            </div>
            <h2>补给清单与基础概率</h2>
            <div className="pp-pool">
              {Equipment.ITEMS.map((item) => (
                <div key={item.id}>
                  <SkillIcon kind={icon(item.icon)} size={36} />
                  <span>{item.name}</span>
                  <small>{item.price >= 180 ? '稀有 · 约 8.33%' : '标准 · 25%'}</small>
                </div>
              ))}
            </div>
            <div className="pp-draw-history">
              <h3>最近接收</h3>
              {profile.drawHistory.slice(0, 5).map((row, index) => {
                return (
                  <p key={index}>
                    {itemById[row.itemId].name}
                    {row.duplicate ? ' · 重复转金币' : ''}
                  </p>
                );
              })}
              {!profile.drawHistory.length && <p>暂无补给记录</p>}
            </div>
          </aside>
        </div>
      )}
      {view === 'records' && (
        <>
          <div className="pp-record-summary">
            <div>
              <b>{profile.records.wins}</b>
              <span>任务胜利</span>
            </div>
            <div>
              <b>{profile.records.losses}</b>
              <span>任务失利</span>
            </div>
            <div>
              <b>
                {profile.records.wins + profile.records.losses
                  ? `${Math.round((profile.records.wins / (profile.records.wins + profile.records.losses)) * 100)}%`
                  : '—'}
              </b>
              <span>完成率</span>
            </div>
          </div>
          <div className="pp-record-table">
            <table>
              <thead>
                <tr>
                  <th>任务</th>
                  <th>驾驶员</th>
                  <th>结果</th>
                  <th>熟练度</th>
                  <th>造成伤害</th>
                  <th>治疗</th>
                  <th>救援</th>
                </tr>
              </thead>
              <tbody>
                {profile.records.history.slice(0, 50).map((row) => {
                  const stats = row.stats;
                  return (
                    <tr key={`${row.round}:${row.character}`}>
                      <td>
                        {row.mission + 1}-{row.stage + 1}
                      </td>
                      <td>{names[row.character]}</td>
                      <td className={row.won ? 'pp-win' : 'pp-loss'}>
                        {row.won ? '任务完成' : '任务失利'}
                      </td>
                      <td>+{row.xp}</td>
                      <td>{Math.round(stats.damage)}</td>
                      <td>{Math.round(stats.healing)}</td>
                      <td>{stats.rescues}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!profile.records.history.length && (
              <div className="pp-empty">
                <SkillIcon kind="ultimate" size={68} />
                <h2>第一份作战记录，等待写入</h2>
                <p>
                  {username
                    ? '完成联网任务后，在这里回顾伤害、救援与成长。'
                    : '登录个人档案后保存联网作战记录。'}
                </p>
                {!username && (
                  <button className="pp-primary" onClick={onLogin}>
                    登录档案
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
