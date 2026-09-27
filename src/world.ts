import { PEOPLE, personById, placeById, type PersonId, type PlaceId } from './people';

export const SLOTS = ['早晨', '午后', '傍晚', '夜晚'] as const;
export type SlotIndex = 0 | 1 | 2 | 3;

export interface Item {
  id: string;
  name: string;
  detail: string;
  placeId: PlaceId;
  updatedBy: PersonId | null;
  ownerId?: PersonId;
  placement?: string;
  history?: { day: number; by: PersonId | null; detail: string; placeId?: PlaceId; placement?: string }[];
}

export interface Project {
  title: string;
  note: string;
  next: string;
  stage?: 0 | 1 | 2 | 3;
}

export interface Resident {
  placeId: PlaceId;
  energy: number;
  project: Project | null;
  memory: string[];
  longMemory?: string[];
  bonds?: Partial<Record<PersonId, string>>;
}

export interface Intent {
  form?: 'diary' | 'note' | 'log' | 'silence';
  placeId: PlaceId;
  activity: string;
  goal: string;
  summary?: string;
  steps: string[];
  observation: string;
  interpretation: string;
  quote: string;
  next: string;
  effort: 'rest' | 'light' | 'focus';
  targetId: PersonId | null;
  bond?: { aboutId: PersonId; note: string } | null;
  memento?: string | null;
  dinner?: { attend: boolean; reason: string };
  object: { id: string | null; name: string; detail: string } | null;
  project: Project | null;
}

export interface ActionScene extends Intent {
  kind: 'action';
  id: string;
  day: number;
  slot: SlotIndex;
  actorId: PersonId;
  objectResult: string | null;
  encounterStatus: 'met' | 'left-note' | null;
}

export interface EncounterScene {
  kind: 'encounter';
  id: string;
  day: number;
  slot: SlotIndex;
  placeId: PlaceId;
  actorIds: PersonId[];
  title: string;
  lines: { actorId: PersonId; text: string }[];
}

export interface DinnerScene {
  kind: 'dinner';
  id: string;
  day: number;
  slot: 3;
  placeId: 'kitchen';
  title: string;
  description: string;
  attendees: PersonId[];
  absentees: { actorId: PersonId; reason: string }[];
  lines: { actorId: PersonId; text: string }[];
}

export interface SharedEventScene {
  kind: 'event';
  id: string;
  day: number;
  slot: SlotIndex;
  placeId: PlaceId;
  title: string;
  description: string;
}

export interface ResidentQuestion {
  day: number;
  sceneId: string;
  actorId: PersonId;
  question: string;
  answer: string;
}

export type Scene = ActionScene | EncounterScene | DinnerScene | SharedEventScene;

export interface World {
  version: 1;
  day: number;
  slot: SlotIndex;
  residents: Record<PersonId, Resident>;
  items: Item[];
  scenes: Scene[];
  pending: Partial<Record<PersonId, Intent>>;
  questions?: ResidentQuestion[];
}

const START_ITEMS: Item[] = [
  { id: 'table', name: '长餐桌', detail: '擦得干净，还空着。', placeId: 'kitchen', updatedBy: null },
  { id: 'beans', name: '一袋绿豆', detail: '放在厨房架子上，尚未使用。', placeId: 'kitchen', updatedBy: null },
  { id: 'notebook', name: '实验记录本', detail: '扉页还留着空白。', placeId: 'lab', updatedBy: null },
  { id: 'robot', name: '小克莱茵', detail: '在实验室待命。', placeId: 'lab', updatedBy: null },
  { id: 'canvas', name: '画架', detail: '支在窗边。', placeId: 'studio', updatedBy: null, ownerId: 'griseo' },
  { id: 'piano', name: '旧钢琴', detail: '琴盖合着。', placeId: 'lounge', updatedBy: null },
  { id: 'lights', name: '一箱灯串', detail: '等待有人把它们挂起来。', placeId: 'hall', updatedBy: null },
  { id: 'board', name: '庭院公告板', detail: '今天还没有留言。', placeId: 'garden', updatedBy: null },
];

const START_PLACES: Record<PersonId, PlaceId> = {
  kevin: 'garden', elysia: 'hall', aponia: 'kitchen', eden: 'lounge',
  villv: 'lab', kalpas: 'kitchen', su: 'garden', sakura: 'hall',
  kosma: 'lounge', mobius: 'lab', griseo: 'studio', hua: 'garden', pardo: 'garden',
};

