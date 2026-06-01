import {
  makeBookId,
  makePromptRecord,
  nowIso,
  type BookLanguage,
  type PictureBook,
  type PictureBookPage,
  type ProtagonistGender
} from "./bookStore.js";

type SceneOption = {
  name: string;
  keywords: string[];
};

const overusedDefaultHeritage = new Set(["壮锦", "壮锦织造技艺", "铜鼓", "铜鼓习俗", "铜鼓铸造技艺"]);

const heritageCatalog: SceneOption[] = [
  { name: "壮族绣球", keywords: ["绣球", "抛绣球", "三月三", "歌圩", "embroidered ball"] },
  { name: "壮族山歌", keywords: ["山歌", "唱歌", "歌圩", "对歌", "三月三", "song"] },
  { name: "刘三姐歌谣", keywords: ["刘三姐", "桂林", "阳朔", "漓江", "山歌", "sanjie"] },
  { name: "壮族三月三", keywords: ["三月三", "歌圩", "节日", "赶歌圩", "festival"] },
  { name: "五色糯米饭", keywords: ["五色糯米饭", "糯米饭", "美食", "三月三", "rice"] },
  { name: "北海贝雕", keywords: ["北海", "银滩", "贝壳", "贝雕", "大海", "沙滩", "beihai", "shell"] },
  { name: "合浦南珠制作技艺", keywords: ["合浦", "南珠", "珍珠", "北海", "银滩", "pearl"] },
  { name: "疍家渔歌", keywords: ["疍家", "渔歌", "渔船", "海边", "北海", "银滩", "fishing"] },
  { name: "三娘湾中华白海豚生态观察", keywords: ["三娘湾", "钦州", "海豚", "白海豚", "中华白海豚", "海湾", "海洋", "dolphin"] },
  { name: "钦州海边赶海生活", keywords: ["三娘湾", "钦州", "赶海", "螃蟹", "蟹", "钓螃蟹", "海边", "沙滩", "烧烤", "渔家"] },
  { name: "侗族大歌", keywords: ["侗族", "三江", "程阳", "风雨桥", "鼓楼", "大歌", "dong"] },
  { name: "侗族木构建筑营造技艺", keywords: ["三江", "程阳", "风雨桥", "鼓楼", "木构", "桥"] },
  { name: "侗族刺绣", keywords: ["侗族", "三江", "服饰", "刺绣", "衣饰"] },
  { name: "容县真武阁木构建筑智慧", keywords: ["玉林", "容县", "真武阁", "古建筑", "木构", "榫卯", "不用铁钉", "铁钉", "楼梯", "云朵迷宫"] },
  { name: "瑶族盘王节", keywords: ["瑶族", "盘王", "金秀", "大瑶山", "瑶山"] },
  { name: "毛南族花竹帽编织技艺", keywords: ["毛南", "环江", "花竹帽", "竹帽", "编织"] },
  { name: "天琴弹唱", keywords: ["天琴", "崇左", "龙州", "凭祥", "德天", "瀑布", "waterfall"] },
  { name: "花山岩画", keywords: ["花山", "岩画", "崇左", "宁明", "左江", "cliff"] },
  { name: "柳州螺蛳粉制作技艺", keywords: ["柳州", "螺蛳粉", "美食", "酸笋", "luosifen"] },
  { name: "广西彩调", keywords: ["柳州", "桂林", "戏曲", "彩调", "集市", "舞台"] },
  { name: "融水苗族芦笙斗马节", keywords: ["柳州", "融水", "苗族", "芦笙", "斗马"] },
  { name: "桂林米粉制作技艺", keywords: ["桂林", "米粉", "美食", "早餐", "rice noodle"] },
  { name: "龙脊梯田农耕文化", keywords: ["龙脊", "梯田", "农耕", "稻田", "春耕", "terrace"] },
  { name: "瑶族服饰", keywords: ["龙脊", "梯田", "瑶族", "红瑶", "服饰", "长发村"] },
  { name: "百色芒果种植文化", keywords: ["百色", "芒果", "果园", "田东", "田阳", "右江", "mango"] },
  { name: "右江壮族农耕生活", keywords: ["百色", "右江", "果园", "田园", "农耕", "mango"] },
  { name: "钦州坭兴陶烧制技艺", keywords: ["钦州", "坭兴陶", "陶", "陶器", "泥"] },
  { name: "壮锦织造技艺", keywords: ["壮锦", "织锦", "织造", "织布", "锦", "纹样", "brocade"] },
  { name: "铜鼓习俗", keywords: ["铜鼓", "鼓声", "鼓", "东兰", "河池", "bronze drum"] }
];

