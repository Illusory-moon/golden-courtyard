# 黄金庭院 · 优化执行计划

> 对象：`E:\gpt\golden-courtyard`（main @ `8368076`，与 GitHub 公开仓库同一份代码，工作区干净）
> 性质：只读分析 + 计划。**本计划未改动任何项目文件。**
> 编制依据：全部结论均在本地实测得出，证据见每条"实测"。

---

## 0. 基线与实测数据

| 项目 | 实测值 | 命令 |
| --- | --- | --- |
| 测试 | 16 / 16 通过，5.2 s | `npm test` |
| 公开版构建 | 成功，13.1 s；JS 393 kB / gzip 130 kB；CSS 26.28 kB | `npm run build:public` |
| bundle 卫生 | 已 tree-shake 干净（产物内无未使用的 lucide 图标） | 见 §5 不做清单 |
| 单次行动请求 prompt | system 1732 + user 3545 = **5277 字符** | 打桩 `globalThis.fetch` 抓包 |
| 其中逐字重复的静态块 | `format` + `rules` = **1369 字符（26%）**，且位于 user 末尾 | 同上 |
| 存档增长速度 | **约 21 000 字符 / 天**（60 天模拟 → 3420 条场景 / 1.27 M 字符） | 模拟 60 天 `applyPhase` |
| 首屏外部请求 | Google Fonts `@import` 在**构建产物里依然存在** | 检查 `dist-public/assets/*.css` |
| 崩溃路径 | 实测 **3 条**均可让整页白屏（见 P0-1） | 见 P0-1 复现脚本 |

**一句话结论**：这个项目工程质量比同类同人项目高不少（测试、schema 校验、提示词的边界约束都很扎实），真正值得动的是 **① 本地存档的健壮性与上限 ② 提示词缓存带来的成本/延迟 ③ 少量死代码与工程卫生**。UI 与游戏逻辑**不建议重构**。

---

## 1. 优先级总览

| # | 事项 | 类别 | 收益 | 风险 | 工作量 |
| --- | --- | --- | --- | --- | --- |
| P0-1 | 存档校验 + 崩溃兜底 | 数据安全 | 消除白屏与整档丢失 | 低 | 小 |
| P0-2 | 存档增长上限与配额兜底 | 数据安全 | 消除写入失败/状态错乱 | 中（改类型） | 中 |
| P0-3 | 存档导出 / 导入 | 数据安全 | 唯一逃生出口（可选） | 低 | 小 |
| P1-3 | 静态提示词前移吃缓存 | 成本/延迟 | 约 6 成 input 走缓存 | 低 | 小 |
| P1-4 | 13 次串行请求 → 有限并发 | 延迟 | 时段耗时 ÷3~5 | **中（有取舍）** | 中 |
| P2-5 | 重试语义分离 | 正确性/成本 | 免掉无意义重试 | 低 | 小 |
| P2-6 | `energy` 传了但没定义 | 正确性 | 让该机制真的生效 | 低 | 极小 |
| P2-7 | 去掉远程字体 `@import` | 体验/隐私 | 少 2 跳阻塞、可离线 | 低 | 小 |
| P2-8 | favicon + description | 体验 | 消 404、分享可预览 | 低 | 极小 |
| P3-9 | CI 工作流 | 工程卫生 | 防回归 | 低 | 小 |
| P3-10 | `engines` 字段 | 工程卫生 | 早失败早提示 | 低 | 极小 |
| P3-11 | 删死字段 | 清理 | 少 30+ 行噪声 | 低 | 小 |
| P3-12 | 上游请求体抽公共 | 维护性 | 消除参数漂移 | 低 | 小 |
| P3-13 | 部署子路径 `base` | 部署 | 子路径可用 | 低 | 极小 |
| P3-14 | 原生 `<dialog>` | 可访问性 | 白送焦点陷阱 | 低 | 中 |
| P3-15 | 开发代理 origin 收紧 | 安全加固 | 已 fail-closed，属加固 | 低 | 极小 |

**建议动手顺序**：P0-1 → P0-2 → P2-7 / P2-8（十分钟级）→ P1-3 → P3-9 → 其余按需。

---

## P0：会丢数据 / 会白屏

### P0-1　收紧存档信任边界 + 加错误兜底

