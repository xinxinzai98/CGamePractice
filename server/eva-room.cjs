'use strict';

const { RequestError } = require('./errors.cjs');

/** Converts authenticated account state into the sole simulation/settlement snapshot. */
function createEvaRooms(D, profiles) {
  function mission(id) {
    const result = D.Eva.MISSIONS.find((entry) => entry.id === id);
    if (!result) throw new RequestError('任务不存在，请刷新内容版本');
    return result;
  }

  function mapFor(id) {
    const definition = mission(id);
    const number = definition.campaignIndex;
    const map = D.campaign(Math.floor(number / 3), number % 3);
    map.name = definition.name;
    return map;
  }

  function build(room, slot, index) {
    const user = profiles.byName(slot.username);
    if (!user?.profile.eva) throw new RequestError('档案需要完成 EVA 迁移');
    const account = user.profile.eva;
    let source = account;
    let preset;
    if (room.mode === 'recovery') {
      source = D.Eva.createProfile();
      preset = D.Eva.defaultPreset();
      preset.ammo = {};
      preset.consumables = {};
    } else if (room.mode === 'magi') {
      source = D.Eva.simulationProfile();
      preset =
        slot.trialPreset ||
        account.presets.find((p) => p.id === (slot.presetId || account.activePresetId));
    } else {
      preset = account.presets.find((p) => p.id === (slot.presetId || account.activePresetId));
    }
    if (!preset) throw new RequestError('请选择一份已保存的出战预设');
    const definition = mission(room.missionId);
    const resolved = D.Eva.resolveLoadout(source, preset, {
      entityId: `p${index}`,
      accountId: user.username.toLowerCase(),
      levelCap: room.mode === 'recovery' ? 1 : definition.levelCap,
      simulation: room.mode === 'magi',
    });
    if (room.mode === 'operation' && resolved.hpFraction <= 0)
      throw new RequestError('该机体已击毁，请先维修或参加后勤整备试验');
    if (room.mode !== 'operation') resolved.hpFraction = 1;
    slot.presetId = preset.id;
    slot.resolved = resolved;
    slot.character = resolved.legacyCharacter;
    return resolved;
  }

  function records(room) {
    const game = room.game;
    const definition = mission(room.missionId);
    const won = game.status === 'won';
    const completed = won
      ? definition.stages
      : Math.min(definition.stages, game.completedStages || 0);
    return room.participants.map((participant) => {
      const player = game.players.find((p) => p.id === participant.entityId);
      if (!player) throw Error('Frozen participant is absent from the simulation');
      return {
        round: room.round,
        at: room.startedAt,
        mode: room.mode,
        missionId: room.missionId,
        ruleVersion: D.Eva.RULE_VERSION,
        seed: room.seed,
        condition: definition.condition,
        difficulty: room.difficulty,
        won,
        elapsed: game.time,
        participants: room.participants,
        entityId: participant.entityId,
        events: game.battleEvents || [],
        hpFraction: Math.max(0, Math.min(1, player.hp / player.maxHp)),
        used: { ...player.used },
        license:
          room.licenseStates.find((p) => p.entityId === participant.entityId)?.license === true,
        completedStages: completed,
      };
    });
  }

  return { mission, mapFor, build, records };
}

module.exports = { createEvaRooms };
