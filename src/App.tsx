import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, BookOpen, CirclePause, CookingPot, Download, FlaskConical, Flower2, LayoutGrid, MapPin, MoveRight, Network, Paintbrush, Play, RotateCcw, Settings2, Sparkles, Sun, Upload, Users, X } from 'lucide-react';
import { askResident, checkConnection, chooseIntent, clearApiSettings, createDinner, createEncounters, loadApiSettings, saveApiSettings, validateApiSettings, type ApiSettings } from './ai';
import { PEOPLE, PLACES, personById, placeById, type PersonId, type PlaceId } from './people';
import { SOULS } from './souls';
import { OFFICIAL_RELATIONSHIP_SOURCE, relationshipsFrom } from './relationships';
import { DEFAULT_MODEL } from './upstream';
import { yearbook } from './yearbook';
import { activeBranch, branches, openWorld, readRawWorld, rememberBranch, selectBranch, writeWorld } from './storage';
import { applyPhase, canMoveItem, createWorld, currentWant, dayHighlights, forkWorldAtDay, isWorld, itemOwner, moveItem, sanitizeWorld, sharedEventFor, socialFor, SLOTS, worldAtDay, type ActionScene, type EncounterScene, type ResidentQuestion, type Scene, type World } from './world';

const useLocalPortraits = import.meta.env?.MODE !== 'public' && import.meta.env?.VITE_COURTYARD_LOCAL_PORTRAITS === 'true';
const portraitUrl = (id: PersonId) => `${import.meta.env.BASE_URL}portraits/${id}-er.png`;
type PendingScene = Pick<ActionScene, 'id' | 'day' | 'slot' | 'actorId' | 'placeId' | 'activity' | 'goal'> & { kind: 'pending' };

function timeLabel(day: number, slot: number): string {
  return `第 ${day} 天 · ${SLOTS[slot]}`;
}

function speakersFor(scene: EncounterScene): string {
  return [...new Set(scene.lines.map((line) => line.actorId))].map((id) => personById[id].name).join('、');
}

function Modal({ className, labelId, onClose, children }: { className: string; labelId: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);
  return <dialog ref={ref} className={`native-modal ${className}`} aria-labelledby={labelId} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.target === event.currentTarget && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) onClose();
  }}>{children}</dialog>;
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
  return <span className={`portrait portrait-${size}`} style={{ '--portrait': person.color } as React.CSSProperties} title={person.name}>{useLocalPortraits ? <img src={portraitUrl(id)} alt={person.name} /> : person.mark}</span>;
}

function CourtyardScene({ world, selectedPlace, onPlace, onPerson, showItems }: {
  world: World;
  selectedPlace: PlaceId | null;
  onPlace: (id: PlaceId) => void;
  onPerson: (id: PersonId) => void;
  showItems: boolean;
}) {
  return <div className="courtyard-scene" aria-label={`庭院二维场景，${showItems ? '上次记录' : '当天结束'}的位置`}>
    {PLACES.map((place) => {
      const occupants = PEOPLE.filter((person) => world.residents[person.id].placeId === place.id);
      return <section className={`scene-place scene-place-${place.id} ${selectedPlace === place.id ? 'scene-place-selected' : ''}`} key={place.id}>
        <button className="scene-place-label" onClick={() => onPlace(place.id)} aria-pressed={selectedPlace === place.id} title={`筛选${place.name}${showItems ? '的物品和事件' : '当天的事件'}`}><PlaceIcon id={place.id} size={16} />{place.name}<span>{occupants.length}</span></button>
        <span className="scene-place-decor" aria-hidden="true"><PlaceIcon id={place.id} size={43} /></span>
        <div className={`scene-residents ${occupants.length > 6 ? 'scene-residents-crowded' : ''}`}>{occupants.map((person) => <button className="scene-resident" key={person.id} onClick={() => onPerson(person.id)} title={`打开${person.name}档案`}>{useLocalPortraits ? <img src={portraitUrl(person.id)} alt="" /> : <span className="scene-resident-mark" style={{ '--portrait': person.color } as React.CSSProperties} aria-hidden="true">{person.mark}</span>}<span>{person.name}</span></button>)}</div>
        {showItems && <div className="scene-items" aria-label={`${place.name}的物品`}>{world.items.filter((item) => item.placeId === place.id).slice(0, 4).map((item) => <button key={item.id} onClick={() => onPlace(place.id)} title={`${item.name}：${item.detail}`}>{item.name}</button>)}</div>}
      </section>;
    })}
  </div>;
}