export function itemOwner(item: Item): PersonId | null {
  // Older browser saves predate ownerId; the easel still belongs to Griseo.
  return item.ownerId ?? (item.id === 'canvas' ? 'griseo' : null);
}

export function canMoveItem(item: Item): boolean {
  return !itemOwner(item) && !['table', 'piano', 'robot', 'board'].includes(item.id);
}

export function createWorld(): World {
  const residents = {} as Record<PersonId, Resident>;
  PEOPLE.forEach((person) => {
    residents[person.id] = { placeId: START_PLACES[person.id], energy: 3, project: null, memory: [], longMemory: [], bonds: {} };
  });
  const items = START_ITEMS.map((item) => ({ ...item, history: [{ day: 0, by: null, detail: item.detail, placeId: item.placeId }] }));
  return { version: 1, day: 1, slot: 0, residents, items, scenes: [], pending: {}, questions: [] };
}

export function isWorld(value: unknown): value is World {
  if (!value || typeof value !== 'object') return false;
  const world = value as Partial<World>;
  return world.version === 1 && Number.isInteger(world.day) && world.day! > 0
    && Number.isInteger(world.slot) && world.slot! >= 0 && world.slot! < SLOTS.length
    && !!world.residents && typeof world.residents === 'object' && !Array.isArray(world.residents)
    && Array.isArray(world.items) && Array.isArray(world.scenes)
    && !!world.pending && typeof world.pending === 'object' && !Array.isArray(world.pending);
}

const validPerson = (id: unknown): id is PersonId => typeof id === 'string' && Object.hasOwn(personById, id);
const validPlace = (id: unknown): id is PlaceId => typeof id === 'string' && Object.hasOwn(placeById, id);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const project = (value: unknown): value is Project => record(value) && typeof value.title === 'string'
  && typeof value.note === 'string' && typeof value.next === 'string'
  && (value.stage === undefined || (Number.isInteger(value.stage) && Number(value.stage) >= 0 && Number(value.stage) <= 3));

function validIntent(value: unknown): value is Intent {
  if (!record(value)) return false;
  return validPlace(value.placeId) && (value.form === undefined || ['diary', 'note', 'log', 'silence'].includes(String(value.form)))
    && typeof value.activity === 'string' && typeof value.goal === 'string'
    && (value.summary === undefined || typeof value.summary === 'string')
    && Array.isArray(value.steps) && value.steps.every((step) => typeof step === 'string')
    && ['observation', 'interpretation', 'quote', 'next'].every((key) => typeof value[key] === 'string')
    && ['rest', 'light', 'focus'].includes(String(value.effort))
    && (value.targetId == null || validPerson(value.targetId))
    && (value.bond === undefined || value.bond === null || (record(value.bond) && validPerson(value.bond.aboutId) && typeof value.bond.note === 'string'))
    && (value.memento === undefined || value.memento === null || typeof value.memento === 'string')
    && (value.dinner === undefined || (record(value.dinner) && typeof value.dinner.attend === 'boolean' && typeof value.dinner.reason === 'string'))
    && (value.object == null || (record(value.object) && (value.object.id === null || typeof value.object.id === 'string')
      && typeof value.object.name === 'string' && typeof value.object.detail === 'string'))
    && (value.project == null || project(value.project));
}

function validScene(value: unknown): value is Scene {
  if (!record(value) || !validPlace(value.placeId) || !Number.isInteger(value.day) || !Number.isInteger(value.slot)
    || !SLOTS[Number(value.slot)] || typeof value.id !== 'string') return false;
  if (value.kind === 'action') return validPerson(value.actorId) && validIntent(value)
    && (value.objectResult === null || typeof value.objectResult === 'string')
    && [null, 'met', 'left-note'].includes(value.encounterStatus as null);
  if (value.kind === 'event') return typeof value.title === 'string' && typeof value.description === 'string';
  if (value.kind === 'encounter' || value.kind === 'dinner') {
    if (typeof value.title !== 'string' || !Array.isArray(value.lines)
      || !value.lines.every((line) => record(line) && validPerson(line.actorId) && typeof line.text === 'string')) return false;
    if (value.kind === 'encounter') return Array.isArray(value.actorIds) && value.actorIds.every(validPerson);
    return value.placeId === 'kitchen' && value.slot === 3 && typeof value.description === 'string'
      && Array.isArray(value.attendees) && value.attendees.every(validPerson)
      && Array.isArray(value.absentees) && value.absentees.every((absence) =>
        record(absence) && validPerson(absence.actorId) && typeof absence.reason === 'string');
  }
  return false;
}