**问题**
`src/world.ts:122` 的 `isWorld` 只检查顶层形状，不校验 `residents.*.placeId`、`scenes[*].placeId`、`scenes[*].actorId` 是否存在于 `PEOPLE` / `PLACES`。而 `src/main.tsx` **没有 ErrorBoundary**——React 一抛错就是整页白屏，几百天的存档就此打不开。

**实测（三条崩溃路径，均已复现）**

```
A 居民 placeId 为未知地点   -> CRASH: Cannot read properties of undefined (reading 'name')
B 场景 placeId 为未知地点   -> CRASH: Cannot read properties of undefined (reading 'name')
C 场景 actorId 为未知人物   -> CRASH: Cannot read properties of undefined (reading 'name')
```

崩点在 `src/App.tsx:109`、`258`（`placeById[resident.placeId].name`）与 `src/App.tsx:29`、`105`（`personById[...]`）。
复现方式：把 `localStorage` 的 `golden-courtyard.world.v1` 改成合法形状但含一个未知地点，刷新即白屏。

**改法（根因修一次，所有消费者自动安全）**
1. `world.ts` 增加 `sanitizeWorld()`：不可修复的（未知地点/人物）就地降级或剔除，**而不是丢弃整座庭院**。
2. `App.tsx` 的 `loadWorld()`（`App.tsx:13-22`）：解析失败或形状不符时，**先备份原始字符串再重建**，不要静默销毁。

```ts
// src/world.ts
const PLACE_IDS = new Set<string>(PLACES.map((p) => p.id));
const PERSON_IDS = new Set<string>(PEOPLE.map((p) => p.id));

/** 逐条剔除坏记录；能修的就修，修不了才丢。 */
export function sanitizeWorld(world: World): World {
  const residents = Object.fromEntries(PEOPLE.map((person) => {
    const resident = world.residents[person.id];
    return [person.id, PLACE_IDS.has(resident.placeId) ? resident : { ...resident, placeId: START_PLACES[person.id] }];
  })) as World['residents'];
  const items = world.items.filter((item) => PLACE_IDS.has(item.placeId));
  const scenes = world.scenes.filter((scene) =>
    PLACE_IDS.has(scene.placeId)
    && (scene.kind !== 'action' || PERSON_IDS.has(scene.actorId))
    && (scene.kind !== 'dinner' || scene.attendees.every((id) => PERSON_IDS.has(id)))
    && (scene.kind !== 'encounter' || scene.lines.every((line) => PERSON_IDS.has(line.actorId))));
  const changed = items.length !== world.items.length || scenes.length !== world.scenes.length
    || PEOPLE.some((p) => residents[p.id] !== world.residents[p.id]);
  return changed ? { ...world, residents, items, scenes } : world;
}
```

```ts
// src/App.tsx —— loadWorld
function loadWorld(): World {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return createWorld();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isWorld(parsed)) {
      const clean = sanitizeWorld(parsed);
      if (clean !== parsed) localStorage.setItem(`${STORAGE_KEY}.recovered`, raw); // 留后路
      return clean;
    }
  } catch { /* 落到下面 */ }
  localStorage.setItem(`${STORAGE_KEY}.corrupt`, raw); // 不要把几百天记录直接烧掉
  return createWorld();
}
```

3. `main.tsx` 包一层 ErrorBoundary（约 15 行 class 组件），兜底页给两个按钮：**导出存档 JSON** / **清空重来**。

**验收**
- 上面 A / B / C 三种坏存档：页面正常打开，坏记录被剔除，其余记录完好；`localStorage` 里出现 `*.corrupt` / `*.recovered` 备份键。
- 新增一条测试：`sanitizeWorld` 对三种坏输入都能返回可渲染的 world（沿用 `world.test.ts` 现有风格，不需要新依赖）。
- `npm test` 16 条 + 新增全绿。

---

### P0-2　给存档增长设上限，并兜住 `QuotaExceededError`

**问题**
- `world.scenes` **只增不减**；`commit()`（`App.tsx:145-149`）每个居民写一次，一个时段写 13+ 次全量 `JSON.stringify`；
- `applyPhase()`（`world.ts:152`）每个时段全量 `structuredClone(world)`。

**实测（60 天模拟）**

```
day 20: scenes=1140  chars=423,744
day 40: scenes=2280  chars=845,504
day 60: scenes=3420  chars=1,267,264
每天 ~21 121 字符  →  5 MB 配额约 120~240 天触顶
60 天时单次 JSON.stringify = 9.6 ms
```

