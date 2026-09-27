import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseIntent, createDinner, createEncounters } from './ai';
import { PEOPLE } from './people';
import { OFFICIAL_RELATIONSHIPS, relationshipsFrom } from './relationships';
import { applyPhase, createWorld, dayHighlights, isWorld, sanitizeWorld, socialFor, worldAtDay, type DinnerScene, type EncounterScene, type Intent, type World } from './world';

const basicIntent: Intent = {
  placeId: 'garden', activity: '整理花圃', goal: '清出一小块空地',
  summary: '在花圃边收拾了一下。', steps: ['移开散落的花盆', '记下空地的大小'], observation: '花圃旁空出一块地。',
  interpretation: '明天可以再种些花。', quote: '先到这里。', next: '明天继续种花。',
  effort: 'light', targetId: null, object: null, project: null,
};

function readyWorld(): World {
  const world = createWorld();
  for (const person of PEOPLE) world.pending[person.id] = { ...basicIntent };
  return world;
}

test('新庭院从各自熟悉的地点开始', () => {
  const world = createWorld();
  assert.equal(world.residents.kalpas.placeId, 'kitchen');
  assert.equal(world.residents.mobius.placeId, 'lab');
  assert.equal(world.residents.griseo.placeId, 'studio');
  assert.equal(world.residents.eden.placeId, 'lounge');
});

test('损坏的地点、人物和单条场景可修复而不丢整座庭院', () => {
  const world = createWorld();
  world.residents.kevin.placeId = 'missing' as World['residents']['kevin']['placeId'];
  world.items.push({ id: 'bad', name: '坏物品', detail: '记录', placeId: 'missing' as World['items'][number]['placeId'], updatedBy: null });
  world.items = world.items.filter((item) => item.id !== 'board');
  world.items[0].history = 'broken' as unknown as World['items'][number]['history'];
  world.scenes.push({ ...basicIntent, kind: 'action', id: 'bad-action', day: 1, slot: 0, actorId: 'missing' as 'kevin', objectResult: null, encounterStatus: null });
  world.scenes.push({ ...basicIntent, kind: 'action', id: 'good-action', day: 1, slot: 0, actorId: 'elysia', objectResult: null, encounterStatus: null });
  assert.ok(isWorld(world));
  const clean = sanitizeWorld(world);
  assert.equal(clean.residents.kevin.placeId, 'garden');
  assert.deepEqual(clean.items.map((item) => item.id).includes('bad'), false);
  assert.equal(clean.items.find((item) => item.id === 'board')?.detail, '今天还没有留言。');
  assert.equal(clean.items[0].history, undefined);
  assert.deepEqual(clean.scenes.map((scene) => scene.id), ['good-action']);
  assert.equal(world.scenes.length, 2);
});

test('物品与项目跨时段保留，后续行动能更新同地点物品', () => {
  const first = readyWorld();
  first.pending.mobius = {
    ...basicIntent, placeId: 'lab', activity: '布置绿豆对照组',
    object: { id: null, name: '两杯绿豆', detail: 'A 杯有光，B 杯遮光，均未发芽。' },
    project: { title: '绿豆光照实验', note: '两杯已编号并布置。', next: '明早记录芽长。' },
  };
  const afterFirst = applyPhase(first, []);
  const item = afterFirst.items.find((entry) => entry.name === '两杯绿豆');
  assert.ok(item);
  assert.equal(afterFirst.residents.mobius.project?.title, '绿豆光照实验');
  assert.equal(afterFirst.slot, 1);
  afterFirst.pending = readyWorld().pending;
  afterFirst.pending.mobius = {
    ...basicIntent, placeId: 'lab', activity: '观察绿豆',
    object: { id: item.id, name: item.name, detail: 'A 杯露白，B 杯仍未发芽。' },
    project: { title: '绿豆光照实验', note: '完成第一次观察。', next: '明早再记录一次。' },
  };
  const afterSecond = applyPhase(afterFirst, []);
  assert.equal(afterSecond.items.find((entry) => entry.id === item.id)?.detail, 'A 杯露白，B 杯仍未发芽。');
  assert.deepEqual(afterSecond.items.find((entry) => entry.id === item.id)?.history?.map((entry) => entry.detail), ['A 杯有光，B 杯遮光，均未发芽。', 'A 杯露白，B 杯仍未发芽。']);
  assert.equal(afterSecond.residents.mobius.project?.note, '完成第一次观察。');
  assert.equal(afterSecond.scenes.filter((scene) => scene.kind === 'action' && scene.actorId === 'mobius').length, 2);
});