const tourismCatalog: SceneOption[] = [
  { name: "桂林山水", keywords: ["桂林", "漓江", "象鼻山", "阳朔", "guilin"] },
  { name: "阳朔漓江", keywords: ["桂林", "阳朔", "漓江", "竹筏", "遇龙河"] },
  { name: "德天跨国瀑布", keywords: ["德天", "瀑布", "大新", "崇左", "waterfall"] },
  { name: "崇左明仕田园", keywords: ["德天", "瀑布", "大新", "崇左", "明仕"] },
  { name: "北海银滩", keywords: ["北海", "银滩", "大海", "沙滩", "beihai"] },
  { name: "合浦海丝首港", keywords: ["北海", "合浦", "南珠", "珍珠", "海丝"] },
  { name: "钦州三娘湾", keywords: ["三娘湾", "钦州", "海豚", "白海豚", "中华白海豚", "螃蟹", "赶海", "海边", "沙滩", "烧烤"] },
  { name: "钦州茅尾海", keywords: ["钦州", "茅尾海", "海湾", "赶海", "渔船", "海鲜", "螃蟹"] },
  { name: "三江程阳风雨桥", keywords: ["三江", "程阳", "风雨桥", "鼓楼", "侗族"] },
  { name: "三江鼓楼侗寨", keywords: ["三江", "侗族", "鼓楼", "侗寨", "大歌"] },
  { name: "龙脊梯田", keywords: ["龙脊", "梯田", "稻田", "terrace"] },
  { name: "河池东兰铜鼓文化景区", keywords: ["铜鼓", "东兰", "河池", "鼓声"] },
  { name: "南宁青秀山", keywords: ["南宁", "青秀山", "绿城", "三月三", "歌圩", "绣球", "山歌"] },
  { name: "南宁动物园", keywords: ["南宁动物园", "动物园", "小熊猫", "动物", "zoo", "red panda"] },
  { name: "南宁三街两巷", keywords: ["三街两巷", "南宁", "老街", "骑楼", "三月三", "歌圩"] },
  { name: "容县真武阁", keywords: ["玉林", "容县", "真武阁", "古建筑", "木构", "榫卯", "不用铁钉", "铁钉", "楼梯", "云朵迷宫"] },
  { name: "黄姚古镇", keywords: ["黄姚", "古镇", "贺州"] },
  { name: "柳州百里柳江", keywords: ["柳州", "柳江", "窑埠", "螺蛳粉"] },
  { name: "柳州窑埠古镇", keywords: ["柳州", "窑埠", "螺蛳粉", "集市", "夜市"] },
  { name: "百色芒果园", keywords: ["百色", "芒果", "果园", "田东", "田阳"] },
  { name: "百色右江河谷", keywords: ["百色", "右江", "河谷", "田园"] },
  { name: "崇左花山岩画景区", keywords: ["花山", "岩画", "崇左", "左江"] }
];

const cultureNotes: Record<string, string> = {
  壮族绣球: "壮族绣球常出现在节庆和歌圩中，既是手工艺品，也能成为故事里的祝福信物。",
  壮族山歌: "壮族山歌讲究即兴对唱，常在节庆、劳动和生活场景中表达心情。",
  刘三姐歌谣: "刘三姐歌谣和桂林山水、壮族山歌联系很深，适合放在漓江、阳朔等故事场景里。",
  壮族三月三: "壮族三月三是广西重要民族节庆，人们会赶歌圩、唱山歌、做五色糯米饭。",
  五色糯米饭: "五色糯米饭是广西节庆美食，颜色来自天然植物，常和三月三等节日相连。",
  北海贝雕: "北海贝雕利用贝壳天然光泽创作图案，很适合海边、银滩和寻宝故事。",
  合浦南珠制作技艺: "合浦南珠以温润光泽闻名，和北海、合浦的海洋文化联系紧密。",
  疍家渔歌: "疍家渔歌来自海上生活，适合表现渔船、海风和渔民劳动场景。",
  侗族大歌: "侗族大歌是多声部民歌，常在三江侗寨、鼓楼和风雨桥旁唱响。",
  侗族木构建筑营造技艺: "侗族风雨桥和鼓楼多用木构营造，体现不用钉铆的建筑智慧。",
  侗族刺绣: "侗族刺绣常见于服饰和生活用品，图案细密，适合描写三江侗寨里的手作细节。",
  容县真武阁木构建筑智慧: "容县真武阁在广西玉林容县，以精巧木构闻名，能帮助孩子理解古建筑的受力、榫卯和空间智慧。",
  瑶族盘王节: "瑶族盘王节承载祭祀、歌舞和族群记忆，适合大瑶山、金秀等场景。",
  毛南族花竹帽编织技艺: "毛南族花竹帽轻巧精美，图案和编织工序都很适合细节描写。",
  天琴弹唱: "天琴弹唱多见于桂西南，琴声清亮，适合瀑布、边关和山水夜色场景。",
  花山岩画: "花山岩画位于左江流域，红色图像记录了古老的祭祀与生活想象。",
  柳州螺蛳粉制作技艺: "柳州螺蛳粉制作技艺融合米粉、汤料和酸笋风味，适合美食旅行故事。",
  广西彩调: "广西彩调节奏活泼、生活气息浓，适合集市、戏台和民间表演故事。",
  融水苗族芦笙斗马节: "融水苗族芦笙斗马节热闹欢快，能表现芦笙声、民族服饰和节庆气氛。",
  桂林米粉制作技艺: "桂林米粉是桂林日常美食代表，能把城市味道自然带进绘本。",
  龙脊梯田农耕文化: "龙脊梯田体现山地农耕智慧，适合稻田、春耕和丰收故事。",
  瑶族服饰: "瑶族服饰色彩鲜明、刺绣精细，和龙脊梯田、红瑶村寨等场景很贴近。",
  百色芒果种植文化: "百色芒果种植和右江河谷气候、果园生活相连，适合写采摘、观察和乡村旅行故事。",
  右江壮族农耕生活: "右江流域有丰富的田园与民族生活记忆，适合把果园、河谷和儿童观察自然结合起来。",
  百色芒果园自然观察: "百色芒果园能观察果树、花香、昆虫和采摘劳动，是认识地方物产和自然节律的好场景。",
  百色右江河谷田园生活: "右江河谷有温暖气候、田园风光和果园生活，能让孩子从身边风景理解家乡特色。",
  柳州柳江城市风景: "柳江穿城而过，桥梁、夜景和市井生活能展现柳州活泼的城市气质。",
  南宁动物园动物观察: "南宁动物园里的动物观察适合写儿童亲近自然、学习保护动物和记录发现的故事。",
  南宁老街城市记忆: "老街里的骑楼、店铺和街巷故事，适合表现城市记忆与日常生活。",
  北海银滩海洋观察: "银滩的浪花、贝壳、海风和潮汐，适合写儿童观察自然和保护海洋的故事。",
  三娘湾中华白海豚生态观察: "三娘湾常被人们和中华白海豚联系在一起，适合写海洋观察、保护海湾和亲近自然的旅行故事。",
  钦州海边赶海生活: "钦州海边的赶海生活能看到蟹洞、潮水、渔船和海风，适合把自然观察写进儿童旅行故事。",
  钦州三娘湾海洋观察: "三娘湾有海风、沙滩、渔船和海豚传说，是观察海洋、认识海湾生态的好地方。",
  钦州茅尾海渔家生活: "茅尾海有海湾、渔船和海鲜风味，适合表现钦州海边日常和渔家生活。",
  钦州坭兴陶烧制技艺: "钦州坭兴陶以陶土、烧制和窑变见长，适合手作体验类故事。",
  壮锦织造技艺: "壮锦织造技艺图案鲜明、色彩丰富，适合织布、纹样和家传手艺故事。",
  铜鼓习俗: "铜鼓习俗和节庆、仪式、鼓声有关，适合真正出现鼓声或铜鼓线索的故事。"
};

