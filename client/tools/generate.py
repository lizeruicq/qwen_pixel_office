#!/usr/bin/env python3
"""Luxury tech-company pixel office: tiles + sprites + map + preview."""
import json
import os
import random
import struct
import zlib
import binascii

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.normpath(os.path.join(BASE_DIR, '..', 'public', 'assets'))
OBJ_DIR = os.path.join(OUT_DIR, 'objects')
TILE = 16
TS_COLS = 8
TS_ROWS = 8
MAP_W = 24
MAP_H = 24
PW, PH = 16, 24

P = {
    'outline': (46, 34, 28),
    'wall': (236, 226, 202), 'wall_sh': (210, 196, 168), 'baseboard': (172, 150, 118),
    'wood1': (216, 182, 134), 'wood1d': (190, 152, 106), 'wood1l': (232, 202, 156),
    'wood2': (202, 166, 118), 'wood2d': (174, 136, 92),
    'wood3': (172, 136, 92), 'wood3d': (142, 108, 70),
    'concrete': (176, 178, 182), 'concrete_d': (150, 152, 157), 'concrete_l': (198, 200, 204),
    'marble': (232, 230, 224), 'marble_d': (200, 198, 192), 'vein': (170, 172, 176),
    'cblue': (110, 148, 176), 'cblue_d': (86, 120, 146), 'cblue_l': (140, 178, 204),
    'tile': (224, 222, 214), 'tile_d': (192, 190, 182), 'grout': (158, 156, 150),
    'rug': (176, 96, 96), 'rug_d': (142, 70, 70),
    'mat': (120, 84, 84), 'mat_d': (96, 66, 66),
    'gdoor': (168, 200, 220), 'gdoor_d': (120, 150, 172),
    'glass': (196, 220, 236, 110), 'glass_f': (110, 130, 146), 'glass_l': (230, 242, 250),
    'logo': (74, 60, 50), 'logo_d': (56, 44, 38), 'logo_l': (96, 78, 64),
    'moss': (96, 138, 84), 'moss_d': (70, 108, 62), 'moss_l': (128, 172, 108),
    'poster1': (44, 62, 110), 'poster1_a': (240, 200, 80),
    'poster2': (196, 90, 84), 'poster2_a': (250, 246, 240),
    'desk': (176, 132, 84), 'desk_d': (132, 94, 56), 'desk_l': (204, 162, 112), 'desk_xd': (104, 72, 42),
    'mon': (36, 40, 48), 'scr': (116, 188, 226), 'scr_d': (80, 146, 186),
    'key': (74, 78, 86), 'mug': (200, 92, 84),
    'paper': (248, 246, 238), 'paper_d': (214, 206, 190),
    'chair': (88, 128, 150), 'chair_d': (62, 94, 114), 'chair_l': (120, 164, 186),
    'ergo': (70, 74, 84), 'ergo_d': (50, 54, 62), 'ergo_l': (104, 110, 122),
    'leaf': (88, 164, 74), 'leaf_d': (62, 126, 56), 'leaf_l': (128, 200, 100),
    'pot': (162, 94, 62), 'pot_d': (124, 66, 44), 'pot_l': (190, 122, 86),
    'wc': (98, 148, 192), 'wc_d': (72, 114, 156), 'wc_l': (132, 178, 216),
    'bottle': (226, 238, 248), 'bottle_d': (180, 204, 226),
    'coffee': (60, 54, 52), 'coffee_l': (108, 98, 92),
    'shelf': (150, 110, 70), 'shelf_d': (114, 80, 50),
    'bkr': (186, 84, 78), 'bkb': (88, 118, 164), 'bkg': (102, 152, 92), 'bky': (212, 188, 96), 'bkp': (150, 110, 170),
    'file': (128, 136, 144), 'file_d': (96, 104, 112), 'file_l': (158, 166, 174),
    'sofa': (96, 116, 158), 'sofa_d': (72, 88, 124), 'sofa_l': (128, 150, 190),
    'arm': (196, 140, 88), 'arm_d': (158, 108, 64), 'arm_l': (220, 170, 118),
    'trash': (96, 102, 110), 'trash_d': (68, 74, 82),
    'lamp': (186, 164, 116), 'shade': (246, 238, 208), 'shade_d': (214, 200, 164),
    'skin': (246, 206, 162), 'skin_d': (222, 176, 132),
    'hair': (74, 56, 40), 'hair_l': (108, 84, 60),
    'hair2': (40, 40, 46), 'hair2_l': (70, 70, 78),
    'hair3': (150, 96, 56), 'hair3_l': (180, 124, 80),
    'shirt': (92, 134, 158), 'shirt_d': (64, 98, 120), 'shirt_l': (128, 172, 196),
    'pants': (66, 74, 92), 'pants_d': (48, 54, 70),
    'shoe': (50, 50, 56), 'eye': (40, 44, 52),
    'sky': (150, 208, 236), 'sky_d': (116, 182, 216), 'cloud': (248, 250, 252),
    'bld': (96, 110, 132), 'bld_d': (72, 84, 104), 'bld_l': (240, 220, 130),
    'wframe': (250, 248, 242), 'sill': (188, 168, 138),
    'wb': (244, 246, 248), 'wb_d': (200, 206, 212),
    'fridge': (214, 218, 224), 'fridge_d': (168, 174, 184), 'fridge_l': (240, 244, 248),
    'vend': (52, 94, 140), 'vend_d': (36, 66, 102), 'vend_l': (80, 130, 180),
    'arc': (196, 64, 88), 'arc_d': (150, 44, 64), 'arc_l': (226, 100, 122),
    'pp': (54, 110, 176), 'pp_d': (38, 82, 140), 'pp_l': (86, 146, 210),
    'foos': (120, 84, 56), 'foos_d': (88, 60, 38),
    'serv': (56, 60, 70), 'serv_d': (38, 42, 50), 'serv_l': (86, 92, 104),
    'led_g': (120, 240, 140), 'led_b': (120, 200, 250), 'led_r': (250, 110, 110), 'led_y': (250, 220, 120),
    'booth': (224, 190, 140), 'booth_d': (184, 148, 104), 'booth_l': (244, 216, 170),
    'bean': (226, 170, 90), 'bean_d': (186, 132, 60), 'bean_l': (246, 200, 130),
    'gold': (238, 200, 90), 'gold_d': (190, 152, 60),
    'black': (30, 32, 38), 'white': (252, 252, 252), 'phone': (52, 56, 64),
    'scoot': (220, 90, 90), 'scoot_d': (150, 60, 60),
}