（上面用的是紧凑合成意图；真实模型输出更长，触顶时间更早。）

触顶后的行为是**错的**：`localStorage.setItem` 抛 `QuotaExceededError` → 被 `advance()` 的 `catch`（`App.tsx:192`）吞成一句"庭院暂时无法继续"；而且 `commit()` 里 `worldRef.current = value` 已经执行、`setWorld(value)` 没有执行 → 内存状态与 UI 不一致，之后继续推进是在不一致的状态上叠加。

**改法（推荐档：老场景压成"存根"，保住时间线、见面次数与物品史）**
1. `world.ts` 把 `ActionScene` 的叙述字段改为可选：`steps?`、`observation?`、`interpretation?`、`quote?`、`goal?`、`summary?`、`next?`、`activity` 仍是必填。
   `summary` 已经是可选的；UI 侧只需给 `App.tsx:79` 的 `scene.steps.map` 加 `?. `（`App.tsx:79`、`81-82` 已经在用 `scene.summary?.trim()` 这类写法）。
2. `commit()` 前调用 `compact()`：只对**超过 N 天（建议 14 天）**的动作场景做压缩，保留 `kind/id/day/slot/placeId/actorId/activity/targetId/encounterStatus/objectResult` 与 `project`，其余叙述字段置空。偶遇与晚饭场景体积本来就小，且 `socialFor()`（`world.ts:131-149`）依赖 `lines` 文本，**不要压**。

```ts
// src/world.ts
const KEEP_FULL_DAYS = 14;

export function compact(world: World): World {
  if (world.day <= KEEP_FULL_DAYS) return world;
  const cutoff = world.day - KEEP_FULL_DAYS;
  let touched = false;
  const scenes = world.scenes.map((scene) => {
    if (scene.kind !== 'action' || scene.day >= cutoff || scene.steps === undefined) return scene;
    touched = true;
    const { steps, observation, interpretation, quote, goal, summary, next, ...rest } = scene;
    return rest;
  });
  return touched ? { ...world, scenes } : world;
}
```

3. `commit()` 加配额兜底：写失败时**先保住内存状态**，再用更激进的裁剪重试一次，仍失败就明确提示并引导导出。

```ts
function commit(value: World): void {
  worldRef.current = value;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(compact(value)));
  } catch {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(compact({ ...value, scenes: value.scenes.slice(-200) })));
      setError('本地存档接近上限，较早的记录已被精简。建议导出备份。');
    } catch {
      setError('本地存档写入失败（浏览器配额已满）。请先导出存档，或清空重来。');
    }
  }
  setWorld(value);
}
```

**如果你想要更省事的 20% 版本**：不动类型，直接在 `compact()` 里把 14 天前的场景整条丢掉。代价是"实际交谈 N 次"会随裁剪变小（该数字由场景推导，见 `world.ts:131`），属于可接受的语义漂移——但我更推荐上面的存根版，它连语义都不动。

**验收**
- 新测试：模拟 120 天后 `JSON.stringify(compact(world)).length` < 1.5 MB，且 `socialFor` 计数在压缩前后**不变**。
- 手工验证：塞一个 `localStorage` 配额很小的环境（或临时把阈值调到 1 天）走一遍完整时段，确认不会卡死、错误提示正确、内存状态与 UI 一致。
- `npm test` 全绿（注意 `App.test.tsx:48-63` 那条"旧记录仍可读"的断言依赖 `summary?.trim() || activity`，压缩后仍成立）。

---

### P0-3　存档导出 / 导入（可选，但建议做）

**理由**：数据只存在 `localStorage`，没有服务器、没有账号。一旦浏览器清缓存、换设备或配额触顶，几百天的庭院**不可恢复**。P0-1 的备份键只是同一条船上多放一个口袋。

**改法**：顶栏加一个"导出存档"按钮（`Blob` + `URL.createObjectURL` 下载 JSON，约 6 行）和一个"导入存档"（`<input type="file">` + `JSON.parse` + `isWorld` + `sanitizeWorld`）。复用 P0-1 的校验，不新增依赖。

**验收**：导出 → 清空 → 导入，庭院完全还原；导入坏文件时给出提示而不是白屏。

---

## P1：成本与耗时