test('不在当前地点的物品不能被行动改写，邀约不强迫他人出现', () => {
  const world = readyWorld();
  world.pending.elysia = { ...basicIntent, placeId: 'hall', targetId: 'mobius', object: { id: 'piano', name: '旧钢琴', detail: '琴盖打开了。' } };
  world.pending.mobius = { ...basicIntent, placeId: 'lab' };
  const next = applyPhase(world, []);
  assert.equal(next.items.find((item) => item.id === 'piano')?.detail, '琴盖合着。');
  const scene = next.scenes.find((entry) => entry.kind === 'action' && entry.actorId === 'elysia');
  assert.equal(scene?.kind === 'action' && scene.encounterStatus, 'left-note');
  assert.equal(next.residents.mobius.placeId, 'lab');
});

test('同地点但没有对话不算接受邀约', () => {
  const world = readyWorld();
  world.pending.elysia = { ...basicIntent, targetId: 'mobius' };
  const next = applyPhase(world, []);
  const scene = next.scenes.find((entry) => entry.kind === 'action' && entry.actorId === 'elysia');
  assert.equal(scene?.kind === 'action' && scene.encounterStatus, 'left-note');
});

test('旧存档同一时段重复改动共享物品时只应用一次', () => {
  const world = readyWorld();
  world.pending.kevin = { ...basicIntent, object: { id: 'board', name: '庭院公告板', detail: '贴上晚餐登记表。' } };
  world.pending.pardo = { ...basicIntent, object: { id: 'board', name: '庭院公告板', detail: '贴上交换便笺。' } };
  const next = applyPhase(world, []);
  const board = next.items.find((item) => item.id === 'board');
  assert.equal(board?.detail, '贴上晚餐登记表。');
  assert.equal(board?.updatedBy, 'kevin');
  assert.equal(next.scenes.filter((scene) => scene.kind === 'action' && scene.objectResult?.includes('公告板')).length, 1);
});

test('旧存档里的画架也只有格蕾修可以改写，新作品归创建者', () => {
  const world = readyWorld();
  const canvas = world.items.find((item) => item.id === 'canvas')!;
  delete canvas.ownerId;
  world.pending.kalpas = { ...basicIntent, placeId: 'studio', object: { id: 'canvas', name: '画架', detail: '画架转向窗户。' } };
  world.pending.griseo = { ...basicIntent, placeId: 'studio', object: { id: 'canvas', name: '画架', detail: '画布上多了一笔蓝色。' } };
  world.pending.hua = { ...basicIntent, placeId: 'studio', object: { id: null, name: '练习册', detail: '记录了今天的动作。' } };
  const next = applyPhase(world, []);
  assert.equal(next.items.find((item) => item.id === 'canvas')?.detail, '画布上多了一笔蓝色。');
  assert.equal(next.items.find((item) => item.name === '练习册')?.ownerId, 'hua');
  const kalpasScene = next.scenes.find((scene) => scene.kind === 'action' && scene.actorId === 'kalpas');
  assert.equal(kalpasScene?.kind === 'action' ? kalpasScene.objectResult : undefined, null);
});

test('夜晚结束后进入次日清晨，行动和物品痕迹仍在', () => {
  let world = createWorld();
  for (let slot = 0; slot < 4; slot += 1) {
    world.pending = readyWorld().pending;
    if (slot === 3) world.pending.eden = { ...basicIntent, placeId: 'lounge', object: { id: 'piano', name: '旧钢琴', detail: '琴谱留在谱架上。' } };
    const dinner: DinnerScene | undefined = slot === 3 ? {
      kind: 'dinner', id: 'dinner-1', day: 1, slot: 3, placeId: 'kitchen', title: '一起吃晚饭',
      description: '大家在餐桌边坐了一会儿。', attendees: PEOPLE.map((person) => person.id), absentees: [], lines: [],
    } : undefined;
    world = applyPhase(world, [], dinner);
  }
  assert.equal(world.day, 2);
  assert.equal(world.slot, 0);
  assert.equal(world.scenes.length, 53);
  assert.equal(world.scenes.at(-1)?.kind, 'dinner');
  assert.equal(world.items.find((item) => item.id === 'piano')?.detail, '琴谱留在谱架上。');
  assert.deepEqual(world.pending, {});
});