const englishNameMap: Record<string, string> = {
  桂小雅: "Gui Xiaoya",
  "是广西文化元素，适合和相关地点、人物或行动自然连在一起。": " is a Guangxi local highlight. Use it when it naturally connects with the place, characters, or action.",
  "是广西文化元素": " is a Guangxi local highlight",
  广西: "Guangxi",
  壮族绣球: "Zhuang embroidered ball",
  壮族山歌: "Zhuang mountain songs",
  刘三姐歌谣: "Liu Sanjie ballads",
  壮族三月三: "Zhuang Sanyuesan Festival",
  五色糯米饭: "five-color sticky rice",
  北海贝雕: "Beihai shell carving",
  合浦南珠制作技艺: "Hepu pearl craft",
  疍家渔歌: "Tanka fishing songs",
  三娘湾中华白海豚生态观察: "Sanniang Bay Chinese white dolphin ecology",
  钦州海边赶海生活: "Qinzhou tide-pool gathering life",
  侗族大歌: "Dong grand song",
  侗族木构建筑营造技艺: "Dong wooden architecture",
  侗族刺绣: "Dong embroidery",
  容县真武阁木构建筑智慧: "Rongxian Zhenwu Pavilion wooden architecture",
  瑶族盘王节: "Yao Panwang Festival",
  毛南族花竹帽编织技艺: "Maonan flower bamboo-hat weaving",
  天琴弹唱: "Tianqin singing",
  花山岩画: "Huashan rock paintings",
  柳州螺蛳粉制作技艺: "Liuzhou luosifen-making craft",
  广西彩调: "Guangxi Caidiao opera",
  融水苗族芦笙斗马节: "Rongshui Miao lusheng and horse-fighting festival",
  桂林米粉制作技艺: "Guilin rice noodle craft",
  龙脊梯田农耕文化: "Longji Terrace farming culture",
  瑶族服饰: "Yao clothing",
  百色芒果种植文化: "Baise mango-growing culture",
  右江壮族农耕生活: "Youjiang Zhuang farming life",
  钦州坭兴陶烧制技艺: "Qinzhou Nixing pottery firing craft",
  壮锦织造技艺: "Zhuang brocade weaving",
  铜鼓习俗: "bronze drum customs",
  桂林山水: "Guilin karst landscape",
  阳朔漓江: "Yangshuo Li River",
  德天跨国瀑布: "Detian Transnational Waterfall",
  崇左明仕田园: "Chongzuo Mingshi Countryside",
  北海银滩: "Beihai Silver Beach",
  合浦海丝首港: "Hepu Maritime Silk Road First Port",
  钦州三娘湾: "Qinzhou Sanniang Bay",
  钦州茅尾海: "Qinzhou Maowei Sea",
  三江程阳风雨桥: "Sanjiang Chengyang Wind-Rain Bridge",
  三江鼓楼侗寨: "Sanjiang drum-tower Dong village",
  龙脊梯田: "Longji Terraces",
  河池东兰铜鼓文化景区: "Hechi Donglan Bronze Drum Cultural Area",
  南宁青秀山: "Nanning Qingxiu Mountain",
  南宁动物园: "Nanning Zoo",
  南宁三街两巷: "Nanning Three Streets and Two Alleys",
  容县真武阁: "Rongxian Zhenwu Pavilion",
  黄姚古镇: "Huangyao Ancient Town",
  柳州百里柳江: "Liuzhou Baili Liujiang scenic belt",
  柳州窑埠古镇: "Liuzhou Yaobu Ancient Town",
  百色芒果园: "Baise mango orchards",
  百色右江河谷: "Baise Youjiang River Valley",
  崇左花山岩画景区: "Chongzuo Huashan Rock Painting Scenic Area",
  桂林山水自然观察: "Guilin landscape nature observation",
  漓江山水与竹筏生活: "Li River scenery and bamboo-raft life",
  德天瀑布边境山水: "Detian Waterfall border landscape",
  明仕田园喀斯特风光: "Mingshi Countryside karst landscape",
  北海银滩海洋观察: "Beihai Silver Beach marine observation",
  合浦海丝港口故事: "Hepu Maritime Silk Road port stories",
  钦州三娘湾海洋观察: "Qinzhou Sanniang Bay marine observation",
  钦州茅尾海渔家生活: "Qinzhou Maowei Sea fishing-family life",
  三江风雨桥建筑观察: "Sanjiang Wind-Rain Bridge architecture",
  三江侗寨生活观察: "Sanjiang Dong village daily life",
  龙脊梯田农耕风景: "Longji Terrace farming landscape",
  河池山乡节庆观察: "Hechi mountain-village festival observation",
  南宁青秀山自然观察: "Nanning Qingxiu Mountain nature observation",
  南宁动物园动物观察: "Nanning Zoo animal observation",
  南宁老街城市记忆: "Nanning old-street city memories",
  黄姚古镇生活美学: "Huangyao Ancient Town everyday aesthetics",
  柳州柳江城市风景: "Liuzhou Liujiang city scenery",
  柳州窑埠夜市生活: "Liuzhou Yaobu night-market life",
  百色芒果园自然观察: "Baise mango-orchard nature observation",
  百色右江河谷田园生活: "Baise Youjiang River Valley rural life",
  崇左左江山水观察: "Chongzuo Zuojiang landscape observation",
  小熊猫: "red panda",
  壮语童谣: "Zhuang nursery rhyme"
};

