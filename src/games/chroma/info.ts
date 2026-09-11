import type { GameDefinition } from '../../lib/game-library';
import { loadRecords, bestRecord, recordScore } from '../../lib/storage';

export const chroma: GameDefinition = {
  id: 'chroma',
  name: 'Chroma Dash',
  href: '/chroma/',
  cover: '/images/chroma-pastel-cover.webp',
  logo: '/images/chroma-dash-logo.webp',
  background: '/images/chroma-pastel-background.webp',
  backgroundPosition: '78% center',
  backgroundColor: '#f5ead5',
  theme: 'light',
  ui: {
    text: '#494b43',
    muted: '#686b62',
    accent: '#61796e',
    button: '#ddb29a73',
    buttonText: '#303a36',
    panel: '#fffaf073',
    selection: '#708279',
    overlay: '#f5ead508',
    mobileOverlay: '#f5ead5e6',
    dialog: '#faf7efdb',
  },
  tags: ['色彩'],
  description: '挑战使用红绿蓝调出眼前的颜色。',
  instructions: [
    '观察目标颜色，调整红、绿、蓝滑杆，也可以输入 RGB 数值或 HEX 色号。',
    '准度挑战：每关 30 秒，共 10 关，最终成绩为平均准确率。',
    '速度挑战：准确率达到 85% 即可过关，否则加罚 1 秒；十关总用时越低越好。',
    '盲猜模式：沿用准度挑战规则，调色时隐藏你的颜色，提交或超时后揭晓。',
  ],
  stats: {
    title: '挑战最佳成绩',
    read: () => {
      const records = loadRecords();
      return (
        [
          ['accuracy', '准度'],
          ['speed', '速度'],
          ['blind', '盲猜'],
        ] as const
      ).map(([mode, label]) => {
        const best = bestRecord(mode, records);
        return { label, value: best ? recordScore(best) : '—' };
      });
    },
  },
};
