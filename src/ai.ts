import { z } from 'zod';
import { PEOPLE, PLACES, personById, placeById, type PersonId, type PlaceId } from './people';
import { formatSoul, SOULS } from './souls';
import { relationshipsFrom } from './relationships';
import { SLOTS, itemOwner, socialFor, type ActionScene, type DinnerScene, type EncounterScene, type Intent, type World } from './world';

const projectSchema = z.object({
  title: z.string().trim().min(2).max(32),
  note: z.string().trim().min(4).max(120),
  next: z.string().trim().min(4).max(100),
});

const intentSchema = z.object({
  placeId: z.string(),
  activity: z.string().trim().min(2).max(32),
  goal: z.string().trim().min(4).max(100),
  summary: z.string().trim().min(4).max(60),
  steps: z.array(z.string().trim().min(4).max(140)).min(2).max(4),
  observation: z.string().trim().min(4).max(140),
  interpretation: z.string().trim().min(4).max(140),
  quote: z.string().trim().min(2).max(100),
  next: z.string().trim().min(4).max(100),
  effort: z.enum(['rest', 'light', 'focus']),
  targetId: z.string().nullable(),
  dinner: z.object({ attend: z.boolean(), reason: z.string().trim().min(2).max(80) }).optional(),
  object: z.object({ id: z.string().nullable(), name: z.string().trim().min(1).max(32), detail: z.string().trim().min(4).max(140) }).nullable(),
  project: projectSchema.nullable(),
});

const encounterSchema = z.object({
  title: z.string().trim().min(2).max(28),
  lines: z.array(z.object({ actorId: z.string(), text: z.string().trim().min(2).max(110) })).min(2).max(8),
});

const dinnerSchema = z.object({
  title: z.string().trim().min(2).max(32),
  description: z.string().trim().min(8).max(180),
  lines: z.array(z.object({ actorId: z.string(), text: z.string().trim().min(2).max(120) })).min(4).max(12),
});

interface ChatResponse {
  output?: { type?: string; content?: { type?: string; text?: string }[] }[];
}

export interface ApiSettings { apiUrl: string; apiKey: string; model: string }
const API_SETTINGS_KEY = 'golden-courtyard.api.v1';

export function loadApiSettings(): ApiSettings | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(API_SETTINGS_KEY) ?? 'null');
    if (value && typeof value === 'object' && 'apiUrl' in value && 'apiKey' in value && 'model' in value
      && typeof value.apiUrl === 'string' && typeof value.apiKey === 'string' && typeof value.model === 'string') {
      return value as ApiSettings;
    }
  } catch { /* Invalid session settings are ignored. */ }
  return null;
}

export function validateApiSettings(settings: ApiSettings): string | null {
  let url: URL;
  try { url = new URL(settings.apiUrl.trim()); } catch { return '请输入完整的 API 地址'; }
  if (url.username || url.password || url.search || url.hash
    || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    return 'API 地址需使用 HTTPS；本机地址可使用 HTTP，且不能含账号、查询参数或片段';
  }
  if (!settings.model.trim()) return '请输入模型名称';
  return null;
}

export function saveApiSettings(settings: ApiSettings): void {
  sessionStorage.setItem(API_SETTINGS_KEY, JSON.stringify({
    apiUrl: settings.apiUrl.trim().replace(/\/+$/, ''), apiKey: settings.apiKey.trim(), model: settings.model.trim(),
  }));
}

export function clearApiSettings(): void { sessionStorage.removeItem(API_SETTINGS_KEY); }

function apiEndpoint(apiUrl: string): string {
  const base = apiUrl.replace(/\/+$/, '');
  return base.endsWith('/responses') ? base : `${base}/responses`;
}

