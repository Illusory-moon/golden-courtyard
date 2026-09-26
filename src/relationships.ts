import { PEOPLE, type PersonId } from './people';

export const OFFICIAL_RELATIONSHIP_SOURCE = 'https://webstatic.mihoyo.com/bh3/event/e20200310rolemap/index.html';

// Each label follows the arrow from the row's resident to the named resident.
const labels: Record<PersonId, Partial<Record<PersonId, string>>> = {
  kevin: { elysia: '信任', aponia: '保持关注', eden: '时代巨星', villv: '配合', kalpas: '对手', su: '挚友', sakura: '战友', kosma: '在意的后辈', mobius: '保持关注', griseo: '前辈的女儿', hua: '战友', pardo: '没什么办法' },
  elysia: { kevin: '喜欢', aponia: '喜欢', eden: '喜欢', villv: '喜欢', kalpas: '喜欢', su: '喜欢', sakura: '喜欢', kosma: '喜欢', mobius: '喜欢', griseo: '喜欢', hua: '喜欢', pardo: '喜欢' },
  aponia: { kevin: '人类的领导者', elysia: '铭记', eden: '圣洁的歌声', villv: '难窥其心', kalpas: '想要帮助', su: '同类', sakura: '敬而远之', kosma: '想要帮助', mobius: '难以认同', griseo: '爱护', hua: '想要帮助', pardo: '保持关注' },
  eden: { kevin: '英雄', elysia: '喜欢', aponia: '理解', villv: '资金援助', kalpas: '悲伤的人', su: '棋友', sakura: '时尚代表', kosma: '予以指导', mobius: '美丽的人', griseo: '关照', hua: '火种', pardo: '有趣的人' },
  villv: { kevin: '重要目标', elysia: '充满兴趣', aponia: '应付不来', eden: '投资人', kalpas: '想要揭秘', su: '哲学交流', sakura: '同道', kosma: '魔术助手', mobius: '互为对手', griseo: '潜在观众', hua: '潜在观众', pardo: '潜在观众' },
  kalpas: { kevin: '保持关注', elysia: '可信', aponia: '滚', eden: '噪音', villv: '铁匠', su: '盲人', sakura: '战友', kosma: '有趣', mobius: '滚', griseo: '小孩', hua: '新兵', pardo: '小猫' },
  su: { kevin: '挚友', elysia: '感佩', aponia: '抱有戒心', eden: '时代巨星', villv: '无能为力', kalpas: '试图开解', sakura: '心理治疗', kosma: '心理治疗', mobius: '难以认同', griseo: '心理治疗', hua: '同乡', pardo: '没什么办法' },
  sakura: { kevin: '战友', elysia: '感激', aponia: '敬而远之', eden: '时尚代表', villv: '同道', kalpas: '战友', su: '接受治疗', kosma: '沉默的后辈', mobius: '共事', griseo: '关心', hua: '筷子组', pardo: '猫毛过敏' },
  kosma: { kevin: '曾经憧憬', elysia: '可靠的前辈', aponia: '忌惮', eden: '演奏交流', villv: '……', kalpas: '有趣', su: '接受治疗', sakura: '可靠的前辈', mobius: '忌惮', griseo: '爱护', hua: '同伴', pardo: '同伴' },
  mobius: { kevin: '保持关注', elysia: '你胖了', aponia: '优柔寡断', eden: '怀念', villv: '互为对手', kalpas: '想要研究', su: '优柔寡断', sakura: '共事', kosma: '研究过了', griseo: '爱护', hua: '反复研究', pardo: '还想研究' },
  griseo: { kevin: '冷冷的', elysia: '“ ”', aponia: '阿波尼亚妈妈', eden: '闪闪发光的', villv: '五颜六色的', kalpas: '害怕……', su: '绿茸茸的', sakura: '软软的', kosma: '关心', mobius: '梅比乌斯阿姨', hua: '暖暖的', pardo: '毛茸茸的' },
  hua: { kevin: '战友', elysia: '尊敬', aponia: '敬而远之', eden: '时代巨星', villv: '似曾相识', kalpas: '警戒', su: '同乡', sakura: '筷子组', kosma: '同伴', mobius: '束手无策', griseo: '有些在意', pardo: '同伴' },
  pardo: { kevin: '老大！', elysia: '很厉害', aponia: '惹不起', eden: '大老板', villv: '进货目标', kalpas: '救命！', su: '进货目标', sakura: '兽耳同盟', kosma: '同伴', mobius: '惹不起', griseo: '玩伴', hua: '同伴' },
};

export const OFFICIAL_RELATIONSHIPS = PEOPLE.flatMap(({ id: from }) =>
  PEOPLE.filter(({ id: to }) => to !== from).map(({ id: to }) => ({ from, to, label: labels[from][to] ?? '' })),
);

export function relationshipsFrom(id: PersonId) {
  return OFFICIAL_RELATIONSHIPS.filter((entry) => entry.from === id);
}