export function SceneDetail({ scene, onClose, questions = [], remainingQuestions = 0, asking = false, onAsk }: { scene: Scene | PendingScene; onClose: () => void; questions?: ResidentQuestion[]; remainingQuestions?: number; asking?: boolean; onAsk?: (question: string) => Promise<void> }) {
  const place = placeById[scene.placeId];
  const [questionDraft, setQuestionDraft] = useState('');
  const [askError, setAskError] = useState('');
  return <Modal className="scene-dialog" labelId="scene-title" onClose={onClose}>
      <div className="dialog-topline"><span>{timeLabel(scene.day, scene.slot)} · {place.name}</span><button className="icon-button" onClick={onClose} title="关闭" aria-label="关闭"><X size={19} /></button></div>
      {scene.kind === 'event' ? <>
        <div className="scene-owner"><span className="encounter-mark"><Sparkles size={23} /></span><div><span className="eyebrow">庭院共同事件</span><h2 id="scene-title">{scene.title}</h2></div></div>
        <p className="person-nature">{scene.description}</p>
      </> : scene.kind === 'dinner' ? <>
        <div className="scene-owner"><span className="encounter-mark"><CookingPot size={23} /></span><div><span className="eyebrow">一天的收尾 · 共同晚饭</span><h2 id="scene-title">{scene.title}</h2></div></div>
        <p className="person-nature">{scene.description}</p>
        <section className="detail-section"><h3>今晚到场 · {scene.attendees.length} 人</h3><div className="dinner-guests">{scene.attendees.length ? scene.attendees.map((id) => <span key={id}><Portrait id={id} size="small" />{personById[id].name}</span>) : <p>今晚无人到场。</p>}</div></section>
        <section className="detail-section"><h3>没有来 · {scene.absentees.length} 人</h3>{scene.absentees.length ? <div className="dinner-absences">{scene.absentees.map(({ actorId, reason }) => <p key={actorId}><strong>{personById[actorId].name}</strong> · {reason}</p>)}</div> : <p>大家都来了。</p>}</section>
        <section className="detail-section"><h3>席间聊了什么</h3>{scene.lines.length ? <div className="dialogue">{scene.lines.map((line, index) => <div className="dialogue-line" key={index}><Portrait id={line.actorId} size="small" /><div><strong>{personById[line.actorId].name}</strong><p>{line.text}</p></div></div>)}</div> : <p className="muted">这顿饭没有留下对话记录。</p>}</section>
      </> : scene.kind !== 'encounter' ? <>
        <div className="scene-owner"><Portrait id={scene.actorId} /><div><span className="eyebrow">{personById[scene.actorId].title} · {personById[scene.actorId].name}</span><h2 id="scene-title">{scene.activity}</h2></div></div>
        {scene.kind === 'pending' && <p className="pending-note">已决定 · 等待本时段结算</p>}
        {(scene.kind === 'pending' || !scene.form || scene.form === 'diary') && !!scene.goal && <section className="detail-section"><h3>想做的事</h3><p>{scene.goal}</p></section>}
        {scene.kind === 'action' && <section className="detail-section"><h3>{scene.form === 'note' ? '留下的便条' : scene.form === 'log' ? '今日记录' : scene.form === 'silence' ? '这一刻' : '我做了什么'}</h3><p>{scene.summary?.trim() || scene.activity}</p>{scene.steps.length > 0 && <details className="action-details"><summary>看看具体经过</summary><div className="action-story">{scene.steps.map((step, index) => <p key={index}>{step}</p>)}</div></details>}</section>}
        {scene.kind === 'action' && (!scene.form || scene.form === 'diary') && <>
          <div className="detail-pair">{scene.observation && <section className="detail-section"><h3>后来怎样</h3><p>{scene.observation}</p></section>}{scene.interpretation && <section className="detail-section"><h3>心里话</h3><p>{scene.interpretation}</p></section>}</div>
          {scene.quote && <blockquote>“{scene.quote}”</blockquote>}
        </>}
        {scene.kind === 'action' && scene.form === 'note' && scene.quote && <blockquote>“{scene.quote}”</blockquote>}
        {scene.kind === 'action' && scene.form === 'log' && scene.observation && <section className="detail-section"><h3>结果</h3><p>{scene.observation}</p></section>}
        {scene.kind === 'action' && <>
          {scene.objectResult && <section className="detail-section trace"><h3>物品记录</h3><p>{scene.objectResult}</p></section>}
          {scene.encounterStatus === 'left-note' && <p className="detail-meta">这份邀约没有得到现场回应，留言会在下一时段送达。</p>}
          {scene.encounterStatus === 'met' && <p className="detail-meta">想见的人参与了同一时段的交谈，详情见偶遇记录。</p>}
          {scene.project && <section className="detail-section"><h3>项目进展 · {scene.project.title}</h3><p>{scene.project.note}</p></section>}
          {scene.next && <div className="next-step"><span>接下来</span><strong>{scene.next}</strong></div>}
        </>}
      </> : <>
        <div className="scene-owner"><span className="encounter-mark"><Users size={24} /></span><div><span className="eyebrow">同地交谈</span><h2 id="scene-title">{scene.title}</h2></div></div>
        <p className="encounter-people">交谈者：{speakersFor(scene)}</p>
        <section className="detail-section"><h3>现场对话</h3><div className="dialogue">{scene.lines.map((line, index) => <div className="dialogue-line" key={index}><Portrait id={line.actorId} size="small" /><div><strong>{personById[line.actorId].name}</strong><p>{line.text}</p></div></div>)}</div></section>
      </>}
      {scene.kind === 'action' && onAsk && <section className="detail-section ask-section"><h3>追问本人</h3>{questions.map((entry, index) => <div className="answer-record" key={index}><strong>问：{entry.question}</strong><p>{entry.answer}</p></div>)}<form onSubmit={(event) => { event.preventDefault(); if (!questionDraft.trim()) return; setAskError(''); void onAsk(questionDraft.trim()).then(() => setQuestionDraft('')).catch((caught) => setAskError(caught instanceof Error ? caught.message : '追问失败。')); }}><label htmlFor="resident-question">你的问题</label><div><input id="resident-question" value={questionDraft} onChange={(event) => setQuestionDraft(event.target.value)} maxLength={120} placeholder="今天为什么没去吃饭？" disabled={asking || remainingQuestions === 0} /><button type="submit" disabled={asking || remainingQuestions === 0 || !questionDraft.trim()}>{asking ? '等待回答' : '追问'}</button></div></form><small>今天还可追问 {remainingQuestions} 次；提交后会调用 AI。</small>{askError && <p className="settings-error" role="alert">{askError}</p>}</section>}
  </Modal>;
}

