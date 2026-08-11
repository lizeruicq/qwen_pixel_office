/**
 * 小办公室地图配置（俯视角星露谷风，tile=16px，22×14）。
 * 素材复用自参考项目 tileset.png / objects/*。
 * 预留位仅保留数据（未来商店），不在场景中渲染任何标记。
 */

export const TILE = 16;
export const MAP = { cols: 22, rows: 14 };

/** tileset 索引 */
export const T = {
  WOOD: 1, // 木地板（横）
  WOODV: 3, // 木地板（竖，用作地毯边界）
  CONC: 4, // 水泥地
  MARB: 5, // 大理石
  CARPET: 6, // 蓝地毯
  RUG: 8, // 红地毯
  MAT: 9, // 门垫
  SAND: 11, // 沙色墙
  CITYWIN: 12, // 城市夜景窗
  GLASS: 13, // 玻璃侧窗
  GRASS: 16, // 草色底边
  POST1: 17, // 海报·火箭
  POST2: 18, // 海报·红
  ACCENT: 20, // 墙上挂钟
};

/** 22×14 房间布局 */
export function floorLayout() {
  const g = [];
  for (let r = 0; r < MAP.rows; r++) {
    const row = [];
    for (let c = 0; c < MAP.cols; c++) {
      let t;
      if (r === 0) t = c === 0 || c === MAP.cols - 1 ? T.SAND : c === 10 ? T.ACCENT : c % 5 === 0 ? T.SAND : T.CITYWIN;
      else if (r === MAP.rows - 1) t = c === 10 || c === 11 ? T.MAT : T.MARB; // 底行：大理石，中间入口
      else if (c === 0) {
        if (r === 2) t = T.POST1;
        else if (r === 4) t = T.POST2;
        else t = T.SAND; // 左墙统一用沙色墙
      } else if (c === MAP.cols - 1) t = T.SAND; // 右墙统一用沙色墙
      else if (c >= 19 && r >= 4 && r <= 7) t = T.MARB; // 水吧区大理石
      else if (c >= 16 && r >= 8) t = (c === 17 || c === 18) && (r === 11 || r === 12) ? T.RUG : T.CARPET;
      else if (c === 15 && r >= 8) t = T.WOODV;
      else t = T.WOOD;
      row.push(t);
    }
    g.push(row);
  }
  return g;
}

/** 物件对象层（中心 x，底边 y） */
export const OBJECTS = [
  // 顶墙：饮水机 + 并排书架
  { key: 'water_cooler', x: 250, y: 44 },
  { key: 'bookshelf', x: 290, y: 44 },
  { key: 'bookshelf', x: 324, y: 44 },
  // 圆桌讨论角（吧凳），靠近右上书架
  { key: 'cactus', x: 210, y: 60 },
  { key: 'round_table', x: 270, y: 80 },
  { key: 'bar_stool', x: 252, y: 96 },
  { key: 'bar_stool', x: 288, y: 96 },
  // 工位区前方大屏幕
  { key: 'big_screen', x: 84, y: 80 },
  // 右墙：咖啡吧
  { key: 'coffee_machine', x: 330, y: 96 },
  { key: 'fridge', x: 330, y: 140 },
  { key: 'plant_monstera', x: 326, y: 188 },
  // 2×2 工位（带电脑）
  { key: 'desk_dual', x: 60, y: 108 },
  { key: 'ergo_chair', x: 60, y: 126 },
  { key: 'desk_dual', x: 108, y: 108 },
  { key: 'ergo_chair', x: 108, y: 126 },
  { key: 'desk_laptop', x: 60, y: 150 },
  { key: 'ergo_chair', x: 60, y: 168 },
  { key: 'desk_laptop', x: 108, y: 150 },
  { key: 'ergo_chair', x: 108, y: 168 },
  { key: 'filing', x: 134, y: 112 },
  { key: 'trash', x: 138, y: 168 },
  // 休息区
  { key: 'lamp', x: 228, y: 148 },
  { key: 'sofa', x: 276, y: 156 },
  { key: 'armchair', x: 232, y: 180 },
  { key: 'coffee_table', x: 276, y: 186 },
  { key: 'beanbag', x: 222, y: 204 },
  // 左墙
  { key: 'plant_small', x: 30, y: 92 },
  { key: 'scooter', x: 26, y: 140 },
  { key: 'kanban', x: 44, y: 204 },
  { key: 'kanban', x: 80, y: 204 },
];

/** 碰撞 footprint（来自参考项目） */
export const FOOTPRINTS = {
  desk_laptop: [28, 10],
  desk_dual: [28, 10],
  ergo_chair: [10, 10],
  bar_stool: [10, 8],
  kanban: [28, 8],
  sofa: [44, 12],
  armchair: [12, 10],
  coffee_table: [28, 8],
  plant_monstera: [12, 8],
  plant_small: [10, 8],
  bookshelf: [28, 8],
  coffee_machine: [12, 10],
  water_cooler: [12, 10],
  snack_shelf: [28, 8],
  fridge: [20, 10],
  cactus: [10, 8],
  beanbag: [14, 8],
  scooter: [12, 8],
  filing: [12, 10],
  round_table: [20, 14],
  big_screen: [40, 8],
  lamp: [10, 8],
  trash: [10, 8],
};

/** 功能热点（钉钉实体投射） */
export const HOTSPOTS = [
  { id: 'desk', name: '工位', x: 108, y: 184 },
  { id: 'board', name: '任务板', x: 62, y: 200 },
  { id: 'sofa', name: '沙发', x: 276, y: 200 },
  { id: 'coffee', name: '咖啡机', x: 314, y: 110 },
  { id: 'shelf', name: '书架', x: 300, y: 62 },
];

/** 预留位数据（未来商店购买家具的空位，不渲染） */
export const RESERVED_SLOTS = [
  { id: 'A', x: 176, y: 120, w: 60, h: 44 },
  { id: 'B', x: 176, y: 176, w: 60, h: 44 },
  { id: 'C', x: 178, y: 80, w: 56, h: 36 },
];

export const WALK_BOUNDS = { minX: 24, maxX: 340, minY: 56, maxY: 200 };
export const SPAWN = { x: 170, y: 150 };

/** 点击触发面板的物件区域（中心 x / 底边 y / 宽 / 高） */
export const PANEL_TRIGGERS = [
  { tab: 'events', x: 84, y: 80, w: 52, h: 36 }, // 大显示屏 → 事件流
  { tab: 'messages', x: 60, y: 110, w: 44, h: 34 }, // 电脑工位 1
  { tab: 'messages', x: 108, y: 110, w: 44, h: 34 }, // 电脑工位 2
  { tab: 'messages', x: 60, y: 152, w: 44, h: 34 }, // 电脑工位 3
  { tab: 'messages', x: 108, y: 152, w: 44, h: 34 }, // 电脑工位 4
  { tab: 'tasks', x: 44, y: 204, w: 36, h: 34 }, // 左白板 → 待办
  { tab: 'secretary', x: 80, y: 204, w: 36, h: 34 }, // 右白板 → 秘书
];

/** 光晕：[x, y, warm|cool] */
export const GLOWS = [
  [84, 104, 'cool'],
  [84, 146, 'cool'],
  [276, 150, 'warm'],
  [330, 96, 'cool'],
  [84, 72, 'cool'],
  [306, 40, 'warm'],
];
