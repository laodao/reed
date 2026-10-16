# -*- coding: utf-8 -*-
"""一次性脚本：用 draw_kit 重绘缅北文章两张图（事实修正版），用后即删"""
import sys
sys.path.insert(0, r'C:/Users/daoge/.agents/skills/writing-styles/scripts')
from draw_kit import Canvas, PALETTE, MARGIN

# ============ 图 A：位置示意 v2（事实修正：去滚弄、1027 改"发起并进攻老街"） ============
c = Canvas(1400, 800,
           title='果敢与妙瓦底：两条边境带位置示意',
           subtitle='示意图，非比例地图，不含国界线；图中事实均出自素材条目 mat-776d07db（研究报告），无新增事实')

# 左卡：缅中边境带
c.card(72, 170, 590, 430, head='缅中边境带（北）', head_color=PALETTE['red'], lines=[
    ('缅甸掸邦北部 · 萨尔温江东岸', None),
    ('', None),
    ('四大家族辖区：果敢 · 老街（2009-2023）', PALETTE['red']),
    ('北接云南省；经济文化同源', None),
    ('2023 年"1027 行动"：同盟军由此发起，', None),
    ('进攻老街，四大家族覆灭', None),
], fill='#F3E7DC')

# 右卡：缅泰边境带
c.card(738, 170, 590, 430, head='缅泰边境带（南）', head_color=PALETTE['blue'], lines=[
    ('克伦邦 · 莫伊河东岸', None),
    ('', None),
    ('妙瓦底：KK 园区 · 水沟谷 · 亚太新城', PALETTE['blue']),
    ('对岸：泰国湄索县（偷渡约 10 秒）', None),
    ('克伦边防军（BGF）实控，苏奇督任领导', None),
    ('园区遭清剿后数月内异地重建', None),
], fill='#E4E9E7')

# 中缝：萨尔温江（两带之间的南北向河流示意）
c.river([(688, 190), (700, 330), (668, 470), (690, 620)], label='萨尔温江', label_at=(642, 330), color=PALETTE['blue'])
c.chip(560, 640, 280, 52, '两带同构：真空 × 庇护 × 暴利', PALETTE['ink'])
c.save('materials/image/draw-location-schematic-v2.png')

# ============ 图 B：数据图 v2（横条 + 大数字卡） ============
c2 = Canvas(1400, 760,
            title='电诈产业规模：三个关键数字',
            subtitle='口径各异，均为二手转述（未回溯原始报告）：UNODC 2023 / 美国财政部 2024 / 泰国高级警官估计')

# 左：两条横条（金额）
d = c2.d
BAR_X, BAR_W = 300, 560
def hbar(y, frac, color, label, value):
    d.rounded_rectangle([BAR_X*2, y*2, (BAR_X + int(BAR_W*frac))*2, (y+64)*2], radius=12*2, fill=color)
    d.text(((BAR_X + int(BAR_W*frac) + 24)*2, (y+6)*2), value, font=c2._t(38, True), fill=PALETTE['ink'])
    d.text((90*2, (y+10)*2), label, font=c2._t(27), fill=PALETTE['ink'])
hbar(210, 1.00, PALETTE['red'],   '东南亚年骗取额', '370 亿美元')
hbar(310, 0.27, PALETTE['blue'],  '美国年损失（+66%）', '100 亿美元+')
c2.caption(90, 175, '年度金额（亿美元）', color=PALETTE['sub'], size=24)
d.line([BAR_X*2, 410*2, (BAR_X+BAR_W+160)*2, 410*2], fill=PALETTE['line'], width=2*2)
c2.caption(90, 425, '标注：UNODC(2023) / 美国财政部(2024)', color=PALETTE['sub'], size=24)

# 右：大数字卡
c2.card(920, 190, 416, 300, head=None, fill='#F3E7DC')
d.text((956*2, 226*2), '园区内仍可能存在', font=c2._t(30), fill=PALETTE['ink'])
d.text((956*2, 286*2), '约 10 万人', font=c2._t(TYPE_BIG:=68, True), fill=PALETTE['red'])
d.text((956*2, 392*2), '被强迫劳作（泰国高级警官估计）', font=c2._t(25), fill=PALETTE['ink'])
d.text((956*2, 436*2), '对照：KK 清剿发现 2198 人（28 国）', font=c2._t(22), fill=PALETTE['sub'])

c2.save('materials/image/draw-scale-data-v2.png')
print('v2 两图绘制完成')