function PersonDetail({ id, world, onClose, onScene }: { id: PersonId; world: World; onClose: () => void; onScene: (scene: Scene) => void }) {
  const person = personById[id];
  const soul = SOULS[id];
  const resident = world.residents[id];
  const social = socialFor(world, id);
  const officialRelationships = relationshipsFrom(id);
  const relatedPeople = PEOPLE.filter((other) => other.id !== id);
  const scenes = world.scenes.filter((scene) => scene.kind === 'action' ? scene.actorId === id : scene.kind === 'dinner' ? scene.attendees.includes(id) : scene.kind === 'encounter' && scene.lines.some((line) => line.actorId === id)).slice(-5).reverse();
  return <Modal className="person-dialog" labelId="person-title" onClose={onClose}>
      <div className="dialog-topline"><span>庭院居民 · 当前档案</span><button className="icon-button" onClick={onClose} title="关闭" aria-label="关闭"><X size={19} /></button></div>
      <div className="person-heading">{useLocalPortraits ? <img className="person-illustration" src={portraitUrl(id)} alt="" /> : <span className="person-illustration person-illustration-mark" style={{ '--portrait': person.color } as React.CSSProperties} aria-hidden="true">{person.mark}</span>}<div><span className="eyebrow">{person.title}</span><h2 id="person-title">{person.name}</h2><span className="muted">上次记录位置 · {placeById[resident.placeId].name}</span></div></div>
      <p className="person-nature">{person.nature}</p>
      <section className="detail-section"><h3>此刻在意</h3><p>{currentWant(world, id)}</p></section>
      {resident.project && <section className="detail-section trace"><h3>进行中的项目 · {resident.project.title}</h3><p>{resident.project.note}</p><small>进度 {resident.project.stage ?? 0}/3 · 接下来：{resident.project.next}</small></section>}
      {!!resident.longMemory?.length && <section className="detail-section"><h3>一直记得</h3><ul>{resident.longMemory.map((entry) => <li key={entry}>{entry}</li>)}</ul></section>}
      {relatedPeople.length > 0 && <section className="detail-section relationship-section"><h3>官方关系定位与实际交谈</h3><div className="relationship-list">{relatedPeople.map((other) => {
        const official = officialRelationships.find((relation) => relation.to === other.id);
        const shared = social[other.id];
        return <div className="relationship-row" key={other.id}><Portrait id={other.id} size="small" /><div><strong>{other.name}</strong>{official && <span>官方关系定位：{official.label}</span>}{resident.bonds?.[other.id] && <p className="bond-note">相处后的印象：{resident.bonds[other.id]}</p>}{shared && <p className="shared-moment">实际交谈 {shared.meetings} 次 · {shared.last}</p>}</div></div>;
      })}</div><a href={OFFICIAL_RELATIONSHIP_SOURCE} target="_blank" rel="noreferrer">查看官方关系网</a></section>}
      <details className="soul-details"><summary>角色 soul · 完整档案</summary><div className="soul-body">{([
        ['身份核心', soul.identity], ['稳定动机', soul.motives], ['情境反应', soul.situations],
        ['关系锚点', soul.relationships], ['声音指纹', soul.voice], ['情境中的说法', soul.moments], ['演绎边界', soul.boundaries],
      ] as const).map(([title, entries]) => <section className="detail-section" key={title}><h3>{title}</h3><ul>{entries.map((entry) => <li key={entry}>{entry}</li>)}</ul></section>)}</div></details>
      <section className="detail-section"><h3>最近参与的事件</h3>{scenes.length ? <div className="mini-scenes">{scenes.map((scene) => <button key={scene.id} onClick={() => onScene(scene)}><span>{timeLabel(scene.day, scene.slot)} · {scene.kind === 'action' ? '行动' : scene.kind === 'dinner' ? '晚饭' : '对话'}</span><strong>{scene.kind === 'action' ? scene.activity : scene.title}</strong><ArrowRight size={15} /></button>)}</div> : <p className="muted">暂无记录。</p>}</section>
  </Modal>;
}

