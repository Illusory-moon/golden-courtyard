import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, CirclePause, CookingPot, FlaskConical, Flower2, LayoutGrid, MapPin, Paintbrush, Play, RotateCcw, Settings2, Sparkles, Sun, Users, X } from 'lucide-react';
import { checkConnection, chooseIntent, clearApiSettings, createDinner, createEncounters, loadApiSettings, saveApiSettings, validateApiSettings, type ApiSettings } from './ai';
import { PEOPLE, PLACES, personById, placeById, type PersonId, type PlaceId } from './people';
import { SOULS } from './souls';
import { OFFICIAL_RELATIONSHIP_SOURCE, relationshipsFrom } from './relationships';
import { applyPhase, createWorld, isWorld, itemOwner, socialFor, SLOTS, type ActionScene, type EncounterScene, type Scene, type World } from './world';

const STORAGE_KEY = 'golden-courtyard.world.v1';
const useLocalPortraits = import.meta.env?.MODE !== 'public' && import.meta.env?.VITE_COURTYARD_LOCAL_PORTRAITS === 'true';
type PendingScene = Pick<ActionScene, 'id' | 'day' | 'slot' | 'actorId' | 'placeId' | 'activity' | 'goal'> & { kind: 'pending' };

function loadWorld(): World {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isWorld(parsed)) return parsed;
    }
  } catch { /* A damaged local draft starts a fresh courtyard. */ }
  return createWorld();
}

function timeLabel(day: number, slot: number): string {
  return `第 ${day} 天 · ${SLOTS[slot]}`;
}

function speakersFor(scene: EncounterScene): string {
  return [...new Set(scene.lines.map((line) => line.actorId))].map((id) => personById[id].name).join('、');
}

function PlaceIcon({ id, size = 20 }: { id: PlaceId; size?: number }) {
  if (id === 'lab') return <FlaskConical size={size} strokeWidth={1.7} />;
  if (id === 'lounge') return <BookOpen size={size} strokeWidth={1.7} />;
  if (id === 'garden') return <Sun size={size} strokeWidth={1.7} />;
  if (id === 'hall') return <Sparkles size={size} strokeWidth={1.7} />;
  if (id === 'kitchen') return <CookingPot size={size} strokeWidth={1.7} />;
  return <Paintbrush size={size} strokeWidth={1.7} />;
}

function Portrait({ id, size = 'regular' }: { id: PersonId; size?: 'small' | 'regular' | 'large' }) {
  const person = personById[id];
  return <span className={`portrait portrait-${size}`} style={{ '--portrait': person.color } as React.CSSProperties} title={person.name}>{useLocalPortraits ? <img src={`/portraits/${id}-er.png`} alt={person.name} /> : person.mark}</span>;
}

function CourtyardScene({ world, selectedPlace, onPlace, onPerson }: {
  world: World;
  selectedPlace: PlaceId | null;
  onPlace: (id: PlaceId) => void;
  onPerson: (id: PersonId) => void;
}) {
  return <div className="courtyard-scene" aria-label="庭院二维场景，上次记录的位置">
    {PLACES.map((place) => {
      const occupants = PEOPLE.filter((person) => world.residents[person.id].placeId === place.id);
      return <section className={`scene-place scene-place-${place.id} ${selectedPlace === place.id ? 'scene-place-selected' : ''}`} key={place.id}>
        <button className="scene-place-label" onClick={() => onPlace(place.id)} aria-pressed={selectedPlace === place.id} title={`筛选${place.name}的物品和事件`}><PlaceIcon id={place.id} size={16} />{place.name}<span>{occupants.length}</span></button>
        <span className="scene-place-decor" aria-hidden="true"><PlaceIcon id={place.id} size={43} /></span>
        <div className={`scene-residents ${occupants.length > 6 ? 'scene-residents-crowded' : ''}`}>{occupants.map((person) => <button className="scene-resident" key={person.id} onClick={() => onPerson(person.id)} title={`打开${person.name}档案`}>{useLocalPortraits ? <img src={`/portraits/${person.id}-er.png`} alt="" /> : <span className="scene-resident-mark" style={{ '--portrait': person.color } as React.CSSProperties} aria-hidden="true">{person.mark}</span>}<span>{person.name}</span></button>)}</div>
      </section>;
    })}
  </div>;
}