const englishCultureNotes: Record<string, string> = {
  壮族绣球: "Zhuang embroidered balls often appear in festivals and song fairs. They can become a blessing token or a playful story clue.",
  壮族山歌: "Zhuang mountain songs are often sung in daily life, festivals, and work scenes, making them a natural sound clue in a story.",
  刘三姐歌谣: "Liu Sanjie ballads are closely connected with Guilin scenery and Zhuang singing traditions.",
  壮族三月三: "Zhuang Sanyuesan is an important Guangxi festival with song fairs, mountain songs, and festive foods.",
  五色糯米饭: "Five-color sticky rice is a Guangxi festival food colored with natural plants and often linked with Sanyuesan.",
  北海贝雕: "Beihai shell carving uses the natural shine of shells, so it fits beach, Silver Beach, and treasure-hunt stories.",
  合浦南珠制作技艺: "Hepu pearls are known for their gentle luster and connect naturally with Beihai and Hepu's maritime culture.",
  疍家渔歌: "Tanka fishing songs come from life on the water and fit scenes with boats, sea wind, and fishing work.",
  三娘湾中华白海豚生态观察: "Sanniang Bay is often associated with Chinese white dolphins, making it a good scene for marine observation and bay protection.",
  钦州海边赶海生活: "Qinzhou tide-pool gathering life includes crab holes, tides, shells, boats, and sea wind.",
  侗族大歌: "Dong grand song is a multi-part folk singing tradition often heard around Sanjiang Dong villages, drum towers, and wind-rain bridges.",
  侗族木构建筑营造技艺: "Dong wind-rain bridges and drum towers show wooden building wisdom through interlocking structures.",
  侗族刺绣: "Dong embroidery appears on clothing and daily objects, adding careful handmade detail to Sanjiang village scenes.",
  容县真武阁木构建筑智慧: "Zhenwu Pavilion in Rongxian, Yulin is known for elegant wooden structure, helping children notice balance, joinery, stairs, and ancient architecture.",
  瑶族盘王节: "The Yao Panwang Festival carries song, dance, ritual, and community memory.",
  毛南族花竹帽编织技艺: "Maonan flower bamboo hats are light and delicate, with patterns and weaving steps that suit close-up story details.",
  天琴弹唱: "Tianqin singing has a bright, clear sound and fits waterfall, border, mountain, and night scenes in southwest Guangxi.",
  花山岩画: "Huashan rock paintings along the Zuojiang River record ancient images of ritual and daily imagination.",
  柳州螺蛳粉制作技艺: "Liuzhou luosifen-making brings together rice noodles, soup, and sour bamboo shoots, fitting food-travel stories.",
  桂林米粉制作技艺: "Guilin rice noodles are a daily city flavor that can naturally enter a Guangxi picture book.",
  龙脊梯田农耕文化: "Longji Terrace farming culture shows mountain farming wisdom and fits rice-field, planting, and harvest scenes.",
  百色芒果园自然观察: "Baise mango orchards let children observe fruit trees, flowers, insects, and harvest work.",
  南宁动物园动物观察: "Nanning Zoo animal observation fits stories about meeting animals, recording discoveries, and learning to protect nature.",
  南宁老街城市记忆: "Nanning old streets, arcades, shops, and lane stories are good for showing city memory and daily life.",
  南宁青秀山自然观察: "Qingxiu Mountain in Nanning fits nature observation, green city scenery, plants, paths, and class-trip discoveries.",
  钦州三娘湾海洋观察: "Sanniang Bay has sea wind, beaches, boats, and dolphin stories, making it a good place to learn about marine ecology."
};

export function localizeGuangxiName(name: string, language: BookLanguage = "zh") {
  if (language !== "en") {
    return name;
  }
  return englishNameMap[name] || name;
}

export function localizeGuangxiText(value: string, language: BookLanguage = "zh") {
  if (language !== "en" || !value) {
    return value;
  }

  return Object.entries(englishNameMap)
    .sort((left, right) => right[0].length - left[0].length)
    .reduce((text, [source, target]) => text.split(source).join(target), value);
}

function ideaIncludesAny(idea: string, keywords: string[]) {
  const normalizedIdea = idea.toLowerCase();
  return keywords.some((keyword) => normalizedIdea.includes(keyword.toLowerCase()));
}

function hashText(text: string) {
  return [...text].reduce((hash, char) => (hash * 31 + char.codePointAt(0)!) % 9973, 17);
}

function scoreOption(idea: string, option: SceneOption) {
  let score = ideaIncludesAny(idea, [option.name]) ? 10 : 0;
  for (const keyword of option.keywords) {
    if (ideaIncludesAny(idea, [keyword])) {
      score += Math.min(6, Math.max(2, keyword.length));
    }
  }
  return score;
}

function rotateOptions<T>(items: T[], seed: string) {
  if (!items.length) {
    return items;
  }
  const start = hashText(seed) % items.length;
  return items.slice(start).concat(items.slice(0, start));
}