function RelationshipMap({ world, onClose }: { world: World; onClose: () => void }) {
  const [from, setFrom] = useState<PersonId>('elysia');
  const [to, setTo] = useState<PersonId>('mobius');
  const others = PEOPLE.filter((person) => person.id !== from);
  const social = socialFor(world, from);
  const relation = relationshipsFrom(from).find((entry) => entry.to === to);
  const reverse = relationshipsFrom(to).find((entry) => entry.to === from);
  return <Modal className="relationship-dialog" labelId="relationship-title" onClose={onClose}>
      <div className="dialog-topline"><span>十三英桀 · 关系视图</span><button className="icon-button" onClick={onClose} title="关闭" aria-label="关闭"><X size={19} /></button></div>
      <div className="relationship-heading"><h2 id="relationship-title">双向关系</h2><label>中心人物 <select value={from} onChange={(event) => { const id = event.target.value as PersonId; setFrom(id); if (id === to) setTo(from); }}>{PEOPLE.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label></div>
      <div className="relationship-graph" aria-label={`${personById[from].name}与其他居民的关系`}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{others.map((person, index) => {
          const angle = 2 * Math.PI * index / others.length - Math.PI / 2;
          return <line key={person.id} x1="50" y1="50" x2={50 + 39 * Math.cos(angle)} y2={50 + 39 * Math.sin(angle)} stroke={person.id === to ? '#a85c80' : '#cbb4bf'} strokeWidth={person.id === to ? 0.7 + Math.min(1.2, (social[person.id]?.meetings ?? 0) * 0.15) : 0.3 + Math.min(0.8, (social[person.id]?.meetings ?? 0) * 0.12)} />;
        })}</svg>
        <div className="relationship-center"><Portrait id={from} /><strong>{personById[from].name}</strong></div>
        {others.map((person, index) => {
          const angle = 2 * Math.PI * index / others.length - Math.PI / 2;
          return <button key={person.id} className={`relationship-node ${to === person.id ? 'selected' : ''}`} style={{ left: `${50 + 39 * Math.cos(angle)}%`, top: `${50 + 39 * Math.sin(angle)}%` }} onClick={() => setTo(person.id)} aria-pressed={to === person.id} title={`查看与${person.name}的双向关系`}><Portrait id={person.id} size="small" /><span>{person.name}</span></button>;
        })}
      </div>
      <div className="relationship-pair"><p><strong>{personById[from].name} → {personById[to].name}</strong><span>官方关系定位：{relation?.label ?? '未记录'}</span>{world.residents[from].bonds?.[to] && <em>相处后的印象：{world.residents[from].bonds[to]}</em>}</p><p><strong>{personById[to].name} → {personById[from].name}</strong><span>官方关系定位：{reverse?.label ?? '未记录'}</span>{world.residents[to].bonds?.[from] && <em>相处后的印象：{world.residents[to].bonds[from]}</em>}</p></div>
      <p className="relationship-shared">实际交谈 {social[to]?.meetings ?? 0} 次{social[to] ? ` · 最近一次：${social[to].last}` : ' · 尚无对话记录'}</p>
      <small>线条粗细只表示记录中的交谈次数，不代表亲密程度。</small>
  </Modal>;
}

export function App({ initialWorld }: { initialWorld?: World } = {}) {
  const [world, setWorld] = useState<World>(() => initialWorld ?? createWorld());
  const worldRef = useRef(world);
  const [branchId, setBranchId] = useState(activeBranch);
  const [branchList, setBranchList] = useState(branches);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const writeQueue = useRef(Promise.resolve());
  const pendingWrites = useRef(0);
  const [saving, setSaving] = useState(false);
  const [connection, setConnection] = useState<'checking' | 'ready' | 'offline'>('checking');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<ApiSettings>(() => loadApiSettings() ?? { apiUrl: '', apiKey: '', model: DEFAULT_MODEL, apiStyle: 'responses' });
  const [settingsError, setSettingsError] = useState('');
  const [running, setRunning] = useState(false);
  const [asking, setAsking] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<PlaceId | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<PersonId | null>(null);
  const [selectedScene, setSelectedScene] = useState<Scene | PendingScene | null>(null);
  const [relationsOpen, setRelationsOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'map' | 'events' | 'people'>('map');
  const [mapMode, setMapMode] = useState<'scene' | 'rooms'>('scene');
  const [viewDay, setViewDay] = useState<number | null>(null);
  const [boardDraft, setBoardDraft] = useState('');
  const [movingItemId, setMovingItemId] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<PlaceId | ''>('');
  const [moveSpot, setMoveSpot] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const askingRef = useRef(false);
  const importRef = useRef<HTMLInputElement | null>(null);

  async function commit(value: World): Promise<void> {
    pendingWrites.current += 1;
    setSaving(true);
    try {
      const write = writeQueue.current.then(() => writeWorld(branchId, value));
      writeQueue.current = write.catch(() => {});
      await write;
    } catch {
      throw new Error('本地存档写入失败，庭院尚未推进。请导出存档并检查浏览器存储空间。');
    } finally {
      pendingWrites.current -= 1;
      if (pendingWrites.current === 0) setSaving(false);
    }
    worldRef.current = value;
    setWorld(value);
  }

  function switchBranch(id: string): void {
    if (running || askingRef.current || pendingWrites.current || (!storageReady && !storageError) || id === branchId) return;
    try {
      selectBranch(id);
      setStorageReady(false);
      setStorageError(false);
      setBranchId(id);
      setSelectedPlace(null);
      setSelectedPerson(null);
      setSelectedScene(null);
      setViewDay(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : '切换庭院失败。'); }
  }

  async function forkDay(day: number): Promise<void> {
    if (running || askingRef.current || pendingWrites.current || !storageReady) return;
    try {
      const fork = forkWorldAtDay(worldRef.current, day);
      const branch = { id: crypto.randomUUID(), name: `第 ${day} 天分叉 · ${branchList.length}` };
      setSaving(true);
      await writeWorld(branch.id, fork);
      rememberBranch(branch);
      setBranchList(branches());
      switchBranch(branch.id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : '分叉失败。'); }
    finally { setSaving(false); }
  }

  function exportWorld(): void {
    downloadFile(`黄金庭院-第${worldRef.current.day}天.json`, JSON.stringify(worldRef.current, null, 2), 'application/json');
  }

  async function exportRawWorld(): Promise<void> {
    try {
      const raw = await readRawWorld(branchId);
      if (raw == null) throw new Error('没有找到可导出的原始存档。');
      downloadFile('黄金庭院-原始存档.json', typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2), 'application/json');
    } catch (caught) { setError(caught instanceof Error ? caught.message : '导出原始存档失败。'); }
  }

  async function recoverWorld(): Promise<void> {
    if (!window.confirm('这会覆盖当前分支。请先导出原始存档，确定继续吗？')) return;
    try {
      await commit(createWorld());
      setStorageReady(true);
      setStorageError(false);
      setError('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : '重建庭院失败。'); }
  }

  function downloadFile(name: string, content: string, type: string): void {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportYearbook(): void {
    const last = worldRef.current.slot === 0 ? worldRef.current.day - 1 : worldRef.current.day;
    if (last < 1) return;
    downloadFile(`黄金庭院-第${Math.max(1, last - 29)}至${last}天.md`, yearbook(worldRef.current, last - 29, last), 'text/markdown;charset=utf-8');
  }

  async function importWorld(file: File): Promise<void> {
    if (!storageReady && !storageError) return;
    const importingBranch = branchId;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isWorld(parsed)) throw new Error('文件不是可识别的庭院存档。');
      const clean = sanitizeWorld(parsed);
      if (!window.confirm('导入会替换当前庭院。请先导出当前存档，确定继续吗？')) return;
      if (activeBranch() !== importingBranch || running || askingRef.current) throw new Error('庭院已切换，导入已取消。');
      await commit(clean);
      setStorageReady(true);
      setStorageError(false);
      setSelectedPlace(null);
      setSelectedPerson(null);
      setSelectedScene(null);
      setViewDay(null);
      setError(clean === parsed ? '' : '已修复导入存档中的无效记录；原文件仍保留在你的设备上。');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '导入存档失败。');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  }

  async function leaveBoardNote(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const note = boardDraft.trim();
    if (!note || running || saving || !storageReady) return;
    const current = worldRef.current;
    const items = current.items.map((item) => item.id === 'board' ? {
      ...item, detail: `访客留言：${note}`, updatedBy: null,
      history: [...(item.history ?? [{ day: 0, by: null, detail: item.detail }]), { day: current.day, by: null, detail: `访客留言：${note}` }],
    } : item);
    try { await commit({ ...current, items }); setBoardDraft(''); setError(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : '留言保存失败。'); }
  }

  async function submitMove(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!movingItemId || !moveTarget || running || saving || !storageReady) return;
    try {
      await commit(moveItem(worldRef.current, movingItemId, moveTarget, moveSpot));
      setSelectedPlace(moveTarget);
      setMovingItemId(null);
      setMoveTarget('');
      setMoveSpot('');
      setError('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : '物品挪动失败。'); }
  }

  async function askScene(scene: ActionScene, question: string): Promise<void> {
    if (running || askingRef.current || !storageReady || pendingWrites.current || connection !== 'ready') throw new Error('当前不能追问。');
    const current = worldRef.current;
    if (!current.scenes.some((entry) => entry.id === scene.id)) throw new Error('这条记录已不在当前存档中。');
    askingRef.current = true;
    setAsking(true);
    try {
      const answer = await askResident(current, scene, question, new AbortController().signal);
      const entry: ResidentQuestion = { day: current.day, sceneId: scene.id, actorId: scene.actorId, question, answer };
      await commit({ ...worldRef.current, questions: [...(worldRef.current.questions ?? []), entry] });
    } finally { askingRef.current = false; setAsking(false); }
  }

  useEffect(() => {
    if (initialWorld) { setStorageReady(true); return; }
    let cancelled = false;
    setStorageReady(false);
    setStorageError(false);
    openWorld(branchId).then((saved) => {
      if (cancelled) return;
      worldRef.current = saved;
      setWorld(saved);
      setStorageReady(true);
      setError('');
    }).catch((caught) => { if (!cancelled) { setStorageError(true); setError(caught instanceof Error ? caught.message : '存档读取失败。'); } });
    return () => { cancelled = true; };
  }, [branchId, initialWorld]);

  useEffect(() => {
    const controller = new AbortController();
    checkConnection(controller.signal).then(({ ready, model: configuredModel }) => {
      setConnection(ready ? 'ready' : 'offline');
      if (configuredModel) setModel(configuredModel);
    }).catch(() => setConnection('offline'));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSelectedScene(null); setSelectedPerson(null); setRelationsOpen(false); setSettingsOpen(false); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  async function advance(): Promise<void> {
    if (running || askingRef.current || !storageReady || connection !== 'ready') return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setViewDay(null);
    setMobileTab('events');
    setError('');
    let current = worldRef.current;
    try {
      const undecided = PEOPLE.filter((person) => !current.pending[person.id]);
      for (let index = 0; index < undecided.length; index += 3) {
        const batch = undecided.slice(index, index + 3);
        setProgress(`${SLOTS[current.slot]} · ${batch.map((person) => person.name).join('、')}正在决定自己的事 · ${Object.keys(current.pending).length}/${PEOPLE.length}`);
        const results = await Promise.allSettled(batch.map((person) => chooseIntent(current, person.id, controller.signal).then(async (intent) => {
          current = { ...current, pending: { ...current.pending, [person.id]: intent } };
          await commit(current);
          setProgress(`${SLOTS[current.slot]} · ${person.name}已决定 · ${Object.keys(current.pending).length}/${PEOPLE.length}`);
        })));
        const failure = results.find((result) => result.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
      }
      setProgress(`${SLOTS[current.slot]} · 庭院里的人正碰面`);
      const encounters = await createEncounters(current, controller.signal);
      if (current.slot === 3) setProgress('夜晚 · 大家正围坐吃晚饭');
      const dinner = current.slot === 3 ? await createDinner(current, encounters, controller.signal) : undefined;
      if (controller.signal.aborted) throw new DOMException('已暂停', 'AbortError');
      const completed = applyPhase(current, encounters, dinner);
      await commit(completed);
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

  async function reset(): Promise<void> {
    if (askingRef.current || !storageReady || pendingWrites.current || !window.confirm('重新开始会清除这座庭院的全部本地记录。继续吗？')) return;
    abortRef.current?.abort();
    try { await commit(createWorld()); setStorageReady(true); } catch (caught) { setError(caught instanceof Error ? caught.message : '重建庭院失败。'); return; }
    setSelectedPlace(null);
    setSelectedScene(null);
    setSelectedPerson(null);
    setViewDay(null);
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
    setSettings({ apiUrl: '', apiKey: '', model: DEFAULT_MODEL, apiStyle: 'responses' });
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
  const latestDay = world.slot === 0 && world.scenes.length ? world.day - 1 : world.day;
  const displayedDay = viewDay ?? latestDay;
  const pastDay = viewDay !== null;
  const displayWorld = pastDay ? worldAtDay(world, displayedDay) : world;
  const displayedScenes = world.scenes.filter((scene) => scene.day === displayedDay);
  const upcomingEvent = sharedEventFor(world);
  const filteredScenes = (pastDay ? displayedScenes : [...world.scenes, ...(upcomingEvent ? [upcomingEvent] : []), ...pendingScenes])
    .filter((scene) => selectedPlace === null || scene.placeId === selectedPlace)
    .slice(pastDay ? 0 : -35).reverse();
  const placeScenes = selectedPlace ? displayedScenes.filter((scene) => scene.placeId === selectedPlace) : displayedScenes;
  const pendingCount = Object.keys(world.pending).length;
  const latestActionCount = displayedScenes.filter((scene) => scene.kind === 'action').length;
  const latestEncounterCount = displayedScenes.filter((scene) => scene.kind === 'encounter').length;
  const latestDinnerCount = displayedScenes.filter((scene) => scene.kind === 'dinner').length;
  const latestEventCount = displayedScenes.filter((scene) => scene.kind === 'event').length;
  const highlights = dayHighlights(world, displayedDay);

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-symbol"><Flower2 size={23} strokeWidth={1.6} /></span><div><span className="brand-kicker">一日物语</span><strong>黄金庭院</strong></div></div>
      <div className="clock"><span className="clock-day">DAY {String(world.day).padStart(2, '0')}</span><span className="clock-main">{SLOTS[world.slot]}</span><span className="clock-next">待生成</span></div>
      <div className="top-actions"><label className="branch-picker"><span>庭院</span><select aria-label="切换庭院分支" value={branchId} onChange={(event) => switchBranch(event.target.value)} disabled={running || asking || saving}>{branchList.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><div className={`connection ${connection}`} title={connection === 'ready' ? 'AI 已配置 · 思考强度 low' : 'AI 未配置'}><span className="status-dot" /><span>{connection === 'ready' ? model : connection === 'checking' ? '检查中' : 'AI 未配置'}</span></div><button className="icon-button" onClick={exportWorld} disabled={!storageReady} title="导出当前庭院 JSON 存档" aria-label="导出存档"><Download size={18} /></button><button className="icon-button" onClick={exportYearbook} disabled={!storageReady || !world.scenes.length} title="导出最近 30 天的可分享 Markdown 月刊" aria-label="导出月刊"><BookOpen size={18} /></button><button className="icon-button" onClick={() => importRef.current?.click()} disabled={running || asking || saving} title="从 JSON 文件导入庭院存档" aria-label="导入存档"><Upload size={18} /></button><input ref={importRef} className="sr-only" type="file" accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importWorld(file); }} /><button className="icon-button" onClick={() => { setSettingsError(''); setSettingsOpen(true); }} disabled={running || asking} title="配置 API 地址、密钥和模型" aria-label="AI 设置"><Settings2 size={18} /></button><button className="icon-button reset-button" onClick={reset} disabled={running || asking || saving} title="清空本地庭院记录并重新开始" aria-label="重新开始"><RotateCcw size={18} /></button><button className="advance-button" onClick={running ? () => abortRef.current?.abort() : advance} disabled={!running && (connection !== 'ready' || asking || saving || !storageReady)} title={running ? '暂停当前生成，已完成的居民行动会保留' : world.slot === 3 ? '生成夜晚行动、同地对话和共同晚饭，会调用 AI' : '生成这一时段的居民行动和同地对话，会调用 AI'}>{running ? <CirclePause size={18} /> : <Play size={18} fill="currentColor" />}<span>{running ? '暂停生成' : pendingCount ? `继续${SLOTS[world.slot]}` : `生成${SLOTS[world.slot]}`}</span></button></div>
    </header>
    {(!storageReady || progress || error || connection === 'offline') && <div className={`notice ${error ? 'notice-error' : ''}`} role={error ? 'alert' : 'status'}>{error || (!storageReady ? '正在读取庭院存档…' : progress || 'API 未配置。打开右上角设置，填写接口地址和模型。')}{storageError && <span className="notice-actions"><button onClick={() => void exportRawWorld()}>导出原始存档</button><button onClick={() => importRef.current?.click()}>导入备份</button><button onClick={() => void recoverWorld()}>重建当前分支</button></span>}{running && <span className="notice-pulse" />}</div>}
    <nav className="mobile-nav" aria-label="视图"><button className={mobileTab === 'map' ? 'active' : ''} onClick={() => setMobileTab('map')}><MapPin size={17} />地图</button><button className={mobileTab === 'events' ? 'active' : ''} onClick={() => setMobileTab('events')}><BookOpen size={17} />事件</button><button className={mobileTab === 'people' ? 'active' : ''} onClick={() => setMobileTab('people')}><Users size={17} />居民</button></nav>
    <main className="workspace">
      <aside className={`people-panel mobile-${mobileTab}`}><div className="panel-heading"><div><span className="eyebrow">人物档案</span><h2>庭院居民</h2></div><button className="relationship-open" onClick={() => setRelationsOpen(true)} title="查看十三人的双向关系图"><Network size={15} />关系图</button></div><div className="people-list">{PEOPLE.map((person) => { const resident = world.residents[person.id]; return <button className="person-row" key={person.id} onClick={() => setSelectedPerson(person.id)}><Portrait id={person.id} /><span className="person-row-text"><strong>{person.name}</strong><small>{resident.project ? `项目：${resident.project.title}` : `上次在：${placeById[resident.placeId].name}`}</small></span><ArrowRight size={15} className="row-arrow" /></button>; })}</div></aside>
      <section className={`center-panel mobile-${mobileTab}`}><div className="world-heading"><div><span className="eyebrow">地点筛选</span><h1>庭院地图</h1></div><div className="world-heading-side"><div className="world-meta"><span><Sun size={15} /> {world.scenes.length ? `第 ${displayedDay} 天 · ${displayedScenes.length} 条记录` : '暂无事件'}</span><span><MapPin size={15} /> {pastDay ? '当天结束的位置' : '上次记录位置'}</span></div><div className="map-switch" role="group" aria-label="地图显示方式"><button className={mapMode === 'scene' ? 'active' : ''} onClick={() => setMapMode('scene')} aria-pressed={mapMode === 'scene'}><MapPin size={14} />场景</button><button className={mapMode === 'rooms' ? 'active' : ''} onClick={() => setMapMode('rooms')} aria-pressed={mapMode === 'rooms'}><LayoutGrid size={14} />房间</button></div></div></div>
        {latestDay > 1 && <div className="day-timeline"><label htmlFor="day-timeline">回看第 {displayedDay} 天</label><input id="day-timeline" type="range" min="1" max={latestDay} value={displayedDay} onChange={(event) => { const day = Number(event.target.value); setViewDay(day === latestDay ? null : day); setSelectedPlace(null); }} /><button onClick={() => { setViewDay(null); setSelectedPlace(null); }} disabled={!pastDay}>回到最近</button><button onClick={() => void forkDay(displayedDay)} disabled={running || asking || saving || !storageReady || displayedDay >= world.day} title={`从第 ${displayedDay} 天结束后创建独立庭院`}>从此日分叉</button></div>}
        {mapMode === 'scene' ? <CourtyardScene world={displayWorld} selectedPlace={selectedPlace} onPlace={(id) => setSelectedPlace(selectedPlace === id ? null : id)} onPerson={setSelectedPerson} showItems /> : <div className="courtyard-map"><div className="map-grounds" aria-hidden="true"><span className="ground-tree tree-one">✿</span><span className="ground-tree tree-two">✳</span><span className="ground-path" /></div><div className="rooms-grid">{PLACES.map((place) => { const occupants = PEOPLE.filter((person) => displayWorld.residents[person.id].placeId === place.id); return <button key={place.id} className={`room room-${place.id} ${selectedPlace === place.id ? 'room-selected' : ''}`} onClick={() => setSelectedPlace(selectedPlace === place.id ? null : place.id)} aria-label={`${place.name}，${pastDay ? '当天结束时' : '上次'}在这里的居民 ${occupants.length} 人`} aria-pressed={selectedPlace === place.id}><div className="room-head"><span className="room-icon"><PlaceIcon id={place.id} /></span><span className="room-name">{place.name}</span><span className="room-count">{occupants.length} 人</span></div><div className="room-art" aria-hidden="true">{occupants.length ? occupants.slice(0, 3).map((person) => useLocalPortraits ? <img className="room-figure" key={person.id} src={portraitUrl(person.id)} alt="" /> : <span className="room-figure room-figure-mark" key={person.id} style={{ '--portrait': person.color } as React.CSSProperties}>{person.mark}</span>) : <PlaceIcon id={place.id} size={44} />}</div><div className="room-people">{occupants.length ? occupants.map((person) => person.name).join("、") : "暂时无人"}</div></button>; })}</div></div>}
        <div className="place-strip">
          <div className="place-strip-heading"><div><span className="eyebrow">{selectedPlace ? pastDay ? '当天事件' : '物品与事件' : '行动与对话'}</span><h2>{selectedPlace ? `${placeById[selectedPlace].name} · ${pastDay ? `第 ${displayedDay} 天` : '物品记录'}` : `第 ${displayedDay} 天 · 已发生`}</h2></div>{selectedPlace && <button className="text-button" onClick={() => setSelectedPlace(null)}>清除地点筛选</button>}</div>
          {selectedPlace ? <>
            <div className="place-items">{displayWorld.items.filter((item) => item.placeId === selectedPlace).map((item) => <div className="place-item" key={item.id}><span className="item-pin" /><div><strong>{item.name}</strong><p>{item.detail}</p>{item.placement && <small>摆放：{item.placement}</small>}{(itemOwner(item) || item.updatedBy) && <small>{itemOwner(item) && `归属：${personById[itemOwner(item)!].name}`}{itemOwner(item) && item.updatedBy && ' · '}{item.updatedBy && `最后写入：${personById[item.updatedBy].name}`}</small>}<details className="item-history"><summary>变化记录 · {item.history?.length ?? 1} 条</summary><ol>{(item.history ?? [{ day: 0, by: null, detail: item.detail }]).map((entry, index) => <li key={index}><small>{entry.day ? `第 ${entry.day} 天` : '初始记录'} · {entry.by ? personById[entry.by].name : entry.placement || item.id === 'board' && entry.detail.startsWith('访客留言：') ? '访客' : '庭院'}</small><span>{entry.detail}{entry.placement && ` · 放在${entry.placement}`}</span></li>)}</ol></details>{!pastDay && canMoveItem(item) && <button className="item-move-button" onClick={() => { setMovingItemId(movingItemId === item.id ? null : item.id); setMoveTarget(''); setMoveSpot(''); }} disabled={running} title={`把${item.name}挪到其他地点`}><MoveRight size={14} />挪动</button>}{!pastDay && movingItemId === item.id && <form className="item-move-form" onSubmit={submitMove}><label>放到哪里<select value={moveTarget} onChange={(event) => setMoveTarget(event.target.value as PlaceId | '')} required><option value="">选择地点</option>{PLACES.filter((place) => place.id !== item.placeId).map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}</select></label><label>具体位置<input value={moveSpot} onChange={(event) => setMoveSpot(event.target.value)} maxLength={40} placeholder="例如：窗台" /></label><button type="submit" disabled={!moveTarget}>放过去</button></form>}{!pastDay && item.id === 'board' && <form className="board-note" onSubmit={leaveBoardNote}><label htmlFor="board-note-input">给公告板留一句话</label><div><input id="board-note-input" value={boardDraft} onChange={(event) => setBoardDraft(event.target.value)} maxLength={120} placeholder="今晚有人想吃甜的吗？" disabled={running} /><button type="submit" disabled={running || !boardDraft.trim()}>贴上纸条</button></div></form>}</div></div>)}</div>
            <div className="place-last">{placeScenes.length ? <button onClick={() => setSelectedScene(placeScenes.at(-1)!)}>查看最近事件：{placeScenes.at(-1)?.kind === 'action' ? (placeScenes.at(-1) as ActionScene).activity : (placeScenes.at(-1) as { title: string }).title}<ArrowRight size={15} /></button> : <span className="muted">这里暂无事件记录。</span>}</div>
          </> : <div className="day-summary">{placeScenes.length ? <><p>个人行动 {latestActionCount} 条 · 现场对话 {latestEncounterCount} 条{latestDinnerCount ? ` · 共同晚饭 ${latestDinnerCount} 场` : ''}{latestEventCount ? ` · 共同事件 ${latestEventCount} 件` : ''}</p><button onClick={() => setSelectedScene(placeScenes.at(-1)!)}>查看最近事件 <ArrowRight size={15} /></button></> : <p>尚未生成事件。</p>}</div>}
        </div>
        {!selectedPlace && highlights.length > 0 && <section className="daily-brief" aria-label={`第 ${displayedDay} 天简报`}><h2>这一天</h2><ul>{highlights.map((line) => <li key={line}>{line}</li>)}</ul></section>}
      </section>
      <aside className={`events-panel mobile-${mobileTab}`}><div className="panel-heading"><div><span className="eyebrow">实时与历史</span><h2>事件记录</h2></div><span className="small-count">显示 {filteredScenes.length} 条</span></div><div className="event-filter">{selectedPlace ? <span><MapPin size={13} />{placeById[selectedPlace].name}<button onClick={() => setSelectedPlace(null)} title="清除地点筛选" aria-label="清除地点筛选"><X size={13} /></button></span> : <span>全部地点</span>}</div><div className="event-list">{filteredScenes.length ? filteredScenes.map((scene) => <button className={`event-row ${scene.kind === 'dinner' ? 'event-row-dinner' : ''} ${scene.kind === 'event' ? 'event-row-shared' : ''}`} key={scene.id} onClick={() => setSelectedScene(scene)}><div className="event-row-top"><span>{timeLabel(scene.day, scene.slot)}</span><span>{placeById[scene.placeId].name}</span></div><div className="event-row-main">{scene.kind === 'action' || scene.kind === 'pending' ? <Portrait id={scene.actorId} size="small" /> : <span className="event-encounter">{scene.kind === 'dinner' ? <CookingPot size={16} /> : scene.kind === 'event' ? <Sparkles size={16} /> : <Users size={16} />}</span>}<div><span className={`event-kind ${scene.kind === 'pending' ? 'event-pending' : ''}`}>{scene.kind === 'pending' ? '已决定 · 待结算' : scene.kind === 'action' ? '个人行动' : scene.kind === 'dinner' ? '共同晚饭' : scene.kind === 'event' ? '庭院共同事件' : '现场对话'}</span><strong>{scene.kind === 'action' || scene.kind === 'pending' ? scene.activity : scene.title}</strong><p>{scene.kind === 'pending' ? `${personById[scene.actorId].name} · ${scene.goal}` : scene.kind === 'action' ? `${personById[scene.actorId].name} · ${scene.summary?.trim() || scene.activity}` : scene.kind === 'dinner' ? `到场 ${scene.attendees.length} 人 · 缺席 ${scene.absentees.length} 人${scene.lines[0] ? ` · ${personById[scene.lines[0].actorId].name}：${scene.lines[0].text}` : ''}` : scene.kind === 'event' ? scene.description : `${speakersFor(scene)} · ${scene.lines[0]?.text ?? ''}`}</p></div></div></button>) : <div className="empty-events"><BookOpen size={27} strokeWidth={1.4} /><strong>暂无事件记录</strong><span>生成一个时段后会出现记录。</span></div>}</div></aside>
    </main>
    <footer className="app-footer"><span>黄金庭院 · 非商业同人实验 · {useLocalPortraits ? <a href="https://honkaiimpact3.fandom.com/wiki/Honkai_Impact_3_Wiki" target="_blank" rel="noreferrer">角色图像资料来源</a> : '印象符号代替官方头像，避免再分发原图'}</span><span>手动推进 · {model} · low</span></footer>
    {selectedScene && <SceneDetail scene={selectedScene} onClose={() => setSelectedScene(null)} questions={(world.questions ?? []).filter((entry) => entry.sceneId === selectedScene.id)} remainingQuestions={connection === 'ready' && !running ? Math.max(0, 3 - (world.questions ?? []).filter((entry) => entry.day === world.day).length) : 0} asking={asking} onAsk={selectedScene.kind === 'action' ? (question) => askScene(selectedScene, question) : undefined} />}
    {selectedPerson && !selectedScene && <PersonDetail id={selectedPerson} world={world} onClose={() => setSelectedPerson(null)} onScene={(scene) => setSelectedScene(scene)} />}
    {relationsOpen && <RelationshipMap world={world} onClose={() => setRelationsOpen(false)} />}
    {settingsOpen && <Modal className="settings-dialog" labelId="settings-title" onClose={() => setSettingsOpen(false)}><form onSubmit={saveSettings}><div className="dialog-topline"><span>连接设置</span><button className="icon-button" type="button" onClick={() => setSettingsOpen(false)} title="关闭" aria-label="关闭"><X size={19} /></button></div><h2 id="settings-title">AI 接口</h2><label>接口格式<select value={settings.apiStyle ?? 'responses'} onChange={(event) => setSettings({ ...settings, apiStyle: event.target.value as 'responses' | 'chat' })}><option value="responses">Responses</option><option value="chat">Chat Completions（本地模型）</option></select></label><label>API 地址<input type="url" value={settings.apiUrl} onChange={(event) => setSettings({ ...settings, apiUrl: event.target.value })} placeholder={settings.apiStyle === 'chat' ? 'http://127.0.0.1:11434/v1' : 'https://example.com/v1'} required /></label><label>API 密钥<input type="password" value={settings.apiKey} onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })} autoComplete="off" placeholder="本机无密钥接口可留空" /></label><label>模型<input value={settings.model} onChange={(event) => setSettings({ ...settings, model: event.target.value })} placeholder="模型 ID" required /></label><p className="settings-hint">Responses 使用 low 思考强度；Chat Completions 使用 JSON 输出。本机模型可留空密钥。密钥仅保存在当前浏览器会话，生成时发送给你填写的接口。</p>{settingsError && <p className="settings-error" role="alert">{settingsError}</p>}<div className="settings-actions">{import.meta.env?.DEV && <button type="button" onClick={useLocalSettings}>使用本机配置</button>}<button className="advance-button" type="submit">保存设置</button></div></form></Modal>}
  </div>;
}