test('每日简报只在晚饭记录形成后，根据真实场景给出事实', () => {
  const world = createWorld();
  assert.deepEqual(dayHighlights(world, 1), []);
  world.scenes.push({
    kind: 'dinner', id: 'dinner-1', day: 1, slot: 3, placeId: 'kitchen', title: '晚饭',
    description: '大家坐在一起。', attendees: ['elysia', 'kevin'],
    absentees: [{ actorId: 'mobius', reason: '留在实验室' }],
    lines: [{ actorId: 'elysia', text: '晚上好。' }, { actorId: 'kevin', text: '晚上好。' }],
  });
  assert.match(dayHighlights(world, 1)[0], /来了 2 人.*梅比乌斯缺席/);
  assert.match(dayHighlights(world, 1)[1], /没有留下对话记录/);
});

test('回看某天时重建居民当晚位置，不改动当前存档', () => {
  const world = createWorld();
  world.scenes.push({ ...basicIntent, kind: 'action', id: 'first', day: 1, slot: 0, actorId: 'kevin', placeId: 'studio', objectResult: null, encounterStatus: null });
  world.scenes.push({ kind: 'dinner', id: 'dinner', day: 1, slot: 3, placeId: 'kitchen', title: '晚饭', description: '吃饭', attendees: ['kevin'], absentees: [], lines: [] });
  world.scenes.push({ ...basicIntent, kind: 'action', id: 'second', day: 2, slot: 0, actorId: 'kevin', placeId: 'lab', objectResult: null, encounterStatus: null });
  world.residents.kevin.placeId = 'lab';
  assert.equal(worldAtDay(world, 1).residents.kevin.placeId, 'kitchen');
  assert.equal(worldAtDay(world, 2).residents.kevin.placeId, 'lab');
  assert.equal(world.residents.kevin.placeId, 'lab');
});

test('两向印象各自保存，旧存档没有印象字段也能继续', () => {
  const world = readyWorld();
  delete world.residents.kevin.bonds;
  world.pending.kevin = { ...basicIntent, bond: { aboutId: 'su', note: '他听得懂没说完的话。' } };
  world.pending.su = { ...basicIntent, bond: { aboutId: 'kevin', note: '他最近愿意慢一点了。' } };
  const next = applyPhase(world, []);
  assert.equal(next.residents.kevin.bonds?.su, '他听得懂没说完的话。');
  assert.equal(next.residents.su.bonds?.kevin, '他最近愿意慢一点了。');
  assert.equal(world.residents.kevin.bonds, undefined);
  const restored = sanitizeWorld(JSON.parse(JSON.stringify(next)) as World);
  assert.equal(restored.residents.kevin.bonds?.su, '他听得懂没说完的话。');
});