export function sanitizeWorld(world: World): World {
  const clean = structuredClone(world);
  let changed = false;
  const fresh = createWorld();
  for (const person of PEOPLE) {
    const resident: unknown = clean.residents[person.id];
    if (!record(resident)) { clean.residents[person.id] = fresh.residents[person.id]; changed = true; continue; }
    if (!validPlace(resident.placeId)) { clean.residents[person.id].placeId = fresh.residents[person.id].placeId; changed = true; }
    if (typeof resident.energy !== 'number' || !Number.isFinite(resident.energy)) { clean.residents[person.id].energy = 3; changed = true; }
    if (resident.project != null && !project(resident.project)) { clean.residents[person.id].project = null; changed = true; }
    if (!Array.isArray(resident.memory) || !resident.memory.every((entry) => typeof entry === 'string')) {
      clean.residents[person.id].memory = Array.isArray(resident.memory) ? resident.memory.filter((entry): entry is string => typeof entry === 'string') : [];
      changed = true;
    }
    if (resident.longMemory !== undefined && (!Array.isArray(resident.longMemory) || !resident.longMemory.every((entry) => typeof entry === 'string'))) {
      clean.residents[person.id].longMemory = Array.isArray(resident.longMemory) ? resident.longMemory.filter((entry): entry is string => typeof entry === 'string').slice(-2) : [];
      changed = true;
    }
    if (resident.bonds !== undefined && (!record(resident.bonds) || Object.entries(resident.bonds).some(([id, note]) => !validPerson(id) || typeof note !== 'string'))) {
      clean.residents[person.id].bonds = Object.fromEntries(record(resident.bonds) ? Object.entries(resident.bonds).filter(([id, note]) => validPerson(id) && typeof note === 'string') : []);
      changed = true;
    }
  }
  const items = clean.items.filter((item) => record(item) && typeof item.id === 'string' && typeof item.name === 'string'
    && typeof item.detail === 'string' && validPlace(item.placeId)
    && (item.placement === undefined || typeof item.placement === 'string')
    && (item.updatedBy === null || validPerson(item.updatedBy))
    && (item.ownerId === undefined || validPerson(item.ownerId)));
  for (const item of items) {
    if (item.history === undefined) {
      const initial = fresh.items.find((entry) => entry.id === item.id);
      item.history = initial && initial.detail === item.detail && initial.placeId === item.placeId && item.updatedBy === null
        ? structuredClone(initial.history)
        : [{ day: clean.day, by: item.updatedBy, detail: item.detail, placeId: item.placeId, placement: item.placement }];
      changed = true;
      continue;
    }
    const history = Array.isArray(item.history) ? item.history.filter((entry) => record(entry) && Number.isInteger(entry.day)
      && entry.day >= 0 && (entry.by === null || validPerson(entry.by)) && typeof entry.detail === 'string'
      && (entry.placeId === undefined || validPlace(entry.placeId))
      && (entry.placement === undefined || typeof entry.placement === 'string')) : [];
    if (!history.length || history.length !== item.history.length) {
      if (history.length) item.history = history;
      else item.history = [{ day: clean.day, by: item.updatedBy, detail: item.detail, placeId: item.placeId, placement: item.placement }];
      changed = true;
    }
  }
  if (!items.some((item) => item.id === 'board')) {
    items.push(fresh.items.find((item) => item.id === 'board')!);
    changed = true;
  }
  const scenes = clean.scenes.filter(validScene);
  if (clean.questions !== undefined) {
    const questions = Array.isArray(clean.questions) ? clean.questions.filter((entry) => record(entry)
      && Number.isInteger(entry.day) && entry.day > 0 && typeof entry.sceneId === 'string'
      && validPerson(entry.actorId) && typeof entry.question === 'string' && typeof entry.answer === 'string') : [];
    if (!Array.isArray(clean.questions) || questions.length !== clean.questions.length) { clean.questions = questions; changed = true; }
  }
  const pending = Object.fromEntries(Object.entries(clean.pending).filter(([id, intent]) => validPerson(id) && validIntent(intent))) as World['pending'];
  if (items.length !== clean.items.length || scenes.length !== clean.scenes.length
    || Object.keys(pending).length !== Object.keys(clean.pending).length) changed = true;
  if (!changed) return world;
  clean.items = items;
  clean.scenes = scenes;
  clean.pending = pending;
  return clean;
}

