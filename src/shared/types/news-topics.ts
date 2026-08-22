/**
 * 预置新闻主题源目录（内置应用 C1 每日热点早报 / C2 行业动态周报的数据来源）
 * @module shared/types/news-topics
 * @description 每个主题预置全球知名媒体首页/主题专栏 URL（约 10 个）。
 *              前端 select 用 NEWS_TOPIC_NAMES；crawl-news 节点按主题取 URL 列表抓取。
 *              用户可自定义主题与 URL（start 输入 customUrls / customTopic）。
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

/** 预置主题源目录（5 主题 × 约 10 源） */
export const NEWS_TOPICS: NewsTopic[] = [
  {
    id: 'ai',
    label: '人工智能',
    sources: [
      { name: 'MIT Technology Review (AI)', url: 'https://www.technologyreview.com/topic/artificial-intelligence/' },
      { name: 'The Verge (AI)', url: 'https://www.theverge.com/ai-artificial-intelligence' },
      { name: 'TechCrunch (AI)', url: 'https://techcrunch.com/category/artificial-intelligence/' },
      { name: 'Wired (AI)', url: 'https://www.wired.com/tag/artificial-intelligence/' },
      { name: 'VentureBeat (AI)', url: 'https://venturebeat.com/category/ai/' },
      { name: 'Ars Technica (AI)', url: 'https://arstechnica.com/ai/' },
      { name: '机器之心', url: 'https://www.jiqizhixin.com/' },
      { name: '量子位', url: 'https://www.qbitai.com/' },
      { name: '新智元', url: 'https://www.aiera.com.cn/' },
      { name: '36氪 (AI)', url: 'https://36kr.com/search/articles/%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD' },
    ],
  },
  {
    id: 'finance',
    label: '全球财经',
    sources: [
      { name: 'Bloomberg', url: 'https://www.bloomberg.com/' },
      { name: 'Reuters (Business)', url: 'https://www.reuters.com/business/' },
      { name: 'WSJ', url: 'https://www.wsj.com/' },
      { name: 'Financial Times', url: 'https://www.ft.com/' },
      { name: 'CNBC', url: 'https://www.cnbc.com/' },
      { name: 'MarketWatch', url: 'https://www.marketwatch.com/' },
      { name: 'The Economist', url: 'https://www.economist.com/' },
      { name: '财新网', url: 'https://www.caixin.com/' },
      { name: '华尔街见闻', url: 'https://wallstreetcn.com/' },
      { name: '第一财经', url: 'https://www.yicai.com/' },
    ],
  },
  {
    id: 'energy',
    label: '新能源',
    sources: [
      { name: 'Reuters (Energy)', url: 'https://www.reuters.com/business/energy/' },
      { name: 'BloombergNEF', url: 'https://about.bnef.com/blog/' },
      { name: 'Electrek', url: 'https://electrek.co/' },
      { name: 'CleanTechnica', url: 'https://cleantechnica.com/' },
      { name: '北极星电力网', url: 'https://news.bjx.com.cn/' },
      { name: '高工锂电', url: 'https://www.gg-lb.com/' },
      { name: 'OFweek (太阳能)', url: 'https://solar.ofweek.com/' },
      { name: '36氪 (能源)', url: 'https://36kr.com/search/articles/%E6%96%B0%E8%83%BD%E6%BA%90' },
      { name: '界面新闻 (能源)', url: 'https://www.jiemian.com/lists/156.html' },
      { name: '能见Eknower', url: 'https://www.nengapp.com/' },
    ],
  },
  {
    id: 'tech',
    label: '科技产业',
    sources: [
      { name: 'The Verge', url: 'https://www.theverge.com/' },
      { name: 'TechCrunch', url: 'https://techcrunch.com/' },
      { name: 'Wired', url: 'https://www.wired.com/' },
      { name: 'Ars Technica', url: 'https://arstechnica.com/' },
      { name: 'CNET', url: 'https://www.cnet.com/' },
      { name: 'Engadget', url: 'https://www.engadget.com/' },
      { name: '36氪', url: 'https://36kr.com/' },
      { name: '虎嗅', url: 'https://www.huxiu.com/' },
      { name: '极客公园', url: 'https://www.geekpark.net/' },
      { name: '爱范儿', url: 'https://www.ifanr.com/' },
    ],
  },
  {
    id: 'world',
    label: '国际时政',
    sources: [
      { name: 'BBC', url: 'https://www.bbc.com/news' },
      { name: 'Reuters (World)', url: 'https://www.reuters.com/world/' },
      { name: 'AP News', url: 'https://apnews.com/' },
      { name: 'The Guardian', url: 'https://www.theguardian.com/international' },
      { name: 'NYT', url: 'https://www.nytimes.com/' },
      { name: 'CNN', url: 'https://edition.cnn.com/' },
      { name: 'Al Jazeera', url: 'https://www.aljazeera.com/' },
      { name: 'DW (Top Stories)', url: 'https://www.dw.com/en/top-stories/s-9097' },
      { name: '联合早报', url: 'https://www.zaobao.com.sg/' },
      { name: '澎湃国际', url: 'https://www.thepaper.cn/' },
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
