import type { GameDefinition } from '../../lib/game-library';
import { readProgress, readResults } from './storage';

export const landroidExtended: GameDefinition = {
  id: 'landroid-extended',
  name: 'Landroid extended',
  href: '/landroid-extended/',
  cover: '/images/landroid-extended-cover.svg',
  logo: '/images/landroid-extended-logo.svg',
  background: '/images/landroid-extended-background.svg',
  backgroundPosition: '72% center',
  backgroundColor: '#16161d',
  theme: 'dark',
  ui: {
    text: '#dddde9',
    muted: '#a7a7ca',
    accent: '#b7b7ff',
    button: '#b7b7ff24',
    buttonText: '#dddde9',
    panel: '#29293673',
    selection: '#b7b7ff',
    overlay: '#16161d35',
    mobileOverlay: '#16161de0',
    dialog: '#20202bed',
  },
  tags: ['太空', '探索'],
  description: '驾驶飞船探索星系。',
  instructions: [
    '按住并拖动调整朝向，拖出内圈开始推进；松手后飞船依照惯性与引力继续移动。',
    '使用鼠标或单指拖动驾驶飞船，屏幕边缘的小三角与编号指向各个星球。',
    '船头朝外、支脚朝向地面即可着陆，展开旗帜并发现天体信息。持续推进一秒再次起飞。',
    '初始 5000 分；首次着陆获得探索、速度与朝向奖励，飞行时间、燃料和船头撞击扣分。按编号完整探索另加 2000 分。',
    '完成全部星球后可上传得分并前往新的星系。开启 AUTO 会停止本局计分，着陆观光 15 秒后继续自动探索。',
    '点击右上角三点打开菜单。飞行进度自动保存在当前浏览器。',
  ],
  stats: {
    title: '探索记录',
    read: () => {
      const progress = readProgress();
      const results = readResults();
      return [
        {
          label: '最高得分',
          value: results.length
            ? String(Math.max(...results.map((r) => r.score)))
            : '—',
        },
        {
          label: '已发现天体',
          value: progress ? `${progress.explored} / ${progress.total}` : '—',
        },
      ];
    },
  },
};