export function socialFor(world: World, id: PersonId): Partial<Record<PersonId, { meetings: number; last: string }>> {
  const social: Partial<Record<PersonId, { meetings: number; last: string }>> = {};
  for (const scene of world.scenes) {
    if (scene.kind !== 'encounter') continue;
    const speakers = [...new Set(scene.lines.map((line) => line.actorId))].filter((actorId) => scene.actorIds.includes(actorId));
    if (speakers.length < 2 || !speakers.includes(id)) continue;
    for (const otherId of speakers) {
      if (otherId === id) continue;
      const previous = social[otherId];
      const otherName = PEOPLE.find((person) => person.id === otherId)!.name;
      const otherLine = scene.lines.find((line) => line.actorId === otherId)?.text ?? '';
      social[otherId] = {
        meetings: (previous?.meetings ?? 0) + 1,
        last: `${otherName}说“${otherLine}”`.slice(0, 220),
      };
    }
  }
  return social;
}

export function dayHighlights(world: World, day: number): string[] {
  const scenes = world.scenes.filter((scene) => scene.day === day);
  const dinner = scenes.find((scene): scene is DinnerScene => scene.kind === 'dinner');
  if (!dinner) return [];
  const highlights: string[] = [
    `晚饭来了 ${dinner.attendees.length} 人${dinner.absentees.length ? `，${dinner.absentees.map(({ actorId }) => personById[actorId].name).join('、')}缺席` : '，没有人缺席'}。`,
  ];
  for (const event of scenes.filter((scene): scene is SharedEventScene => scene.kind === 'event')) highlights.push(`${event.title}：${event.description}`);
  const speakers = new Set(scenes.flatMap((scene) => scene.kind === 'encounter' || scene.kind === 'dinner' ? scene.lines.map((line) => line.actorId) : []));
  const quiet = PEOPLE.filter((person) => !speakers.has(person.id));
  if (quiet.length) highlights.push(quiet.length <= 3
    ? `${quiet.map((person) => person.name).join('、')}今天没有留下对话记录。`
    : `今天有 ${quiet.length} 人没有留下对话记录。`);
  const firstVisit = scenes.find((scene) => scene.kind === 'action' && !world.scenes.some((earlier) =>
    earlier.kind === 'action' && earlier.day < day && earlier.actorId === scene.actorId && earlier.placeId === scene.placeId));
  if (day > 1 && firstVisit?.kind === 'action') highlights.push(`${personById[firstVisit.actorId].name}首次在${placeById[firstVisit.placeId].name}留下行动记录。`);
  const changed = scenes.filter((scene) => scene.kind === 'action' && scene.objectResult && !scene.objectResult.startsWith('未改动')).length;
  if (changed) highlights.push(`今天有 ${changed} 件物品留下了新的变化。`);
  return highlights;
}

export function anniversariesFor(world: World, day: number): string[] {
  if (day <= 365) return [];
  const scenes = world.scenes.filter((scene) => scene.day < day && (day - scene.day) % 365 === 0);
  const memories: string[] = [];
  for (const scene of scenes) {
    if (scene.kind === 'dinner' && !world.scenes.some((earlier) => earlier.kind === 'dinner' && earlier.day < scene.day)) {
      memories.push(`${Math.floor((day - scene.day) / 365)} 年前的今天，大家第一次围在餐桌旁：${scene.title}。`);
    }
    if (scene.kind === 'event') memories.push(`${Math.floor((day - scene.day) / 365)} 年前的今天，庭院发生过「${scene.title}」。`);
    if (scene.kind === 'action' && scene.project?.stage === 3 && scene.objectResult && !scene.objectResult.startsWith('未改动')) {
      memories.push(`${Math.floor((day - scene.day) / 365)} 年前的今天，${personById[scene.actorId].name}完成了「${scene.project.title}」。`);
    }
  }
  return memories.slice(0, 3);
}

const SHARED_EVENTS: Pick<SharedEventScene, 'placeId' | 'title' | 'description'>[] = [
  { placeId: 'garden', title: '午后落雨', description: '庭院开始下小雨，石阶和花圃都湿了。' },
  { placeId: 'hall', title: '门厅停电', description: '门厅的灯忽然熄灭，厨房仍有灯光。' },
  { placeId: 'hall', title: '一封无名信', description: '一封没有写明收件人的信放在门厅桌上。' },
  { placeId: 'studio', title: '颜料洒了', description: '画室门边洒了一小片蓝色颜料，地上还没收拾。' },
];

