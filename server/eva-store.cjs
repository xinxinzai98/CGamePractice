'use strict';
const crypto = require('node:crypto');
const { RequestError } = require('./errors.cjs');

// Local test denominations; these are quota units, never prices or payment confirmation.
const QUOTA_TIERS = Object.freeze({ quota60: 60, quota300: 300, quota980: 980 });
const canonical = (value) =>
  JSON.stringify(value, function (_key, item) {
    if (item && typeof item === 'object' && !Array.isArray(item))
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map((key) => [key, item[key]]),
      );
    return item;
  });
function textId(value, label, max = 128) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f]/.test(value))
    throw new RequestError(`${label}无效`);
  return value.trim();
}
function quantities(value, label = '物资数量') {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new RequestError(`${label}无效`);
  const normalized = {};
  for (const [id, quantity] of Object.entries(value)) {
    textId(id, '物资编号');
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 10000)
      throw new RequestError(`${label}无效`);
    if (quantity) normalized[id] = quantity;
  }
  return normalized;
}
const voucherHash = (code) =>
  crypto
    .createHash('sha256')
    .update(textId(code, '兑换券', 256))
    .digest('hex');

function createEvaStore({ db, transaction, byName, commitMutation, operation, rules }) {
  const E = () => rules().Eva;
  const refresh = (user) => {
    const fresh = byName(user.username);
    Object.assign(user, { profile: fresh.profile, revision: fresh.revision });
  };
  const domain = (fn) => {
    try {
      return fn();
    } catch (error) {
      if (
        error.name === 'ValidationError' ||
        error.name === 'EvaValidationError' ||
        error.name === 'ProtocolError'
      )
        throw new RequestError(error.message);
      throw error;
    }
  };
  function redeem(profile, user, hash) {
    const row = db
      .prepare(
        'SELECT v.*,o.amount,o.state AS order_state FROM quota_vouchers v JOIN quota_orders o ON o.order_id=v.order_id WHERE token_hash=?',
      )
      .get(hash);
    if (!row || row.state === 'revoked') throw new RequestError('兑换券无效或已撤销');
    const key = user.username.toLowerCase();
    if (row.state === 'redeemed') {
      if (row.redeemed_by !== key) throw new RequestError('兑换券已使用');
      return { orderId: row.order_id, amount: row.amount, alreadyRedeemed: true };
    }
    if (row.order_state !== 'issued') throw new RequestError('订单不允许核销');
    profile.wallet.gold += row.amount;
    db.prepare(
      "UPDATE quota_vouchers SET state='redeemed',redeemed_by=?,redeemed_at=? WHERE token_hash=? AND state='active'",
    ).run(key, Date.now(), hash);
    db.prepare("UPDATE quota_orders SET state='redeemed',redeemed_by=? WHERE order_id=?").run(
      key,
      row.order_id,
    );
    audit(row.order_id, 'redeem', key, { suffix: row.suffix, amount: row.amount });
    return { orderId: row.order_id, amount: row.amount, alreadyRedeemed: false };
  }
  function evaAction(user, action, body, operationId) {
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new RequestError('操作内容无效');
    let request, execute;
    switch (action) {
      case 'research':
        request = { ownerId: body.ownerId, nodeId: body.nodeId };
        execute = (p) => E().research(p, request.ownerId, request.nodeId);
        break;
      case 'upgrade':
        request = { machineId: body.machineId };
        execute = (p) => E().upgrade(p, request.machineId);
        break;
      case 'preset':
        request = { preset: body.preset };
        execute = (p) => E().savePreset(p, request.preset);
        break;
      case 'purchase':
        request = { offerId: body.offerId, quantity: body.quantity ?? 1 };
        execute = (p) => E().purchase(p, request.offerId, request.quantity, Date.now());
        break;
      case 'draw':
        request = {};
        execute = (p) => E().draw(p, () => crypto.randomInt(0x100000000) / 0x100000000);
        break;
      case 'exchange':
        request = { category: body.category, itemId: body.itemId, quantity: body.quantity ?? 1 };
        execute = (p) => E().exchange(p, request.category, request.itemId, request.quantity);
        break;
      case 'repair':
        request = { machineId: body.machineId };
        execute = (p) => {
          if (
            db
              .prepare("SELECT 1 FROM eva_reservations WHERE user_key=? AND state='reserved'")
              .get(user.username.toLowerCase())
          )
            throw new RequestError('本局结算后才能进行维修');
          return E().repair(p, request.machineId);
        };
        break;
      case 'settings':
        request = { autoRepair: body.autoRepair, autoSupply: body.autoSupply };
        execute = (p) => {
          if (typeof request.autoRepair !== 'boolean' || typeof request.autoSupply !== 'boolean')
            throw new RequestError('自动整备设置无效');
          Object.assign(p, request);
          return request;
        };
        break;
      case 'redeem':
        request = { voucherHash: voucherHash(body.code) };
        execute = (p) => redeem(p, user, request.voucherHash);
        break;
      default:
        throw new RequestError('未知 EVA 操作');
    }
    return operation(user, operationId, `eva:${action}`, JSON.parse(canonical(request)), (p) =>
      domain(() => execute(p.eva)),
    );
  }
  const rowFor = (round) =>
    db.prepare('SELECT * FROM eva_rounds WHERE round_id=?').get(textId(round, '局次'));
  function beginRequest(context) {
    const mission = E().MISSIONS.find((entry) => entry.id === context.missionId);
    if (!mission) throw new RequestError('任务不存在');
    const difficulty = context.difficulty ?? 'normal';
    if (!['relaxed', 'normal', 'hard'].includes(difficulty)) throw new RequestError('任务难度无效');
    if (!['operation', 'magi', 'tutorial', 'recovery'].includes(context.mode))
      throw new RequestError('战斗模式无效');
    if (
      (context.mode === 'recovery' && mission.id !== 'mission.recovery') ||
      (context.mode === 'operation' && mission.id === 'mission.recovery')
    )
      throw new RequestError('后勤整备试验必须使用独立恢复模式');
    if (!Number.isSafeInteger(context.seed) || context.seed < 0 || context.seed > 0xffffffff)
      throw new RequestError('战斗种子无效');
    if ((context.condition ?? null) !== mission.condition)
      throw new RequestError('任务条件与公示不一致');
    if (
      !Array.isArray(context.participants) ||
      context.participants.length < 1 ||
      context.participants.length > 2
    )
      throw new RequestError('参战实体无效');
    const accounts = new Set(),
      entities = new Set();
    const participants = context.participants.map((participant) => {
      if (![1, 2, 3].includes(participant.level)) throw new RequestError('有效机体等级无效');
      const accountId = textId(participant.accountId, '账号').toLowerCase(),
        entityId = textId(participant.entityId, '参战实体');
      if (accounts.has(accountId) || entities.has(entityId))
        throw new RequestError('同一账号或实体不能重复参战');
      accounts.add(accountId);
      entities.add(entityId);
      return { ...structuredClone(participant), accountId, entityId };
    });
    return {
      round: textId(context.round, '局次'),
      mode: context.mode,
      missionId: mission.id,
      difficulty,
      seed: context.seed,
      condition: context.condition ?? null,
      participants,
    };
  }
  function beginResult(row, replayed) {
    const context = JSON.parse(row.context_json);
    return {
      round: row.round_id,
      replayed,
      participants: context.participants.map((p) => ({
        accountId: p.accountId,
        entityId: p.entityId,
        resolved: p,
        license: context.licenses[p.accountId],
        reserved: JSON.parse(
          db
            .prepare('SELECT reserved_json FROM eva_reservations WHERE round_id=? AND user_key=?')
            .get(row.round_id, p.accountId).reserved_json,
        ),
      })),
    };
  }
  function evaBeginRound(input) {
    const request = beginRequest(input),
      encoded = canonical(request);
    return transaction(() => {
      const previous = rowFor(request.round);
      if (previous) {
        const priorRequest = JSON.parse(previous.context_json).request;
        if (
          canonical({ ...priorRequest, difficulty: priorRequest.difficulty ?? 'normal' }) !==
          encoded
        )
          throw new RequestError('局次编号已用于另一场战斗');
        return beginResult(previous, true);
      }
      const at = Date.now(),
        licenses = {},
        participants = [],
        users = [];
      const mission = E().MISSIONS.find((item) => item.id === request.missionId);
      for (const inputParticipant of request.participants) {
        const fresh = byName(inputParticipant.accountId);
        if (!fresh) throw new RequestError('参战账号不存在');
        if (
          db
            .prepare("SELECT 1 FROM eva_reservations WHERE user_key=? AND state='reserved'")
            .get(inputParticipant.accountId)
        )
          throw new RequestError('账号存在待结算局次');
        const simulated = request.mode !== 'operation';
        const preset = request.mode === 'recovery' ? E().defaultPreset() : inputParticipant.preset;
        const resolved = domain(() =>
          E().resolveLoadout(
            request.mode === 'recovery'
              ? E().createProfile()
              : simulated
                ? E().simulationProfile()
                : fresh.profile.eva,
            preset,
            {
              entityId: inputParticipant.entityId,
              accountId: inputParticipant.accountId,
              levelCap:
                request.mode === 'recovery'
                  ? 1
                  : Math.min(inputParticipant.level, mission.levelCap),
              simulation: simulated && request.mode !== 'recovery',
            },
          ),
        );
        if (simulated) resolved.hpFraction = 1;
        participants.push(resolved);
        users.push(fresh);
        licenses[resolved.accountId] = fresh.profile.eva.licenseExpiresAt > at;
      }
      const context = {
        ...request,
        request,
        participants,
        at,
        licenses,
        ruleVersion: E().RULE_VERSION,
      };
      db.prepare("INSERT INTO eva_rounds VALUES (?,?,?,NULL,NULL,'active',?,?)").run(
        request.round,
        canonical(context),
        '[]',
        at,
        at,
      );
      for (let index = 0; index < participants.length; index++) {
        const participant = participants[index],
          fresh = users[index];
        const reserved =
          request.mode === 'operation'
            ? quantities({ ...participant.preset.ammo, ...participant.preset.consumables })
            : {};
        commitMutation(
          fresh,
          (p) => {
            for (const [itemId, count] of Object.entries(reserved)) {
              if ((p.eva.stock[itemId] || 0) < count) throw new RequestError(`库存不足：${itemId}`);
              p.eva.stock[itemId] -= count;
            }
            return { round: request.round, reserved, license: licenses[participant.accountId] };
          },
          `eva-reserve:${request.round}`,
          'eva:reserve',
          { round: request.round },
        );
        db.prepare(
          "INSERT INTO eva_reservations (round_id,user_key,entity_id,reserved_json,state) VALUES (?,?,?,?,'reserved')",
        ).run(request.round, participant.accountId, participant.entityId, canonical(reserved));
      }
      return beginResult(rowFor(request.round), false);
    });
  }
  function normalizeRecords(row, records) {
    const context = JSON.parse(row.context_json),
      previous = JSON.parse(row.checkpoint_json);
    if (!Array.isArray(records) || records.length !== context.participants.length)
      throw new RequestError('局次记录缺少参战账号');
    return context.participants.map((participant) => {
      const record = records.find((r) => r.entityId === participant.entityId);
      if (
        !record ||
        record.round !== row.round_id ||
        record.mode !== context.mode ||
        record.missionId !== context.missionId
      )
        throw new RequestError('局次记录与开局快照不一致');
      if (
        record.difficulty !== undefined &&
        (!['relaxed', 'normal', 'hard'].includes(record.difficulty) ||
          record.difficulty !== (context.difficulty ?? 'normal'))
      )
        throw new RequestError('局次难度与开局快照不一致');
      if (
        !Number.isFinite(record.elapsed) ||
        record.elapsed < 0 ||
        record.elapsed > 86400 ||
        !Number.isFinite(record.hpFraction) ||
        record.hpFraction < 0 ||
        record.hpFraction > 1 ||
        !Number.isSafeInteger(record.completedStages) ||
        record.completedStages < 0 ||
        record.completedStages > 12 ||
        typeof record.won !== 'boolean'
      )
        throw new RequestError('局次进展无效');
      const used = quantities(record.used),
        reservation = db
          .prepare('SELECT reserved_json FROM eva_reservations WHERE round_id=? AND user_key=?')
          .get(row.round_id, participant.accountId);
      const reserved = JSON.parse(reservation.reserved_json);
      if (context.mode === 'operation')
        for (const [id, count] of Object.entries(used)) {
          if (count > (reserved[id] || 0)) throw new RequestError('已消费物资超过预留数量');
        }
      const prior = previous.find((r) => r.entityId === participant.entityId);
      if (
        prior &&
        (record.elapsed < prior.elapsed ||
          record.completedStages < prior.completedStages ||
          Object.entries(prior.used).some(([id, count]) => (used[id] || 0) < count))
      )
        throw new RequestError('局次检查点不能回退');
      if (!Array.isArray(record.events) || record.events.length > 100000)
        throw new RequestError('作战事件无效');
      const ids = new Set();
      let lastSeq = -1;
      for (const event of record.events) {
        if (
          !event ||
          typeof event.id !== 'string' ||
          ids.has(event.id) ||
          !Number.isSafeInteger(event.seq) ||
          event.seq <= lastSeq ||
          !Number.isFinite(event.time) ||
          event.time < 0 ||
          event.time > record.elapsed + 0.001 ||
          typeof event.kind !== 'string' ||
          typeof event.actorId !== 'string' ||
          (event.amount !== undefined && (!Number.isFinite(event.amount) || event.amount < 0))
        )
          throw new RequestError('作战事件序列无效');
        ids.add(event.id);
        lastSeq = event.seq;
      }
      if (
        prior &&
        (record.events.length < prior.events.length ||
          prior.events.some((event, i) => canonical(event) !== canonical(record.events[i])))
      )
        throw new RequestError('已确认作战事件不能改写');
      return {
        round: row.round_id,
        at: context.at,
        mode: context.mode,
        missionId: context.missionId,
        difficulty: context.difficulty ?? 'normal',
        ruleVersion: context.ruleVersion,
        seed: context.seed,
        condition: context.condition,
        won: record.won,
        elapsed: record.elapsed,
        participants: context.participants,
        entityId: participant.entityId,
        events: structuredClone(record.events),
        hpFraction: record.hpFraction,
        used,
        license: context.licenses[participant.accountId],
        completedStages: record.completedStages,
      };
    });
  }
  function evaCheckpoint(round, records) {
    return transaction(() => {
      const row = rowFor(round);
      if (!row) throw new RequestError('局次不存在');
      if (row.state !== 'active') return { round, state: row.state };
      const normalized = normalizeRecords(row, records);
      db.prepare('UPDATE eva_rounds SET checkpoint_json=?,updated_at=? WHERE round_id=?').run(
        canonical(normalized),
        Date.now(),
        round,
      );
      for (const record of normalized)
        db.prepare('UPDATE eva_reservations SET used_json=? WHERE round_id=? AND entity_id=?').run(
          canonical(record.used),
          round,
          record.entityId,
        );
      return { round, state: 'active' };
    });
  }
  function settleEvaRound(round) {
    return transaction(() => {
      const row = rowFor(round);
      if (!row) throw new RequestError('局次不存在');
      if (row.state === 'settled' || row.state === 'aborted') return JSON.parse(row.result_json);
      if (row.state !== 'pending') throw new RequestError('局次尚未登记终局');
      const terminal = JSON.parse(row.terminal_json),
        context = JSON.parse(row.context_json),
        participants = [];
      for (const record of terminal.records) {
        const participant = context.participants.find((p) => p.entityId === record.entityId),
          fresh = byName(participant.accountId);
        if (!fresh) throw Error('EVA settlement account does not exist');
        const reservation = db
          .prepare('SELECT * FROM eva_reservations WHERE round_id=? AND user_key=?')
          .get(round, participant.accountId);
        const reserved = JSON.parse(reservation.reserved_json),
          returned = {};
        const silverBefore = fresh.profile.eva.wallet.silver;
        const result = commitMutation(
          fresh,
          (p) => {
            for (const [id, count] of Object.entries(reserved)) {
              returned[id] = count - (record.used[id] || 0);
              p.eva.stock[id] = (p.eva.stock[id] || 0) + returned[id];
            }
            const reward = E().awardBattle(p.eva, record);
            const campaign = /^mission\.campaign\.(\d+)$/.exec(record.missionId);
            if (record.mode === 'operation' && record.won && campaign) {
              const number = Number(campaign[1]);
              if (number >= 1 && number <= 12 && number <= p.unlocked)
                p.unlocked = Math.max(p.unlocked, Math.min(12, number + 1));
            }
            return reward;
          },
          `eva-round:${round}`,
          'eva:battle',
          { round },
        ).result;
        if (record.mode === 'operation') {
          if (fresh.profile.eva.autoRepair) {
            const machine = fresh.profile.eva.machines[participant.machineId];
            const due = machine.repairDue || 0;
            if (due > 0 && fresh.profile.eva.wallet.silver >= due) {
              const before = fresh.profile.eva.wallet.silver;
              commitMutation(
                fresh,
                (p) => E().repair(p.eva, participant.machineId),
                `eva-repair:${round}`,
                'eva:auto-repair',
                { round, machineId: participant.machineId },
              );
              result.repairCost += before - fresh.profile.eva.wallet.silver;
            } else if (due > 0)
              result.maintenanceShortfall += due - fresh.profile.eva.wallet.silver;
          }
          if (fresh.profile.eva.autoSupply)
            for (const [itemId, target] of Object.entries(reserved)) {
              const missing = Math.max(0, target - (fresh.profile.eva.stock[itemId] || 0));
              if (!missing) continue;
              const offer = E().OFFERS.find(
                (entry) => entry.itemId === itemId && entry.currency === 'silver',
              );
              if (!offer) throw Error(`No replenishment offer for ${itemId}`);
              const packs = Math.ceil(missing / offer.quantity),
                price = packs * offer.price;
              if (fresh.profile.eva.wallet.silver >= price) {
                const before = fresh.profile.eva.wallet.silver;
                commitMutation(
                  fresh,
                  (p) => E().purchase(p.eva, offer.id, packs, Date.now()),
                  `eva-supply:${round}:${itemId}`,
                  'eva:auto-supply',
                  { round, itemId, packs },
                );
                result.supplyCost += before - fresh.profile.eva.wallet.silver;
              } else result.maintenanceShortfall += price - fresh.profile.eva.wallet.silver;
            }
        }
        result.silverNet = fresh.profile.eva.wallet.silver - silverBefore;
        record.reward = structuredClone(result);
        const storedBattle = fresh.profile.eva.battles.find((item) => item.round === round);
        if (storedBattle) storedBattle.reward = structuredClone(result);
        db.prepare('UPDATE profiles SET json=? WHERE user_key=?').run(
          JSON.stringify(fresh.profile),
          participant.accountId,
        );
        db.prepare('UPDATE operations SET result_json=? WHERE user_key=? AND operation_id=?').run(
          JSON.stringify(result),
          participant.accountId,
          `eva-round:${round}`,
        );
        db.prepare(
          "UPDATE eva_reservations SET used_json=?,returned_json=?,state='settled' WHERE round_id=? AND user_key=?",
        ).run(canonical(record.used), canonical(returned), round, participant.accountId);
        participants.push({
          accountId: participant.accountId,
          entityId: participant.entityId,
          result,
          record,
        });
      }
      const result = { round, state: terminal.aborted ? 'aborted' : 'settled', participants };
      db.prepare('UPDATE eva_rounds SET result_json=?,state=?,updated_at=? WHERE round_id=?').run(
        canonical(result),
        result.state,
        Date.now(),
        round,
      );
      return result;
    });
  }
  function evaFinishRound(round, records) {
    transaction(() => {
      const row = rowFor(round);
      if (!row) throw new RequestError('局次不存在');
      const normalized = normalizeRecords(row, records);
      if (row.terminal_json) {
        if (canonical(JSON.parse(row.terminal_json).records) !== canonical(normalized))
          throw new RequestError('终局与已登记结果冲突');
        return;
      }
      db.prepare(
        "UPDATE eva_rounds SET terminal_json=?,state='pending',updated_at=? WHERE round_id=?",
      ).run(canonical({ records: normalized, aborted: false }), Date.now(), round);
    });
    return settleEvaRound(round);
  }
  function evaAbortRound(round) {
    transaction(() => {
      const row = rowFor(round);
      if (!row) throw new RequestError('局次不存在');
      if (row.state !== 'active') return;
      const context = JSON.parse(row.context_json),
        checkpoints = JSON.parse(row.checkpoint_json);
      const records = context.participants.map((p) => {
        const checkpoint = checkpoints.find((r) => r.entityId === p.entityId);
        return checkpoint
          ? { ...checkpoint, won: false }
          : {
              round,
              at: context.at,
              mode: context.mode,
              missionId: context.missionId,
              difficulty: context.difficulty ?? 'normal',
              ruleVersion: context.ruleVersion,
              seed: context.seed,
              condition: context.condition,
              won: false,
              elapsed: 0,
              participants: context.participants,
              entityId: p.entityId,
              events: [],
              hpFraction: p.hpFraction,
              used: {},
              license: context.licenses[p.accountId],
              completedStages: 0,
            };
      });
      db.prepare(
        "UPDATE eva_rounds SET terminal_json=?,state='pending',updated_at=? WHERE round_id=?",
      ).run(canonical({ records, aborted: true }), Date.now(), round);
    });
    return settleEvaRound(round);
  }
  function evaRecover() {
    const rows = db
      .prepare(
        "SELECT round_id,state FROM eva_rounds WHERE state IN ('active','pending') ORDER BY started_at,round_id",
      )
      .all();
    for (const row of rows) {
      if (row.state === 'pending') settleEvaRound(row.round_id);
      else evaAbortRound(row.round_id);
    }
    return { recovered: rows.length };
  }
  function evaReview(user, round) {
    const row = rowFor(round);
    if (!row?.result_json) throw new RequestError('复盘尚未生成');
    const participant = JSON.parse(row.result_json).participants.find(
      (p) => p.accountId === user.username.toLowerCase(),
    );
    if (!participant) throw new RequestError('只能读取自己的作战复盘');
    const record = { ...participant.record, difficulty: participant.record.difficulty ?? 'normal' };
    return {
      record,
      result: participant.result,
      review: { ...E().reviewBattle(record), difficulty: record.difficulty },
    };
  }
  function audit(orderId, action, operator, detail) {
    db.prepare(
      'INSERT INTO quota_audit (order_id,action,operator,detail_json,at) VALUES (?,?,?,?,?)',
    ).run(orderId, action, operator, JSON.stringify(detail), Date.now());
  }
  function quotaRecordPayment(input) {
    const orderId = textId(input.orderId, '订单号'),
      tier = textId(input.tier, '档位'),
      receipt = textId(input.receiptReference, '收款凭据编号', 160),
      operator = textId(input.operator, '核对人', 80);
    const amount = QUOTA_TIERS[tier];
    if (!amount) throw new RequestError('配额档位不存在');
    return transaction(() => {
      const previous = db.prepare('SELECT * FROM quota_orders WHERE order_id=?').get(orderId);
      if (previous) {
        if (previous.tier !== tier || previous.receipt_reference !== receipt)
          throw new RequestError('订单号已关联不同收款记录');
        return { orderId, tier, amount, state: previous.state, replayed: true };
      }
      if (db.prepare('SELECT 1 FROM quota_orders WHERE receipt_reference=?').get(receipt))
        throw new RequestError('收款凭据已关联其他订单');
      db.prepare("INSERT INTO quota_orders VALUES (?,?,?,?,?,?,'confirmed',NULL)").run(
        orderId,
        tier,
        amount,
        receipt,
        operator,
        Date.now(),
      );
      audit(orderId, 'payment-confirmed', operator, { tier, amount, receiptReference: receipt });
      return { orderId, tier, amount, state: 'confirmed', replayed: false };
    });
  }
  function issue(orderId, operator, reissue) {
    orderId = textId(orderId, '订单号');
    operator = textId(operator, '发行人', 80);
    return transaction(() => {
      const order = db.prepare('SELECT * FROM quota_orders WHERE order_id=?').get(orderId);
      if (!order) throw new RequestError('须先人工核对并登记收款');
      if (order.state === 'redeemed') throw new RequestError('订单已核销，不能补发');
      if (!reissue && order.state !== 'confirmed')
        throw new RequestError('订单已发行或撤销；如券码遗失请明确补发');
      db.prepare(
        "UPDATE quota_vouchers SET state='revoked' WHERE order_id=? AND state='active'",
      ).run(orderId);
      const code = `EV3-${crypto.randomBytes(24).toString('base64url')}`,
        hash = voucherHash(code),
        suffix = code.slice(-6);
      db.prepare("INSERT INTO quota_vouchers VALUES (?,?,?,'active',?,?,NULL,NULL)").run(
        hash,
        suffix,
        orderId,
        Date.now(),
        operator,
      );
      db.prepare("UPDATE quota_orders SET state='issued' WHERE order_id=?").run(orderId);
      audit(orderId, reissue ? 'reissue' : 'issue', operator, { suffix });
      return { orderId, amount: order.amount, code, suffix, state: 'issued' };
    });
  }
  function quotaRevoke(orderId, operator) {
    orderId = textId(orderId, '订单号');
    operator = textId(operator, '撤销人', 80);
    return transaction(() => {
      const order = db.prepare('SELECT * FROM quota_orders WHERE order_id=?').get(orderId);
      if (!order) throw new RequestError('订单不存在');
      if (order.state === 'redeemed') throw new RequestError('已核销订单不能撤销兑换券');
      if (order.state !== 'revoked') {
        db.prepare(
          "UPDATE quota_vouchers SET state='revoked' WHERE order_id=? AND state='active'",
        ).run(orderId);
        db.prepare("UPDATE quota_orders SET state='revoked' WHERE order_id=?").run(orderId);
        audit(orderId, 'revoke', operator, {});
      }
      return { orderId, state: 'revoked' };
    });
  }
  return {
    evaAction,
    evaBeginRound,
    evaCheckpoint,
    evaFinishRound,
    evaAbortRound,
    evaRecover,
    evaReview,
    evaRoundStatus: (round) => rowFor(round)?.state || null,
    evaOperations: (user) =>
      db
        .prepare(
          "SELECT operation_id,kind,request_json,result_json,delta_json,balance_json,revision,at FROM operations WHERE user_key=? AND kind LIKE 'eva:%' ORDER BY revision DESC LIMIT 200",
        )
        .all(user.username.toLowerCase())
        .map((row) => ({
          ...row,
          request: JSON.parse(row.request_json),
          result: JSON.parse(row.result_json),
          delta: JSON.parse(row.delta_json),
          balance: JSON.parse(row.balance_json),
        })),
    quotaRecordPayment,
    quotaIssue: (id, operator) => issue(id, operator, false),
    quotaReissue: (id, operator) => issue(id, operator, true),
    quotaRevoke,
    quotaOrders: () =>
      db
        .prepare(
          'SELECT o.*,v.suffix,v.state AS voucher_state FROM quota_orders o LEFT JOIN quota_vouchers v ON v.order_id=o.order_id ORDER BY o.paid_at DESC,v.issued_at DESC',
        )
        .all(),
    quotaAudit: (orderId) =>
      db
        .prepare(
          'SELECT action,operator,detail_json,at FROM quota_audit WHERE order_id=? ORDER BY id',
        )
        .all(textId(orderId, '订单号')),
  };
}
module.exports = { createEvaStore, QUOTA_TIERS };