export function SceneDetail({ scene, onClose }: { scene: Scene | PendingScene; onClose: () => void }) {
  const place = placeById[scene.placeId];
  return <div className="dialog-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <article className="scene-dialog" role="dialog" aria-modal="true" aria-labelledby="scene-title">
      <div className="dialog-topline"><span>{timeLabel(scene.day, scene.slot)} · {place.name}</span><button className="icon-button" onClick={onClose} title="关闭" aria-label="关闭"><X size={19} /></button></div>
      {scene.kind === 'dinner' ? <>
        <div className="scene-owner"><span className="encounter-mark"><CookingPot size={23} /></span><div><span className="eyebrow">一天的收尾 · 共同晚饭</span><h2 id="scene-title">{scene.title}</h2></div></div>
        <p className="person-nature">{scene.description}</p>
        <section className="detail-section"><h3>今晚到场 · {scene.attendees.length} 人</h3><div className="dinner-guests">{scene.attendees.length ? scene.attendees.map((id) => <span key={id}><Portrait id={id} size="small" />{personById[id].name}</span>) : <p>今晚无人到场。</p>}</div></section>
        <section className="detail-section"><h3>没有来 · {scene.absentees.length} 人</h3>{scene.absentees.length ? <div className="dinner-absences">{scene.absentees.map(({ actorId, reason }) => <p key={actorId}><strong>{personById[actorId].name}</strong> · {reason}</p>)}</div> : <p>大家都来了。</p>}</section>
        <section className="detail-section"><h3>席间聊了什么</h3>{scene.lines.length ? <div className="dialogue">{scene.lines.map((line, index) => <div className="dialogue-line" key={index}><Portrait id={line.actorId} size="small" /><div><strong>{personById[line.actorId].name}</strong><p>{line.text}</p></div></div>)}</div> : <p className="muted">这顿饭没有留下对话记录。</p>}</section>
      </> : scene.kind !== 'encounter' ? <>
        <div className="scene-owner"><Portrait id={scene.actorId} /><div><span className="eyebrow">{personById[scene.actorId].title} · {personById[scene.actorId].name}</span><h2 id="scene-title">{scene.activity}</h2></div></div>
        {scene.kind === 'pending' && <p className="pending-note">已决定 · 等待本时段结算</p>}
        <section className="detail-section"><h3>想做的事</h3><p>{scene.goal}</p></section>
        {scene.kind === 'action' && <section className="detail-section"><h3>我做了什么</h3><p>{scene.summary?.trim() || scene.activity}</p><details className="action-details"><summary>看看具体经过</summary><div className="action-story">{scene.steps.map((step, index) => <p key={index}>{step}</p>)}</div></details></section>}
        {scene.kind === 'action' && <>
          <div className="detail-pair"><section className="detail-section"><h3>后来怎样</h3><p>{scene.observation}</p></section><section className="detail-section"><h3>心里话</h3><p>{scene.interpretation}</p></section></div>
          <blockquote>“{scene.quote}”</blockquote>
          {scene.objectResult && <section className="detail-section trace"><h3>物品状态变化</h3><p>{scene.objectResult}</p></section>}
          {scene.encounterStatus === 'left-note' && <p className="detail-meta">这份邀约没有得到现场回应，留言会在下一时段送达。</p>}
          {scene.encounterStatus === 'met' && <p className="detail-meta">想见的人参与了同一时段的交谈，详情见偶遇记录。</p>}
          {scene.project && <section className="detail-section"><h3>项目进展 · {scene.project.title}</h3><p>{scene.project.note}</p></section>}
          <div className="next-step"><span>接下来</span><strong>{scene.next}</strong></div>
        </>}
      </> : <>
        <div className="scene-owner"><span className="encounter-mark"><Users size={24} /></span><div><span className="eyebrow">同地交谈</span><h2 id="scene-title">{scene.title}</h2></div></div>
        <p className="encounter-people">交谈者：{speakersFor(scene)}</p>
        <section className="detail-section"><h3>现场对话</h3><div className="dialogue">{scene.lines.map((line, index) => <div className="dialogue-line" key={index}><Portrait id={line.actorId} size="small" /><div><strong>{personById[line.actorId].name}</strong><p>{line.text}</p></div></div>)}</div></section>
      </>}
    </article>
  </div>;
}