test('晚饭保留自主出席决定，缺席者不会在对话中发言', async () => {
  const world = readyWorld();
  world.slot = 3;
  world.pending.mobius = { ...basicIntent, dinner: { attend: false, reason: '今晚想独自整理记录' } };
  const originalFetch = globalThis.fetch;
  let request: { attendees: { id: string }[]; absentees: { name: string }[] } | undefined;
  let speaker = 'pardo';
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
    request = JSON.parse(body.messages[1].content) as typeof request;
    return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({
      title: '餐桌边聊起花圃', description: '大家围着长桌坐下，话题慢慢热起来。',
      lines: [{ actorId: 'elysia', text: '花圃今天空出一块地啦。' }, { actorId: 'kevin', text: '明天可以再看看。' },
        { actorId: speaker, text: '咱也想帮忙！' }, { actorId: 'elysia', text: '那就这么说定了。' }],
    }) }] }] }), { status: 200 });
  };
  try {
    const dinner = await createDinner(world, [], new AbortController().signal);
    assert.equal(request?.attendees.length, 12);
    assert.deepEqual(request?.absentees.map((person) => person.name), ['梅比乌斯']);
    assert.equal(dinner.absentees[0].reason, '今晚想独自整理记录');
    assert.equal(dinner.lines.some((line) => line.actorId === 'mobius'), false);
    const next = applyPhase(world, [], dinner);
    assert.equal(next.day, 2);
    assert.equal(next.scenes.at(-1)?.kind, 'dinner');
    assert.equal(next.residents.elysia.placeId, 'kitchen');
    assert.equal(next.residents.mobius.placeId, 'garden');
    assert.match(next.residents.elysia.memory.at(-1) ?? '', /晚餐：餐桌边聊起花圃/);
    assert.equal(next.residents.mobius.memory.some((entry) => entry.startsWith('晚餐：')), false);
    speaker = 'mobius';
    const rejected = await createDinner(world, [], new AbortController().signal);
    assert.deepEqual(rejected.lines, []);
    assert.match(rejected.description, /对话暂时没有记下来/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('官方关系保留方向与各自的称呼', () => {
  assert.equal(OFFICIAL_RELATIONSHIPS.length, 156);
  for (const person of PEOPLE) {
    const relations = relationshipsFrom(person.id);
    assert.equal(relations.length, 12, person.name);
    assert.equal(new Set(relations.map((relation) => relation.to)).size, 12, person.name);
    assert.ok(relations.every((relation) => relation.from === person.id && relation.to !== person.id && relation.label.trim()), person.name);
  }
  assert.equal(relationshipsFrom('elysia').find((entry) => entry.to === 'mobius')?.label, '喜欢');
  assert.equal(relationshipsFrom('mobius').find((entry) => entry.to === 'elysia')?.label, '你胖了');
  assert.equal(relationshipsFrom('kevin').find((entry) => entry.to === 'su')?.label, '挚友');
  assert.equal(relationshipsFrom('su').find((entry) => entry.to === 'kevin')?.label, '挚友');
  assert.equal(relationshipsFrom('kevin').find((entry) => entry.to === 'pardo')?.label, '没什么办法');
  assert.equal(relationshipsFrom('pardo').find((entry) => entry.to === 'kevin')?.label, '老大！');
  assert.equal(relationshipsFrom('sakura').find((entry) => entry.to === 'pardo')?.label, '猫毛过敏');
  assert.equal(relationshipsFrom('pardo').find((entry) => entry.to === 'sakura')?.label, '兽耳同盟');
  assert.equal(relationshipsFrom('kevin').find((entry) => entry.to === 'kosma')?.label, '在意的后辈');
  assert.equal(relationshipsFrom('kosma').find((entry) => entry.to === 'kevin')?.label, '曾经憧憬');
  assert.equal(relationshipsFrom('kalpas').find((entry) => entry.to === 'kevin')?.label, '保持关注');
  assert.equal(relationshipsFrom('mobius').find((entry) => entry.to === 'kalpas')?.label, '想要研究');
});

test('旧存档也能记录真正发话者的共同经历', () => {
  const world = readyWorld();
  world.pending.elysia = { ...basicIntent, targetId: 'mobius' };
  assert.ok(isWorld(world));
  const encounter: EncounterScene = {
    kind: 'encounter', id: 'encounter-1-0-garden', day: 1, slot: 0, placeId: 'garden',
    actorIds: ['elysia', 'mobius', 'kevin'], title: '讨论桌上的样本',
    lines: [{ actorId: 'elysia', text: '可以让我看一眼吗？' }, { actorId: 'mobius', text: '先别碰，样本还没编号。' }],
    observation: '两人把样本留在桌上继续检查。',
  };
  const next = applyPhase(world, [encounter]);
  const restored = JSON.parse(JSON.stringify(next)) as World;
  assert.equal(socialFor(restored, 'elysia').mobius?.meetings, 1);
  assert.match(socialFor(restored, 'mobius').elysia?.last ?? '', /爱莉希雅说/);
  assert.doesNotMatch(socialFor(restored, 'elysia').mobius?.last ?? '', /两人把样本留在桌上/);
  assert.equal(socialFor(restored, 'kevin').mobius, undefined);
  assert.equal(next.residents.kevin.memory.some((entry) => entry.includes('与人相遇')), false);
  const invitation = next.scenes.find((scene) => scene.kind === 'action' && scene.actorId === 'elysia');
  assert.equal(invitation?.kind === 'action' && invitation.encounterStatus, 'met');
});

test('新偶遇只生成对话，不补写可能冲突的共同观察', async () => {
  const world = readyWorld();
  const originalFetch = globalThis.fetch;
  let requestFormat: Record<string, unknown> | undefined;
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
    requestFormat = (JSON.parse(request.messages[1].content) as { format: Record<string, unknown> }).format;
    return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({
      title: '门厅里聊了两句',
      lines: [{ actorId: 'elysia', text: '你看过灯串了吗？' }, { actorId: 'mobius', text: '我还没有检查过。' }],
    }) }] }] }), { status: 200 });
  };
  try {
    const encounters = await createEncounters(world, new AbortController().signal);
    assert.equal(encounters.length, 1);
    assert.equal(encounters[0].observation, undefined);
    assert.equal(requestFormat?.observation, undefined);
    const next = applyPhase(world, encounters);
    assert.match(next.residents.elysia.memory.at(-1) ?? '', /门厅里聊了两句/);
    assert.doesNotMatch(next.residents.elysia.memory.at(-1) ?? '', /undefined/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('下一时段能看到未碰面邀约及官方关系，且无需真实 API', async () => {
  const world = readyWorld();
  world.pending.elysia = { ...basicIntent, placeId: 'hall', activity: '邀请梅比乌斯看灯串', targetId: 'mobius' };
  world.pending.mobius = { ...basicIntent, placeId: 'lab' };
  const next = applyPhase(world, []);
  next.residents.mobius.memory.push('与爱莉希雅相遇：灯泡仍亮，插头已拔下。');
  next.residents.mobius.bonds = { elysia: '她总能把话题带到意想不到的地方。' };
  next.items.find((item) => item.id === 'board')!.history?.push({ day: next.day, by: null, detail: '访客留言：今晚有人想吃甜的吗？' });
  const originalFetch = globalThis.fetch;
  let input: Record<string, unknown> | undefined;
  let system = '';
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
    system = request.messages[0].content;
    input = JSON.parse(request.messages[1].content) as Record<string, unknown>;
    return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(basicIntent) }] }] }), { status: 200 });
  };
  try {
    await chooseIntent(next, 'mobius', new AbortController().signal);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual((input?.receivedInvitations as { fromId: string }[]).map((entry) => entry.fromId), ['elysia']);
  assert.deepEqual(input?.notesOnBoard, ['今晚有人想吃甜的吗？']);
  assert.deepEqual(input?.currentBonds, { elysia: '她总能把话题带到意想不到的地方。' });
  assert.match(JSON.stringify(input?.rules), /没有变化时填 null/);
  assert.ok((input?.memories as string[]).every((entry) => !entry.includes('灯泡仍亮')));
  const relationships = input?.officialRelationships as { label: string; toId: string; daily?: string }[];
  assert.equal(relationships.length, 12);
  assert.ok(relationships.some((entry) => entry.toId === 'elysia' && entry.label === '你胖了'));
  assert.ok(relationships.every((entry) => entry.daily === undefined));
  assert.match(system, /情境中的说法/);
  assert.match(system, /不必回应/);
  assert.match(JSON.stringify(input).slice(0, 20), /format/);
  assert.match(system, /从 goal、summary 和 steps 就认出梅比乌斯/);
  assert.match(JSON.stringify(input?.format), /刚才做了什么/);
});

