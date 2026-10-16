# -*- coding: utf-8 -*-
import sys
sys.path.insert(0, 'C:/Users/daoge/.agents/skills/writing-styles/scripts')
from draw_kit import Canvas, PALETTE, TYPE

# ---------- 图2：竖排时间线 ----------
c = Canvas(1300, 930, title='光遗传学：从衣藻到诺奖的 35 年', subtitle='关键节点与因果推进（时间轴非比例）', foot='来源：OpenAlex 论文数据、诺贝尔奖官方公告与科普、获奖报道；2026-10 绘制。')
d, s = c.d, c.s
nodes = [
    ('1991', '衣藻眼点测出感光电流', 'Hegemann 团队，吸管电极'),
    ('2002', 'ChR1 登上 Science', 'Nagel 第一作者兼通讯，绿光诱导质子电流'),
    ('2003', 'ChR2 登上 PNAS', '蓝光门控阳离子通道，被引 2673'),
    ('2005', 'Nat Neurosci 工具化', 'Deisseroth 组，被引约 4884'),
    ('2007', '首次驱动动物行为', '自由活动小鼠，光控转圈'),
    ('2010', 'Nature Methods 年度技术', '工具学界公认'),
    ('2026', '诺贝尔生理学或医学奖', 'Deisseroth · Hegemann · Nagel'),
]
X = 170
y0, step = 215, 100
c.river([(X, y0 - 40), (X, y0 + step * 6 + 30)])
for i, (yr, t1, t2) in enumerate(nodes):
    y = y0 + i * step
    color = PALETTE['red'] if yr == '2026' else PALETTE['blue']
    r = 12
    d.ellipse([(X-r)*s, (y-r)*s, (X+r)*s, (y+r)*s], fill=color, outline=PALETTE['paper'], width=3*s)
    d.text(((X-56)*s, y*s), yr, font=c._t(TYPE['head'], True), fill=color, anchor='rm')
    c.card(250, y - 40, 950, 84, lines=[(f'{t1}　——　{t2}', PALETTE['ink'] if yr != '2026' else PALETTE['red'])])
c.save('materials/image/draw-opto-timeline.png')
print('图2 完成')

# ---------- 图3：临床试验条形图 ----------
c = Canvas(1300, 1010, title='光遗传视网膜临床：仍在百人以内的量级', subtitle='全球视蛋白光遗传人体试验入组/预计入组（截至 2026-10-09）', foot='来源：ClinicalTrials.gov 登记与公司披露，素材整理；「预计」为登记上限。监管受理不等同疗效确认。')
d, s = c.d, c.s
trials = [
    ('RESTORE（Nanoscope）', 27, '2b期·随机双盲·已完成', False),
    ('GS030（GenSight）', 10, '1/2期·剂量递增', False),
    ('STARLIGHT（Nanoscope）', 6, '2a期·开放标签', False),
    ('BS01（Bionic Sight）', 20, '预计入组', True),
    ('RTx-021（Ray Therapeutics）', 18, '预计入组', True),
]
X0, X1 = 470, 1150
y = 240
bh, gap = 56, 88
mx = max(t[1] for t in trials)
for name, n, note, est in trials:
    c.caption(80, y + 10, name, size=24)
    bw = int((X1 - X0) * n / mx)
    color = PALETTE['blue_soft'] if est else PALETTE['blue']
    d.rectangle([X0*s, y*s, (X0+bw)*s, (y+bh)*s], fill=color)
    c.caption(X0 + bw + 16, y + 6, str(n), size=30)
    d.text((X0*s, (y+bh+8)*s), note, font=c._t(21), fill=PALETTE['sub'])
    y += gap + bh
c.save('materials/image/draw-opto-clinical.png')
print('图3 完成')