function PersonDetail({ id, world, onClose, onScene }: { id: PersonId; world: World; onClose: () => void; onScene: (scene: Scene) => void }) {
  const person = personById[id];
  const soul = SOULS[id];
  const resident = world.residents[id];
  const social = socialFor(world, id);
  const officialRelationships = relationshipsFrom(id);
  const relatedPeople = PEOPLE.filter((other) => other.id !== id);
  const scenes = world.scenes.filter((scene) => scene.kind === 'action' ? scene.actorId === id : scene.kind === 'dinner' ? scene.attendees.includes(id) : scene.lines.some((line) => line.actorId === id)).slice(-5).reverse();
  return <div className="dialog-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <article className="person-dialog" role="dialog" aria-modal="true" aria-labelledby="person-title">
      <div className="dialog-topline"><span>庭院居民</span><button className="icon-button" onClick={onClose} title="关闭" aria-label="关闭"><X size={19} /></button></div>
      <div className="person-heading">{useLocalPortraits ? <img className="person-illustration" src={`/portraits/${id}-er.png`} alt="" /> : <span className="person-illustration person-illustration-mark" style={{ '--portrait': person.color } as React.CSSProperties} aria-hidden="true">{person.mark}</span>}<div><span className="eyebrow">{person.title}</span><h2 id="person-title">{person.name}</h2><span className="muted">上次记录位置 · {placeById[resident.placeId].name}</span></div></div>
      <p className="person-nature">{person.nature}</p>
      <section className="detail-section"><h3>此刻在意</h3><p>{person.wants}</p></section>
      {resident.project && <section className="detail-section trace"><h3>进行中的项目 · {resident.project.title}</h3><p>{resident.project.note}</p><small>项目下一步：{resident.project.next}</small></section>}
      {relatedPeople.length > 0 && <section className="detail-section relationship-section"><h3>官方关系定位与实际交谈</h3><div className="relationship-list">{relatedPeople.map((other) => {
        const official = officialRelationships.find((relation) => relation.to === other.id);
        const shared = social[other.id];
        return <div className="relationship-row" key={other.id}><Portrait id={other.id} size="small" /><div><strong>{other.name}</strong>{official && <span>官方关系定位：{official.label}</span>}{shared && <p className="shared-moment">实际交谈 {shared.meetings} 次 · {shared.last}</p>}</div></div>;
      })}</div><a href={OFFICIAL_RELATIONSHIP_SOURCE} target="_blank" rel="noreferrer">查看官方关系网</a></section>}
      <details className="soul-details"><summary>角色 soul · 完整档案</summary><div className="soul-body">{([
        ['身份核心', soul.identity], ['稳定动机', soul.motives], ['情境反应', soul.situations],
        ['关系锚点', soul.relationships], ['声音指纹', soul.voice], ['情境中的说法', soul.moments], ['演绎边界', soul.boundaries],
      ] as const).map(([title, entries]) => <section className="detail-section" key={title}><h3>{title}</h3><ul>{entries.map((entry) => <li key={entry}>{entry}</li>)}</ul></section>)}</div></details>
      <section className="detail-section"><h3>最近参与的事件</h3>{scenes.length ? <div className="mini-scenes">{scenes.map((scene) => <button key={scene.id} onClick={() => onScene(scene)}><span>{timeLabel(scene.day, scene.slot)} · {scene.kind === 'action' ? '行动' : scene.kind === 'dinner' ? '晚饭' : '对话'}</span><strong>{scene.kind === 'action' ? scene.activity : scene.title}</strong><ArrowRight size={15} /></button>)}</div> : <p className="muted">暂无记录。</p>}</section>
    </article>
  </div>;
}