async function chat(system: string, user: string, signal: AbortSignal): Promise<unknown> {
  const timeout = AbortSignal.timeout(120_000);
  const settings = loadApiSettings();
  const direct = !!settings && !import.meta.env?.DEV;
  const response = await fetch(direct ? apiEndpoint(settings.apiUrl) : '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(direct && settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}) },
    body: JSON.stringify(direct ? {
      model: settings.model, input: [{ role: 'system', content: system }, { role: 'user', content: user }],
      reasoning: { effort: 'low' }, text: { format: { type: 'json_object' } }, max_output_tokens: 1100,
    } : { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], settings }),
    signal: AbortSignal.any([signal, timeout]),
  });
  if (!response.ok) throw new Error(`AI 接口返回 HTTP ${response.status}`);
  const payload = await response.json() as ChatResponse;
  const content = payload.output?.flatMap((entry) => entry.content ?? []).find((entry) => entry.type === 'output_text')?.text;
  if (typeof content !== 'string') throw new Error('AI 没有返回文本');
  try {
    return JSON.parse(content);
  } catch {
    throw new Error('AI 没有返回有效的 JSON');
  }
}

export async function checkConnection(signal: AbortSignal): Promise<{ ready: boolean; model: string }> {
  const settings = loadApiSettings();
  if (settings && !validateApiSettings(settings)) return { ready: true, model: settings.model };
  if (!import.meta.env?.DEV) return { ready: false, model: '' };
  const response = await fetch('/api/health', { signal });
  if (!response.ok) return { ready: false, model: '' };
  const payload = await response.json() as { ready?: boolean; model?: string };
  return { ready: payload.ready === true, model: payload.model ?? '' };
}

