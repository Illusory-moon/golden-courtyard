import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App, SceneDetail } from './App';
import { PEOPLE } from './people';
import { applyPhase, createWorld, type DinnerScene, type Intent, type World } from './world';

const intent: Intent = {
  placeId: 'kitchen', activity: '整理长桌', goal: '让大家有地方坐',
  steps: ['擦净桌面', '摆好椅子'], observation: '桌面已经擦净。',
  interpretation: '今晚可以聚餐。', quote: '这样就好。', next: '晚些时候再看看。',
  effort: 'light', targetId: null, object: null, project: null,
};

function renderWorld(world: World): string {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => JSON.stringify(world) },
  });
  try {
    return renderToStaticMarkup(createElement(App));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

test('逐人决定即时出现在事件记录，结算后由正式记录替换', () => {
  const world = createWorld();
  world.pending.kevin = intent;
  const pending = renderWorld(world);
  assert.equal((pending.match(/class="scene-resident"/g) ?? []).length, PEOPLE.length);
  assert.match(pending, /title="爱莉希雅">✿<\/span>/);
  assert.doesNotMatch(pending, /\/portraits\//);
  assert.match(pending, /已决定 · 待结算/);
  assert.match(pending, /整理长桌/);
  assert.match(pending, /让大家有地方坐/);
  assert.doesNotMatch(pending, /桌面已经擦净/);

  for (const person of PEOPLE) world.pending[person.id] = intent;
  const completed = renderWorld(applyPhase(world, []));
  assert.doesNotMatch(completed, /已决定 · 待结算/);
  assert.match(completed, /整理长桌/);
});

test('行动先说简短概述，具体经过可展开；旧记录仍可读', () => {
  const world = createWorld();
  for (const person of PEOPLE) world.pending[person.id] = intent;
  const action = applyPhase(world, []).scenes[0];
  assert.equal(action.kind, 'action');
  if (action.kind !== 'action') return;
  const scene = { ...action, summary: '收拾了长桌，今晚能一起吃饭了。', steps: ['擦净桌面', '摆好椅子'] };
  const detail = renderToStaticMarkup(createElement(SceneDetail, { scene, onClose: () => {} }));
  assert.match(detail, /我做了什么<\/h3><p>收拾了长桌，今晚能一起吃饭了。<\/p>/);
  assert.match(detail, /<details class="action-details"><summary>看看具体经过<\/summary>/);
  assert.match(detail, /擦净桌面/);
  const oldDetail = renderToStaticMarkup(createElement(SceneDetail, { scene: action, onClose: () => {} }));
  assert.match(oldDetail, /我做了什么<\/h3><p>整理长桌<\/p>/);
  const pending = renderToStaticMarkup(createElement(SceneDetail, { scene: { ...action, kind: 'pending' }, onClose: () => {} }));
  assert.doesNotMatch(pending, /我做了什么/);
});

test('共同晚饭展示到场、缺席和实际对话', () => {
  const scene: DinnerScene = {
    kind: 'dinner', id: 'dinner-1', day: 1, slot: 3, placeId: 'kitchen', title: '今晚的餐桌',
    description: '长桌边逐渐热闹起来。', attendees: ['kevin', 'elysia'],
    absentees: [{ actorId: 'mobius', reason: '还想待在实验室' }],
    lines: [{ actorId: 'elysia', text: '今天的灯串漂亮吗？' }, { actorId: 'kevin', text: '很漂亮。' }],
  };
  const detail = renderToStaticMarkup(createElement(SceneDetail, { scene, onClose: () => {} }));
  assert.match(detail, /共同晚饭/);
  assert.match(detail, /今晚到场 · 2 人/);
  assert.match(detail, /梅比乌斯.*还想待在实验室/);
  assert.match(detail, /今天的灯串漂亮吗/);
  const world = createWorld();
  world.scenes.push(scene);
  world.day = 2;
  const page = renderWorld(world);
  assert.match(page, /共同晚饭 1 场/);
  assert.match(page, /到场 2 人 · 缺席 1 人/);
});
