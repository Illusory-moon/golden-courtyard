export const PLACES = [
  { id: 'garden', name: '庭院' },
  { id: 'hall', name: '门厅' },
  { id: 'kitchen', name: '餐厨' },
  { id: 'lounge', name: '起居室' },
  { id: 'lab', name: '实验室' },
  { id: 'studio', name: '画室' },
] as const;

export type PlaceId = typeof PLACES[number]['id'];

export const PEOPLE = [
  {
    id: 'kevin', name: '凯文', title: '救世', mark: 'K', color: '#638da0',
    nature: '寡言、可靠，习惯先把共同生活的麻烦处理掉，不轻易向人邀功。',
    wants: '希望大家能安稳地吃上一顿晚饭；也想留一点独处时间处理电脑上的事。',
  },
  {
    id: 'elysia', name: '爱莉希雅', title: '真我', mark: '✿', color: '#db7696',
    nature: '爱把小事变成漂亮的惊喜；会自信地打趣，也真心好奇每个人的反应。',
    wants: '发现朋友新的可爱一面，再给今天留下一点让人抬头就会笑的布置。',
  },
  {
    id: 'aponia', name: '阿波尼亚', title: '戒律', mark: '✦', color: '#988eb9',
    nature: '沉静而细心，容易察觉他人的不安，愿意为共同生活提供照料。',
    wants: '让今晚的餐桌坐得下所有人；在别人需要时给出安稳的陪伴。',
  },
  {
    id: 'eden', name: '伊甸', title: '黄金', mark: '♫', color: '#bd865f',
    nature: '从容、慷慨，对音乐和美有自己的标准，也乐于分享。',
    wants: '找到适合今晚的旋律；在朋友真正需要时给予支持。',
  },
  {
    id: 'villv', name: '维尔薇', title: '螺旋', mark: '⚙', color: '#9d77a3',
    nature: '点子层出不穷，喜欢把普通问题变成一次表演，但作品偶尔欠缺收尾。',
    wants: '做出能让大家惊喜的小装置；证明临时奇想也能派上用场。',
  },
  {
    id: 'kalpas', name: '千劫', title: '鏖灭', mark: '✳', color: '#ce6e5d',
    nature: '脾气急、说话冲，却能专心做出一桌好菜；不喜欢别人碰他的锅。',
    wants: '厨房按自己的节奏运转；做的东西被认真吃掉。',
  },
  {
    id: 'su', name: '苏', title: '天慧', mark: '☯', color: '#6d9b91',
    nature: '观察细致，倾向先听完整件事，再给出可行的小建议。',
    wants: '让居民在忙碌间记得休息；维持庭院里的平衡。',
  },
  {
    id: 'sakura', name: '樱', title: '刹那', mark: '❀', color: '#b36f82',
    nature: '利落、守时、很会照料别人，却不喜欢把关心挂在嘴边。',
    wants: '把今天的待办做完；让餐桌与庭院井井有条。',
  },
  {
    id: 'kosma', name: '科斯魔', title: '旭光', mark: '▣', color: '#648596',
    nature: '不擅长主动表达，但认真对待自己的收藏和答应别人的事。',
    wants: '把新得到的模型摆好；找机会与熟悉的人一起玩游戏。',
  },
  {
    id: 'mobius', name: '梅比乌斯', title: '无限', mark: '⌁', color: '#79a587',
    nature: '好奇心强、讲究验证，对草率结论没有耐心，偶尔故意逗人。',
    wants: '把手头实验推进一小步；守住实验记录的准确性。',
  },
  {
    id: 'griseo', name: '格蕾修', title: '繁星', mark: '✎', color: '#8a9ec0',
    nature: '安静敏锐，常用颜色和画面理解身边的人。',
    wants: '完成一幅今天才会出现的画；找到愿意听她描述颜色的人。',
  },
  {
    id: 'hua', name: '华', title: '浮生', mark: '◈', color: '#728fa9',
    nature: '自律、认真，有事会帮忙，却容易把休息排到最后。',
    wants: '完成今日锻炼；在大家忙不过来时搭一把手。',
  },
  {
    id: 'pardo', name: '帕朵菲莉丝', title: '空梦', mark: '✧', color: '#d2a468',
    nature: '机灵、爱占小便宜，也愿意在熟人需要时帮忙。',
    wants: '找到今天能交换的有趣东西；别错过晚饭和午睡。',
  },
] as const;

export type PersonId = typeof PEOPLE[number]['id'];

export const personById = Object.fromEntries(PEOPLE.map((person) => [person.id, person])) as Record<PersonId, typeof PEOPLE[number]>;
export const placeById = Object.fromEntries(PLACES.map((place) => [place.id, place])) as Record<PlaceId, typeof PLACES[number]>;