function actionPrompt(world: World, id: PersonId): { system: string; user: string } {
  const person = personById[id];
  const resident = world.residents[id];
  const social = socialFor(world, id);
  const reservedItems = new Set(Object.values(world.pending).map((intent) => intent?.object?.id).filter((itemId): itemId is string => !!itemId));
  const system = `你正在扮演《崩坏3》逐火十三英桀的日常平行世界角色${person.name}。这是轻松的同住生活，没有战争、死亡、残酷考验或拯救世界的任务。你的决定只代表你自己，其他人可以拒绝邀请。\n角色 soul：\n${formatSoul(SOULS[id])}\n官方关系标签是对每个人的起始印象，不是今天已经发生的事，也不是固定的邀约名单；近期真实经历优先。你可以与任何人互动，也可以独处，不必总找最熟悉的人。共同经历只依据实际对话更新，不能把见面次数当成亲密度。上一时段未碰面的邀约会作为简短留言送达；收到后可以赴约、改约或拒绝，不必为了关系放弃自己的计划。\n请自由选择一件符合自己兴趣、眼前情境与当前时段的生活小事；可以做饭、散步、聊天、练习、创作或休息，不必每轮重复习惯，也不要把别人的工作或作品当成自己的研究题目。只有角色确实主动做实验时才写对象、方法和记录。所有居民在当前时段同时行动，你不能把别人在本时段的行动当成已知，也不能凭空编造上一时段的相遇。写出本人实际做的步骤、看见的结果与自己的想法，不替别人决定或说话；时间不够时不要编造立刻成功。你不能凭空拿到不在所选地点的既有物品。只返回 JSON 对象，不含 Markdown。`;
  const previousDay = world.slot === 0 ? world.day - 1 : world.day;
  const previousSlot = world.slot === 0 ? 3 : world.slot - 1;
  const missedInvitations = world.scenes.filter((scene): scene is ActionScene => scene.kind === 'action'
    && scene.day === previousDay && scene.slot === previousSlot && scene.encounterStatus === 'left-note');
  const user = JSON.stringify({
    day: world.day,
    time: SLOTS[world.slot],
    dinnerInvitation: world.slot === 3 ? '自己的夜晚行动结束后，餐厨会有一顿共同晚饭。你可以去，也可以不去；独处、疲惫或手头有事都可以是理由。不要替别人决定。' : undefined,
    currentPlace: placeById[resident.placeId].name,
    energy: resident.energy,
    availablePlaces: PLACES.map((place) => ({ id: place.id, name: place.name })),
    residentsLastSeen: PEOPLE.filter((person) => person.id !== id).map((person) => ({ id: person.id, name: person.name, place: placeById[world.residents[person.id].placeId].name })),
    items: world.items.map((item) => ({ id: item.id, name: item.name, placeId: item.placeId, detail: item.detail,
      owner: itemOwner(item) ? personById[itemOwner(item)!].name : null,
      editable: (!itemOwner(item) || itemOwner(item) === id) && !reservedItems.has(item.id),
    })),
    currentProject: resident.project,
    memories: resident.memory.filter((entry) => !/^与.+相遇：/.test(entry)).slice(-6),
    officialRelationships: relationshipsFrom(id).map((relation) => ({
      toId: relation.to, to: personById[relation.to].name, label: relation.label,
    })),
    sharedMoments: PEOPLE.filter((other) => social[other.id]).map((other) => ({
      id: other.id, name: other.name, ...social[other.id],
    })),
    receivedInvitations: missedInvitations.filter((scene) => scene.targetId === id).map((scene) => ({
      fromId: scene.actorId, from: personById[scene.actorId].name, placeId: scene.placeId, activity: scene.activity, goal: scene.goal,
    })),
    unansweredInvitations: missedInvitations.filter((scene) => scene.actorId === id).map((scene) => ({
      toId: scene.targetId, placeId: scene.placeId, activity: scene.activity,
    })),
    format: {
      placeId: '地点 ID', activity: '具体活动短标题', goal: '用本人语气写一两句刚起的念头，可以犹豫、俏皮或直接，不写任务目标',
      summary: '别人问“刚才做了什么”时，本人会随口给出的简短回答。只说做了哪件事和有意思的结果；不要复盘动作轨迹。例如凯文散步会说“在庭院散了会儿步”，不会说“我避开潮湿的石阶，走到转角活动肩背”',
      steps: ['第一段生活片段：亲手做的动作，加上当时注意到的一点事', '第二段生活片段：顺着现场变化做出的具体选择；像回忆，不像步骤清单'],
      observation: '沿用本人语气，说眼前实际变成了什么样；不替别人决定反应',
      interpretation: '本人愿意说出来的心情、疑惑或偏爱，不是总结或模型内部推理',
      quote: '此刻可能脱口而出的一句话，不复述 goal', next: '本人语气说起下次可能做的事，不写项目计划书',
      effort: 'rest/light/focus', targetId: '想接触的居民 ID 或 null',
      ...(world.slot === 3 ? { dinner: { attend: '是否参加今晚的共同晚饭，true 或 false', reason: '自己想来或缺席的简短理由，不替别人做决定' } } : {}),
      object: { id: '已有物品 ID；新物品用 null', name: '物品名称', detail: '行动结束后可见状态' },
      project: { title: '跨时段项目名', note: '当前进展', next: '下一步' },
    },
    rules: [
      'object 和 project 都可以是 null；普通活动不必硬给物品或项目留痕。object 每次最多创建或改变一件；只可改所选地点且 editable 为 true 的物品。别人的私人物品可以看、可以询问，但不能代替主人移动或改写。',
      'targetId 可以是 null；它表示有意接触对方，若这时段没碰上会留下一条简短邀约。对方上一时段的位置不保证仍准确。',
      ...(world.slot === 3 ? ['dinner 是夜晚必填的独立决定。晚饭发生在本次个人行动之后，不改变本次行动的地点；有理由就可以缺席，不要因为想凑齐人数而勉强自己。'] : []),
      '持续项目要沿用已有标题，除非确实开始一件新事；未推进可填 null。',
      'goal、summary、steps、observation、interpretation、quote、next 都是本人讲今天的事；字段名只是存档结构，不是写作提纲。每段都带自己的节奏和注意点，不可只让 quote 像本人。自然用第一人称，但别让每句都以“我”开头，也不要照抄 soul 的示例句。',
      'summary 控制在一小句，像回答朋友，不写“我来到、我看见、我避开”这样的过程，也不写目的、方法、结果三段式。只保留这件事最值得提的一点；细节交给 steps。',
      'steps 是连续的两三段生活片段，不要用“首先、接着、最后”列操作，也不要用“为了确保、经过检查、达到了目标”做报告。写动作发生时的手感、停顿或临时决定，普通日常不写实验目的、方法、结果、结论。',
      '同一项检查、限制或物品状态只在叙事中说一次；object.detail 会单独保存客观结果，不要让 goal、steps、observation 轮流复述它。',
      'observation 要保留实际发生的具体细节，可写感官感受，但不要把推测写成事实；只有角色确实在做实验时才写必要的实验记录。interpretation 是愿意说出的心情或想法，不是模型内部推理。',
    ],
  });
  return {
    system: `${system}\n让读者从 goal、summary 和 steps 就认出${person.name}，不要等到 quote 才出现角色声音；情境样例只示范反应方式，不能照抄或让每一轮重演。动作必须具体，叙述可以轻快、停顿或改主意，按这个人的语气来。object.detail、project.note 等供世界状态使用的字段则客观描述。`,
    user,
  };
}