### P1-3　把静态提示词前移，吃满 prompt cache

**问题**
每次行动请求的 user 消息 = 世界状态（2177 字符）+ **完全逐字重复的 `format` + `rules`（1369 字符，26%）**，而这块静态内容位于 user JSON 的**末尾**（`ai.ts:154-176`），在易变状态之后。前缀缓存匹配的是**最长公共前缀**，所以这 26% 每天 52 次全部白付。

同时，system 消息（`ai.ts:123`，1732 字符）对同一个角色在**所有时段、所有天数完全一致**——它本来就是天然的可缓存前缀。

**实测**

```
system chars : 1732
user chars   : 3545   (静态 format+rules: 1369,  易变状态: 2177)
合计         : 5277 字符/次
每时段 ×13   : 68 601
每天   ×52   : 274 404
```

**改法**
1. 把 `format` 与 `rules` 从 user 对象移入 system 字符串，user 只留会变的世界状态。
2. 顺手让 system **与 slot 无关**：现在 `format.dinner` 与"夜晚必填"那条规则只在 `world.slot === 3` 出现（`ai.ts:162`、`169`），会让 system 产生两种变体。改成始终包含该键 + 一句"仅夜晚生效"，于是每个角色只有**一份**稳定前缀，缓存命中率最高。

预期效果：稳定前缀从 1732 → 约 3100 字符，**每次请求约六成 input 走缓存**（更快、更便宜），输出的语义完全不变。

**注意（会破测试，属预期）**
`world.test.ts:250` 断言 `JSON.stringify(input.format)` 匹配 `/刚才做了什么/`。同一条测试的 `world.test.ts:248-249` 已经在断言 system 内容，改成 `assert.match(system, /刚才做了什么/)` 即可。

**验收**
- `npm test` 全绿（含改动后的断言）。
- 用打桩 `fetch` 抓两个不同时段、不同角色的请求体，确认：user 中不再出现 `format`/`rules`；同一角色的 system 跨时段**逐字节相同**。
- 若所用网关支持 `cached_tokens` 统计，记录优化前后单时段用量对比。

---

### P1-4　13 次串行请求 → 有限并发（**需你拍板，有真实取舍**）

**问题**
`App.tsx:175-181` 逐人 `await chooseIntent`，一个时段 13 次串行往返，之后还有"每个 ≥2 人的地点一次偶遇"（`ai.ts:211-252`）与晚饭。按单次 15–30 s 估算，**一个时段 3–7 分钟**，一整天 4 个时段 15–30 分钟。这是最大的体验瓶颈。

**为什么不能直接 `Promise.all`**
物品预约机制依赖串行：`ai.ts:122` / `186` 用"已决定的 pending"推出 `reservedItems`，告诉后面的人"这件已被占用"。并发后所有人看到同一份初始状态，两人可能同时选同一件物品。`applyPhase`（`world.ts:172`）已有 `!itemChanges.has(item.id)` 兜底，所以**不会写坏数据**，但**第二人的物品改动会被静默丢弃**——一次行动白花。

**三档，请选一档**
- **A（不动，推荐保守派）**：只做 P1-3。省钱省流量，耗时不变。零风险。
- **B（并发 3，推荐效率派）**：用 `Promise.allSettled` 每批 3 人，每完成一人就 `commit`（保留现有断点续跑语义，暂停仍有效）。代价：物品冲突概率上升。**配套改动**：把"被抢物品"从静默丢弃改成降级——该条 scene 的 `object` 记为 `null` 并在 `objectResult` 写明"想做的东西被别人先动过了"，让玩家看到发生了什么。
- **C（先轻后重，最稳的加速）**：把 13 次调用拆成"先并发拿到 `placeId`"（轻量、schema 更小），再按地点串行生成细节。提速有限但物品预约语义完全保留。工作量最大。

**验收（选 B 时）**
- 模拟一次"两人抢同一物品"的时段：不崩、不丢数据、两条行动都留下记录，冲突方有一条可读说明。
- 暂停 / 继续在任意批次边界都能断点续跑（现有 `pending` 逐个 commit 的机制保持不变）。
- 手工计时：同一时段总耗时降到原来的 1/3 左右。

---

## P2：体验与正确性

### P2-5　重试语义分离（格式重试 ≠ 传输重试）