function tourismCultureLabel(name: string) {
  const labelMap: Record<string, string> = {
    桂林山水: "桂林山水自然观察",
    阳朔漓江: "漓江山水与竹筏生活",
    德天跨国瀑布: "德天瀑布边境山水",
    崇左明仕田园: "明仕田园喀斯特风光",
    北海银滩: "北海银滩海洋观察",
    合浦海丝首港: "合浦海丝港口故事",
    钦州三娘湾: "钦州三娘湾海洋观察",
    钦州茅尾海: "钦州茅尾海渔家生活",
    三江程阳风雨桥: "三江风雨桥建筑观察",
    三江鼓楼侗寨: "三江侗寨生活观察",
    龙脊梯田: "龙脊梯田农耕风景",
    河池东兰铜鼓文化景区: "河池山乡节庆观察",
    南宁青秀山: "南宁青秀山自然观察",
    南宁动物园: "南宁动物园动物观察",
    南宁三街两巷: "南宁老街城市记忆",
    容县真武阁: "容县真武阁木构建筑智慧",
    黄姚古镇: "黄姚古镇生活美学",
    柳州百里柳江: "柳州柳江城市风景",
    柳州窑埠古镇: "柳州窑埠夜市生活",
    百色芒果园: "百色芒果园自然观察",
    百色右江河谷: "百色右江河谷田园生活",
    崇左花山岩画景区: "崇左左江山水观察"
  };
  return labelMap[name] || `${name}文化观察`;
}