export async function chooseIntent(world: World, id: PersonId, signal: AbortSignal): Promise<Intent> {
  const { system, user } = actionPrompt(world, id);
  const reservedItems = new Set(Object.values(world.pending).map((intent) => intent?.object?.id).filter((itemId): itemId is string => !!itemId));
  let error: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (signal.aborted) throw new DOMException('已暂停', 'AbortError');
    try {
      const value = await chat(system, attempt ? `${user}\n上次输出不合格式：${error?.message}。请修正 JSON。` : user, signal);
      const parsed = intentSchema.parse(value);
      if (world.slot === 3 && !parsed.dinner) throw new Error('夜晚缺少晚饭决定');
      if (!PLACES.some((place) => place.id === parsed.placeId)) throw new Error('地点不存在');
      if (parsed.targetId !== null && (!PEOPLE.some((person) => person.id === parsed.targetId) || parsed.targetId === id)) throw new Error('邀请对象不存在');
      if (parsed.object?.id) {
        const item = world.items.find((entry) => entry.id === parsed.object?.id);
        if (!item || item.placeId !== parsed.placeId) throw new Error('物品不在选择的地点');
        if (itemOwner(item) && itemOwner(item) !== id) throw new Error('这是别人的私人物品，不能代替主人改动');
        if (reservedItems.has(item.id)) throw new Error('这件物品在本时段已被占用');
      }
      return parsed as Intent;
    } catch (caught) {
      if (signal.aborted) throw caught;
      error = caught instanceof Error ? caught : new Error('模型输出无效');
    }
  }
  throw new Error(`${personById[id].name}暂时无法完成行动：${error?.message}`);
}

export async function createEncounters(world: World, signal: AbortSignal): Promise<EncounterScene[]> {
  const groups = new Map<PlaceId, PersonId[]>();
  for (const person of PEOPLE) {
    const place = world.pending[person.id]?.placeId;
    if (!place) continue;
    groups.set(place, [...(groups.get(place) ?? []), person.id]);
  }
  const scenes: EncounterScene[] = [];
  for (const [placeId, ids] of groups) {
    if (ids.length < 2) continue;
    const intents = ids.map((id) => {
      const social = socialFor(world, id);
      return {
        id, name: personById[id].name,
        soul: {
          relationships: SOULS[id].relationships,
          voice: SOULS[id].voice,
          moments: SOULS[id].moments,
          boundaries: SOULS[id].boundaries,
        },
        officialRelationships: relationshipsFrom(id).filter((relation) => ids.includes(relation.to)).map((relation) => ({ toId: relation.to, label: relation.label })),
        sharedMoments: ids.filter((otherId) => otherId !== id && social[otherId]).map((otherId) => ({ withId: otherId, ...social[otherId] })),
        ...world.pending[id],
      };
    });
    try {
      const value = await chat(
        '你写一段轻松的庭院偶遇。官方关系标签有方向，是开口方式的起点；共同经历比标签更接近当前关系。情境说法只示范声音，不照抄台词。若双方在场且有人以 targetId 主动邀约，优先写出对方的明确回应，允许拒绝或改约。两人的独立行动发生在同一时段，不要合并成共同完成的行动；只写彼此真的能听见的对话，不另写现场结论，不推断物品的最终状态，不强迫任何人接受邀请，不制造战争或痛苦。至少让两位不同居民发话。只返回 JSON 对象。',
        JSON.stringify({ place: placeById[placeId].name, time: SLOTS[world.slot], people: intents, format: { title: '短标题', lines: [{ actorId: ids[0], text: '一句话' }, { actorId: ids[1], text: '一句回应' }] } }),
        signal,
      );
      const parsed = encounterSchema.parse(value);
      const speakers = [...new Set(parsed.lines.map((line) => line.actorId))];
      if (speakers.length < 2 || speakers.some((speaker) => !ids.includes(speaker as PersonId))) continue;
      scenes.push({ kind: 'encounter', id: `encounter-${world.day}-${world.slot}-${placeId}`, day: world.day, slot: world.slot, placeId, actorIds: speakers as PersonId[], title: parsed.title, lines: parsed.lines as EncounterScene['lines'] });
    } catch (error) {
      if (signal.aborted) throw error;
      // Solo actions still resolve if a conversational flourish fails.
    }
  }
  return scenes;
}