**问题**
`ai.ts:188-207` 的两次循环把所有异常一视同仁。当失败是 HTTP 429 / 5xx / 网络中断时，它会带着"**上次输出不合格式：AI 接口返回 HTTP 429。请修正 JSON。**"（`ai.ts:191`）再请求一次——既误导模型，又白白多烧一次钱，而且没有退避，遇到限流就是立刻再撞一次。

`world.test.ts:261` 用 `content.split('\n上次输出不合格式：')[0]` 解析请求，说明这个拼接前缀是被测试依赖的**既定行为**，改动时保留该前缀即可。

**改法**
- 在 `chat()`（`ai.ts:84-106`）里区分两类错误：HTTP/网络类抛专用 `TransportError`，JSON/schema/业务校验类保持普通 `Error`。
- `chooseIntent`：`TransportError` → 指数退避重试（如 600 ms / 1800 ms，最多 2 次），**不改 prompt**；格式类错误 → 沿用现有的"上次输出不合格式"补丁重试。用 `AbortSignal.any` 保证暂停仍能立刻中断退避等待。

**验收**
- 新增测试：stub `fetch` 第一次返回 429、第二次返回正常 JSON → 应重试成功，且**第二次请求的 user 中不含"上次输出不合格式"**；stub 始终返回 429 → 应在有限次数后失败并抛出可读错误。
- `npm test` 全绿（`world.test.ts:261` 的解析逻辑不受影响）。

---

### P2-6　`energy` 传给了模型，但从没告诉模型它是什么

**问题**
`world.ts:23/117/163` 维护 `energy`（0–4，rest +1 / focus −1，跨日至少回到 2），`ai.ts:133` 把它塞进 user JSON。但 system 提示词与 `format`/`rules` **从未定义这个数字的含义**。模型看到的是一个裸的 `3`。等于每轮花钱携带一个无意义字段——而且这套机制实际上在空转。

**改法（二选一）**
- **推荐**：在 system 里补一句定义，并接上已有的 `effort` 字段——"energy 表示此刻的精力（0 最低、4 最高）；精力低时更倾向 `rest`、独处或短小的活动，精力高时才安排 `focus` 的长事。" 机制不增代码就活了起来。
- **极简派**：删掉 `energy`（`world.ts` 3 处 + `ai.ts:133`）。YAGNI。

**验收**：抓请求体确认 system 中含 energy 的语义说明；连续跑几个时段，观察精力低时 `effort` 分布向 `rest` 偏移（人工观察即可，不必写断言）。

---

### P2-7　去掉远程字体 `@import`

**问题**
`styles.css:1` 用 `@import url('https://fonts.googleapis.com/...')` 引入 Noto Sans SC（4 个字重）+ Noto Serif SC（3 个字重）。**实测构建产物里这个远程 `@import` 依然存在**，链路是：`index.html` → 本地 CSS → Google CSS → woff2，**3 跳渲染阻塞**。

三个真实代价：① 首屏更慢；② 离线 / Google 不可达的网络下字体失败（国内尤甚），`:root` 直接掉到 `system-ui`，设计版式变样；③ 每个访客的 IP 会被交给 Google——这与项目"全部本机、不外发"的定位相冲突（README 反复强调密钥与图片都不外流）。

而 `Noto Serif SC` 实际只用在装饰用的印象符号与弹窗标题（`styles.css:81`、`82`、`83`、`85`）。

**改法（推荐，最懒且最稳）**
删掉 `@import`，改用系统 CJK 栈；装饰处用系统衬线。零外部请求、零新依赖、离线可用。

```css
:root{font-family:system-ui,-apple-system,'PingFang SC','Microsoft YaHei','Source Han Sans SC',sans-serif;/* ... */}

/* 原 'Noto Serif SC',serif 处（.scene-resident-mark / .room-figure-mark / .person-illustration-mark / .settings-dialog h2） */
font-family:'Songti SC','SimSun',serif;
```

若坚持保留 Noto：改在 `index.html` 用 `<link rel="preconnect">` + `<link rel="stylesheet">`（消掉一跳），或自托管 **subset** woff2（中文全字库体积很大，务必子集化）。

**验收**：`dist-public/assets/*.css` 中不含任何外部域名；断网刷新页面版式不乱；首屏少 2 跳（DevTools Network 确认）。

---

### P2-8　补 favicon 与页面描述