export function sharedEventFor(world: World): SharedEventScene | null {
  const turn = (world.day - 1) * SLOTS.length + world.slot;
  if (turn < 5 || (turn - 5) % 15 !== 0) return null;
  const event = SHARED_EVENTS[Math.floor((turn - 5) / 15) % SHARED_EVENTS.length];
  return { kind: 'event', id: `event-${world.day}-${world.slot}`, day: world.day, slot: world.slot, ...event };
}

export function currentWant(world: World, id: PersonId): string {
  const resident = world.residents[id];
  if (resident.project?.next) return resident.project.next;
  const last = world.scenes.slice().reverse().find((scene): scene is ActionScene => scene.kind === 'action' && scene.actorId === id);
  return last?.next || personById[id].wants;
}

export function worldAtDay(world: World, day: number): World {
  const residents = createWorld().residents;
  for (const scene of world.scenes) {
    if (scene.day > day) continue;
    if (scene.kind === 'action') residents[scene.actorId].placeId = scene.placeId;
    if (scene.kind === 'dinner') {
      for (const id of scene.attendees) residents[id].placeId = 'kitchen';
    }
  }
  const items = world.items.flatMap((item) => {
    const history = item.history?.filter((entry) => entry.day <= day);
    if (!history?.length) return [];
    const last = history.at(-1)!;
    return [{ ...item, detail: last.detail, placeId: last.placeId ?? item.placeId,
      placement: last.placement, updatedBy: last.by, history }];
  });
  return { ...world, residents, items };
}

export function forkWorldAtDay(world: World, day: number): World {
  if (!Number.isInteger(day) || day < 1 || day >= world.day) throw new Error('只能从已完成的一天分叉。');
  let replay = createWorld();
  for (let date = 1; date <= day; date += 1) {
    for (let slot = 0; slot < SLOTS.length; slot += 1) {
      const scenes = world.scenes.filter((scene) => scene.day === date && scene.slot === slot);
      const actions = scenes.filter((scene): scene is ActionScene => scene.kind === 'action');
      if (actions.length !== PEOPLE.length || new Set(actions.map((scene) => scene.actorId)).size !== PEOPLE.length) {
        throw new Error(`第 ${date} 天的${SLOTS[slot]}行动记录不完整，不能从这一天分叉。`);
      }
      const dinner = scenes.find((scene): scene is DinnerScene => scene.kind === 'dinner');
      if (slot === 3 && !dinner) throw new Error(`第 ${date} 天缺少共同晚饭，不能分叉。`);
      replay.pending = Object.fromEntries(actions.map((scene) => [scene.actorId, scene])) as World['pending'];
      replay = applyPhase(replay, scenes.filter((scene): scene is EncounterScene => scene.kind === 'encounter'), dinner);
    }
  }
  const history = worldAtDay(world, day);
  replay.items = history.items;
  replay.scenes = structuredClone(world.scenes.filter((scene) => scene.day <= day));
  replay.questions = structuredClone((world.questions ?? []).filter((entry) => entry.day <= day));
  return replay;
}

export function moveItem(world: World, itemId: string, placeId: PlaceId, spot: string): World {
  const item = world.items.find((entry) => entry.id === itemId);
  if (!item || !canMoveItem(item) || !validPlace(placeId) || item.placeId === placeId) throw new Error('这件物品不能这样挪动。');
  const placement = `${placeById[placeId].name}${spot.trim() ? `的${spot.trim()}` : ''}`;
  const items = world.items.map((entry) => entry.id === itemId ? {
    ...entry, placeId, placement,
    history: [...(entry.history ?? [{ day: 0, by: null, detail: entry.detail, placeId: entry.placeId, placement: entry.placement }])
      .map((past) => ({ ...past, placeId: past.placeId ?? entry.placeId })),
      { day: world.day, by: null, detail: entry.detail, placeId, placement }],
  } : entry);
  const scene: SharedEventScene = { kind: 'event', id: `move-${world.day}-${world.slot}-${itemId}-${world.scenes.length}`,
    day: world.day, slot: world.slot, placeId, title: `${item.name}换了地方`, description: `访客把${item.name}放到了${placement}。` };
  return { ...world, items, scenes: [...world.scenes, scene] };
}

