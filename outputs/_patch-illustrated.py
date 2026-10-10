# -*- coding: utf-8 -*-
"""一次性脚本：为 v3 文章插入配图与素材来源段（用后即删）"""
p = 'outputs/content/长文-四大家族的黄昏缅北电诈的覆灭与再生-v3-affairs-formal.md'
src = open(p, encoding='utf-8').read()

# 1. 题图（摘要后）
a = '> **摘要：产业可以被斩首，土壤要靠政治才能填平。四大家族的结局证明了前半句，妙瓦底的复工证明了后半句。**\n\n2026年7月26日'
ins1 = '''> **摘要：产业可以被斩首，土壤要靠政治才能填平。四大家族的结局证明了前半句，妙瓦底的复工证明了后半句。**

![题图｜缅甸 8-9 世纪坐佛造像，大都会博物馆藏（CC0）。旧王朝的造像与新兴的园区，共享同一片土地。](materials/image/mat-72f11fb5.jpg)

2026年7月26日'''
assert a in src, 'anchor-1'
src = src.replace(a, ins1)

# 2. 明代罐（历史经纬第一段后）
b = '在治理上则长期处于中央权力鞭长莫及的地带。'
assert b in src, 'anchor-2'
src = src.replace(b, b + '\n\n![明中期青花鲤藻纹罐，大都会博物馆藏（CC0）。果敢汉人先民自明末清初南迁，把瓷器、汉字与宗族组织一并带过了萨尔温江。](materials/image/mat-bb868c60.jpg)')

# 3. 位置示意图（第一节末）
c = '四大家族全部身家的建造时间不超过十五年，而这三个要素在缅北的存在，要以百年计。'
assert c in src, 'anchor-3'
src = src.replace(c, c + '\n\n![果敢与妙瓦底两条边境带位置示意（本工作流自绘，非比例地图，不含国界线）。](materials/image/mat-da60fdce.png)')

# 4. 数据图（第三节末）——锚点避开引号
d = '一词最沉重的含义。'
assert d in src, 'anchor-4'
src = src.replace(d, d + '\n\n![电诈产业规模关键数据（本工作流自绘；口径：UNODC 2023、美国财政部 2024、泰国警官估计）。](materials/image/mat-927d27ea.png)')

# 5. 素材来源段（自检分隔线前）
e = '\n---\n\n## 深度自检'
assert e in src, 'anchor-5'
src = src.replace(e, '''
## 素材来源（资产条目）

- `mat-776d07db` 缅北电诈覆灭深度研究报告（The Bot 主题深度研究工作流）——全文事实与数据基座
- `mat-72f11fb5` 缅甸坐佛造像（Met Open Access，CC0）——题图
- `mat-bb868c60` 明中期青花鲤藻纹罐（Met Open Access，CC0）——历史经纬配图
- `mat-da60fdce` 两条边境带位置示意（自绘）——第一节
- `mat-927d27ea` 产业规模关键数据图（自绘，口径见图注）——第三节

---

## 深度自检''')

open(p, 'w', encoding='utf-8').write(src)
print('带图版组装完成（4 图 + 素材来源段）')
