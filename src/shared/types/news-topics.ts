/**
 * 内置新闻源目录（信息来源库的新闻种子与兜底目录）
 * @module shared/types/news-topics
 * @description 每个分组预置 15 个源（国外 top10 + 国内 top5）。该常量同时是：
 *              - 迁移 create-info-sources 的预置种子（写入 info_source_topics / info_sources，
 *                归属内置类别「新闻来源」news；id 与顺序必须保持一致）
 *              - crawl-news 节点的兜底目录（信息来源库不可用或分组为空时回退）
 *              用户可自定义类别/分组/来源（设置 → 信息来源），运行期以库内数据为准。
 *
 *              说明：国外源网络可达性由用户自行解决；单源抓取失败由节点容错跳过。
 */

/** 预置主题源（一项 = 一个媒体/专栏） */
export interface NewsTopicSource {
  /** 媒体/专栏显示名（如 "MIT Technology Review"） */
  name: string
  /** 首页或主题专栏地址 */
  url: string
}

/** 主题定义 */
export interface NewsTopic {
  /** 主题 id（英文 slug，工作流变量引用用） */
  id: string
  /** 主题显示名（中文，前端 select 用） */
  label: string
  /** 该主题下预置的全球媒体/专栏源 */
  sources: NewsTopicSource[]
}