export function applyPhase(world: World, encounters: EncounterScene[], dinner?: DinnerScene): World {
  const next = structuredClone(world);
  if (world.slot === 3 && !dinner) throw new Error('夜晚缺少晚餐记录');
  for (const person of PEOPLE) {
    const intent = next.pending[person.id];
    if (!intent) throw new Error(`${person.name} 尚未决定这个时段的行动`);
  }
  const itemChanges = new Map<string, { actorId: PersonId; detail: string }>();
  const sharedEvent = sharedEventFor(world);
  if (sharedEvent) next.scenes.push(sharedEvent);
  for (const person of PEOPLE) {
    const intent = next.pending[person.id]!;
    const resident = next.residents[person.id];
    resident.placeId = intent.placeId;
    resident.energy = Math.max(0, Math.min(4, resident.energy + (intent.effort === 'rest' ? 1 : intent.effort === 'focus' ? -1 : 0)));
    if (intent.bond && intent.bond.aboutId !== person.id) resident.bonds = { ...resident.bonds, [intent.bond.aboutId]: intent.bond.note };
    if (intent.memento?.trim()) resident.longMemory = [...new Set([...(resident.longMemory ?? []), intent.memento.trim()])].slice(-2);
    const targetReplied = intent.targetId !== null && encounters.some((encounter) =>
      encounter.placeId === intent.placeId
      && encounter.lines.some((line) => line.actorId === person.id)
      && encounter.lines.some((line) => line.actorId === intent.targetId));
    let objectResult: string | null = null;
    if (intent.object) {
      const item = intent.object.id ? next.items.find((entry) => entry.id === intent.object?.id) : null;
      if (item && item.placeId === intent.placeId && (!itemOwner(item) || itemOwner(item) === person.id) && !itemChanges.has(item.id)) {
        objectResult = `${item.name}：${item.detail} → ${intent.object.detail}`;
        itemChanges.set(item.id, { actorId: person.id, detail: intent.object.detail });
      } else if (item && itemChanges.has(item.id)) {
        objectResult = `未改动${item.name}：${personById[itemChanges.get(item.id)!.actorId].name}已在同一时段先处理它。`;
      } else if (!intent.object.id) {
        const created: Item = {
          id: `item-${world.day}-${world.slot}-${person.id}`,
          name: intent.object.name,
          detail: intent.object.detail,
          placeId: intent.placeId,
          updatedBy: person.id,
          ownerId: person.id,
          history: [{ day: world.day, by: person.id, detail: intent.object.detail, placeId: intent.placeId }],
        };
        next.items.push(created);
        objectResult = `${created.name}：${created.detail}`;
      }
    }
    if (intent.project) resident.project = intent.project.stage === 3 && objectResult && !objectResult.startsWith('未改动') ? null : intent.project;
    next.scenes.push({
      ...intent,
      object: objectResult?.startsWith('未改动') ? null : intent.object,
      kind: 'action',
      id: `action-${world.day}-${world.slot}-${person.id}`,
      day: world.day,
      slot: world.slot,
      actorId: person.id,
      objectResult,
      encounterStatus: intent.targetId ? targetReplied ? 'met' : 'left-note' : null,
    });
    resident.memory = [...resident.memory, `${SLOTS[world.slot]}：${intent.activity}。${intent.observation || intent.summary || ''}`].slice(-6);
  }
  for (const [id, change] of itemChanges) {
    const item = next.items.find((entry) => entry.id === id)!;
    const previous = item.detail;
    item.detail = change.detail;
    item.updatedBy = change.actorId;
    item.history = [...(item.history ?? [{ day: 0, by: null, detail: previous, placeId: item.placeId }]), { day: world.day, by: change.actorId, detail: change.detail, placeId: item.placeId, placement: item.placement }];
  }
  next.scenes.push(...encounters);
  for (const encounter of encounters) {
    const speakers = [...new Set(encounter.lines.map((line) => line.actorId))].filter((id) => encounter.actorIds.includes(id));
    if (speakers.length < 2) continue;
    for (const id of speakers) {
      const resident = next.residents[id];
      resident.memory = [...resident.memory, `与${speakers.filter((otherId) => otherId !== id).map((otherId) => PEOPLE.find((person) => person.id === otherId)!.name).join('、')}交谈：${encounter.title}`].slice(-6);
    }
  }
  if (dinner) {
    next.scenes.push(dinner);
    for (const id of dinner.attendees) {
      const resident = next.residents[id];
      resident.placeId = 'kitchen';
      resident.memory = [...resident.memory, `晚餐：${dinner.title}`].slice(-6);
    }
  }
  next.pending = {};
  if (world.slot === 3) {
    next.day += 1;
    next.slot = 0;
    for (const resident of Object.values(next.residents)) resident.energy = Math.max(resident.energy, 2);
  } else {
    next.slot = (world.slot + 1) as SlotIndex;
  }
  return next;
}