function pickSceneFirstElements(idea: string, catalog: SceneOption[], count: number, shouldSupplement = true) {
  const scored = catalog
    .map((option, index) => ({ option, index, score: scoreOption(idea, option) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const selected = scored.filter((item) => item.score > 0).map((item) => item.option);
  const selectedNames = new Set(selected.map((item) => item.name));
  const supplement = rotateOptions(
    scored
      .filter((item) => !selectedNames.has(item.option.name))
      .map((item) => item.option)
      .filter((option) => !overusedDefaultHeritage.has(option.name) || ideaIncludesAny(idea, [option.name, ...option.keywords])),
    idea
  );

  return (selected.length ? selected : shouldSupplement ? supplement : [])
    .slice(0, count)
    .map((option) => option.name);
}

export function chooseHeritageElements(idea: string, count = 3) {
  const matched = pickSceneFirstElements(idea, heritageCatalog, count, false);
  if (matched.length) {
    return matched;
  }
  return chooseTourismElements(idea, count).map(tourismCultureLabel).slice(0, count);
}

export function chooseTourismElements(idea: string, count = 2) {
  return pickSceneFirstElements(idea, tourismCatalog, count);
}

export function buildSceneFirstHeritageGuide(idea: string, language: BookLanguage = "zh") {
  const heritage = chooseHeritageElements(idea, 4);
  const tourism = chooseTourismElements(idea, 3);
  if (language === "en") {
    const displayHeritage = heritage.map((item) => localizeGuangxiName(item, language));
    const displayTourism = tourism.map((item) => localizeGuangxiName(item, language));
    return [
      "Scene-first culture rule: choose Guangxi heritage elements only when they naturally fit. If no heritage element fits, introduce meaningful local highlights such as landscape, food, farming, city memory, architecture, ecology, or daily life.",
      "Do not use Zhuang brocade or bronze drum as default Guangxi symbols. Use them only when the idea mentions brocade, weaving, patterns, bronze drums, drum sounds, or a clearly related custom.",
      "Examples: Beihai/Silver Beach/sea -> Beihai shell carving, Hepu pearls, Tanka fishing songs; Sanyuesan/song fair/mountain songs/embroidered ball -> Zhuang Sanyuesan, Zhuang mountain songs, Zhuang embroidered ball, five-color sticky rice; Sanjiang/wind-rain bridge -> Dong grand song and Dong wooden architecture; Yulin/Rongxian/Zhenwu Pavilion/wooden stairs -> Zhenwu Pavilion wooden architecture; Liuzhou/food -> Luosifen making craft; Guilin/Lijiang/Liu Sanjie -> Liu Sanjie ballads and Guilin rice noodles.",
      `For this idea, prefer culture highlights such as: ${displayHeritage.join(", ")}. Prefer travel scenes such as: ${displayTourism.join(", ")}.`
    ].join("\n");
  }

  return [
    "文化选择原则：先读学生灵感里的地点、节日、食物、声音、人物和动作；有自然贴合的非遗就介绍非遗，没有非遗也可以介绍有意义的地方亮点，如山水、物产、农耕、城市记忆、建筑、生态或日常生活。",
    "不要把壮锦、铜鼓当作默认广西符号；只有学生提到织锦、纹样、铜鼓、鼓声，或故事场景确实相关时才使用。",
    "示例：北海/银滩/海边 -> 北海贝雕、合浦南珠制作技艺、疍家渔歌；三娘湾/钦州/海豚/螃蟹/赶海 -> 三娘湾中华白海豚生态观察、钦州海边赶海生活、钦州三娘湾海洋观察；三月三/歌圩/山歌/绣球 -> 壮族三月三、壮族山歌、壮族绣球、五色糯米饭；三江/风雨桥 -> 侗族大歌、侗族木构建筑营造技艺；玉林/容县/真武阁/木楼梯 -> 容县真武阁木构建筑智慧；柳州/美食 -> 柳州螺蛳粉制作技艺；桂林/漓江/刘三姐 -> 刘三姐歌谣、桂林米粉制作技艺。",
    `本次灵感优先考虑这些文化亮点：${heritage.join("、")}。文旅场景优先考虑：${tourism.join("、")}。`
  ].join("\n");
}

function guiXiaolingVisualSpec(language: BookLanguage) {
  if (language === "en") {
    return [
      "Gui Xiaoya visual lock: Gui Xiaoya is the picture-book companion robot, a cute glossy white-and-blue round robot mascot with a glowing cyan face and heart, headset microphone, friendly childlike smile, blue cape, and toy-like proportions.",
      "Guangxi details: indigo ethnic-inspired headscarf with teal, white, red, and gold geometric trim, small silver-inspired charm, and subtle Guangxi ethnic pattern accents on the cuffs, cape, and notebook. Do not treat these costume details as mandatory story heritage themes."
    ].join(" ");
  }

  return [
    "桂小雅视觉锁定：桂小雅是画册里的固定机器人伙伴，可爱的白蓝配色圆润机器人吉祥物，黑色发光屏幕脸、青蓝色笑脸和爱心灯、耳麦、蓝色披风，整体像柔和精致的玩具机器人。",
    "广西特色细节：靛蓝民族风格头巾，带青蓝、白、红、金色几何边纹，头巾结旁有轻巧银饰小挂件；袖口、披风和本子有少量广西民族纹样点缀。不要把这些装饰当成故事必须出现的非遗主题。"
  ].join(" ");
}

function protagonistVisualSpec(language: BookLanguage, gender: ProtagonistGender) {
  if (language === "en") {
    return gender === "boy"
      ? "Student protagonist: one 8-10 year-old Guangxi elementary-school boy, bright eyes, friendly expression, simple red-blue jacket with subtle Guangxi ethnic pattern accents, small backpack."
      : "Student protagonist: one 8-10 year-old Guangxi elementary-school girl, bright eyes, friendly expression, simple red-blue jacket with subtle Guangxi ethnic pattern accents, small backpack.";
  }

  return gender === "boy"
    ? "小学生主角设定：一位八到十岁广西小学生男孩，明亮眼睛、友好表情，穿红蓝相间、带少量广西民族纹样点缀的小外套，背一个小书包。"
    : "小学生主角设定：一位八到十岁广西小学生女孩，明亮眼睛、友好表情，穿红蓝相间、带少量广西民族纹样点缀的小外套，背一个小书包。";
}

function makeIllustrationPrompt(
  pageTitle: string,
  pageText: string,
  heritage: string[],
  tourism: string[],
  language: BookLanguage,
  protagonistGender: ProtagonistGender
) {
  const noReadableTextRule =
    language === "en"
      ? [
          "No readable text: do not draw Chinese characters, English letters, pinyin, numbers, punctuation, captions, speech bubbles, labels, signs, plaques, banners, page numbers, subtitles, watermarks, logos, UI, book text, paper notes, display boards, monument inscriptions, or any readable marks.",
          "If the scene contains a sign, plaque, book, paper, banner, monument, or display board, render it blank, decorative, or unreadable."
        ].join(" ")
      : [
          "画面无可读文字：不要画汉字、英文、拼音、数字、标点、字幕、对白气泡、标签、招牌、牌匾、横幅、页码、水印、标识、界面文字、书页文字、纸条、展板、纪念碑文字或任何可读符号。",
          "如果场景包含招牌、牌匾、书本、纸张、横幅、纪念碑或展板，请画成空白、装饰纹理或不可读纹理。"
        ].join(" ");

  if (language === "en") {
    return [
      "Warm and bright children's picture book illustration, watercolor texture, one elementary-school protagonist, suitable for ages 6-12.",
      protagonistVisualSpec(language, protagonistGender),
      guiXiaolingVisualSpec(language),
      "Visual concept: one child-friendly Guangxi picture-book scene, not a written title.",
      "Show one clear action with the student protagonist and Gui Xiaoya in a Guangxi scene. Do not render story paragraphs, encyclopedia notes, captions, signs, or labels.",
      `Guangxi cultural highlights: ${heritage.join(", ")}.`,
      `Guangxi cultural tourism elements: ${tourism.join(", ")}.`,
      "Layered composition, friendly expressions, Guangxi ethnic patterns, landscape and festival atmosphere, no real-person portrait.",
      noReadableTextRule
    ].join("\n");
  }

  return [
    "儿童绘本插图，温暖明亮的水彩风格，小学生主角，画面适合六到十二岁儿童。",
    protagonistVisualSpec(language, protagonistGender),
    guiXiaolingVisualSpec(language),
    "本页视觉概念：一个适合儿童绘本的广西场景，不提供可写进画面的标题。",
    "只画小学生主角和桂小雅在广西场景中的一个清楚动作，不要渲染故事正文、小百科、字幕、招牌或标签。",
      `广西文化亮点：${heritage.join("、")}。`,
    `广西文旅元素：${tourism.join("、")}。`,
    "画面有层次，角色表情友好，保留广西民族纹样、山水和节庆氛围，不要出现真实人物肖像。",
    noReadableTextRule
  ].join("\n");
}

function getCultureNote(name: string, language: BookLanguage) {
  const note = cultureNotes[name] || `${name}是广西文化元素，适合和相关地点、人物或行动自然连在一起。`;
  if (language === "en") {
    const localizedName = localizeGuangxiName(name, language);
    return englishCultureNotes[name] || `${localizedName} is a Guangxi local highlight. Use it when it fits the place, action, and mood of the story.`;
  }
  return note;
}

function makeFallbackTitle(idea: string, language: BookLanguage) {
  if (language === "en") {
    if (ideaIncludesAny(idea, ["三娘湾", "钦州", "海豚", "白海豚", "螃蟹", "赶海", "sanniang", "dolphin"])) {
      return "Dolphins and Little Crabs in Sanniang Bay";
    }
    if (ideaIncludesAny(idea, ["北海", "银滩", "beihai", "sea"])) {
      return "The Shell-Carving Treasure on Silver Beach";
    }
    if (ideaIncludesAny(idea, ["三江", "风雨桥", "侗族", "dong"])) {
      return "The Dong Grand Song by the Wind-Rain Bridge";
    }
    if (ideaIncludesAny(idea, ["玉林", "容县", "真武阁", "zhenwu", "rongxian"])) {
      return "The Cloud Maze in Zhenwu Pavilion";
    }
    if (ideaIncludesAny(idea, ["柳州", "螺蛳粉", "liuzhou", "luosifen"])) {
      return "A Heritage Market Scented with Luosifen";
    }
    if (ideaIncludesAny(idea, ["德天", "瀑布", "waterfall"])) {
      return "The Tianqin Echo Beside Detian Waterfall";
    }
    if (ideaIncludesAny(idea, ["桂林", "漓江", "刘三姐", "guilin"])) {
      return "The Mountain-Song Map on the Li River";
    }
    if (ideaIncludesAny(idea, ["三月三", "歌圩", "绣球", "song fair", "embroidered ball"])) {
      return "The Singing Embroidered Ball at the Song Fair";
    }
    return "My Scene-First Guangxi Story";
  }

  if (ideaIncludesAny(idea, ["三娘湾", "钦州", "海豚", "白海豚", "中华白海豚", "螃蟹", "钓螃蟹", "赶海", "海边烧烤", "烧烤"])) {
    return "三娘湾的海豚和小螃蟹";
  }
  if (ideaIncludesAny(idea, ["北海", "银滩", "大海", "贝壳"])) {
    return "银滩上的贝雕寻宝记";
  }
  if (ideaIncludesAny(idea, ["三江", "风雨桥", "侗族", "鼓楼"])) {
    return "风雨桥边的侗族大歌";
  }
  if (ideaIncludesAny(idea, ["玉林", "容县", "真武阁", "古建筑", "不用铁钉", "云朵迷宫"])) {
    return "真武阁里的云朵楼梯";
  }
  if (ideaIncludesAny(idea, ["柳州", "螺蛳粉"])) {
    return "螺蛳粉香气里的文化集市";
  }
  if (ideaIncludesAny(idea, ["德天", "瀑布", "崇左"])) {
    return "瀑布边的天琴回声";
  }
  if (ideaIncludesAny(idea, ["桂林", "漓江", "刘三姐", "阳朔"])) {
    return "漓江上的山歌地图";
  }
  if (ideaIncludesAny(idea, ["三月三", "歌圩", "绣球", "山歌"])) {
    return "歌圩里的会唱歌绣球";
  }
  return "我的广西应景小故事";
}

function makeChineseFallbackPages(
  idea: string,
  heritage: string[],
  tourism: string[],
  protagonistGender: ProtagonistGender
) {
  if (ideaIncludesAny(idea, ["三娘湾", "钦州", "海豚", "白海豚", "中华白海豚", "螃蟹", "钓螃蟹", "赶海", "海边烧烤", "烧烤"])) {
    return [
      {
        title: "海风把灵感吹来",
        text:
          "周末，我背着小桶和画本来到钦州三娘湾。海风咸咸的，沙滩上有一串串小脚印。桂小雅提醒我先观察潮水，再靠近浅浅的沙地。我把想钓螃蟹、看海豚、吃海边烧烤的愿望写在第一页，故事就从浪花声里开始了。"
      },
      {
        title: "小螃蟹的沙洞",
        text:
          "退潮后，我蹲在湿湿的沙地旁，看见一个圆圆的小洞。桂小雅把镜头放低，屏幕上出现小螃蟹探头的样子。我没有用力去抓它，只把它画进本子里，还记下蟹洞、贝壳和海草的位置。原来赶海最重要的不是带走多少东西，而是学会慢慢观察。"
      },
      {
        title: "海面上的白色弧线",
        text:
          "下午，远处海面忽然亮起一道白色弧线，像浪花跳了起来。岸边的叔叔告诉我，三娘湾常让人想起中华白海豚，看海豚时要安静，不追赶、不喂食，也不把垃圾留在沙滩上。我和桂小雅把这一刻画成一张会发光的海湾明信片。"
      },
      {
        title: "烧烤香里的小导游词",
        text:
          "傍晚，海边飘来玉米和烤虾的香味，我一边吃晚饭，一边把今天的发现讲给家人听：三娘湾有海风、蟹洞、渔船，也有需要人们保护的海豚朋友。桂小雅帮我把这些话整理成绘本。我想把这本书带回班里，邀请同学们一起温柔地认识大海。"
      }
    ];
  }

  if (ideaIncludesAny(idea, ["玉林", "容县", "真武阁", "古建筑", "不用铁钉", "云朵迷宫"])) {
    return [
      {
        title: "楼梯变成云朵",
        text:
          "我和桂小雅来到玉林容县真武阁前，木楼梯忽然像白白的云一样轻轻升起。桂小雅没有急着闯关，而是提醒我先看柱子、横梁和屋檐怎样互相支撑。我把第一朵云画进本子，故事从一座会提问的古建筑开始。"
      },
      {
        title: "迷宫里的木头线索",
        text:
          "云朵迷宫里没有怪声，只有木头轻轻咔哒的想象声。我摸着栏杆往前走，发现每一根木构件都像拼图一样找到自己的位置。桂小雅把榫卯结构画成小图标，让我明白古人用连接和受力，让楼阁稳稳站立。"
      },
      {
        title: "不用铁钉的秘密",
        text:
          "走到转角时，云朵门打开了，里面是一座小小的木构模型。我试着把梁、柱、斗拱一样一样摆好，模型就站住了。原来真武阁的厉害，不是靠魔法，而是靠工匠反复计算、观察材料、懂得让每一部分一起用力。"
      },
      {
        title: "我的古建筑讲解",
        text:
          "最后，我把云朵楼梯变回画本里的路线图，给同学们写下一段讲解词：容县真武阁让我们看到广西古建筑的智慧，也提醒我们保护老建筑。桂小雅点亮屏幕说，真正的闯关成功，是把发现讲给更多人听。"
      }
    ];
  }

  return [
    {
      title: "灵感发光",
      text: `我把自己的灵感说给桂小雅听，${heritage[0]}成了第一条线索，因为它和这个地点、人物、心情最合拍。桂小雅没有急着把故事写完，而是先问我看见了什么、听见了什么、最想让同学记住哪一个广西细节。`
    },
    {
      title: "走进广西",
      text: `我来到了${tourism[0]}，这里的声音、颜色和人们的生活，自然而然把我带向${heritage[1]}。我一边走一边观察，把路边的风景、空气里的味道和当地人的动作都记下来，让故事不只是介绍，而像一次真正的旅行。`
    },
    {
      title: "小小讲解员",
      text: `路上，我遇到一个想了解广西文化的小伙伴。我用桂小雅帮我整理的词语，向他介绍${heritage[0]}和${heritage[2]}。我发现，讲文化不是背答案，而是把自己亲眼看到、亲耳听到的发现说清楚。`
    },
    {
      title: "我的创编绘本",
      text: `最后，我把今天的冒险创编成一本绘本，也把${tourism[1]}介绍给更多同学。每个文化小百科都出现在最适合它的地方，主角的心情也从好奇、观察、分享，慢慢变成了想继续探索广西的勇气。`
    }
  ];
}

export function createFallbackBook(idea: string, language: BookLanguage = "zh", protagonistGender: ProtagonistGender = "girl"): PictureBook {
  const id = makeBookId();
  const timestamp = nowIso();
  const selectedHeritage = chooseHeritageElements(idea, 3);
  const selectedTourism = chooseTourismElements(idea, 2);
  const heritage = selectedHeritage.map((item) => localizeGuangxiName(item, language));
  const tourism = selectedTourism.map((item) => localizeGuangxiName(item, language));
  if (language === "en") {
    const title = makeFallbackTitle(idea, language);
    const pageTexts = [
      `I shared my idea with Gui Xiaoya, and ${heritage[0]} became the first clue because it matched the place and mood of my story.`,
      `I arrived at ${tourism[0]}. The sounds, colors, and people there naturally led me to ${heritage[1]}, so the journey felt truly local.`,
      `On the road, I met a friend who wanted to know Guangxi better. With Gui Xiaoya's help, I introduced ${heritage[0]} and ${heritage[2]} in my own words.`,
      `At the end, I turned the journey into a picture book and shared ${tourism[1]} with classmates, letting each local highlight appear only where it belonged.`
    ];
    const titles = ["A Bright Idea", "Into Guangxi", "Little Culture Guide", "My Picture Book"];
    const pages: PictureBookPage[] = pageTexts.map((text, index) => ({
      pageNumber: index + 1,
      title: titles[index],
      text,
      imagePrompt: makeIllustrationPrompt(titles[index], text, heritage, tourism, language, protagonistGender),
      imageUrl: "",
      imageSource: "placeholder",
      cultureNote: getCultureNote(selectedHeritage[index % selectedHeritage.length], language)
    }));
    const storyPrompt = `Turn the student's idea "${idea}" into a 4-page Guangxi culture and travel picture book in English. Use heritage only when it naturally fits.`;

    return {
      id,
      title,
      subtitle: "A picture book where the scene chooses the cultural clue",
      originalIdea: idea,
      language,
      protagonistGender,
      createdAt: timestamp,
      updatedAt: timestamp,
      heritageElements: heritage,
      tourismElements: tourism,
      guidingQuestions: [
        "Is the local highlight a friend, a clue, or a magical object in my story?",
        "Which Guangxi place or culture do I want classmates to remember after reading?"
      ],
      outline: `The main character starts from one idea, travels through ${tourism.join(" and ")}, follows scene-matched clues such as ${heritage.join(", ")}, and finishes an original Guangxi picture book.`,
      pages,
      tourGuideScript: `Hello, I am a little cultural tourism guide. Today I want to introduce ${tourism.join(" and ")}. I chose ${heritage.join(", ")} because they fit this story scene. Welcome to Guangxi, and turn travel discoveries into your own stories.`,
      studentReflection: "I learned that cultural highlights should grow from the place, characters, and action in my story, not be added just because they are famous.",
      aiContentRatio: 88,
      promptRecords: [
        makePromptRecord("story", "Core Story Creation Prompt", storyPrompt, "Generated a 4-page picture book, outline, guide script, and culture notes."),
        ...pages.map((page) => makePromptRecord("image", `Page ${page.pageNumber} Image Prompt`, page.imagePrompt, "Waiting for image generation or using a local demo illustration."))
      ]
    };
  }

  const title = makeFallbackTitle(idea, language);

  const fallbackPages = makeChineseFallbackPages(idea, heritage, tourism, protagonistGender);

  const pages: PictureBookPage[] = fallbackPages.map((page, index) => ({
    pageNumber: index + 1,
    title: page.title,
    text: page.text,
    imagePrompt: makeIllustrationPrompt(page.title, page.text, heritage, tourism, language, protagonistGender),
    imageUrl: "",
    imageSource: "placeholder",
    cultureNote: getCultureNote(heritage[index % heritage.length], language)
  }));

  const storyPrompt = `请把小学生灵感“${idea}”创编成 4 页广西文化文旅绘本；有自然贴合的非遗就介绍，没有就介绍有意义的地方亮点。`;

  return {
    id,
    title,
    subtitle: "一本让场景先说话的广西文化绘本",
    originalIdea: idea,
    language,
    protagonistGender,
    createdAt: timestamp,
    updatedAt: timestamp,
    heritageElements: heritage,
    tourismElements: tourism,
    guidingQuestions: [
      "这个文化亮点在故事里是朋友、线索，还是魔法道具？",
      "你希望读完故事的同学记住哪个广西景点或文化？"
    ],
    outline: `主角从一句灵感出发，在${tourism.join("、")}之间冒险，根据地点和情节认识${heritage.join("、")}，最后完成自己的广西文化文旅绘本。`,
    pages,
    tourGuideScript: `大家好，我是小小文旅推荐官。今天我想介绍${tourism.join("和")}。我选择${heritage.join("、")}，是因为它们和这个故事的地点、声音、味道或行动最贴近。欢迎大家来广西，把旅途中的发现也创编成自己的故事。`,
    studentReflection: "我发现文化亮点不是硬塞进故事里的标签，而是要从地点、人物和情节里自然长出来。",
    aiContentRatio: 88,
    promptRecords: [
      makePromptRecord("story", "核心创建故事提示词", storyPrompt, "已生成 4 页绘本故事、大纲、文旅讲解和文化小百科。"),
      ...pages.map((page) => makePromptRecord("image", `第 ${page.pageNumber} 页图片提示词`, page.imagePrompt, "等待图片生成或使用本地演示插图。"))
    ]
  };
}