export async function createDinner(world: World, encounters: EncounterScene[], signal: AbortSignal): Promise<DinnerScene> {
  if (world.slot !== 3) throw new Error('共同晚饭只能在夜晚生成');
  const attendees = PEOPLE.filter((person) => world.pending[person.id]?.dinner?.attend !== false).map((person) => person.id);
  const absentees = PEOPLE.filter((person) => world.pending[person.id]?.dinner?.attend === false).map((person) => ({
    actorId: person.id, reason: world.pending[person.id]!.dinner!.reason,
  }));
  const base = {
    kind: 'dinner' as const, id: `dinner-${world.day}`, day: world.day, slot: 3 as const,
    placeId: 'kitchen' as const, attendees, absentees,
  };
  if (attendees.length < 2) return { ...base, title: '今晚的餐桌', description: attendees.length ? '今晚只有一人来吃晚饭，餐桌很安静。' : '今晚大家各有安排，餐桌暂时空着。', lines: [] };
  const people = attendees.map((id) => ({
    id, name: personById[id].name, activity: world.pending[id]!.activity,
    summary: world.pending[id]!.summary, voice: SOULS[id].voice,
    relationships: relationshipsFrom(id).filter((relation) => attendees.includes(relation.to)).map((relation) => ({ toId: relation.to, label: relation.label })),
  }));
  const dayHighlights = world.scenes.filter((scene): scene is ActionScene => scene.kind === 'action' && scene.day === world.day)
    .slice(-13).map((scene) => ({ actorId: scene.actorId, summary: scene.summary || scene.activity }));
  try {
    const value = await chat(
      '写《黄金庭院》一天结束时的共同晚饭。来的人和缺席的人已由各自决定，不得更改；缺席者不能说话，也不要替他们补写心思。写一段有来有往的真实餐桌对话；三人以上到场时至少三人发话，只有两人时双方发话，允许其他安静的人只听不说。话题从今天真实发生的小事自然引出，彼此可以回应、打趣、岔开话题，别按名单轮流汇报，也别把所有人都写成同一种声线。只使用已提供的物品和事实，不编造做好的菜、实验结果或关系进展。描述餐桌的场面，不写分析或总结。只返回 JSON 对象。',
      JSON.stringify({ day: world.day, attendees: people, absentees: absentees.map((entry) => ({ name: personById[entry.actorId].name, reason: entry.reason })),
        dayHighlights, tonight: encounters.map((scene) => ({ place: placeById[scene.placeId].name, lines: scene.lines })),
        kitchenItems: world.items.filter((item) => item.placeId === 'kitchen').map((item) => ({ name: item.name, detail: item.detail })),
        tonightKitchenChanges: PEOPLE.flatMap((person) => { const intent = world.pending[person.id]; return intent?.placeId === 'kitchen' && intent.object ? [{ actorId: person.id, name: intent.object.name, detail: intent.object.detail }] : []; }),
        format: { title: '这顿饭的短标题', description: '两句以内的餐桌场面', lines: [{ actorId: attendees[0], text: '角色说的一句话' }] },
      }), signal,
    );
    const parsed = dinnerSchema.parse(value);
    const speakers = new Set(parsed.lines.map((line) => line.actorId));
    if ([...speakers].some((id) => !attendees.includes(id as PersonId)) || speakers.size < Math.min(3, attendees.length)) throw new Error('晚餐对话人物不符');
    return { ...base, ...parsed, lines: parsed.lines as DinnerScene['lines'] };
  } catch (error) {
    if (signal.aborted) throw error;
    return { ...base, title: '今晚的餐桌', description: '晚餐时谁来了、谁缺席了都有记录；席间对话暂时没有记下来。', lines: [] };
  }
}