class S:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = [(0, 0, 0, 0)] * (w * h)

    def _n(self, c):
        return c if len(c) == 4 else (c[0], c[1], c[2], 255)

    def set(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y * self.w + x] = self._n(c)

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[y * self.w + x]
        return (0, 0, 0, 0)

    def fill(self, c):
        c = self._n(c)
        self.px = [c] * (self.w * self.h)

    def rect(self, x1, y1, x2, y2, c):
        c = self._n(c)
        for y in range(max(0, y1), min(self.h - 1, y2) + 1):
            for x in range(max(0, x1), min(self.w - 1, x2) + 1):
                self.px[y * self.w + x] = c

    def hl(self, y, x1, x2, c):
        for x in range(max(0, x1), min(self.w - 1, x2) + 1):
            self.set(x, y, c)

    def vl(self, x, y1, y2, c):
        for y in range(max(0, y1), min(self.h - 1, y2) + 1):
            self.set(x, y, c)

    def ell(self, x1, y1, x2, y2, c):
        c = self._n(c)
        cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
        rx, ry = max(0.5, (x2 - x1) / 2), max(0.5, (y2 - y1) / 2)
        for y in range(max(0, y1), min(self.h - 1, y2) + 1):
            for x in range(max(0, x1), min(self.w - 1, x2) + 1):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                    self.px[y * self.w + x] = c

    def shadow(self, cx, y, w, h, a=70):
        self.ell(cx - w // 2, y - h // 2, cx + w // 2, y + h // 2, (20, 16, 24, a))

    def blit(self, src, dx, dy):
        for y in range(src.h):
            for x in range(src.w):
                c = src.px[y * src.w + x]
                if c[3] > 0:
                    self.set(dx + x, dy + y, c)

    def rows(self):
        return [self.px[y * self.w:(y + 1) * self.w] for y in range(self.h)]


def write_png(path, rows):
    h, w = len(rows), len(rows[0])
    raw = bytearray()
    for row in rows:
        raw.append(0)
        for r, g, b, a in row:
            raw.extend((r, g, b, a))
    comp = zlib.compress(bytes(raw))

    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', binascii.crc32(t + d) & 0xFFFFFFFF)

    data = bytes([137, 80, 78, 71, 13, 10, 26, 10])
    data += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    data += chunk(b'IDAT', comp)
    data += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(data)


# ---------------- tiles ----------------
def t_wood(base, dark, light, vertical=False):
    s = S(TILE, TILE)
    s.fill(base)
    if vertical:
        for x in range(0, TILE, 4):
            s.vl(x, 0, TILE - 1, dark)
        s.vl(1, 0, TILE - 1, light)
    else:
        for y in range(0, TILE, 4):
            s.hl(y, 0, TILE - 1, dark)
        s.hl(1, 0, TILE - 1, light)
    for _ in range(3):
        x, y = random.randint(1, TILE - 4), random.randint(1, TILE - 2)
        s.rect(x, y, x + 2, y, dark)
    return s


def t_concrete():
    s = S(TILE, TILE)
    s.fill(P['concrete'])
    for _ in range(10):
        s.set(random.randint(0, 15), random.randint(0, 15), P['concrete_d'])
    for _ in range(5):
        s.set(random.randint(0, 15), random.randint(0, 15), P['concrete_l'])
    s.hl(0, 0, 15, P['concrete_l'])
    return s


def t_marble():
    s = S(TILE, TILE)
    s.fill(P['marble'])
    for _ in range(3):
        x, y = random.randint(1, 10), random.randint(1, 10)
        for i in range(random.randint(3, 6)):
            s.set(x + i, y + i // 2, P['vein'])
    s.set(1, 1, P['white'])
    s.set(14, 13, P['marble_d'])
    return s


def t_carpet(base, dark, light):
    s = S(TILE, TILE)
    s.fill(base)
    for y in range(0, TILE, 4):
        for x in range(0, TILE, 4):
            s.set(x + 1, y + 1, dark)
            s.set(x + 2, y + 2, dark)
            s.set(x + 1, y + 2, light)
    return s


def t_tile():
    s = S(TILE, TILE)
    s.fill(P['tile'])
    s.hl(0, 0, 15, P['grout']); s.hl(8, 0, 15, P['grout'])
    s.vl(0, 0, 15, P['grout']); s.vl(8, 0, 15, P['grout'])
    s.rect(1, 1, 6, 6, P['tile_d']); s.rect(9, 9, 14, 14, P['tile_d'])
    s.set(2, 2, P['white']); s.set(10, 10, P['white'])
    return s


def t_rug():
    s = S(TILE, TILE)
    s.fill(P['rug'])
    s.hl(0, 0, 15, P['rug_d']); s.hl(15, 0, 15, P['rug_d'])
    s.vl(0, 0, 15, P['rug_d']); s.vl(15, 0, 15, P['rug_d'])
    for y in range(3, 13, 4):
        for x in range(3, 13, 4):
            s.set(x, y, P['rug_d'])
    return s


def t_mat():
    s = S(TILE, TILE)
    s.fill(P['mat'])
    for y in range(2, 16, 4):
        s.hl(y, 1, 14, P['mat_d'])
    return s


def t_gdoor():
    s = S(TILE, TILE)
    s.fill(P['gdoor'])
    s.rect(2, 0, 13, 15, P['gdoor_d'])
    s.rect(4, 2, 11, 13, P['gdoor'])
    s.set(5, 3, P['white']); s.set(6, 5, P['white'])
    return s


def t_wall():
    s = S(TILE, TILE)
    s.fill(P['wall'])
    for _ in range(6):
        s.set(random.randint(1, 14), random.randint(1, 11), P['wall_sh'])
    s.hl(0, 0, 15, P['wall_sh'])
    s.rect(0, 13, 15, 15, P['baseboard'])
    return s


def t_window_city():
    s = S(TILE, TILE)
    s.fill(P['sky'])
    s.rect(0, 9, 15, 13, P['sky_d'])
    # skyline
    s.rect(1, 6, 4, 13, P['bld']); s.rect(6, 4, 9, 13, P['bld_d']); s.rect(11, 7, 14, 13, P['bld'])
    for bx, by in ((2, 7), (3, 10), (7, 5), (8, 8), (12, 9), (13, 11)):
        s.set(bx, by, P['bld_l'])
    s.set(4, 3, P['cloud']); s.set(5, 3, P['cloud']); s.set(12, 2, P['cloud'])
    s.rect(0, 0, 15, 1, P['wframe'])
    s.vl(0, 0, 15, P['wframe']); s.vl(15, 0, 15, P['wframe']); s.vl(7, 1, 12, P['wframe'])
    s.rect(0, 14, 15, 15, P['sill'])
    return s


def t_glass():
    s = S(TILE, TILE)
    s.fill(P['glass'])
    s.rect(0, 0, 15, 1, P['glass_f'])
    s.rect(0, 14, 15, 15, P['glass_f'])
    s.set(3, 4, P['glass_l']); s.set(4, 6, P['glass_l']); s.set(10, 8, P['glass_l'])
    return s


def t_logo():
    s = S(TILE, TILE)
    s.fill(P['logo'])
    s.vl(0, 0, 15, P['logo_d']); s.vl(8, 0, 15, P['logo_d'])
    s.hl(0, 0, 15, P['logo_l'])
    return s


def t_logo_mark():
    s = t_logo()
    s.rect(3, 4, 6, 7, P['bkb'])
    s.rect(7, 4, 10, 7, P['bkg'])
    s.rect(3, 8, 6, 11, P['bky'])
    s.rect(7, 8, 10, 11, P['bkr'])
    s.set(4, 5, P['white']); s.set(8, 9, P['white'])
    return s


def t_moss():
    s = S(TILE, TILE)
    s.fill(P['moss'])
    for _ in range(26):
        s.set(random.randint(0, 15), random.randint(0, 15), random.choice([P['moss_d'], P['moss_l']]))
    s.rect(0, 13, 15, 15, P['baseboard'])
    return s


def t_poster1():
    s = t_wall()
    s.rect(3, 2, 12, 10, P['outline'])
    s.rect(4, 3, 11, 9, P['poster1'])
    # rocket
    s.rect(7, 4, 8, 6, P['poster1_a'])
    s.set(6, 6, P['poster1_a']); s.set(9, 6, P['poster1_a'])
    s.set(7, 7, P['white']); s.set(8, 7, P['poster2'])
    return s


def t_poster2():
    s = t_wall()
    s.rect(3, 2, 12, 10, P['outline'])
    s.rect(4, 3, 11, 9, P['poster2'])
    s.ell(6, 4, 9, 7, P['poster2_a'])
    s.hl(9, 5, 10, P['poster2_a'])
    return s


def t_whiteboard():
    s = t_wall()
    s.rect(2, 3, 13, 9, P['wb_d'])
    s.rect(3, 4, 12, 8, P['wb'])
    s.hl(5, 5, 8, P['bkb']); s.hl(6, 6, 10, P['bkr']); s.set(11, 5, P['bkg'])
    return s


def t_clock():
    s = t_wall()
    s.ell(4, 2, 11, 9, P['white'])
    s.ell(5, 3, 10, 8, P['black'])
    s.ell(6, 4, 9, 7, P['white'])
    s.vl(7, 4, 6, P['black']); s.hl(6, 7, 9, P['black'])
    return s


def t_empty():
    return S(TILE, TILE)


# ---------------- furniture sprites ----------------
def o_desk_dual():
    s = S(32, 24)
    s.shadow(16, 21, 30, 5)
    s.rect(1, 6, 30, 17, P['desk']); s.rect(1, 6, 30, 8, P['desk_l']); s.rect(1, 15, 30, 17, P['desk_d'])
    s.rect(0, 17, 2, 22, P['desk_xd']); s.rect(29, 17, 31, 22, P['desk_xd'])
    # dual monitors
    s.rect(5, 1, 12, 7, P['black']); s.rect(6, 2, 11, 6, P['scr']); s.rect(6, 5, 11, 6, P['scr_d'])
    s.rect(19, 1, 26, 7, P['black']); s.rect(20, 2, 25, 6, P['scr_d']); s.rect(20, 2, 25, 4, P['scr'])
    s.rect(8, 7, 9, 9, P['black']); s.rect(22, 7, 23, 9, P['black'])
    s.set(7, 3, P['white']); s.set(21, 3, P['white'])
    s.rect(10, 12, 21, 14, P['key'])
    for x in range(11, 21, 2):
        s.set(x, 13, P['white'])
    s.ell(24, 12, 27, 14, P['key'])
    s.rect(3, 11, 6, 14, P['mug']); s.set(6, 12, P['mug']); s.set(4, 11, P['white'])
    s.rect(27, 8, 29, 11, P['leaf']); s.rect(27, 11, 29, 13, P['pot'])
    return s


def o_desk_laptop():
    s = S(32, 24)
    s.shadow(16, 21, 30, 5)
    s.rect(1, 6, 30, 17, P['desk']); s.rect(1, 6, 30, 8, P['desk_l']); s.rect(1, 15, 30, 17, P['desk_d'])
    s.rect(0, 17, 2, 22, P['desk_xd']); s.rect(29, 17, 31, 22, P['desk_xd'])
    # laptop
    s.rect(11, 3, 20, 9, P['file_d']); s.rect(12, 4, 19, 8, P['scr'])
    s.set(13, 5, P['white'])
    s.rect(10, 10, 21, 13, P['file_l']); s.rect(11, 11, 20, 12, P['key'])
    # notebook + phone + plant
    s.rect(4, 9, 8, 12, P['bkr']); s.set(5, 9, P['white'])
    s.rect(25, 9, 27, 12, P['phone'])
    s.rect(26, 3, 29, 6, P['leaf']); s.rect(27, 6, 28, 9, P['pot'])
    s.rect(4, 13, 6, 15, P['mug'])
    return s


def o_ergo_chair():
    s = S(16, 24)
    s.shadow(8, 21, 12, 4)
    s.rect(4, 1, 11, 3, P['ergo'])            # headrest
    s.rect(3, 4, 12, 12, P['ergo_d'])
    s.rect(4, 5, 11, 10, P['ergo'])
    s.rect(4, 5, 11, 6, P['ergo_l'])
    s.rect(3, 13, 12, 17, P['ergo'])
    s.rect(3, 13, 12, 14, P['ergo_l'])
    s.vl(7, 17, 20, P['black']); s.hl(20, 4, 11, P['black'])
    s.set(4, 21, P['black']); s.set(11, 21, P['black'])
    return s


def o_bar_counter():
    s = S(64, 28)
    s.shadow(32, 25, 62, 5)
    s.rect(1, 8, 62, 22, P['desk']); s.rect(1, 8, 62, 10, P['desk_l']); s.rect(1, 20, 62, 22, P['desk_d'])
    for x in range(5, 62, 8):
        s.vl(x, 12, 19, P['desk_d'])
    # espresso machine
    s.rect(6, 2, 15, 8, P['coffee']); s.rect(7, 3, 14, 4, P['coffee_l'])
    s.rect(9, 5, 12, 7, P['black']); s.set(10, 6, P['led_r'])
    # cups
    for i, x in enumerate((20, 24, 28)):
        s.rect(x, 5, x + 2, 7, P['white'])
    # snack jars
    s.rect(36, 3, 40, 8, P['bottle']); s.rect(36, 3, 40, 4, P['bky'])
    s.rect(42, 3, 46, 8, P['bottle']); s.rect(42, 3, 46, 4, P['bkr'])
    s.rect(52, 2, 58, 8, P['coffee_l']); s.rect(53, 3, 57, 6, P['bottle'])
    return s


def o_bar_stool():
    s = S(16, 20)
    s.shadow(8, 17, 11, 4)
    s.ell(4, 3, 11, 8, P['arm'])
    s.ell(4, 3, 11, 5, P['arm_l'])
    s.vl(7, 8, 14, P['black']); s.hl(14, 5, 10, P['black'])
    s.set(5, 15, P['black']); s.set(10, 15, P['black'])
    return s


def o_fridge():
    s = S(24, 40)
    s.shadow(12, 37, 20, 5)
    s.rect(3, 2, 20, 35, P['fridge']); s.rect(3, 2, 20, 4, P['fridge_l'])
    s.rect(3, 18, 20, 19, P['fridge_d'])
    s.vl(11, 2, 35, P['fridge_d'])
    s.rect(9, 8, 10, 14, P['file_d']); s.rect(12, 8, 13, 14, P['file_d'])
    s.rect(9, 22, 10, 30, P['file_d']); s.rect(12, 22, 13, 30, P['file_d'])
    # magnets
    s.set(5, 6, P['bkr']); s.set(7, 10, P['bky']); s.set(5, 24, P['bkb']); s.set(15, 6, P['bkg']); s.set(17, 26, P['bkp'])
    s.rect(3, 35, 20, 36, P['fridge_d'])
    return s


def o_vending():
    s = S(24, 40)
    s.shadow(12, 37, 20, 5)
    s.rect(2, 2, 21, 36, P['vend']); s.rect(2, 2, 21, 4, P['vend_l']); s.rect(2, 34, 21, 36, P['vend_d'])
    s.rect(4, 6, 15, 24, P['black'])
    items = [P['bkr'], P['bky'], P['bkg'], P['bkb'], P['bkp']]
    random.seed(11)
    for yy in range(8, 23, 5):
        s.hl(yy + 3, 5, 14, P['vend_d'])
        for xx in range(5, 14, 3):
            s.rect(xx, yy, xx + 1, yy + 2, random.choice(items))
    s.rect(17, 8, 20, 14, P['file_d']); s.set(18, 10, P['led_g'])
    s.rect(17, 18, 20, 21, P['black'])
    s.rect(4, 27, 15, 31, P['vend_d'])
    return s


def o_arcade():
    s = S(24, 40)
    s.shadow(12, 37, 20, 5)
    s.rect(3, 4, 20, 35, P['arc']); s.rect(3, 4, 20, 6, P['arc_l'])
    s.rect(3, 33, 20, 35, P['arc_d'])
    s.rect(5, 0, 18, 4, P['arc_d']); s.rect(6, 1, 17, 3, P['bky'])
    s.rect(6, 9, 17, 19, P['black']); s.rect(7, 10, 16, 17, P['scr'])
    s.set(9, 12, P['led_y']); s.set(12, 14, P['led_r']); s.set(14, 11, P['led_g'])
    s.rect(6, 22, 17, 26, P['arc_d'])
    s.set(9, 24, P['bkr']); s.set(13, 24, P['bkb'])
    s.vl(11, 21, 23, P['black']); s.set(11, 21, P['led_r'])
    return s


def o_pingpong():
    s = S(48, 26)
    s.shadow(24, 23, 46, 5)
    s.rect(1, 8, 46, 20, P['pp']); s.rect(1, 8, 46, 10, P['pp_l']); s.rect(1, 18, 46, 20, P['pp_d'])
    s.vl(23, 6, 21, P['white']); s.rect(22, 6, 25, 8, P['black'])
    s.hl(14, 1, 46, P['white']); s.hl(8, 1, 46, P['white'])
    s.rect(4, 20, 6, 24, P['black']); s.rect(41, 20, 43, 24, P['black'])
    s.ell(8, 4, 12, 8, P['arc'])   # paddle
    s.set(15, 5, P['white'])       # ball
    return s


def o_foosball():
    s = S(32, 24)
    s.shadow(16, 21, 30, 5)
    s.rect(2, 5, 29, 18, P['foos']); s.rect(2, 5, 29, 7, P['desk_l']); s.rect(2, 16, 29, 18, P['foos_d'])
    s.rect(4, 8, 27, 15, P['bkg']); s.rect(4, 8, 27, 9, P['leaf_l'])
    for x in (8, 14, 20, 26):
        s.vl(x, 4, 19, P['file_l'])
        s.set(x, 10, P['bkr']); s.set(x, 13, P['bkb'])
    s.rect(3, 18, 5, 22, P['black']); s.rect(26, 18, 28, 22, P['black'])
    return s


def o_server_rack():
    s = S(16, 40)
    s.shadow(8, 37, 13, 4)
    s.rect(3, 2, 12, 36, P['serv']); s.rect(3, 2, 12, 3, P['serv_l'])
    leds = [P['led_g'], P['led_b'], P['led_r'], P['led_y']]
    random.seed(5)
    for y in range(5, 34, 4):
        s.rect(4, y, 11, y + 2, P['serv_d'])
        s.set(5, y + 1, random.choice(leds))
        s.set(10, y + 1, random.choice(leds))
    s.rect(3, 36, 12, 37, P['serv_d'])
    return s


def o_phone_booth():
    s = S(24, 40)
    s.shadow(12, 37, 20, 5)
    s.rect(2, 2, 21, 35, P['booth']); s.rect(2, 2, 21, 4, P['booth_l']); s.rect(2, 33, 21, 35, P['booth_d'])
    s.rect(5, 6, 18, 24, P['gdoor']); s.rect(6, 7, 17, 22, P['gdoor_d'])
    s.set(8, 9, P['white']); s.set(9, 11, P['white'])
    s.rect(15, 16, 17, 18, P['black'])
    s.rect(5, 26, 18, 30, P['booth_d'])
    s.rect(8, 27, 15, 29, P['bkr'])
    return s


def o_beanbag():
    s = S(16, 16)
    s.shadow(8, 13, 13, 4)
    s.ell(2, 4, 13, 13, P['bean'])
    s.ell(3, 4, 12, 8, P['bean_l'])
    s.ell(4, 10, 11, 13, P['bean_d'])
    s.set(6, 6, P['bean_d']); s.set(9, 7, P['bean_d'])
    return s


def o_armchair():
    s = S(16, 24)
    s.shadow(8, 21, 13, 4)
    s.rect(2, 4, 13, 12, P['arm_d']); s.rect(3, 5, 12, 10, P['arm']); s.rect(3, 5, 12, 6, P['arm_l'])
    s.rect(2, 12, 13, 18, P['arm']); s.rect(2, 12, 13, 13, P['arm_l'])
    s.rect(0, 6, 3, 17, P['arm_d']); s.rect(12, 6, 15, 17, P['arm_d'])
    s.rect(3, 18, 5, 20, P['black']); s.rect(10, 18, 12, 20, P['black'])
    return s


def o_round_table():
    s = S(24, 24)
    s.shadow(12, 19, 20, 5)
    s.ell(3, 3, 20, 16, P['desk']); s.ell(4, 4, 19, 12, P['desk_l']); s.ell(4, 12, 19, 16, P['desk_d'])
    s.rect(10, 16, 13, 20, P['desk_xd'])
    s.rect(7, 6, 10, 9, P['paper']); s.set(8, 7, P['paper_d'])
    s.rect(14, 9, 16, 12, P['mug'])
    return s


def o_trophy_shelf():
    s = S(32, 40)
    s.shadow(16, 37, 30, 5)
    s.rect(1, 2, 30, 35, P['shelf']); s.rect(1, 2, 30, 4, P['desk_l']); s.rect(1, 33, 30, 35, P['shelf_d'])
    for yy in (12, 22):
        s.rect(2, yy, 29, yy + 1, P['shelf_d'])
    for i, x in enumerate((4, 11, 18, 25)):
        s.rect(x, 7, x + 2, 11, P['gold']); s.rect(x + 1, 5, x + 1, 7, P['gold'])
        s.ell(x - 1, 4, x + 4, 7, P['gold'])
        s.set(x + 1, 4, P['white'])
    for i, x in enumerate((6, 16, 26)):
        s.rect(x, 16, x + 3, 21, P['gold_d']); s.ell(x - 1, 14, x + 4, 18, P['gold'])
    s.rect(5, 26, 10, 31, P['bkb']); s.rect(12, 26, 17, 31, P['bkr']); s.rect(20, 26, 27, 31, P['bkg'])
    return s


def o_plant_monstera():
    s = S(16, 28)
    s.shadow(8, 25, 13, 4)
    s.rect(5, 19, 10, 24, P['pot']); s.rect(5, 19, 10, 20, P['pot_l']); s.rect(5, 24, 10, 25, P['pot_d'])
    s.rect(7, 8, 8, 19, P['leaf'])
    s.ell(3, 6, 9, 12, P['leaf']); s.ell(6, 2, 12, 8, P['leaf_d'])
    s.ell(7, 10, 13, 16, P['leaf'])
    s.set(5, 8, P['leaf_l']); s.set(9, 4, P['leaf_l']); s.set(10, 12, P['leaf_l'])
    return s


def o_cactus():
    s = S(16, 20)
    s.shadow(8, 17, 11, 4)
    s.rect(5, 12, 10, 16, P['pot']); s.rect(5, 12, 10, 13, P['pot_l'])
    s.rect(6, 3, 9, 12, P['leaf'])
    s.rect(3, 6, 5, 10, P['leaf']); s.rect(10, 5, 12, 9, P['leaf'])
    s.rect(4, 5, 5, 6, P['leaf']); s.rect(10, 4, 11, 5, P['leaf'])
    s.set(7, 4, P['leaf_l']); s.set(8, 7, P['leaf_l'])
    s.set(7, 1, P['bkr']); s.set(8, 2, P['bkr'])
    return s


def o_scooter():
    s = S(16, 16)
    s.shadow(8, 14, 12, 3)
    s.rect(3, 10, 12, 12, P['black'])
    s.ell(2, 11, 5, 14, P['black']); s.ell(10, 11, 13, 14, P['black'])
    s.vl(10, 2, 10, P['file_d']); s.hl(2, 8, 12, P['file_d'])
    s.set(10, 2, P['scoot']); s.set(8, 2, P['scoot'])
    s.rect(4, 9, 9, 10, P['scoot'])
    return s


def o_kanban():
    s = S(32, 24)
    s.shadow(16, 21, 30, 5)
    s.rect(1, 1, 30, 17, P['file_l']); s.rect(2, 2, 29, 16, P['wb'])
    s.vl(11, 2, 16, P['wb_d']); s.vl(20, 2, 16, P['wb_d'])
    notes = [P['bky'], P['bkr'], P['bkg'], P['bkb'], P['bkp']]
    random.seed(3)
    for col, (x1, x2) in enumerate(((3, 10), (12, 19), (21, 28))):
        for _ in range(4):
            x = random.randint(x1, x2 - 2)
            y = random.randint(3, 13)
            s.rect(x, y, x + 2, y + 2, random.choice(notes))
    s.rect(3, 17, 5, 21, P['black']); s.rect(26, 17, 28, 21, P['black'])
    return s


def o_snack_shelf():
    s = S(32, 32)
    s.shadow(16, 29, 30, 5)
    s.rect(1, 2, 30, 27, P['shelf']); s.rect(1, 2, 30, 4, P['desk_l']); s.rect(1, 25, 30, 27, P['shelf_d'])
    for yy in (10, 18):
        s.rect(2, yy, 29, yy + 1, P['shelf_d'])
    goods = [P['bkr'], P['bky'], P['bkg'], P['bkb'], P['bkp'], P['mug']]
    random.seed(9)
    for y1, y2 in ((5, 9), (12, 16), (20, 24)):
        x = 3
        while x < 27:
            w = random.randint(2, 4)
            s.rect(x, y1 + 1, x + w, y2, random.choice(goods))
            s.set(x, y1, P['white'])
            x += w + 1
    return s


def o_water_cooler():
    s = S(16, 32)
    s.shadow(8, 29, 13, 4)
    s.rect(4, 12, 11, 27, P['wc']); s.rect(4, 12, 11, 14, P['wc_l']); s.rect(4, 25, 11, 27, P['wc_d'])
    s.rect(5, 16, 10, 22, P['wc_d']); s.rect(5, 16, 10, 17, P['wc_l'])
    s.rect(6, 23, 7, 25, P['bkr']); s.rect(8, 23, 9, 25, P['bkb'])
    s.rect(5, 3, 10, 12, P['bottle']); s.rect(5, 3, 10, 5, P['bottle_d'])
    s.rect(6, 1, 9, 3, P['wc_d'])
    s.set(6, 6, P['white']); s.set(7, 8, P['white'])
    return s


def o_sofa():
    s = S(48, 24)
    s.shadow(24, 21, 44, 5)
    s.rect(2, 4, 45, 12, P['sofa_d']); s.rect(3, 5, 44, 11, P['sofa']); s.rect(3, 5, 44, 6, P['sofa_l'])
    s.rect(2, 12, 45, 18, P['sofa']); s.rect(2, 12, 45, 13, P['sofa_l'])
    s.rect(0, 4, 4, 19, P['sofa_d']); s.rect(43, 4, 47, 19, P['sofa_d'])
    s.vl(16, 5, 17, P['sofa_d']); s.vl(31, 5, 17, P['sofa_d'])
    s.rect(4, 19, 6, 21, P['black']); s.rect(41, 19, 43, 21, P['black'])
    # throw pillows
    s.rect(6, 7, 10, 11, P['bky']); s.rect(36, 7, 40, 11, P['bkr'])
    return s


def o_coffee_table():
    s = S(32, 16)
    s.shadow(16, 13, 28, 4)
    s.rect(2, 4, 29, 10, P['desk']); s.rect(2, 4, 29, 5, P['desk_l'])
    s.rect(3, 10, 5, 13, P['desk_xd']); s.rect(26, 10, 28, 13, P['desk_xd'])
    s.rect(8, 5, 12, 8, P['bkr']); s.set(9, 5, P['white'])
    s.rect(19, 5, 22, 8, P['mug'])
    return s


def o_meeting_table():
    s = S(48, 32)
    s.shadow(24, 29, 46, 6)
    s.rect(2, 6, 45, 24, P['desk']); s.rect(2, 6, 45, 8, P['desk_l']); s.rect(2, 22, 45, 24, P['desk_d'])
    s.rect(0, 8, 2, 22, P['desk_xd']); s.rect(45, 8, 47, 22, P['desk_xd'])
    s.rect(8, 10, 14, 14, P['paper']); s.rect(30, 16, 36, 20, P['paper'])
    s.rect(20, 12, 23, 15, P['mug']); s.rect(38, 11, 41, 14, P['mug'])
    # laptop open
    s.rect(24, 9, 31, 14, P['file_d']); s.rect(25, 10, 30, 13, P['scr'])
    return s


def o_reception_desk():
    s = S(64, 28)
    s.shadow(32, 25, 62, 5)
    s.rect(1, 8, 62, 22, P['logo']); s.rect(1, 8, 62, 10, P['logo_l'])
    s.rect(1, 20, 62, 22, P['logo_d'])
    s.rect(1, 6, 62, 9, P['desk_l']); s.rect(1, 6, 62, 7, P['white'])
    for x in range(6, 62, 9):
        s.vl(x, 12, 19, P['logo_d'])
    s.rect(8, 11, 14, 13, P['bkb']); s.rect(15, 11, 21, 13, P['bkg'])
    s.rect(44, 3, 50, 6, P['phone']); s.set(46, 2, P['phone'])
    s.rect(26, 4, 32, 6, P['paper'])
    return s


def o_plant_large():
    s = S(24, 40)
    s.shadow(12, 37, 18, 5)
    s.rect(7, 28, 16, 35, P['pot']); s.rect(7, 28, 16, 29, P['pot_l']); s.rect(7, 35, 16, 36, P['pot_d'])
    s.rect(8, 26, 15, 28, P['pot_d'])
    s.rect(11, 8, 12, 27, P['leaf'])
    s.rect(8, 12, 10, 24, P['leaf_d']); s.rect(13, 12, 15, 24, P['leaf_d'])
    s.rect(5, 16, 7, 26, P['leaf']); s.rect(16, 16, 18, 26, P['leaf'])
    s.rect(10, 5, 13, 9, P['leaf'])
    s.set(11, 4, P['leaf_l']); s.set(12, 3, P['leaf_l'])
    s.set(9, 13, P['leaf_l']); s.set(14, 14, P['leaf_l'])
    s.set(6, 18, P['leaf_l']); s.set(17, 19, P['leaf_l'])
    return s


def o_plant_small():
    s = S(16, 24)
    s.shadow(8, 21, 12, 4)
    s.rect(5, 15, 10, 20, P['pot']); s.rect(5, 15, 10, 16, P['pot_l']); s.rect(5, 20, 10, 21, P['pot_d'])
    s.rect(7, 6, 8, 15, P['leaf'])
    s.rect(5, 9, 6, 14, P['leaf_d']); s.rect(9, 9, 10, 14, P['leaf_d'])
    s.set(7, 5, P['leaf_l']); s.set(8, 4, P['leaf']); s.set(6, 8, P['leaf_l']); s.set(10, 11, P['leaf_l'])
    return s


def o_trash():
    s = S(16, 20)
    s.shadow(8, 17, 11, 4)
    s.rect(4, 4, 11, 15, P['trash']); s.rect(4, 4, 11, 5, P['file_l'])
    s.rect(3, 3, 12, 4, P['trash_d'])
    s.rect(5, 8, 6, 13, P['trash_d']); s.rect(9, 8, 10, 13, P['trash_d'])
    s.rect(6, 1, 9, 3, P['paper'])
    return s


def o_lamp():
    s = S(16, 40)
    s.shadow(8, 37, 13, 4)
    s.ell(2, 0, 13, 12, P['shade']); s.ell(3, 1, 12, 10, P['white']); s.ell(4, 8, 11, 12, P['shade_d'])
    s.vl(7, 12, 32, P['lamp']); s.vl(8, 12, 32, P['lamp'])
    s.rect(4, 32, 11, 35, P['lamp']); s.rect(4, 32, 11, 33, P['shade_d'])
    return s


def o_filing():
    s = S(16, 32)
    s.shadow(8, 29, 13, 4)
    s.rect(3, 3, 12, 27, P['file']); s.rect(3, 3, 12, 4, P['file_l'])
    for y in (6, 12, 18, 24):
        s.rect(4, y, 11, y + 4, P['file_d']); s.rect(4, y, 11, y + 1, P['file_l'])
        s.hl(y + 2, 6, 9, P['white'])
    return s


def o_big_screen():
    s = S(48, 32)
    s.shadow(24, 29, 40, 5)
    # 支架
    s.vl(23, 22, 28, P['black']); s.vl(24, 22, 28, P['black'])
    s.rect(16, 28, 31, 29, P['ergo_d'])
    # 边框 + 屏幕
    s.rect(1, 1, 46, 22, P['black'])
    s.rect(2, 2, 45, 21, P['scr_d'])
    s.rect(2, 2, 45, 9, P['scr'])
    # 幻灯片内容：标题块 + 柱状图 + 上升折线
    s.rect(4, 4, 18, 7, P['white'])
    s.hl(5, 5, 16, P['bkb']); s.hl(7, 5, 12, P['wb_d'])
    for i, h in enumerate((4, 7, 6, 10)):
        x = 26 + i * 5
        s.rect(x, 18 - h, x + 2, 18, P['bky'])
        s.hl(18 - h, x, x + 2, P['white'])
    pts = [(5, 17), (9, 15), (13, 16), (17, 12), (21, 13), (25, 10)]
    for x, y in pts:
        s.set(x, y, P['led_g']); s.set(x + 1, y, P['led_g'])
    s.set(44, 20, P['led_r'])
    return s


def o_time_clock():
    # 立式打卡机：立柱机身 + 顶部斜面小屏（常亮时钟） + 刷卡感应区
    s = S(24, 32)
    s.shadow(12, 29, 20, 5)
    # 底座
    s.rect(7, 27, 17, 28, P['ergo_d']); s.rect(8, 26, 16, 27, P['ergo'])
    # 立柱机身
    s.rect(8, 8, 16, 26, P['vend_d'])
    s.rect(9, 9, 15, 25, P['vend'])
    s.vl(9, 9, 25, P['vend_l'])
    # 顶部斜面屏幕（亮蓝，显示 09:00）
    s.rect(8, 4, 16, 9, P['black'])
    s.rect(9, 5, 15, 8, P['scr'])
    s.rect(9, 5, 15, 5, P['white'])  # 屏幕顶部高光
    s.set(10, 6, P['black']); s.set(11, 6, P['black'])   # 0
    s.set(13, 6, P['black'])                              # :
    s.set(14, 6, P['black']); s.set(15, 6, P['black'])   # 9
    # 刷卡感应区（绿色圆点呼吸灯）
    s.ell(10, 14, 14, 18, P['ergo_d'])
    s.ell(11, 15, 13, 17, P['led_g'])
    s.set(12, 16, P['white'])
    # 下方打卡按钮（红）
    s.rect(10, 21, 14, 23, P['led_r'])
    return s


# ---------------- 玩家上半身胸像（RPG 对话框用，4 表情） ----------------
def portrait(expr):
    # 与 player.png 同人物：蓝衬衫 + 棕发 + 默认肤色。48x48 胸像，只露头与肩。
    s = S(48, 48)
    sk, sk_d, out = P['skin'], P['skin_d'], P['outline']
    hair, hair_l = P['hair'], P['hair_l']
    sh, sh_l, sh_d = P['shirt'], P['shirt_l'], P['shirt_d']
    # 肩膀/衣领（底部）
    s.rect(8, 38, 39, 47, out)
    s.rect(9, 39, 38, 47, sh)
    s.rect(9, 39, 38, 41, sh_l)
    s.rect(9, 44, 38, 47, sh_d)
    # 头（大椭圆）
    s.ell(10, 4, 37, 38, out)
    s.ell(11, 5, 36, 37, sk)
    # 头发（盖头顶 + 两侧）
    s.ell(11, 4, 36, 16, hair)
    s.rect(11, 14, 15, 24, hair); s.rect(32, 14, 36, 24, hair)
    s.hl(9, 14, 30, hair_l)
    # 耳朵
    s.rect(9, 22, 11, 26, sk); s.rect(36, 22, 38, 26, sk)
    # 眉毛 + 眼 + 嘴按表情差异
    if expr == 'happy':
        # 弯眼笑：眼睛画成上弯弧线（眯眼笑），大笑嘴
        s.rect(16, 19, 20, 20, hair); s.rect(27, 19, 31, 20, hair)   # 弯眉
        s.rect(16, 22, 20, 23, out); s.set(17, 22, sk)               # 左眯眼
        s.rect(27, 22, 31, 23, out); s.set(30, 22, sk)               # 右眯眼
        s.rect(20, 28, 27, 31, out)                                   # 嘴
        s.rect(21, 28, 26, 29, P['white'])                            # 牙齿
        s.rect(21, 31, 26, 31, P['bkr'])                              # 口腔
        s.rect(13, 25, 15, 27, (240, 160, 150))                       # 腮红
        s.rect(32, 25, 34, 27, (240, 160, 150))
    elif expr == 'tired':
        # 半垂眼 + 眼袋 + 平直嘴
        s.rect(16, 20, 20, 21, hair); s.rect(27, 20, 31, 21, hair)   # 平眉
        s.rect(16, 23, 20, 24, out)                                   # 左眼（半闭）
        s.hl(22, 16, 20, sk_d)                                        # 左眼皮
        s.rect(27, 23, 31, 24, out); s.hl(22, 27, 31, sk_d)          # 右眼
        s.hl(26, 17, 20, sk_d); s.hl(26, 27, 31, sk_d)               # 眼袋
        s.rect(21, 30, 27, 30, out)                                   # 平嘴
    elif expr == 'angry':
        # 倒八眉 + 瞪眼 + 咬牙
        s.rect(16, 19, 19, 20, hair); s.rect(17, 20, 20, 21, hair)   # 左倒八眉
        s.rect(28, 19, 31, 20, hair); s.rect(27, 20, 30, 21, hair)   # 右倒八眉
        s.rect(16, 23, 20, 25, P['white']); s.set(18, 24, out)        # 左瞪眼
        s.rect(27, 23, 31, 25, P['white']); s.set(29, 24, out)        # 右瞪眼
        s.rect(20, 29, 27, 30, out)                                   # 咬牙
        s.rect(21, 29, 26, 29, P['white'])
        s.set(14, 26, (240, 150, 140)); s.set(33, 26, (240, 150, 140))  # 怒红
    else:  # normal
        s.rect(16, 19, 20, 20, hair); s.rect(27, 19, 31, 20, hair)   # 平眉
        s.rect(16, 22, 19, 24, P['white']); s.set(18, 23, out)        # 左眼
        s.rect(28, 22, 31, 24, P['white']); s.set(29, 23, out)        # 右眼
        s.rect(21, 29, 26, 30, out)                                   # 微张嘴
        s.set(22, 29, sk_d)
    return s


# ---------------- 千仔（绿色小章鱼吉祥物） ----------------
QZ_BODY = (46, 196, 110)
QZ_BODY_D = (28, 152, 84)
QZ_BODY_L = (104, 226, 152)
QZ_FACE = (24, 26, 30)


def qz_frame(direction, frame):
    if direction == 'left':
        r = qz_frame('right', frame)
        s2 = S(PW, 16)
        for yy in range(16):
            for xx in range(PW):
                s2.set(PW - 1 - xx, yy, r.get(xx, yy))
        return s2
    s = S(PW, 16)
    s.ell(3, 13, 12, 15, (20, 16, 24, 70))  # 影子
    dy = 1 if frame == 1 else 0
    lift = 1 if frame == 2 else 0
    # 四条短触手（摆动）
    s.ell(2, 9 + dy - lift, 4, 12 + dy, QZ_BODY)
    s.ell(11, 9 + dy - (1 - lift), 13, 12 + dy, QZ_BODY)
    s.ell(5, 10 + dy, 7, 14 + dy, QZ_BODY)
    s.ell(8, 10 + dy, 10, 14 + dy, QZ_BODY)
    s.ell(5, 12 + dy, 10, 14 + dy, QZ_BODY_D)
    # 圆顶头
    s.ell(3, 1 + dy, 12, 10 + dy, QZ_BODY)
    s.ell(4, 2 + dy, 9, 4 + dy, QZ_BODY_L)
    if direction == 'down':
        # 大白眼 + 小瞳孔
        s.ell(4, 3 + dy, 7, 8 + dy, P['white'])
        s.ell(8, 3 + dy, 11, 8 + dy, P['white'])
        s.rect(6, 5 + dy, 6, 6 + dy, QZ_FACE)
        s.rect(9, 5 + dy, 9, 6 + dy, QZ_FACE)
        # 眉毛
        s.set(5, 2 + dy, QZ_FACE); s.set(10, 2 + dy, QZ_FACE)
        # 微笑
        s.set(7, 9 + dy, QZ_FACE); s.set(8, 9 + dy, QZ_FACE)
    elif direction == 'right':
        # 侧面：一只大眼靠右
        s.ell(8, 3 + dy, 11, 8 + dy, P['white'])
        s.rect(10, 5 + dy, 10, 6 + dy, QZ_FACE)
        s.set(9, 2 + dy, QZ_FACE)
        s.set(8, 9 + dy, QZ_FACE)
    # up = 背面，无脸
    return s


# ---------------- characters ----------------
def char_frame(direction, frame, shirt, shirt_l, shirt_d, hair, hair_l):
    s = S(PW, PH)
    s.ell(2, 20, 13, 22, (20, 16, 24, 80))
    dy = 0 if frame == 0 else 1
    if direction in ('down', 'up'):
        if frame == 0:
            s.rect(5, 21, 7, 22, P['shoe']); s.rect(9, 22, 11, 23, P['shoe'])
        elif frame == 1:
            s.rect(5, 22, 7, 23, P['shoe']); s.rect(9, 21, 11, 22, P['shoe'])
        else:  # frame 2: opposite-leg step (mirror of frame 1)
            s.rect(5, 21, 7, 22, P['shoe']); s.rect(9, 22, 11, 23, P['shoe'])
        s.rect(5, 17, 10, 22, P['pants']); s.rect(5, 17, 10, 18, P['pants_d'])
        s.rect(4, 10 + dy, 11, 18 + dy, P['outline'])
        s.rect(5, 11 + dy, 10, 17 + dy, shirt)
        s.rect(5, 11 + dy, 10, 12 + dy, shirt_l)
        s.rect(5, 16 + dy, 10, 17 + dy, shirt_d)
        s.rect(3, 12 + dy, 4, 16 + dy, shirt_d); s.rect(12, 12 + dy, 13, 16 + dy, shirt_d)
        s.rect(3, 16 + dy, 4, 17 + dy, P['skin']); s.rect(12, 16 + dy, 13, 17 + dy, P['skin'])
        s.ell(3, 0 + dy, 12, 9 + dy, P['outline'])
        s.ell(4, 1 + dy, 11, 8 + dy, P['skin'])
        if direction == 'down':
            s.rect(4, 1 + dy, 11, 3 + dy, hair)
            s.rect(3, 2 + dy, 4, 5 + dy, hair); s.rect(12, 2 + dy, 13, 5 + dy, hair)
            s.set(6, 4 + dy, P['eye']); s.set(9, 4 + dy, P['eye'])
            s.set(7, 6 + dy, P['skin_d']); s.set(8, 6 + dy, P['skin_d'])
            s.set(5, 3 + dy, hair_l)
        else:
            s.ell(4, 1 + dy, 11, 8 + dy, hair)
            s.set(5, 7 + dy, hair_l); s.set(6, 8 + dy, hair_l)
    else:
        if frame == 0:
            s.rect(6, 21, 8, 22, P['shoe']); s.rect(10, 22, 12, 23, P['shoe'])
        elif frame == 1:
            s.rect(6, 22, 8, 23, P['shoe']); s.rect(10, 21, 12, 22, P['shoe'])
        else:  # frame 2: opposite-leg step (mirror of frame 1)
            s.rect(6, 21, 8, 22, P['shoe']); s.rect(10, 22, 12, 23, P['shoe'])
        s.rect(6, 17, 11, 22, P['pants']); s.rect(6, 17, 11, 18, P['pants_d'])
        s.rect(5, 10 + dy, 11, 18 + dy, P['outline'])
        s.rect(6, 11 + dy, 10, 17 + dy, shirt)
        s.rect(6, 11 + dy, 10, 12 + dy, shirt_l)
        s.rect(10, 12 + dy, 11, 16 + dy, shirt_d)
        s.rect(11, 16 + dy, 12, 17 + dy, P['skin'])
        s.ell(4, 0 + dy, 12, 9 + dy, P['outline'])
        s.ell(5, 1 + dy, 11, 8 + dy, P['skin'])
        s.rect(5, 1 + dy, 11, 3 + dy, hair)
        s.rect(4, 2 + dy, 5, 6 + dy, hair)
        s.set(10, 4 + dy, P['eye'])
        s.set(6, 3 + dy, hair_l)
    if direction == 'left':
        r = char_frame('right', frame, shirt, shirt_l, shirt_d, hair, hair_l)
        s2 = S(PW, PH)
        for yy in range(PH):
            for xx in range(PW):
                s2.set(PW - 1 - xx, yy, r.get(xx, yy))
        return s2
    return s


def npc_typing(frame, shirt, shirt_l, hair, hair_l, shirt_d=None):
    # 坐姿小人（坐在椅子上、面向桌上的显示器敲键盘）：头发朝后、无面部（背对镜头）。
    if shirt_d is None:
        shirt_d = shirt
    s = S(PW, PH)
    s.ell(2, 20, 13, 22, (20, 16, 24, 80))
    dy = 0 if frame == 0 else 1
    s.rect(5, 17, 10, 22, P['pants_d'])
    s.rect(4, 10, 11, 18, P['outline'])
    s.rect(5, 11, 10, 17, shirt)
    s.rect(5, 11, 10, 12, shirt_l)
    s.rect(5, 16, 10, 17, shirt_d)
    s.rect(3, 11 + dy, 4, 14 + dy, shirt)
    s.rect(12, 12 - dy, 13, 15 - dy, shirt)
    s.rect(3, 10 + dy, 4, 11 + dy, P['skin'])
    s.rect(12, 11 - dy, 13, 12 - dy, P['skin'])
    s.ell(3, 0, 12, 9, P['outline'])
    s.ell(4, 1, 11, 8, hair)
    s.set(5, 7, hair_l); s.set(6, 8, hair_l)
    return s


def npc_stand(frame, shirt, shirt_l, hair, hair_l):
    s = S(PW, PH)
    s.ell(2, 20, 13, 22, (20, 16, 24, 80))
    dy = 0 if frame == 0 else 1
    s.rect(5, 21, 7, 22, P['shoe']); s.rect(9, 21, 11, 22, P['shoe'])
    s.rect(5, 17, 10, 22, P['pants']); s.rect(5, 17, 10, 18, P['pants_d'])
    s.rect(4, 10 + dy, 11, 18 + dy, P['outline'])
    s.rect(5, 11 + dy, 10, 17 + dy, shirt)
    s.rect(5, 11 + dy, 10, 12 + dy, shirt_l)
    s.rect(3, 12 + dy, 4, 16 + dy, shirt); s.rect(12, 12 + dy, 13, 16 + dy, shirt)
    s.rect(3, 16 + dy, 4, 17 + dy, P['skin']); s.rect(12, 16 + dy, 13, 17 + dy, P['skin'])
    s.ell(3, 0 + dy, 12, 9 + dy, P['outline'])
    s.ell(4, 1 + dy, 11, 8 + dy, P['skin'])
    s.rect(4, 1 + dy, 11, 3 + dy, hair)
    s.rect(3, 2 + dy, 4, 5 + dy, hair); s.rect(12, 2 + dy, 13, 5 + dy, hair)
    s.set(6, 4 + dy, P['eye']); s.set(9, 4 + dy, P['eye'])
    s.set(7, 6 + dy, P['skin_d'])
    s.set(5, 3 + dy, hair_l)
    # coffee cup in hand
    s.rect(12, 14 + dy, 13, 16 + dy, P['mug'])
    return s


# ---------------- special ----------------
def o_glow(color):
    size = 96
    s = S(size, size)
    c = size / 2
    for y in range(size):
        for x in range(size):
            d = (((x - c) ** 2 + (y - c) ** 2) ** 0.5) / (size / 2)
            if d < 1:
                a = int((1 - d) ** 2 * 70)
                s.set(x, y, (color[0], color[1], color[2], a))
    return s


def o_dust():
    s = S(4, 4)
    s.set(1, 1, (255, 255, 255, 90)); s.set(2, 1, (255, 255, 255, 50))
    s.set(1, 2, (255, 255, 255, 50)); s.set(2, 2, (255, 255, 255, 25))
    return s


# ---------------- tiles registry ----------------
W1, W2, W3, W4 = 1, 2, 3, 4
CONC, MARB, CBLU, TF = 5, 6, 7, 8
RUG, MAT, GDOOR = 9, 10, 11
WALL, WIN, GLASS, LOGO, LOGOM = 12, 13, 14, 15, 16
MOSS, POST1, POST2, WB, CLK = 17, 18, 19, 20, 21

TILES = [
    lambda: t_wood(P['wood1'], P['wood1d'], P['wood1l']),
    lambda: t_wood(P['wood2'], P['wood2d'], P['wood1']),
    lambda: t_wood(P['wood3'], P['wood3d'], P['wood2']),
    lambda: t_wood(P['wood1'], P['wood1d'], P['wood1l'], vertical=True),
    t_concrete,
    t_marble,
    lambda: t_carpet(P['cblue'], P['cblue_d'], P['cblue_l']),
    t_tile,
    t_rug,
    t_mat,
    t_gdoor,
    t_wall,
    t_window_city,
    t_glass,
    t_logo,
    t_logo_mark,
    t_moss,
    t_poster1,
    t_poster2,
    t_whiteboard,
    t_clock,
]

OBJECTS = {
    'desk_dual': o_desk_dual,
    'desk_laptop': o_desk_laptop,
    'ergo_chair': o_ergo_chair,
    'chair': o_ergo_chair,
    'bar_counter': o_bar_counter,
    'bar_stool': o_bar_stool,
    'fridge': o_fridge,
    'vending': o_vending,
    'arcade': o_arcade,
    'pingpong': o_pingpong,
    'foosball': o_foosball,
    'server_rack': o_server_rack,
    'phone_booth': o_phone_booth,
    'beanbag': o_beanbag,
    'armchair': o_armchair,
    'round_table': o_round_table,
    'trophy_shelf': o_trophy_shelf,
    'plant_monstera': o_plant_monstera,
    'cactus': o_cactus,
    'scooter': o_scooter,
    'kanban': o_kanban,
    'snack_shelf': o_snack_shelf,
    'water_cooler': o_water_cooler,
    'sofa': o_sofa,
    'coffee_table': o_coffee_table,
    'meeting_table': o_meeting_table,
    'reception_desk': o_reception_desk,
    'plant_large': o_plant_large,
    'plant_small': o_plant_small,
    'trash': o_trash,
    'lamp': o_lamp,
    'filing': o_filing,
    'big_screen': o_big_screen,
    'time_clock': o_time_clock,
}

NPC_SHIRTS = {
    'npc1': ((102, 152, 92), (140, 190, 124), P['hair'], P['hair_l']),
    'npc2': ((150, 110, 170), (186, 148, 204), P['hair2'], P['hair2_l']),
    'npc3': ((186, 84, 78), (220, 128, 118), P['hair3'], P['hair3_l']),
}

# palette variants for wandering colleagues (shirt, shirt_l, shirt_d, hair, hair_l)
WALK_VARIANTS = [
    (P['bkr'], (220, 128, 118), (150, 60, 56), P['hair'], P['hair_l']),    # red
    (P['bkb'], (128, 160, 200), (64, 88, 128), P['hair2'], P['hair2_l']),  # blue
    (P['bkg'], (140, 190, 124), (70, 110, 66), P['hair3'], P['hair3_l']),  # green
    (P['bky'], (232, 210, 130), (170, 148, 74), P['hair'], P['hair_l']),   # yellow
    (P['bkp'], (186, 148, 204), (110, 84, 132), P['hair2'], P['hair2_l']), # purple
    (P['bean'], P['bean_l'], P['bean_d'], P['hair3'], P['hair3_l']),       # orange
]


def generate_assets():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(OBJ_DIR, exist_ok=True)
    random.seed(42)

    tile_funcs = TILES + [t_empty] * (TS_COLS * TS_ROWS - len(TILES))
    ts = S(TS_COLS * TILE, TS_ROWS * TILE)
    for i, fn in enumerate(tile_funcs):
        ts.blit(fn(), (i % TS_COLS) * TILE, (i // TS_COLS) * TILE)
    write_png(os.path.join(OUT_DIR, 'tileset.png'), ts.rows())

    for name, fn in OBJECTS.items():
        write_png(os.path.join(OBJ_DIR, name + '.png'), fn().rows())

    def char_sheet(shirt, shirt_l, shirt_d, hair, hair_l, seated=False, back_typing=False):
        sh = S(PW * 3, PH * 4)
        if seated:
            # 3x4 全填坐姿图：这样 setFrame(<任意站立帧>) 都显示坐姿，不会闪出站立帧
            for row in range(4):
                for col in range(3):
                    sh.blit(npc_typing(0, shirt, shirt_l, hair, hair_l, shirt_d), col * PW, row * PH)
            return sh
        for row, d in enumerate(('down', 'up', 'right', 'left')):
            for col, f in enumerate((0, 1, 2)):
                if back_typing and d == 'up':
                    # up 行画成坐姿（背对桌上显示器敲键盘）：主代理坐下时播 walk-up/setFrame(3,4,5)
                    # 三帧交替 typing(0)/typing(1)/typing(0)，播放时就是敲键盘动画
                    sh.blit(npc_typing(1 if f == 1 else 0, shirt, shirt_l, hair, hair_l, shirt_d),
                            col * PW, row * PH)
                else:
                    sh.blit(char_frame(d, f, shirt, shirt_l, shirt_d, hair, hair_l), col * PW, row * PH)
        return sh

    # 主代理图集：down/right/left 是正常行走帧，up 行画成坐姿（坐到工位、背对显示器敲键盘时播）
    write_png(os.path.join(OUT_DIR, 'player.png'),
              char_sheet(P['shirt'], P['shirt_l'], P['shirt_d'], P['hair'], P['hair_l'],
                         back_typing=True).rows())

    # main agent's own typing sheet — same palette as player.png (blue shirt),
    # so it doesn't change colour when it starts typing
    ptm = S(PW * 2, PH)
    for f in (0, 1):
        ptm.blit(npc_typing(f, P['shirt'], P['shirt_l'], P['hair'], P['hair_l'], P['shirt_d']), f * PW, 0)
    write_png(os.path.join(OUT_DIR, 'player_typing.png'), ptm.rows())

    # 玩家上半身胸像（RPG 对话框用）：同人物 4 表情
    for expr in ('happy', 'normal', 'tired', 'angry'):
        write_png(os.path.join(OUT_DIR, 'portrait_%s.png' % expr), portrait(expr).rows())

    # 千仔吉祥物 sheet：4 方向 × 3 帧，每帧 16×16
    qz = S(PW * 3, 16 * 4)
    for row, d in enumerate(('down', 'up', 'right', 'left')):
        for col, f in enumerate((0, 1, 2)):
            qz.blit(qz_frame(d, f), col * PW, row * 16)
    write_png(os.path.join(OUT_DIR, 'qianzai.png'), qz.rows())

    # typing npcs
    for name, (shirt, shirt_l, hair, hair_l) in NPC_SHIRTS.items():
        s = S(PW * 2, PH)
        for f in (0, 1):
            s.blit(npc_typing(f, shirt, shirt_l, hair, hair_l), f * PW, 0)
        write_png(os.path.join(OUT_DIR, name + '.png'), s.rows())

    # standing npc (receptionist / coffee drinker)
    st = S(PW * 2, PH)
    for f in (0, 1):
        st.blit(npc_stand(f, P['bkr'], (220, 128, 118), P['hair2'], P['hair2_l']), f * PW, 0)
    write_png(os.path.join(OUT_DIR, 'npcstand.png'), st.rows())

    # walking npc (orange shirt) — kept for backwards compatibility
    write_png(os.path.join(OUT_DIR, 'npcwalk.png'),
              char_sheet(P['bean'], P['bean_l'], P['bean_d'], P['hair3'], P['hair3_l']).rows())

    # per-variant "sit & type" two-frame sheets, using each variant's true palette
    for k, (shirt, shirt_l, shirt_d, hair, hair_l) in enumerate(WALK_VARIANTS):
        s = S(PW * 2, PH)
        for f in (0, 1):
            s.blit(npc_typing(f, shirt, shirt_l, hair, hair_l, shirt_d), f * PW, 0)
        write_png(os.path.join(OUT_DIR, 'agent_typing%d.png' % k), s.rows())

    # agent{k} 本身也重画成坐姿（3x4 全坐姿）：子代理固定坐在工位上，
    # applyState 的 setFrame(0) 由此显示坐姿而不是站立帧
    for k, (shirt, shirt_l, shirt_d, hair, hair_l) in enumerate(WALK_VARIANTS):
        write_png(os.path.join(OUT_DIR, 'agent%d.png' % k),
                  char_sheet(shirt, shirt_l, shirt_d, hair, hair_l, seated=True).rows())

    write_png(os.path.join(OUT_DIR, 'glow.png'), o_glow((255, 226, 170)).rows())
    write_png(os.path.join(OUT_DIR, 'glow_blue.png'), o_glow((170, 210, 255)).rows())
    write_png(os.path.join(OUT_DIR, 'dust.png'), o_dust().rows())

    # pixel backdrop (page fallback behind the scene): bright cartoon sky + grass tile
    write_png(os.path.join(OUT_DIR, 'bg.png'), make_backdrop().rows())


def make_backdrop(w=64, h=64):
    """Cartoon pixel backdrop tile: bright sky + drifting clouds + a grass strip."""
    s = S(w, h)
    SKY = (138, 196, 235)
    s.fill(SKY)
    rng = random.Random(7)
    # soft blocky clouds in the sky
    for _ in range(5):
        cx, cy = rng.randrange(4, w - 12), rng.randrange(4, h // 2)
        cw, ch = rng.randrange(8, 16), rng.randrange(3, 5)
        s.rect(cx, cy, cx + cw, cy + ch, (247, 250, 252))
        s.rect(cx + 2, cy - 2, cx + cw - 2, cy, (247, 250, 252))
    # a few distant birds
    for _ in range(4):
        bx, by = rng.randrange(w - 4), rng.randrange(3, h // 3)
        s.set(bx, by, (90, 100, 120)); s.set(bx + 2, by, (90, 100, 120))
        s.set(bx + 1, by - 1, (90, 100, 120))
    # grass strip along the bottom
    gh = h // 5
    s.rect(0, h - gh, w - 1, h - 1, (110, 184, 92))
    s.rect(0, h - gh, w - 1, h - gh + 1, (140, 208, 116))     # sun-lit top edge
    for _ in range(w):                                        # little grass tufts / flowers
        gx = rng.randrange(w)
        gy = rng.randrange(h - gh + 2, h - 1)
        s.set(gx, gy, rng.choice([(84, 152, 70), (240, 220, 120), (236, 140, 150)]))
    return s


# ---------------- map ----------------
def generate_map():
    floor = [0] * (MAP_W * MAP_H)
    walls = [0] * (MAP_W * MAP_H)
    objects = []

    def sf(x, y, t):
        if 0 <= x < MAP_W and 0 <= y < MAP_H:
            floor[y * MAP_W + x] = t

    def sw(x, y, t):
        if 0 <= x < MAP_W and 0 <= y < MAP_H:
            walls[y * MAP_W + x] = t

    def frect(x1, y1, x2, y2, t):
        for yy in range(y1, y2 + 1):
            for xx in range(x1, x2 + 1):
                sf(xx, yy, t)

    def obj(name, cx, base_ty):
        objects.append({'name': name, 'x': int(cx * TILE), 'y': base_ty * TILE + TILE})

    # base floor
    for y in range(MAP_H):
        for x in range(MAP_W):
            if 0 < x < MAP_W - 1 and 0 < y < MAP_H - 1:
                sf(x, y, random.choice([W1, W1, W2, W4]))

    # outer walls + city windows
    for x in range(MAP_W):
        sw(x, 0, WALL); sw(x, MAP_H - 1, WALL)
    for y in range(MAP_H):
        sw(0, y, WALL); sw(MAP_W - 1, y, WALL)
    for x in list(range(3, 10)) + list(range(15, 22)):
        sw(x, 0, WIN)
    sw(11, 0, CLK); sw(13, 0, CLK)

    # moss accents + posters on side walls
    for y in (4, 5, 13, 14, 20, 21):
        sw(0, y, MOSS); sw(MAP_W - 1, y, MOSS)
    sw(0, 9, POST1); sw(0, 18, POST2); sw(MAP_W - 1, 9, POST2); sw(MAP_W - 1, 18, POST1)

    # corridors (polished concrete): horizontal artery + vertical center divider
    frect(1, 9, MAP_W - 2, 9, CONC)
    frect(14, 1, 14, MAP_H - 2, CONC)

    # ----- meeting room (top-right, glass, enlarged) -----
    frect(15, 1, 22, 8, TF)
    for y in range(1, 9):
        sw(15, y, GLASS); sw(22, y, GLASS)
    for x in range(15, 23):
        sw(x, 8, GLASS)
    sw(18, 8, 0); sf(18, 8, GDOOR)            # door on the corridor
    sw(15, 3, WB); sw(15, 4, WB)              # whiteboard
    obj('meeting_table', 18.5, 4)
    obj('chair', 16, 2); obj('chair', 18, 2); obj('chair', 20, 2)
    obj('chair', 16, 6); obj('chair', 18, 6); obj('chair', 20, 6)
    obj('plant_small', 21, 1)

    # ----- game zone (top-left) -----
    frect(1, 1, 13, 8, W2)
    obj('pingpong', 7, 5)
    obj('foosball', 11, 7)
    obj('arcade', 3, 3)
    obj('arcade', 5.5, 3)
    obj('vending', 9, 3)
    obj('trophy_shelf', 6, 3)
    obj('beanbag', 4, 7)
    obj('plant_monstera', 12, 2)

    # ----- west wing open workspace (bottom-left) -----
    for row_ty in (11, 15, 19):
        for i, cx in enumerate((3, 6.5, 10)):
            obj('desk_dual' if (i + row_ty) % 2 else 'desk_laptop', cx, row_ty)
            obj('ergo_chair', cx, row_ty + 1)
    obj('phone_booth', 1.5, 12)
    obj('kanban', 13, 13)
    obj('plant_large', 1.5, 21)
    obj('water_cooler', 13, 21)

    # ----- lounge / reception (bottom-right, enlarged) -----
    frect(15, 10, 22, 22, CBLU)
    sf(17, 13, RUG); sf(18, 13, RUG); sf(17, 14, RUG); sf(18, 14, RUG)
    obj('sofa', 17.5, 12)
    obj('armchair', 21, 12)
    obj('coffee_table', 17.5, 14)
    obj('plant_large', 15, 10)
    obj('plant_large', 22, 10)
    # reception area at the bottom (front desk merged into the lounge, enlarged)
    frect(16, 19, 21, 21, MARB)
    obj('reception_desk', 18.5, 20)
    obj('armchair', 15, 20)
    obj('armchair', 22, 20)
    obj('coffee_table', 15.5, 18)
    obj('lamp', 22, 18)
    obj('plant_monstera', 15, 22)
    obj('cactus', 22, 22)

    spawn = {'name': 'Spawn', 'x': 18 * TILE + 8, 'y': 17 * TILE + 8}

    glows = [
        [18.5 * TILE, 4 * TILE, 'cool'],     # meeting room screen glow
        [7 * TILE, 5 * TILE, 'warm'],        # game zone
        [5 * TILE, 14 * TILE, 'cool'],       # west wing desk glow
        [17.5 * TILE, 13 * TILE, 'warm'],    # lounge
        [18.5 * TILE, 20 * TILE, 'warm'],    # reception desk
        [7 * TILE, 9 * TILE, 'warm'],        # corridor west
        [18 * TILE, 9 * TILE, 'warm'],       # corridor east
    ]
    return floor, walls, objects, spawn, glows


def build_json(floor, walls, objects, spawn):
    def layer(name, data, lid):
        return {'id': lid, 'name': name, 'type': 'tilelayer', 'x': 0, 'y': 0,
                'width': MAP_W, 'height': MAP_H, 'visible': True, 'opacity': 1, 'data': data}

    objs = []
    oid = 1
    for o in objects:
        objs.append({'id': oid, 'name': o['name'], 'type': '', 'x': o['x'], 'y': o['y'],
                     'width': 0, 'height': 0, 'point': True})
        oid += 1
    objs.append({'id': oid, 'name': spawn['name'], 'type': '', 'x': spawn['x'], 'y': spawn['y'],
                 'width': 0, 'height': 0, 'point': True})

    data = {
        'version': '1.10', 'tiledversion': '1.10.2', 'orientation': 'orthogonal',
        'renderorder': 'right-down', 'width': MAP_W, 'height': MAP_H,
        'tilewidth': TILE, 'tileheight': TILE, 'nextlayerid': 5, 'nextobjectid': oid + 1,
        'layers': [
            layer('Floor', floor, 1),
            layer('Walls', walls, 2),
            {'id': 3, 'name': 'Objects', 'type': 'objectgroup', 'x': 0, 'y': 0, 'objects': objs},
        ],
        'tilesets': [{
            'firstgid': 1, 'name': 'office', 'tilewidth': TILE, 'tileheight': TILE,
            'spacing': 0, 'margin': 0, 'image': 'tileset.png',
            'imagewidth': TS_COLS * TILE, 'imageheight': TS_ROWS * TILE,
            'tilecount': TS_COLS * TS_ROWS, 'columns': TS_COLS,
        }],
    }
    with open(os.path.join(OUT_DIR, 'map.json'), 'w') as f:
        json.dump(data, f)


def build_preview(floor, walls, objects):
    prev = S(MAP_W * TILE, MAP_H * TILE)
    tile_surfs = [fn() for fn in TILES] + [S(TILE, TILE)] * (TS_COLS * TS_ROWS - len(TILES))
    for y in range(MAP_H):
        for x in range(MAP_W):
            f = floor[y * MAP_W + x]
            w = walls[y * MAP_W + x]
            if f > 0:
                prev.blit(tile_surfs[f - 1], x * TILE, y * TILE)
            if w > 0:
                prev.blit(tile_surfs[w - 1], x * TILE, y * TILE)
    for o in sorted(objects, key=lambda o: o['y']):
        name = o['name']
        if name in NPC_SHIRTS:
            shirt, shirt_l, hair, hair_l = NPC_SHIRTS[name]
            spr = npc_typing(0, shirt, shirt_l, hair, hair_l)
        elif name in ('npcstand', 'npcstand2'):
            spr = npc_stand(0, P['bkr'], (220, 128, 118), P['hair2'], P['hair2_l'])
        elif name == 'npcwalk':
            spr = char_frame('down', 0, P['bean'], P['bean_l'], P['bean_d'], P['hair3'], P['hair3_l'])
        elif name in OBJECTS:
            spr = OBJECTS[name]()
        else:
            continue
        prev.blit(spr, o['x'] - spr.w // 2, o['y'] - spr.h)
    write_png(os.path.join(OUT_DIR, 'preview.png'), prev.rows())


def build_workstations(objects):
    """工位池 = 每把 ergo_chair + 它的桌子，作为唯一的工位数据源（前端读 workstations.json）。
    与 generate_map 的桌椅布局保持一致（桌子在椅子正上方一格），避免 seatPos/FOOTPRINTS
    各处独立编码同一网格而漂移。"""
    chairs = [(o['x'], o['y']) for o in objects if o['name'] == 'ergo_chair']
    desks = {(o['x'], o['y']) for o in objects if o['name'] in ('desk_dual', 'desk_laptop')}
    seats = []
    for cx, cy in sorted(chairs, key=lambda p: (p[1], p[0])):
        if (cx, cy - TILE) in desks:                # 桌子就在椅子正上方一格
            seats.append({'cx': cx, 'cy': cy, 'dx': cx, 'dy': cy - TILE})
    return seats


if __name__ == '__main__':
    generate_assets()
    floor, walls, objects, spawn, glows = generate_map()
    build_json(floor, walls, objects, spawn)
    with open(os.path.join(OUT_DIR, 'glows.json'), 'w') as f:
        json.dump(glows, f)
    with open(os.path.join(OUT_DIR, 'workstations.json'), 'w') as f:
        json.dump(build_workstations(objects), f)
    build_preview(floor, walls, objects)
    print('done: luxury office generated', MAP_W, 'x', MAP_H, 'objects:', len(objects))