**问题**：`index.html` 没有 `<link rel="icon">`，而 `public/courtyard.svg` **已经在产物里**（public 模式靠 `vite.config.ts:16-19` 的插件复制到 `dist-public/`）→ 浏览器每次加载都白跑一次 `/favicon.ico` 404。同时没有 `meta description` / OG 标签，公开演示链接分享出去没有预览。

**改法**（`index.html`，两行）：
```html
<link rel="icon" href="/courtyard.svg" type="image/svg+xml" />
<meta name="description" content="十三英桀的非商业同人日常模拟：每人按自己的性格与手头项目选择下一段时光。" />
```

**验收**：Network 面板无 `/favicon.ico` 404；标签页显示图标。

---

## P3：工程卫生与清理

### P3-9　加 CI
仓库现在**完全没有 CI**（无 `.github/`）。新增 `.github/workflows/ci.yml`：`actions/setup-node@v4`（node 22）→ `npm ci` → `npm test` → `npm run build:public`。
**验收**：PR 上出现绿色检查。**注意**：公开构建必须不带头像——CI 里只跑 `build:public` 即可，仓库本来也没有 `public/portraits/`（已 gitignore）。

### P3-10　`package.json` 加 `engines`
`"engines": { "node": ">=22" }`。README 写着 Node 22+，但没有机器可读的约束，低版本 Node 会在 `fetch`/`AbortSignal.any` 上给出难懂的报错。

### P3-11　删死字段（已实测确认零引用）
- `people.ts:2-7`：`PLACES` 的 `icon`、`x`、`y`、`tint` **四个字段 × 6 个地点全部无引用**（`x`/`y`/`tint` 在 `src` 内 grep 零命中；`icon` 只出现在 CSS 类名 `.icon-button` 里）。地点图标实际由 `App.tsx:32-39` 的 `PlaceIcon` 用 lucide-react 提供。删掉即少 4 个字段的维护面。
- `world.ts:64`：`EncounterScene.observation?` 已不再生成（`world.test.ts:212-213` 明确断言为 `undefined`）也不再展示。类型字段可删（旧存档里多出的键在运行时无害，不必写迁移）。

### P3-12　上游请求体抽成一处
`ai.ts:92-94` 与 `vite.config.ts:55` **各自拼了一份** `{ model, input, reasoning: { effort: 'low' }, text: { format: { type: 'json_object' } }, max_output_tokens: 1100 }`。两处漂移会导致"开发代理路径与直连路径行为不一致"，这类 bug 极难发现。
新增 `src/upstream.ts`：`export const DEFAULT_MODEL = 'gpt-5.6-sol'` + `export function upstreamBody(model, input)`，三处（含 `vite.config.ts:10`）共用。
顺带：默认模型 `'gpt-5.6-sol'` 在 `App.tsx:131/133/225/226` 与 `vite.config.ts:10` **重复 5 次**，一并收拢到该常量。

### P3-13　部署到子路径时的 `base`
实测产物使用**绝对路径**：`dist-public/index.html` 里是 `/assets/...`，CSS 里是 `url(/courtyard.svg)`。如果部署到 GitHub Pages 的项目子路径（`/golden-courtyard/`），这些全部 404。届时在 `vite.config.ts` 设 `base: '/golden-courtyard/'`（或部署到根域名）。README 没写部署方式，属条件性事项。

### P3-14　弹窗改用原生 `<dialog>`（可选）
`App.tsx:66`、`106`、`268` 三处手写 `dialog-scrim` + `role="dialog" aria-modal`，加 `App.tsx:160-164` 手动 Esc 监听。原生 `<dialog>` + `showModal()` 白送**焦点陷阱、Esc 关闭、`::backdrop`**，还能删掉那 4 行监听——目前弹窗打开后焦点仍留在背后的页面上，键盘/读屏用户会跑偏。中等工作量（要改成 ref + `useEffect` 调 `showModal`，CSS 的 `.dialog-scrim` 换成 `::backdrop`），收益是可访问性达标。

