import { personById, placeById } from './people';
import { dayHighlights, SLOTS, type World } from './world';

const line = (text: string) => text.replace(/\s+/g, ' ').trim();

export function yearbook(world: World, firstDay: number, lastDay: number): string {
  const first = Math.max(1, Math.floor(firstDay));
  const last = Math.min(world.day, Math.floor(lastDay));
  const pages = [`# 黄金庭院 · 第 ${first}—${last} 天`, '', '非商业同人模拟记录 · 由本地存档整理', ''];
  for (let day = first; day <= last; day += 1) {
    const scenes = world.scenes.filter((scene) => scene.day === day);
    if (!scenes.length) continue;
    pages.push(`## 第 ${day} 天`, '');
    const highlights = dayHighlights(world, day);
    for (const highlight of highlights) pages.push(`- ${line(highlight)}`);
    if (highlights.length) pages.push('');
    for (const scene of scenes) {
      const heading = `### ${SLOTS[scene.slot]} · ${placeById[scene.placeId].name}`;
      if (scene.kind === 'action') {
        pages.push(`${heading} · ${personById[scene.actorId].name}：${line(scene.activity)}`, '', line(scene.summary || scene.activity));
        for (const step of scene.steps) pages.push('', line(step));
        if (scene.quote) pages.push('', `> ${line(scene.quote)}`);
        if (scene.objectResult) pages.push('', `物品：${line(scene.objectResult)}`);
      } else if (scene.kind === 'encounter') {
        pages.push(`${heading} · ${line(scene.title)}`, '');
        for (const speech of scene.lines) pages.push(`- **${personById[speech.actorId].name}**：${line(speech.text)}`);
      } else if (scene.kind === 'dinner') {
        pages.push(`${heading} · ${line(scene.title)}`, '', line(scene.description), '', `到场：${scene.attendees.map((id) => personById[id].name).join('、') || '无人'}`);
        if (scene.absentees.length) pages.push(`缺席：${scene.absentees.map(({ actorId, reason }) => `${personById[actorId].name}（${line(reason)}）`).join('、')}`);
        for (const speech of scene.lines) pages.push(`- **${personById[speech.actorId].name}**：${line(speech.text)}`);
      } else pages.push(`${heading} · ${line(scene.title)}`, '', line(scene.description));
      pages.push('');
    }
  }
  return pages.join('\n');
}