export function App() {
  const [world, setWorld] = useState<World>(loadWorld);
  const worldRef = useRef(world);
  const [connection, setConnection] = useState<'checking' | 'ready' | 'offline'>('checking');
  const [model, setModel] = useState('gpt-5.6-sol');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<ApiSettings>(() => loadApiSettings() ?? { apiUrl: '', apiKey: '', model: 'gpt-5.6-sol' });
  const [settingsError, setSettingsError] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<PlaceId | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<PersonId | null>(null);
  const [selectedScene, setSelectedScene] = useState<Scene | PendingScene | null>(null);
  const [mobileTab, setMobileTab] = useState<'map' | 'events' | 'people'>('map');
  const [mapMode, setMapMode] = useState<'scene' | 'rooms'>('scene');
  const abortRef = useRef<AbortController | null>(null);

  function commit(value: World): void {
    worldRef.current = value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    setWorld(value);
  }

  useEffect(() => {
    const controller = new AbortController();
    checkConnection(controller.signal).then(({ ready, model: configuredModel }) => {
      setConnection(ready ? 'ready' : 'offline');
      if (configuredModel) setModel(configuredModel);
    }).catch(() => setConnection('offline'));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSelectedScene(null); setSelectedPerson(null); setSettingsOpen(false); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  async function advance(): Promise<void> {
    if (running || connection !== 'ready') return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setMobileTab('events');
    setError('');
    let current = worldRef.current;
    try {
      for (const [index, person] of PEOPLE.entries()) {
        if (current.pending[person.id]) continue;
        setProgress(`${SLOTS[current.slot]} · ${person.name}正在决定自己的事 · ${index + 1}/${PEOPLE.length}`);
        const intent = await chooseIntent(current, person.id, controller.signal);
        current = { ...current, pending: { ...current.pending, [person.id]: intent } };
        commit(current);
      }
      setProgress(`${SLOTS[current.slot]} · 庭院里的人正碰面`);
      const encounters = await createEncounters(current, controller.signal);
      if (current.slot === 3) setProgress('夜晚 · 大家正围坐吃晚饭');
      const dinner = current.slot === 3 ? await createDinner(current, encounters, controller.signal) : undefined;
      if (controller.signal.aborted) throw new DOMException('已暂停', 'AbortError');
      const completed = applyPhase(current, encounters, dinner);
      commit(completed);
      setSelectedScene(completed.scenes.at(-1) ?? null);
      setMobileTab('events');
      setProgress('');
    } catch (caught) {
      if (controller.signal.aborted) setProgress('已暂停。下次继续这个时段。');
      else { setError(caught instanceof Error ? caught.message : '庭院暂时无法继续'); setProgress(''); }
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  }

  function reset(): void {
    if (!window.confirm('重新开始会清除这座庭院的全部本地记录。继续吗？')) return;
    abortRef.current?.abort();
    commit(createWorld());
    setSelectedPlace(null);
    setSelectedScene(null);
    setSelectedPerson(null);
    setProgress('');
    setError('');
  }

  function saveSettings(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const validationError = validateApiSettings(settings);
    if (validationError) { setSettingsError(validationError); return; }
    saveApiSettings(settings);
    setModel(settings.model.trim());
    setConnection('ready');
    setSettingsError('');
    setSettingsOpen(false);
  }

  function useLocalSettings(): void {
    clearApiSettings();
    setSettings({ apiUrl: '', apiKey: '', model: 'gpt-5.6-sol' });
    setSettingsError('');
    setSettingsOpen(false);
    setConnection('checking');
    const controller = new AbortController();
    checkConnection(controller.signal).then(({ ready, model: configuredModel }) => {
      setConnection(ready ? 'ready' : 'offline');
      if (configuredModel) setModel(configuredModel);
    }).catch(() => setConnection('offline'));
  }

  const pendingScenes: PendingScene[] = PEOPLE.flatMap((person) => {
    const intent = world.pending[person.id];
    return intent ? [{ kind: 'pending', id: `pending-${world.day}-${world.slot}-${person.id}`, day: world.day, slot: world.slot, actorId: person.id, placeId: intent.placeId, activity: intent.activity, goal: intent.goal }] : [];
  });
  const filteredScenes = [...world.scenes, ...pendingScenes].filter((scene) => selectedPlace === null || scene.placeId === selectedPlace).slice(-35).reverse();
  const latestDay = world.slot === 0 && world.scenes.length ? world.day - 1 : world.day;
  const latestDayScenes = world.scenes.filter((scene) => scene.day === latestDay);
  const placeScenes = selectedPlace ? latestDayScenes.filter((scene) => scene.placeId === selectedPlace) : latestDayScenes;
  const pendingCount = Object.keys(world.pending).length;
  const latestActionCount = latestDayScenes.filter((scene) => scene.kind === 'action').length;
  const latestEncounterCount = latestDayScenes.filter((scene) => scene.kind === 'encounter').length;
  const latestDinnerCount = latestDayScenes.filter((scene) => scene.kind === 'dinner').length;

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-symbol"><Flower2 size={23} strokeWidth={1.6} /></span><div><span className="brand-kicker">一日物语</span><strong>黄金庭院</strong></div></div>
      <div className="clock"><span className="clock-day">DAY {String(world.day).padStart(2, '0')}</span><span className="clock-main">{SLOTS[world.slot]}</span><span className="clock-next">待生成</span></div>
      <div className="top-actions"><div className={`connection ${connection}`} title={connection === 'ready' ? 'AI 已配置 · 思考强度 low' : 'AI 未配置'}><span className="status-dot" /><span>{connection === 'ready' ? model : connection === 'checking' ? '检查中' : 'AI 未配置'}</span></div><button className="icon-button" onClick={() => { setSettingsError(''); setSettingsOpen(true); }} disabled={running} title="配置 API 地址、密钥和模型" aria-label="AI 设置"><Settings2 size={18} /></button><button className="icon-button reset-button" onClick={reset} disabled={running} title="清空本地庭院记录并重新开始" aria-label="重新开始"><RotateCcw size={18} /></button><button className="advance-button" onClick={running ? () => abortRef.current?.abort() : advance} disabled={!running && connection !== 'ready'} title={running ? '暂停当前生成，已完成的居民行动会保留' : world.slot === 3 ? '生成夜晚行动、同地对话和共同晚饭，会调用 AI' : '生成这一时段的居民行动和同地对话，会调用 AI'}>{running ? <CirclePause size={18} /> : <Play size={18} fill="currentColor" />}<span>{running ? '暂停生成' : pendingCount ? `继续${SLOTS[world.slot]}` : `生成${SLOTS[world.slot]}`}</span></button></div>
    </header>
    {(progress || error || connection === 'offline') && <div className={`notice ${error ? 'notice-error' : ''}`} role={error ? 'alert' : 'status'}>{error || progress || 'API 未配置。打开右上角设置，填写接口地址和模型。'}{running && <span className="notice-pulse" />}</div>}
    <nav className="mobile-nav" aria-label="视图"><button className={mobileTab === 'map' ? 'active' : ''} onClick={() => setMobileTab('map')}><MapPin size={17} />地图</button><button className={mobileTab === 'events' ? 'active' : ''} onClick={() => setMobileTab('events')}><BookOpen size={17} />事件</button><button className={mobileTab === 'people' ? 'active' : ''} onClick={() => setMobileTab('people')}><Users size={17} />居民</button></nav>
    <main className="workspace">
      <aside className={`people-panel mobile-${mobileTab}`}><div className="panel-heading"><div><span className="eyebrow">人物档案</span><h2>庭院居民</h2></div><span className="small-count">13 人</span></div><div className="people-list">{PEOPLE.map((person) => { const resident = world.residents[person.id]; return <button className="person-row" key={person.id} onClick={() => setSelectedPerson(person.id)}><Portrait id={person.id} /><span className="person-row-text"><strong>{person.name}</strong><small>{resident.project ? `项目：${resident.project.title}` : `上次在：${placeById[resident.placeId].name}`}</small></span><ArrowRight size={15} className="row-arrow" /></button>; })}</div></aside>
      <section className={`center-panel mobile-${mobileTab}`}><div className="world-heading"><div><span className="eyebrow">地点筛选</span><h1>庭院地图</h1></div><div className="world-heading-side"><div className="world-meta"><span><Sun size={15} /> {world.scenes.length ? `第 ${latestDay} 天 · ${latestDayScenes.length} 条记录` : '暂无事件'}</span><span><MapPin size={15} /> 上次记录位置</span></div><div className="map-switch" role="group" aria-label="地图显示方式"><button className={mapMode === 'scene' ? 'active' : ''} onClick={() => setMapMode('scene')} aria-pressed={mapMode === 'scene'}><MapPin size={14} />场景</button><button className={mapMode === 'rooms' ? 'active' : ''} onClick={() => setMapMode('rooms')} aria-pressed={mapMode === 'rooms'}><LayoutGrid size={14} />房间</button></div></div></div>
        {mapMode === 'scene' ? <CourtyardScene world={world} selectedPlace={selectedPlace} onPlace={(id) => setSelectedPlace(selectedPlace === id ? null : id)} onPerson={setSelectedPerson} /> : <div className="courtyard-map"><div className="map-grounds" aria-hidden="true"><span className="ground-tree tree-one">✿</span><span className="ground-tree tree-two">✳</span><span className="ground-path" /></div><div className="rooms-grid">{PLACES.map((place) => { const occupants = PEOPLE.filter((person) => world.residents[person.id].placeId === place.id); return <button key={place.id} className={`room room-${place.id} ${selectedPlace === place.id ? 'room-selected' : ''}`} onClick={() => setSelectedPlace(selectedPlace === place.id ? null : place.id)} aria-label={`${place.name}，上次在这里的居民 ${occupants.length} 人`} aria-pressed={selectedPlace === place.id}><div className="room-head"><span className="room-icon"><PlaceIcon id={place.id} /></span><span className="room-name">{place.name}</span><span className="room-count">{occupants.length} 人</span></div><div className="room-art" aria-hidden="true">{occupants.length ? occupants.slice(0, 3).map((person) => useLocalPortraits ? <img className="room-figure" key={person.id} src={`/portraits/${person.id}-er.png`} alt="" /> : <span className="room-figure room-figure-mark" key={person.id} style={{ '--portrait': person.color } as React.CSSProperties}>{person.mark}</span>) : <PlaceIcon id={place.id} size={44} />}</div><div className="room-people">{occupants.length ? occupants.map((person) => person.name).join("、") : "暂时无人"}</div></button>; })}</div></div>}
        <div className="place-strip"><div className="place-strip-heading"><div><span className="eyebrow">{selectedPlace ? '物品与事件' : '行动与对话'}</span><h2>{selectedPlace ? `${placeById[selectedPlace].name} · 物品记录` : `第 ${latestDay} 天 · 已发生`}</h2></div>{selectedPlace && <button className="text-button" onClick={() => setSelectedPlace(null)}>清除地点筛选</button>}</div>{selectedPlace ? <><div className="place-items">{world.items.filter((item) => item.placeId === selectedPlace).map((item) => <div className="place-item" key={item.id}><span className="item-pin" /><div><strong>{item.name}</strong><p>{item.detail}</p>{(itemOwner(item) || item.updatedBy) && <small>{itemOwner(item) && `归属：${personById[itemOwner(item)!].name}`}{itemOwner(item) && item.updatedBy && ' · '}{item.updatedBy && `最后写入：${personById[item.updatedBy].name}`}</small>}</div></div>)}</div><div className="place-last">{placeScenes.length ? <button onClick={() => setSelectedScene(placeScenes.at(-1)!)}>查看最近事件：{placeScenes.at(-1)?.kind === 'action' ? (placeScenes.at(-1) as ActionScene).activity : (placeScenes.at(-1) as { title: string }).title}<ArrowRight size={15} /></button> : <span className="muted">这里暂无事件记录。</span>}</div></> : <div className="day-summary">{placeScenes.length ? <><p>个人行动 {latestActionCount} 条 · 现场对话 {latestEncounterCount} 条{latestDinnerCount ? ` · 共同晚饭 ${latestDinnerCount} 场` : ''}</p><button onClick={() => setSelectedScene(placeScenes.at(-1)!)}>查看最近事件 <ArrowRight size={15} /></button></> : <p>尚未生成事件。</p>}</div>}</div>
      </section>
      <aside className={`events-panel mobile-${mobileTab}`}><div className="panel-heading"><div><span className="eyebrow">实时与历史</span><h2>事件记录</h2></div><span className="small-count">显示 {filteredScenes.length} 条</span></div><div className="event-filter">{selectedPlace ? <span><MapPin size={13} />{placeById[selectedPlace].name}<button onClick={() => setSelectedPlace(null)} title="清除地点筛选" aria-label="清除地点筛选"><X size={13} /></button></span> : <span>全部地点</span>}</div><div className="event-list">{filteredScenes.length ? filteredScenes.map((scene) => <button className={`event-row ${scene.kind === 'dinner' ? 'event-row-dinner' : ''}`} key={scene.id} onClick={() => setSelectedScene(scene)}><div className="event-row-top"><span>{timeLabel(scene.day, scene.slot)}</span><span>{placeById[scene.placeId].name}</span></div><div className="event-row-main">{scene.kind === 'action' || scene.kind === 'pending' ? <Portrait id={scene.actorId} size="small" /> : <span className="event-encounter">{scene.kind === 'dinner' ? <CookingPot size={16} /> : <Users size={16} />}</span>}<div><span className={`event-kind ${scene.kind === 'pending' ? 'event-pending' : ''}`}>{scene.kind === 'pending' ? '已决定 · 待结算' : scene.kind === 'action' ? '个人行动' : scene.kind === 'dinner' ? '共同晚饭' : '现场对话'}</span><strong>{scene.kind === 'action' || scene.kind === 'pending' ? scene.activity : scene.title}</strong><p>{scene.kind === 'pending' ? `${personById[scene.actorId].name} · ${scene.goal}` : scene.kind === 'action' ? `${personById[scene.actorId].name} · ${scene.summary?.trim() || scene.activity}` : scene.kind === 'dinner' ? `到场 ${scene.attendees.length} 人 · 缺席 ${scene.absentees.length} 人${scene.lines[0] ? ` · ${personById[scene.lines[0].actorId].name}：${scene.lines[0].text}` : ''}` : `${speakersFor(scene)} · ${scene.lines[0]?.text ?? ''}`}</p></div></div></button>) : <div className="empty-events"><BookOpen size={27} strokeWidth={1.4} /><strong>暂无事件记录</strong><span>生成一个时段后会出现记录。</span></div>}</div></aside>
    </main>
    <footer className="app-footer"><span>黄金庭院 · 非商业同人实验 · {useLocalPortraits ? <a href="https://honkaiimpact3.fandom.com/wiki/Honkai_Impact_3_Wiki" target="_blank" rel="noreferrer">角色图像资料来源</a> : '印象符号代替官方头像，避免再分发原图'}</span><span>手动推进 · {model} · low</span></footer>
    {selectedScene && <SceneDetail scene={selectedScene} onClose={() => setSelectedScene(null)} />}
    {selectedPerson && !selectedScene && <PersonDetail id={selectedPerson} world={world} onClose={() => setSelectedPerson(null)} onScene={(scene) => setSelectedScene(scene)} />}
    {settingsOpen && <div className="dialog-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}><form className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onSubmit={saveSettings}><div className="dialog-topline"><span>连接设置</span><button className="icon-button" type="button" onClick={() => setSettingsOpen(false)} title="关闭" aria-label="关闭"><X size={19} /></button></div><h2 id="settings-title">AI 接口</h2><label>API 地址<input type="url" value={settings.apiUrl} onChange={(event) => setSettings({ ...settings, apiUrl: event.target.value })} placeholder="https://example.com/v1" required /></label><label>API 密钥<input type="password" value={settings.apiKey} onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })} autoComplete="off" placeholder="本机无密钥接口可留空" /></label><label>模型<input value={settings.model} onChange={(event) => setSettings({ ...settings, model: event.target.value })} placeholder="模型 ID" required /></label><p className="settings-hint">使用 OpenAI 兼容 Responses API，思考强度为 low。密钥仅保存在当前浏览器会话，生成时发送给你填写的接口。</p>{settingsError && <p className="settings-error" role="alert">{settingsError}</p>}<div className="settings-actions">{import.meta.env?.DEV && <button type="button" onClick={useLocalSettings}>使用本机配置</button>}<button className="advance-button" type="submit">保存设置</button></div></form></div>}
  </div>;
}