### P3-15　开发代理 origin 检查（低优先加固）
`vite.config.ts:30`：`if (request.headers.origin && ...)` —— **缺少 Origin 头就完全跳过检查**。实测：
```
1 无 Origin                -> HTTP 503（通过了 origin 检查，走到"未配置"）
2 Origin=同源              -> HTTP 503（正常）
3 Origin=evil, Host=正常   -> HTTP 403（拦住了）
4 Origin=evil, Host=evil   -> HTTP 403（DNS rebinding 也被拦住了）
5 Origin: null             -> HTTP 502（new URL 抛错，fail-closed）
```
浏览器发 POST 必带 Origin，所以**实际风险很低**（第 4 条也说明 rebinding 走不通）。属于加固而非漏洞：想收紧就把条件改成"缺少 Origin 或 Origin 不匹配 → 403"，并把 `new URL` 包进 try 让它返回 403 而不是 502。**不要为此改动现有安全模型**（无 CORS 头 + 仅监听 127.0.0.1 已经在起作用）。

---

## 4. 明确不建议做（YAGNI）

以下都在"看着可以优化、实际不该动"的清单里，避免后面有人（包括我自己）手痒：

- **不动 bundle**：实测产物内**没有**未使用的 lucide 图标，tree-shaking 正常；393 kB / gzip 130 kB 基本就是 React 19 本身。不上 code-split、不换 preact、不为了体积拆包。
- **不引入状态管理库**：13 个 useState + 1 个 worldRef 已经够用，App 是单页单状态树。
- **不用 zod 重写全部类型**：zod 已在 `ai.ts` 用于模型输出（用得很对）；把 `World` 也全面 zod 化会造成"类型与 schema 双份维护"，P0-1 的 15 行手写校验收益/成本比更好。
- **不加 ESLint/Prettier 全家桶**：`tsconfig` 已开 `strict` + `noUnusedLocals` + `noUnusedParameters`，`tsc -b` 已在构建里把关。
- **不重构 `App.tsx` 的巨型单行 JSX**（`253`、`258-261`、`263` 那几行确实难读）：重排的 diff 风险高于收益。真想改善，只做**纯格式化换行**（不动机器生成的语义），收益有限。
- **不引入测试框架**：`node:test` + `tsx` 已覆盖 16 条关键行为（含 `globalThis.fetch` 打桩、跨时段状态、晚饭出席、物品归属、官方关系方向），比多数同人项目扎实。保持现状。
- **不删 `world.pending` 断点续跑**：这是暂停/继续语义的核心，P1-4 改成并发时也必须保留。

---

## 5. 执行约定

**每个条目单独一个 commit**，改完立刻跑：

```powershell
cd E:\gpt\golden-courtyard
npm ci
npm test                  # 期望 16 pass（新增测试后更多）
npm run build:public      # 期望成功，约 13 s
```

**回归红线**：以下既有行为不得改变——
1. 存档向后兼容（旧存档仍能继续使用，README 明确承诺）；
2. 非主人不能改写他人私人物品（`world.ts:172`、`ai.ts:196-201`，有测试守着）；
3. 未获现场回应的邀约降级为"下一时段留言"（`world.ts:165-168`、`196`，有测试守着）；
4. 公开构建**绝不**包含 `public/portraits/` 图片（`vite.config.ts:71` 的 `copyPublicDir: false` + 独立复制插件，是合规要求，别顺手"简化"）；
5. `.env*` / 密钥不进仓库（`sessionStorage` 与 dev 代理的设计不要动）。

**预期收益合计**：消除 3 条白屏路径与存档无限增长（P0）、单次请求约六成 input 走缓存（P1-3）、时段耗时 ÷3~5（P1-4 选 B 时）、首屏少 2 跳外部请求（P2-7）、CI 防回归（P3-9）、约 40 行死代码/重复代码清零（P3-11/12）。

---

## 附：本计划的证据来源

- 静态阅读：`src/App.tsx`（270 行）、`src/ai.ts`（290 行）、`src/world.ts`（231 行）、`src/people.ts`、`src/relationships.ts`、`src/souls.ts`、`src/*.test.ts*`、`vite.config.ts`、`tsconfig.json`、`package.json`、`index.html`、`src/styles.css`、`.env.*`、`.gitignore`、`README.md`。
- 动态实测：`npm test`（16/16）、`npm run build:public`（13.1 s）、bundle 与产物 CSS 检查、坏存档崩溃复现（3 例）、60 天存档增长模拟、prompt 体积抓包、dev 代理 origin 五连测（`curl`）。
- 临时探针脚本均在 `src/` 下创建并**已删除**；`git status` 干净。
