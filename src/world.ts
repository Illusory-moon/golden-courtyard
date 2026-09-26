import { PEOPLE, type PersonId, type PlaceId } from './people';

export const SLOTS = ['早晨', '午后', '傍晚', '夜晚'] as const;
export type SlotIndex = 0 | 1 | 2 | 3;

export interface Item {
  id: string;
  name: string;
  detail: string;
  placeId: PlaceId;
  updatedBy: PersonId | null;
  ownerId?: PersonId;
}

export interface Project {
  title: string;
  note: string;
  next: string;
}

export interface Resident {
  placeId: PlaceId;
  energy: number;
  project: Project | null;
  memory: string[];
}

export interface Intent {
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
  observation?: string;
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

export type Scene = ActionScene | EncounterScene | DinnerScene;

export interface World {
  version: 1;
  day: number;
  slot: SlotIndex;
  residents: Record<PersonId, Resident>;
  items: Item[];
  scenes: Scene[];
  pending: Partial<Record<PersonId, Intent>>;
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

export function createWorld(): World {
  const residents = {} as Record<PersonId, Resident>;
  PEOPLE.forEach((person) => {
    residents[person.id] = { placeId: START_PLACES[person.id], energy: 3, project: null, memory: [] };
  });
  return { version: 1, day: 1, slot: 0, residents, items: structuredClone(START_ITEMS), scenes: [], pending: {} };
}

export function isWorld(value: unknown): value is World {
  if (!value || typeof value !== 'object') return false;
  const world = value as Partial<World>;
  return world.version === 1 && Number.isInteger(world.day) && world.day! > 0
    && Number.isInteger(world.slot) && world.slot! >= 0 && world.slot! < SLOTS.length
    && !!world.residents && Array.isArray(world.items) && Array.isArray(world.scenes)
    && !!world.pending && PEOPLE.every((person) => !!world.residents?.[person.id]);
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

export function applyPhase(world: World, encounters: EncounterScene[], dinner?: DinnerScene): World {
  const next = structuredClone(world);
  if (world.slot === 3 && !dinner) throw new Error('夜晚缺少晚餐记录');
  for (const person of PEOPLE) {
    const intent = next.pending[person.id];
    if (!intent) throw new Error(`${person.name} 尚未决定这个时段的行动`);
  }
  const itemChanges = new Map<string, { actorId: PersonId; detail: string }>();
  for (const person of PEOPLE) {
    const intent = next.pending[person.id]!;
    const resident = next.residents[person.id];
    resident.placeId = intent.placeId;
    resident.energy = Math.max(0, Math.min(4, resident.energy + (intent.effort === 'rest' ? 1 : intent.effort === 'focus' ? -1 : 0)));
    if (intent.project) resident.project = intent.project;
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
      } else if (!intent.object.id) {
        const created: Item = {
          id: `item-${world.day}-${world.slot}-${person.id}`,
          name: intent.object.name,
          detail: intent.object.detail,
          placeId: intent.placeId,
          updatedBy: person.id,
          ownerId: person.id,
        };
        next.items.push(created);
        objectResult = `${created.name}：${created.detail}`;
      }
    }
    next.scenes.push({
      ...intent,
      kind: 'action',
      id: `action-${world.day}-${world.slot}-${person.id}`,
      day: world.day,
      slot: world.slot,
      actorId: person.id,
      objectResult,
      encounterStatus: intent.targetId ? targetReplied ? 'met' : 'left-note' : null,
    });
    resident.memory = [...resident.memory, `${SLOTS[world.slot]}：${intent.activity}。${intent.observation}`].slice(-6);
  }
  for (const [id, change] of itemChanges) {
    const item = next.items.find((entry) => entry.id === id)!;
    item.detail = change.detail;
    item.updatedBy = change.actorId;
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