test('接口限流后保留原提示重试，不误写成 JSON 错误', async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
    requests.push(body.messages[1].content);
    if (requests.length === 1) return new Response('', { status: 429 });
    return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(basicIntent) }] }] }), { status: 200 });
  };
  try {
    await chooseIntent(createWorld(), 'elysia', new AbortController().signal);
    assert.equal(requests.length, 2);
    assert.equal(requests[1], requests[0]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('非主人不能选择改写画架，已占用的物品也不可重复选择', async () => {
  const world = createWorld();
  world.pending.kevin = { ...basicIntent, object: { id: 'board', name: '庭院公告板', detail: '贴上晚餐登记表。' } };
  const originalFetch = globalThis.fetch;
  const requests: { items: { id: string; owner: string | null; editable: boolean }[] }[] = [];
  let responseIntent: Intent = { ...basicIntent, placeId: 'studio', object: { id: 'canvas', name: '画架', detail: '把画架挪到窗前。' } };
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
    requests.push(JSON.parse(request.messages[1].content.split('\n上次输出不合格式：')[0]) as typeof requests[number]);
    return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(responseIntent) }] }] }), { status: 200 });
  };
  try {
    await assert.rejects(chooseIntent(world, 'kalpas', new AbortController().signal), /私人物品/);
    assert.equal(requests[0].items.find((item) => item.id === 'canvas')?.owner, '格蕾修');
    assert.equal(requests[0].items.find((item) => item.id === 'canvas')?.editable, false);
    assert.equal(requests[0].items.find((item) => item.id === 'board')?.editable, false);
    responseIntent = { ...basicIntent, object: { id: 'board', name: '庭院公告板', detail: '把公告板换到门边。' } };
    await assert.rejects(chooseIntent(world, 'kalpas', new AbortController().signal), /已被占用/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