/** 预置主题源目录（5 主题 × 15 源：国外 10 + 国内 5） */
export const NEWS_TOPICS: NewsTopic[] = [
  {
    id: 'ai',
    label: '人工智能',
    sources: [
      // 国外 top10
      { name: 'MIT Technology Review (AI)', url: 'https://www.technologyreview.com/topic/artificial-intelligence/' },
      { name: 'The Verge (AI)', url: 'https://www.theverge.com/ai-artificial-intelligence' },
      { name: 'TechCrunch (AI)', url: 'https://techcrunch.com/category/artificial-intelligence/' },
      { name: 'Wired (AI)', url: 'https://www.wired.com/tag/artificial-intelligence/' },
      { name: 'VentureBeat (AI)', url: 'https://venturebeat.com/category/ai/' },
      { name: 'Ars Technica (AI)', url: 'https://arstechnica.com/ai/' },
      { name: 'IEEE Spectrum (AI)', url: 'https://spectrum.ieee.org/topic/artificial-intelligence' },
      { name: 'Google AI Blog', url: 'https://blog.google/technology/ai/' },
      { name: 'OpenAI Blog', url: 'https://openai.com/news/' },
      { name: 'Nature (AI)', url: 'https://www.nature.com/subjects/artificial-intelligence' },
      // 国内 top5
      { name: '机器之心', url: 'https://www.jiqizhixin.com/' },
      { name: '量子位', url: 'https://www.qbitai.com/' },
      { name: '新智元', url: 'https://www.aiera.com.cn/' },
      { name: '36氪 (AI)', url: 'https://36kr.com/search/articles/%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD' },
      { name: '雷锋网 (AI)', url: 'https://www.leiphone.com/category/ai' },
    ],
  },
  {
    id: 'finance',
    label: '全球财经',
    sources: [
      // 国外 top10
      { name: 'Bloomberg', url: 'https://www.bloomberg.com/' },
      { name: 'Reuters (Business)', url: 'https://www.reuters.com/business/' },
      { name: 'WSJ', url: 'https://www.wsj.com/' },
      { name: 'Financial Times', url: 'https://www.ft.com/' },
      { name: 'CNBC', url: 'https://www.cnbc.com/' },
      { name: 'MarketWatch', url: 'https://www.marketwatch.com/' },
      { name: 'The Economist', url: 'https://www.economist.com/' },
      { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/' },
      { name: 'Investing.com', url: 'https://www.investing.com/' },
      { name: 'Barron\'s', url: 'https://www.barrons.com/' },
      // 国内 top5
      { name: '财新网', url: 'https://www.caixin.com/' },
      { name: '华尔街见闻', url: 'https://wallstreetcn.com/' },
      { name: '第一财经', url: 'https://www.yicai.com/' },
      { name: '东方财富', url: 'https://www.eastmoney.com/' },
      { name: '新浪财经', url: 'https://finance.sina.com.cn/' },
    ],
  },
  {
    id: 'energy',
    label: '新能源',
    sources: [
      // 国外 top10
      { name: 'Reuters (Energy)', url: 'https://www.reuters.com/business/energy/' },
      { name: 'BloombergNEF', url: 'https://about.bnef.com/blog/' },
      { name: 'Electrek', url: 'https://electrek.co/' },
      { name: 'CleanTechnica', url: 'https://cleantechnica.com/' },
      { name: 'PV-Tech', url: 'https://www.pv-tech.org/' },
      { name: 'Energy Storage News', url: 'https://www.energy-storage.news/' },
      { name: 'Solar Power World', url: 'https://www.solarpowerworldonline.com/' },
      { name: 'Windpower Monthly', url: 'https://www.windpowermonthly.com/' },
      { name: 'Utility Dive', url: 'https://www.utilitydive.com/' },
      { name: 'Canary Media', url: 'https://www.canarymedia.com/' },
      // 国内 top5
      { name: '北极星电力网', url: 'https://news.bjx.com.cn/' },
      { name: '高工锂电', url: 'https://www.gg-lb.com/' },
      { name: 'OFweek (太阳能)', url: 'https://solar.ofweek.com/' },
      { name: '能见Eknower', url: 'https://www.nengapp.com/' },
      { name: '中国能源报', url: 'https://www.cnenergynews.cn/' },
    ],
  },
  {
    id: 'tech',
    label: '科技产业',
    sources: [
      // 国外 top10
      { name: 'The Verge', url: 'https://www.theverge.com/' },
      { name: 'TechCrunch', url: 'https://techcrunch.com/' },
      { name: 'Wired', url: 'https://www.wired.com/' },
      { name: 'Ars Technica', url: 'https://arstechnica.com/' },
      { name: 'CNET', url: 'https://www.cnet.com/' },
      { name: 'Engadget', url: 'https://www.engadget.com/' },
      { name: '9to5Mac', url: 'https://9to5mac.com/' },
      { name: 'ZDNet', url: 'https://www.zdnet.com/' },
      { name: 'The Next Web', url: 'https://thenextweb.com/' },
      { name: 'VentureBeat', url: 'https://venturebeat.com/' },
      // 国内 top5
      { name: '36氪', url: 'https://36kr.com/' },
      { name: '虎嗅', url: 'https://www.huxiu.com/' },
      { name: '极客公园', url: 'https://www.geekpark.net/' },
      { name: '爱范儿', url: 'https://www.ifanr.com/' },
      { name: '钛媒体', url: 'https://www.tmtpost.com/' },
    ],
  },
  {
    id: 'world',
    label: '国际时政',
    sources: [
      // 国外 top10
      { name: 'BBC', url: 'https://www.bbc.com/news' },
      { name: 'Reuters (World)', url: 'https://www.reuters.com/world/' },
      { name: 'AP News', url: 'https://apnews.com/' },
      { name: 'The Guardian', url: 'https://www.theguardian.com/international' },
      { name: 'NYT', url: 'https://www.nytimes.com/' },
      { name: 'CNN', url: 'https://edition.cnn.com/' },
      { name: 'Al Jazeera', url: 'https://www.aljazeera.com/' },
      { name: 'DW (Top Stories)', url: 'https://www.dw.com/en/top-stories/s-9097' },
      { name: 'France 24', url: 'https://www.france24.com/en/' },
      { name: 'The Times of India', url: 'https://timesofindia.indiatimes.com/' },
      // 国内 top5
      { name: '联合早报', url: 'https://www.zaobao.com.sg/' },
      { name: '澎湃国际', url: 'https://www.thepaper.cn/' },
      { name: '环球网', url: 'https://world.huanqiu.com/' },
      { name: '参考消息', url: 'https://www.cankaoxiaoxi.com/' },
      { name: '观察者网', url: 'https://www.guancha.cn/' },
    ],
  },
]

/** 主题显示名列表（前端 start select 用） */
export const NEWS_TOPIC_LABELS: Array<{ label: string; value: string }> = NEWS_TOPICS.map(t => ({
  label: t.label,
  value: t.id,
}))

/** 按主题 id 取源列表（crawl-news 节点用；未知主题返回空数组） */
export function getNewsTopicSources(topicId: string): NewsTopicSource[] {
  const topic = NEWS_TOPICS.find(t => t.id === topicId)
  return topic ? topic.sources : []
}
