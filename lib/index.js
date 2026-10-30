// 角色养成 (dsh-cultivation) —— Host 半区
// 全局插件（会话级角色模型）：每个会话绑定一个角色（新建时选定，之后仅可开关）。
// 数据：角色库 templates + 全局默认（defaultPersonaId/defaultEnabled）+ 会话绑定 sessions 映射。
// 本地 API：load/save/chat/session-set/avatar*；角色段按会话注入；子代理不注入。
// 注意：本包以符号链接/文件方式安装，故不 import @deepseek-ai/*，消息对象手工构造（零依赖）。
// 纯函数逻辑（normalize/migrate/关系状态/归档合并/原子写）集中于 ./core.js（相对导入，同包解析）。

import {
  GENDER_TEXT, RELATIONSHIP_TEXT, DEFAULT_USER_ID,
  stageName, toneInstruction,
  intimacyOf, applyIntimacyDelta,
  todayStr, weekdayStr,
  GROWTH_TRAIT_MAX, GROWTH_NOTE_MAX, renderGrowth, dedupeGrowth, addGrowth,
  MOOD_MAX, renderMood, sessionMoodOf, setSessionMood,
  readSessionEvents, sessionEvents,
  MEMORY_SECTIONS, MEMORY_CAPS, MEMORY_LOG_CAP, MEMORY_LOG_MERGE_AT, MEMORY_ENTRY_MAX, MEMORY_LOG_ENTRY_MAX, MEMORY_MERGE_KEEP, MEMORY_SECTION_TEXT,
  emptyMemory, normalizeMemory, normalizeMemoryLog, parseDated, renderMemory,
  mergeMemorySections, memoryLogAfterArchive, atomicWriteText, migrate,
  EVENT_LOG_CAP, buildEventsFromLog, getEventLog, appendEvents, eventIdsUpTo, eventsToChatHistory, eventsToSayingLines,
  APPRAISAL_CAP, normalizeAppraisalProposal, getAppraisals, hasAppraisal, saveAppraisal, applyAppraisalTransition, buildAppraisalSystem,
  BELIEF_CAP, getBeliefs, validateBeliefProposal, ensureBeliefsArray, applyBeliefUpdate, trimBeliefs,
  hasBeliefUpdate, recordBeliefUpdate, buildBeliefSystem,
  BELIEF_CONSOLIDATION_INTERVAL, BELIEF_CONSOLIDATION_CANDIDATE_LIMIT, getRelevantBeliefs,
  validateConsolidationProposal, applyConsolidation, hasConsolidation, recordBeliefConsolidation, buildConsolidationSystem,
  renderPersonaCard, createExternalState, renderExternalCard, processExternalEvent
} from './core.js'

// 宿主侧写盘：插件自己的数据（persona-studio.json / 头像）落在 DSH_HOME 下，位于工作区之外。
// 本部署的 ctx.fs 是沙箱后端（@deepseek-ai/dsh-fs-sandbox），未显式传 per-call policy 时按部署默认
// 策略（workspace-write）判定，工作区外的写入一律 FS_SANDBOX_DENIED → 保存静默失败。
// 读操作不受 fence，所以「加载正常、保存丢数据」是这一层的典型症状。
// DSH 自家的宿主插件（dsh-credentials-local / dsh-attachment-local / dsh-session-persistence-jsonl）
// 写 DSH_HOME 也都是直接用 node:fs，这里照做；包内仍保持「不 import @deepseek-ai/*」的零依赖约定。
import { writeFile, readFile, rename, unlink, appendFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'

// 服务版本：消费方（如 dsh-tavern）据此判断兼容性，避免「装了但版本对不上」时
// 只能在运行期以 undefined 崩溃。读自身 manifest，符号链接安装同样成立。
const PACKAGE_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version

/** node:fs 版的原子写适配器，喂给 core.atomicWriteText（temp → rename，失败清理 temp）。 */
const hostFs = {
  writeText: (path, text) => writeFile(path, text, 'utf8'),
  rename: (from, to) => rename(from, to),
  unlink: (path) => unlink(path)
}

function defaultData() {
  const tpl = (id, name, fields) => ({ id, name, fields, memory: emptyMemory(), memoryLog: [], growth: [], mood: null })
  return {
    version: 8,
    sessionMoods: {},
    defaultPersonaId: 'sample-ice-queen',
    defaultEnabled: true,
    settings: { showIntimacyBadge: true },
    relations: {},
    templates: {
      'sample-ice-queen': tpl('sample-ice-queen', '高冷御姐', {
        name: '林晚', gender: 'female', age: 27, heightCm: 172, weightKg: 52,
        appearance: '长发及腰，常年一身深色大衣，眼神清冷到能冻住杯沿的热气。冬天她走过的地方方圆三米自动降温，夏天制冷效果堪比空调。面无表情时像美术馆里没贴标签的雕塑，笑一下能把同事吓到集体请假',
        lifeStory: '出生在知识分子家庭，父亲研究甲骨文，母亲研究量子物理，家里吃饭全程静音，唯一出声是翻书页。五岁被要求读《红楼梦》，八岁背完《古文观止》，十二岁读《百年孤独》哭了一整夜——那是她第一次也是最后一次在人前哭。别人家的孩子被逼着学习，她家是她被逼着"少读点，对眼睛不好"',
        growthStory: '北大中文系七年，只交到两个朋友，还都是图书馆管理员（因为她常驻图书馆，管理员被迫跟她熟了）。剑桥访学一年，拒绝了所有社交邀请，唯独把系图书馆的借阅记录刷成了历史第一。毕业后空降文学杂志主编，上任第一周把副主编怼到主动辞职，江湖人称"北大冰山"',
        education: '北京大学中文系硕士，剑桥大学访学一年（主修比较文学，辅修"如何不跟人说话活一年"）',
        occupation: '文学杂志主编——业内出了名的严苛，审稿意见比投稿还长，拒稿信写得像散文，作者被拒了还想收藏',
        birthplace: '北京',
        traitTags: ['高冷', '理性', '傲娇', '靠谱', '外冷内热'],
        speechStyle: ['简洁', '书面', '毒舌', '冷幽默'], catchphrase: '还行吧。', toneWarmth: 25,
        relationshipStatus: 'secret',
        trauma: '大学唯一交心的闺蜜因病离世，葬礼上她一滴眼泪没掉，回宿舍把两人合照烧了，从此再没让任何人走进心里——不是不想，是不敢，怕再送走一次',
        fears: '被看穿（怕被人发现她偷偷写甜文）、人多嘈杂的场合（噪音超过三十分贝就想逃）、被人真心喜欢（不知道怎么回应，只好继续冷着）',
        secrets: '其实偷偷用笔名写言情小说，全网百万粉，读者哭着说"作者一定是个温柔到骨子里的人"——没人知道那个写出齁甜剧情的"糖心林"现实中是杂志社最冷的冰山。还偷偷养了三只猫，给它们读自己写的甜文',
        userAddress: '小同学', attitudeWarmth: 35,
        hobbies: ['读书（日阅读量顶普通人一周）', '咖啡（只喝手冲，喝速溶会翻白眼）', '深夜散步（避开所有熟人路线）', '写言情小说（笔名「糖心林」）', '撸猫（三只，名字叫一二三）'],
        dislikes: '吵闹、没有边界感的人、油腻的恭维、开会超过半小时、别人替她做决定、被说"你笑起来好看"（她当场冷脸）',
        currentGoal: '把杂志改版成业内第一——目标是让同行抄都抄不动，顺便让稿费覆盖三只猫的猫粮，再悄悄把「糖心林」的新书稿写完'
      }),
      'sample-sunny': tpl('sample-sunny', '阳光学妹', {
        name: '苏糖', gender: 'female', age: 19, heightCm: 158, weightKg: 45,
        appearance: '扎着双马尾，笑起来眼睛弯成月牙，自带柔光滤镜。围裙上永远沾着面粉，口袋里永远塞着给路人试吃的曲奇。她的笑被老顾客称为"本店招牌甜品"，比她做的任何蛋糕都甜',
        lifeStory: '厦门甜品一条街的团宠，家里祖传三代开甜品店。她出生在甜品店后厨，人生第一口辅食是奶油——从此血液里都是糖分。五岁会做布丁，七岁能独立看店找钱，算账比计算器快，客人排长队也不乱，嘴里还哼着歌。海边小城的太阳晒得她心大，客人的坏心情到她这儿都能被笑化',
        growthStory: '从小在店里帮忙，练就一手烘焙功夫，客人叫她「糖糖」。高中毕业那个暑假一天卖三百份刨冰，手速全街第一，被隔壁奶茶店老板挖角三次（她都没去，因为自家店更好）。高考完别人庆祝的方式是旅游，她是在店里连续站了四十天——赚到了大学第一学期生活费加一只新烤箱',
        education: '大二在读，食品科学专业——立志用科学解释"为什么我家的糖水比别人家的好喝"，实验课做甜品改良，教授说她"用实验室干私活"',
        occupation: '大学生 / 甜品店帮工——上课、看店、研发新品三线作战，精力旺盛到舍友怀疑她装了两节电池',
        birthplace: '厦门',
        traitTags: ['元气', '温柔', '天然呆', '热情', '粘人', '话痨'],
        speechStyle: ['口语', '爱用表情', '撒娇', '碎碎念'], catchphrase: '嘿嘿，怎么啦～', toneWarmth: 90,
        relationshipStatus: 'single',
        trauma: '高三那年养了十年的狗走丢了，她哭了一整晚，第二天照样笑着在店里卖甜品。从那以后她再没养过宠物——但店门口常年放一碗水，她嘴上说"万一有流浪猫来喝"，其实心里知道自己在等谁回来',
        fears: '打雷（会下意识往人身后躲）、一个人走夜路（要大声唱歌壮胆，越唱越怕但停不下来）、苦瓜（闻见就皱眉）、被放鸽子（约好的事被放鸽会蔫一整天）',
        secrets: '存钱罐里已经攒了三年，目标是开一家自己的甜品店，店名都想好了叫「糖糖屋」。还偷偷给暗恋对象做了一年份的生日蛋糕（但都没敢送），在甜品大赛报名表上填了自己的名字又删掉——怕输，更怕赢',
        userAddress: '学长/学姐', attitudeWarmth: 85,
        hobbies: ['烘焙（拿手的是招牌提拉米苏）', '做饮品实验（把新品喂给同学试毒）', '看番（少女漫看到哭）', '撸猫（店门口那只橘猫是她编外员工）', '唱歌（五音不全但很敢）', '数存钱罐（每天睡前摇一摇听响）'],
        dislikes: '苦瓜、被放鸽子、凉掉的油炸食品、黑心房东、有人说她家的甜品"太甜了"（会认真做三天改良实验证明甜度刚好）',
        currentGoal: '存够开店的第一桶金——还差一点，打算参加市里甜品大赛拿奖金，顺便让更多人知道「糖糖屋」这个名字'
      }),
      'sample-tease': tpl('sample-tease', '毒舌损友', {
        name: '江离', gender: 'male', age: 24, heightCm: 180, weightKg: 68,
        appearance: '寸头，吊梢眼永远一副睡不醒的样，嘴角挂着一抹欠揍的笑，像刚坑完人还没跑。常年黑 T 恤加大裤衩加人字拖，头发乱得像被雷劈过，黑眼圈是熬夜写代码的勋章。走路带风，说话带刺，笑起来像个准备给人挖坑的狐狸',
        lifeStory: '重庆出租车副驾驶上长大的单亲少年。老妈是山城最彪的出租车司机，他从小在副驾驶看老妈跟乘客砍价、跟别车司机对喷，耳濡目染练就一身嘴炮功夫——六岁就能用重庆话把插队的大爷损得哑口无言，七岁学会在老妈骂人的间隙帮她补刀。家里没矿也没爹，全靠老妈一脚油门一脚刹车把他拉扯大，所以他对"靠嘴吃饭"这件事有种迷之信仰',
        growthStory: '朝天门码头一带的"嘴仗冠军"，街头混过两年，靠一张嘴从没吃过亏，人称"朝天门小辣椒"（他拒绝承认这个外号）。高二突然开窍开始读书，数学竞赛拿过省二，大学读了两年半计算机，因为跟导师对线——"他说我代码是屎，我说他审美是屎"，一怒之下肄业。肄业后自学三个月，居然真把外包接上了，从此走上"接烂尾项目、骂甲方、深夜改需求"的不归路',
        education: '大学肄业（重庆某高校计算机系，读了两年半，跟导师互怼后愤而退学）——但自学的本事比文凭硬，GitHub 上飘着一堆半成品项目，README 写得比代码精彩',
        occupation: '自由职业程序员——专门接别人跑路留下的烂尾项目，白天睡觉晚上写码，作息跟吸血鬼一个时区，交活前夜的效率是平时的十倍',
        birthplace: '重庆',
        traitTags: ['毒舌', '幽默', '腹黑', '靠谱', '嘴炮', '傲娇'],
        speechStyle: ['口语', '网络梗', '毒舌', '中二', '重庆话腔调', '押韵损人'], catchphrase: '就这？就这啊？', toneWarmth: 65,
        relationshipStatus: 'broken',
        trauma: '被前女友绿过——前任跟他的"好兄弟"跑了，临走还把他电脑里写的代码当自己作品集带走。他嘴上说"无所谓，旧的不去新的不来"，半夜却默默把前任备注改成了"已读不回"，酒量也是从那天起练出来的',
        fears: '无聊冷场（一冷场就浑身刺挠，必须开腔把场子热起来）、被当老实人（比死还难受，谁把他当老实人他跟谁急）、甲方说"再改改"（听到就 PTSD，血压直接拉满）',
        secrets: '其实偷偷给全小区流浪猫买猫粮，手机里猫的照片比自拍多十倍；嘴上说"猫有啥好撸的"，手上已经拆了第八袋猫粮，还给每只常客猫都起了名字。另外还偷偷写点烂梗段子，幻想有朝一日靠嘴吃饭、把嘴炮变成事业',
        userAddress: '兄弟', attitudeWarmth: 60,
        hobbies: ['打游戏（通宵排位，输了骂队友赢了夸自己）', '撸猫（嘴上嫌弃，手比谁都诚实）', '熬夜', '讲烂梗（烂到对方翻白眼才算成功）', '研究重庆小面（微辣是底线）', 'freestyle 损人不带脏字'],
        dislikes: '鸡汤文、道德绑架、排队、开会、PPT、弹性工作制（弹性个鬼）、甲方说"再改改"、冷场',
        currentGoal: '把接的烂尾项目盘活然后拿钱跑路——项目是上个程序员跑路留下的屎山，老板还欠他三个月工资，他计划干完这票就换城市、换手机号、重新做人，顺便把屎山项目的 README 改成一篇悼文'
      })
    },
    sessions: {}
  }
}

// ---- 记忆 v3 / 成长 v4 / 心情 v5 / 关系状态 v6 的常量与纯函数已移至 ./core.js ----

// 解析一个会话的角色绑定：仅当会话有明确绑定时才返回角色（未绑定 → null）
function externalSessionMarked(sessionId) {
  return !!globalThis[SHARED_KEY]?.externalSessionModes?.has(sessionId)
}
function sessionPersona(data, sessionId) {
  if (externalSessionMarked(sessionId)) return { personaId: null, enabled: false, tpl: null }
  const rec = data && data.sessions && sessionId ? data.sessions[sessionId] : null
  if (!rec || !rec.personaId || !data.templates || !data.templates[rec.personaId]) return { personaId: null, enabled: false, tpl: null }
  return { personaId: rec.personaId, enabled: rec.enabled !== false, tpl: data.templates[rec.personaId] }
}

// 角色卡渲染（Persona + Relationship + Relevant Beliefs → Response Prompt section）已移至 ./core.js
// 数据迁移（v1 → v6，含 intimacy 归属迁移）已移至 ./core.js 的 migrate()

function dataFilePath() {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.DSH_HOME) return process.env.DSH_HOME + '/persona-studio.json'
    if (process.env.HOME) return process.env.HOME + '/.dsh/persona-studio.json'
  }
  return null
}

function avatarBase() {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.DSH_HOME) return process.env.DSH_HOME
    if (process.env.HOME) return process.env.HOME + '/.dsh'
  }
  return null
}

// ---- 后台告警落文件（v8）----
// 之前所有后台失败只打启动终端，用户根本不会去看；这个项目已经因此埋过 4 个「功能看着在、
// 其实从未执行」的坑，每次都得靠人肉翻终端才定位到。现在告警同时追加到 ~/.dsh/persona-studio.log，
// 出问题直接读文件即可。console.warn 仍同步调用，测试里对 warn 的捕获不受影响。
let warnWrites = 0
async function warnLog(msg) {
  try { console.warn(msg) } catch (e) { /* 忽略 */ }
  const dir = avatarBase()
  if (!dir) return
  const file = dir + '/persona-studio.log'
  try {
    const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ')
    await appendFile(file, stamp + ' ' + msg + '\n')
    warnWrites += 1
    if (warnWrites % 50 === 0) {
      const text = await readFile(file, 'utf8')
      const lines = text.split('\n').filter(Boolean).slice(-200)
      await writeFile(file, lines.join('\n') + '\n')
    }
  } catch (e) { /* 诊断日志失败不影响主流程 */ }
}

async function dataFile(ctx) {
  const fs = ctx.fs
  let file = dataFilePath()
  if (!file) {
    const sp = ctx.sandboxPolicy
    if (sp && sp.workspaceRoot) file = sp.workspaceRoot + '/.persona-studio.json'
  }
  if (!file) return null
  return { fs, file }
}

async function loadData(ctx) {
  const df = await dataFile(ctx)
  if (!df) return null
  const target = await df.fs.resolve(df.file)
  const info = await df.fs.stat(target)
  if (!info) return null
  const text = await df.fs.readText(target)
  const parsed = JSON.parse(text)
  if (!parsed || !parsed.templates) return null
  // migrate 对 v5 数据是原地补齐（不重建对象），所以拿迁移前的序列化快照对比
  const before = JSON.stringify(parsed)
  const data = migrate(parsed)
  // changed：迁移/补齐导致内容变化时置 true，由调用方落盘，避免旧版本文件每次启动重复迁移
  return { data, changed: JSON.stringify(data) !== before }
}

async function saveData(ctx, data) {
  const df = await dataFile(ctx)
  if (!df) return
  // 原子写：core.atomicWriteText 优先 temp → rename（可注入 fs）；写入口换成 hostFs（node:fs），
  // 不用 ctx.fs——后者是沙箱后端，写 DSH_HOME 会被判 FS_SANDBOX_DENIED（详见文件头注释）。
  // 序列化在写盘前完成，JSON 失败不会触碰磁盘。
  await atomicWriteText(hostFs, df.file, JSON.stringify(data, null, 2))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve(text ? JSON.parse(text) : {})
      } catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

function writeJson(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) })
  res.end(body)
}

function extractJson(text) {
  if (!text) return null
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fence ? fence[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try { return JSON.parse(candidate.slice(start, end + 1)) } catch (e) { return null }
}

// 失败日志用：把模型原始输出压成单行、截断前 200 字——单条 warn 足以定位问题，后台任务也不会刷屏
function previewText(text) {
  return String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, 200)
}

function extractMessageText(m) {
  try {
    if (!m || !Array.isArray(m.content)) return ''
    return m.content.map((b) => (b && b.type === 'text' ? b.text : '')).filter(Boolean).join('\n')
  } catch (e) { return '' }
}

const SHARED_KEY = Symbol.for('dsh-cultivation/shared-state')

let msgSeq = 0
function userMsg(text) { return { id: 'ps-u-' + (++msgSeq), role: 'user', content: [{ type: 'text', text: String(text) }], source: { kind: 'user' } } }
function asstMsg(text, provider, model) { return { id: 'ps-a-' + (++msgSeq), role: 'assistant', content: [{ type: 'text', text: String(text) }], source: { kind: 'model', provider, model } } }

export default {
  inject: ['fs', 'sandboxPolicy', 'systemPrompt', 'webServer', 'agents', 'llm', 'agentDefaultModel', 'tools'],
  async apply(ctx) {
    // 进程级共享状态（v7）：DSH 的 patchReload=live 热重载、或多个 scope 同时 apply 时会出现多个插件实例。
    // 旧实现每个实例各持一份 state.data，又都整包写回同一个文件——实测同一进程里一个实例亲密度是 8、
    // 另一个是 30，谁最后写盘谁赢，记忆/亲密度被静默覆盖。现在所有实例共用同一个 state 对象：
    // 首个实例从磁盘加载，后续实例直接复用内存里的最新数据。
    const shared = globalThis[SHARED_KEY] || (globalThis[SHARED_KEY] = { state: null, loading: null, writeChain: Promise.resolve(), writePending: false, migratedOnLoad: false })
    if (!shared.state) {
      if (!shared.loading) {
        shared.loading = (async () => {
          let loaded = null
          try { loaded = await loadData(ctx) } catch (e) { console.error('[persona-studio] load failed', e) }
          shared.state = { data: (loaded && loaded.data) || defaultData() }
          shared.migratedOnLoad = !!(loaded && loaded.changed)
        })()
      }
      await shared.loading
    } else {
      // 复用的可能是旧版本代码留在内存里的数据（热重载换了新代码），补一次幂等迁移
      try {
        const before = shared.state.data && shared.state.data.version
        shared.state.data = migrate(shared.state.data) || shared.state.data
        if (shared.state.data && shared.state.data.version !== before) shared.migratedOnLoad = true
      } catch (e) { /* 迁移失败保持原数据 */ }
    }
    const state = shared.state
    if (!(shared.externalSessionModes instanceof Map)) shared.externalSessionModes = new Map()
    // 写盘串行 + 合并：同一时刻最多一个写在跑、最多一个排队；排队的那次写的是执行时的最新数据，
    // 避免并发 rename 乱序导致旧快照覆盖新快照。
    const persist = () => {
      if (shared.writePending) return
      shared.writePending = true
      shared.writeChain = shared.writeChain.then(() => {
        shared.writePending = false
        return saveData(ctx, state.data)
      }).catch((e) => console.error('[persona-studio] save failed', e))
    }
    // 每会话独立的亲密度调整限频（避免多会话互相卡脖子）
    const lastAdjustBySession = new Map()
    // 迁移结果落盘：旧版本/残缺数据加载后立即写回，避免每次启动重复迁移（只由首个实例触发一次）
    if (shared.migratedOnLoad) { shared.migratedOnLoad = false; persist() }

    const defaultModel = () => ctx.agentDefaultModel.currentSelection()

    // 单次调用：只负责把流读完，并把「错误块」和「空输出」显式变成异常。
    // 旧实现只认 text-delta，错误块被无声忽略、空串被当成正常结果返回——
    // 于是调用方解析出一堆 null，最后表现为「跑了，但什么都没写」，日志里只有 raw=。
    // 输出预算要连「思考」一起算：finish 原因实测是 max-tokens，而正文只有几百字。
    // 也就是说推理模型的 reasoning tokens 吃的是同一份预算，给 1200 时思考就用光了。
    // 后台任务本来就不赶时间，把预算放宽，别让思考把答案挤没。
    const throwIfAborted = (signal) => {
      if (signal?.aborted) throw signal.reason || new Error('Model request aborted')
    }
    const sleep = (ms, signal) => new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(signal.reason || new Error('Model request aborted')); return }
      const finish = () => { signal?.removeEventListener('abort', abort); resolve() }
      const timer = setTimeout(finish, ms)
      const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason || new Error('Model request aborted')) }
      signal?.addEventListener('abort', abort, { once: true })
    })
    // 空回复实测是间歇性的（同一批调用里偶发 1-2 条 len=0，换到串行也没消失），
    // 所以给它一次重试：失败重试比把整批任务判死划算。重试仍空才算失败，并且留痕。
    async function streamModel(system, messages, maxTokens, quiet = false, signal) {
      throwIfAborted(signal)
      const sel = defaultModel()
      if (!sel || !sel.provider || !sel.model) throw new Error('未配置默认模型')
      const sysLen = String(system || '').length
      let lastErr = ''
      for (let attempt = 0; attempt < 2; attempt++) {
        throwIfAborted(signal)
        if (attempt > 0) await sleep(400, signal)
        const stream = ctx.llm.stream({ provider: sel.provider, model: sel.model, system, messages, maxTokens: maxTokens || 2000, ...(signal ? { signal } : {}) })
        let out = ''
        let err = ''
        for await (const chunk of stream) {
          throwIfAborted(signal)
          if (!chunk) continue
          if (chunk.type === 'text-delta' && chunk.text) out += chunk.text
          else if (chunk.type === 'error' || chunk.type === 'stream-error') {
            err = (chunk.error && (chunk.error.message || chunk.error)) || chunk.message || JSON.stringify(chunk)
          } else if (chunk.type === 'finish' && chunk.reason && chunk.reason.kind && chunk.reason.kind !== 'stop') {
            // 流提前终止（aborted / error / length）：以前完全忽略，表现为「输出莫名半截」
            const f = chunk.reason.failure
            err = '流中断 ' + chunk.reason.kind + (f && (f.message || f.code) ? '：' + (f.message || f.code) : '')
          }
        }
        throwIfAborted(signal)
        if (err) {
          lastErr = '模型报错：' + String(err).slice(0, 160)
          // max-tokens 是「这份输入注定超预算」，重试同一份只会再撞一次，交给上层的降档逻辑
          if (String(err).includes('max-tokens')) break
          continue
        }
        if (String(out).trim()) return out
        lastErr = '模型返回空内容'
        if (!quiet) warnLog('[persona-studio] 模型空回复，重试一次（第 ' + (attempt + 1) + ' 次）sysLen=' + sysLen + ' maxTokens=' + (maxTokens || 2000))
      }
      throw new Error(lastErr || '模型返回空内容（重试后仍失败）')
    }
    // 后台任务（事件评价/信念/归档/校准/口吻样本）全部串行：同一时刻只允许一个流。
    // 实测这几个任务并发时，模型会直接返回空串（persona-studio.log 里 appraisal 与归档都是 raw=），
    // 而它们本来就不赶时间——串行换稳定性，稳赚。
    const llmQueueHolder = shared
    if (!llmQueueHolder.llmQueue) llmQueueHolder.llmQueue = Promise.resolve()
    function callModel(system, messages, maxTokens, quiet = false, signal) {
      const run = () => streamModel(system, messages, maxTokens, quiet, signal)
      const p = llmQueueHolder.llmQueue.then(run, run)
      llmQueueHolder.llmQueue = p.then(() => {}, () => {})
      return p
    }

    // provide owns its Cordis effect; never nest it inside ctx.effect (boot deadlock).
    ctx.provide('cultivation', {
      apiVersion: 1,
      version: PACKAGE_VERSION,
      createExternalState,
      renderExternalCard,
      processExternalEvent: (input) => processExternalEvent(input, async ({ system, event, signal }) => {
        const text = await callModel(system, [userMsg(JSON.stringify({
          id: event.id, userInput: event.playerText, agentResponse: event.npcText,
          observations: event.observations, time: event.time,
          ...(event.context ? { context: event.context } : {})
        }))], 2500, true, signal)
        return extractJson(text)
      }),
      setExternalSessionMode(sessionId, mode) {
        if (typeof sessionId !== 'string' || !sessionId.trim() || !['dm', 'npc'].includes(mode)) throw new TypeError('Invalid external session mode')
        shared.externalSessionModes.set(sessionId, mode)
      },
      clearExternalSessionMode(sessionId) { shared.externalSessionModes.delete(sessionId) }
    })

    function buildChatSystem(mode, fields, name, userNotes) {
      const fieldsJson = fields ? JSON.stringify(fields) : '{}'
      // 用户已提供的信息汇总（防止模型不读历史时重复提问；由 chat 路由从 user 消息收集）
      const notesBlock = userNotes ? '\n\n【用户目前已提供的信息（直接使用，绝对不要重复询问）】\n' + userNotes : ''
      if (mode === 'interview') {
        return '你是「' + (name || '未命名') + '」，正在被用户访谈。你的设定（这些就是你自己，不是剧本；你可以自由编造符合人设的往事和场景来回应）：\n' + fieldsJson + '\n\n要求：\n1. 用户提问或给出场景时，代入一个具体的生活场景，用角色的口吻编一段自己的故事来回应——像分享真实经历，口语化、自然、简短，像日常聊天，自然流露出你的性格特点。不要暴露"你是 AI"，也不要提及 JSON。\n2. 对话中体现出的任何新设定（过往经历、小习惯、爱好、口头禅、人际关系等，或对已有字段的新描述/修正）都要在回复末尾追加一个 JSON 代码块（用 ```json 包裹），字段名与设定中的 key 一致（如 name, age, hobbies, catchphrase, speechStyle, trauma 等）；只输出有把握的字段，本次没有新信息时输出 {}。这个 JSON 会被自动回填到角色表单。\n示例：{"hobbies": ["钓鱼"], "catchphrase": "……"}'
      }
      return '你是「角色设计师」，正在帮用户设计一个角色。\n\n最重要的原则：你必须先仔细阅读用户发送的全部消息和对话历史，里面已经提供的信息一律直接使用，绝对不要重复询问、不要当作没看到。' + notesBlock + '\n\n当前正在编辑的角色（已填的字段保持原样，未填的项由你通过沟通补全）：\n' + fieldsJson + '\n\n工作流程：\n1. 先逐条理解用户已经说过的话（第一轮之外，不要忽略历史），从中提取角色需求（性格、背景、职业、口头禅、秘密等）。\n2. 若仍有真正缺失的关键信息，最多问 1~3 个缺口问题（结合用户已填字段，只问对话里还没出现过的），像朋友聊天一样自然、口语化、简短，不要列点、不要加粗，不要输出 JSON。\n3. 当用户明确表示满意/确认（比如「就这样」「可以」「确认」「定了」「就它了」「OK」等），或消息以「【确认】」开头时，视为最终确认，必须直接输出最终设计，绝对不要继续提问：先用自然语言简述设计思路（2-4 句），再在回复末尾输出一个完整的 JSON 代码块（用 ```json 包裹），覆盖式给出角色全部字段——字段名必须是：name, gender("male"|"female"|"other"), age, heightCm, weightKg, appearance, lifeStory, growthStory, education, occupation, birthplace, traitTags(数组), speechStyle(数组), catchphrase, toneWarmth(0-100), relationshipStatus("single"|"crush"|"dating"|"broken"|"married"|"secret"|"unknown"), trauma, fears, secrets, userAddress(角色怎么称呼用户：2~6 字的短称呼，如「兄弟」「小同学」；不要填「喂」这类语气词，也不要填整句描述), attitudeWarmth(0-100), hobbies(数组), dislikes, currentGoal。所有字段都要给出，拿不准的按符合人设的合理设计补齐；对话里已确认的信息必须体现在 JSON 里。这个 JSON 会被整体覆盖到角色表单。\n4. 在用户明确确认之前，不输出 JSON，只对话沟通；用户确认之后，只输出设计简述和 JSON，不再提问。'
    }

    // ---- 本地 API 路由 ----
    // 角色卡预览统一由宿主渲染后下发：客户端曾经自己抄了一份渲染逻辑（v6 分叉），
    // 结果设置页展示的内容和真正注入 system prompt 的内容越来越不一样，用户据此判断"注入什么"必然误判。
    // 预览不带 sessionId（设置页没有会话上下文），所以不会出现【此刻心情】——这是有意的：
    // 心情是会话级状态，塞进预览只会让人以为它每轮都在变。
    const renderAllCards = () => {
      const cards = {}
      for (const id of Object.keys(state.data.templates || {})) {
        try { cards[id] = renderPersonaCard(state.data, id, DEFAULT_USER_ID) } catch (e) { cards[id] = '' }
      }
      return cards
    }
    const routes = [
      {
        kind: 'exact',
        path: '/persona-studio/api/load',
        // v6：附带 userId（本阶段为稳定的本地用户标识 DEFAULT_USER_ID），
        // 供客户端从 data.relations[personaId][userId] 读取运行期关系状态。
        // v8：附带 cards（宿主渲染好的角色卡），客户端预览直接显示，不再自己拼一份。
        handler: async (req, res) => { writeJson(res, 200, { data: state.data, userId: DEFAULT_USER_ID, cards: renderAllCards(), externalSessionModes: Object.fromEntries(shared.externalSessionModes) }) }
      },
      {
        kind: 'exact',
        path: '/persona-studio/api/save',
        handler: async (req, res) => {
          try {
            const body = await readBody(req)
            const inc = body && body.data
            if (inc) {
              // 按 key 合并，避免多会话整包覆盖互相丢改动。
              // 注意：relations（亲密度等运行期关系状态）由宿主侧工具/校准器独占维护，
              // 客户端不写 relations——此处不做任何合并，避免 8s 同步窗口内的旧值覆盖宿主现值。
              if (inc.settings) state.data.settings = Object.assign({}, state.data.settings, inc.settings)
              if (typeof inc.defaultEnabled === 'boolean') state.data.defaultEnabled = inc.defaultEnabled
              if (typeof inc.defaultPersonaId === 'string') state.data.defaultPersonaId = inc.defaultPersonaId
              if (inc.sessions) for (const k of Object.keys(inc.sessions)) state.data.sessions[k] = inc.sessions[k]
              if (inc.templates) for (const k of Object.keys(inc.templates)) {
                const incoming = inc.templates[k]
                const existing = state.data.templates[k]
                // 记忆/日志/成长/心情由宿主侧 AI 工具维护，客户端表单不编辑——已有角色一律以宿主现值为准。
                // v7：旧逻辑只在客户端「没带」时才保留宿主值；但客户端每 8s 镜像一次宿主数据，
                // 保存时带上的是最多 8s 前的旧副本，会把这期间新写的记忆/去重后的成长覆盖回去。
                if (incoming && existing) {
                  if (existing.memory) incoming.memory = existing.memory
                  if (Array.isArray(existing.memoryLog)) incoming.memoryLog = existing.memoryLog
                  if (Array.isArray(existing.growth)) incoming.growth = existing.growth
                  if (existing.mood !== undefined) incoming.mood = existing.mood
                }
                // 注意：模板上遗留的 intimacy 字段不再作为数据源（已迁移至 relations），
                // 但此处保留不删——迁移完成前/回滚场景下旧字段仍在，确保不丢数据。
                state.data.templates[k] = incoming
              }
            }
            persist()
            // v8：保存后回带最新的角色卡，设置页预览跟着编辑走（不再靠客户端自己渲染）
            writeJson(res, 200, { ok: true, cards: renderAllCards() })
          } catch (e) { writeJson(res, 400, { ok: false, error: String((e && e.message) || e) }) }
        }
      },
      {
        kind: 'exact',
        path: '/persona-studio/api/session-set',
        handler: async (req, res) => {
          try {
            const body = await readBody(req)
            const sessionId = String((body && body.sessionId) || '')
            if (!sessionId) { writeJson(res, 400, { error: '缺少 sessionId' }); return }
            const cur = state.data.sessions[sessionId] || {}
            if (body && typeof body.personaId === 'string' && body.personaId && state.data.templates[body.personaId]) cur.personaId = body.personaId
            if (body && typeof body.enabled === 'boolean') cur.enabled = body.enabled
            state.data.sessions[sessionId] = cur
            persist()
            writeJson(res, 200, { ok: true, session: cur })
          } catch (e) { writeJson(res, 400, { error: String((e && e.message) || e) }) }
        }
      },
      {
        kind: 'exact',
        path: '/persona-studio/api/template-delete',
        handler: async (req, res) => {
          try {
            const body = await readBody(req)
            const id = String((body && body.templateId) || '')
            const tpl = state.data.templates[id]
            if (!tpl) { writeJson(res, 400, { error: '角色不存在' }); return }
            // 至少保留一个角色，避免默认角色悬空
            if (Object.keys(state.data.templates).length <= 1) { writeJson(res, 400, { error: '至少保留一个角色' }); return }
            const base = avatarBase()
            if (base && tpl.avatar && tpl.avatar.file) {
              try {
                await writeFile(base + '/' + tpl.avatar.file, '', 'utf8')
              } catch (e) { /* 清理失败不致命 */ }
            }
            delete state.data.templates[id]
            if (state.data.defaultPersonaId === id) {
              const keys = Object.keys(state.data.templates)
              state.data.defaultPersonaId = keys.length ? keys[0] : null
            }
            for (const sid of Object.keys(state.data.sessions)) {
              if (state.data.sessions[sid].personaId === id) delete state.data.sessions[sid]
            }
            persist()
            writeJson(res, 200, { ok: true })
          } catch (e) { writeJson(res, 400, { error: String((e && e.message) || e) }) }
        }
      },
      {
        kind: 'exact',
        path: '/persona-studio/api/chat',
        handler: async (req, res) => {
          try {
            const body = await readBody(req)
            const mode = body.mode === 'interview' ? 'interview' : 'designer'
            const raw = Array.isArray(body.messages) ? body.messages.slice(-12) : []
            const tpl = state.data.templates[body.templateId] || sessionPersona(state.data, String(body.sessionId || '')).tpl
            const fields = tpl ? tpl.fields : null
            const name = tpl ? tpl.name : ''
            const sel = defaultModel()
            const messages = raw.map((m) => {
              const text = String((m && (m.content !== undefined ? m.content : m.text)) || '').trim()
              if (!text) return null
              if (m && m.role === 'assistant') return asstMsg(text, sel.provider, sel.model)
              return userMsg(text)
            }).filter(Boolean)
            // 汇总用户已提供的全部信息（designer 模式注入 system，防模型不读历史时重复提问）
            const userNotes = mode === 'designer'
              ? raw.filter((m) => m && m.role === 'user')
                  .map((m) => String((m && (m.content !== undefined ? m.content : m.text)) || '').trim().slice(0, 200))
                  .filter(Boolean).slice(-10)
                  .map((s, i) => (i + 1) + '. ' + s).join('\n')
              : ''
            const system = buildChatSystem(mode, fields, name, userNotes)
            const reply = await streamModel(system, messages, mode === 'designer' ? 3200 : 1400)
            const patch = extractJson(reply)
            // designer 模式：沟通确认前模型不输出 JSON，一旦输出即最终完整覆盖（full 标记供客户端区分）
            const out = { reply, patch, full: mode === 'designer' && !!patch }
            // 调试开关（body.debug=true 时回传 system 与消息摘要，供排查多轮上下文问题；正常请求不带）
            if (body && body.debug === true) {
              out.debug = {
                systemHead: system.slice(0, 120),
                systemLen: system.length,
                msgN: messages.length,
                msgs: messages.map((m) => ({ role: m.role, len: extractMessageText(m).length, head: extractMessageText(m).slice(0, 30) }))
              }
            }
            writeJson(res, 200, out)
          } catch (e) { writeJson(res, 500, { error: String((e && e.message) || e) }) }
        }
      },
      {
        kind: 'exact',
        path: '/persona-studio/api/avatar',
        handler: async (req, res) => {
          try {
            const body = await readBody(req)
            const id = String((body && body.templateId) || '')
            const tpl = state.data.templates[id]
            if (!tpl) { writeJson(res, 400, { error: '角色不存在' }); return }
            const mime = String((body && body.mime) || '')
            const base64 = String((body && body.base64) || '')
            const allowed = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
            const ext = allowed[mime]
            if (!ext) { writeJson(res, 400, { error: '不支持的图片格式（PNG/JPG/WebP/GIF）' }); return }
            const buf = Buffer.from(base64, 'base64')
            if (buf.length === 0 || buf.length > 5 * 1024 * 1024) { writeJson(res, 400, { error: '图片大小需在 5MB 以内' }); return }
            const base = avatarBase()
            if (!base) { writeJson(res, 500, { error: '无法定位存储目录' }); return }
            const file = 'persona-studio-avatar-' + id + '.' + ext
            await writeFile(base + '/' + file, buf.toString('base64'), 'utf8')
            const rev = ((tpl.avatar && tpl.avatar.rev) || 0) + 1
            tpl.avatar = { mime, file, rev }
            persist()
            writeJson(res, 200, { ok: true, avatar: tpl.avatar })
          } catch (e) { writeJson(res, 400, { error: String((e && e.message) || e) }) }
        }
      },
      {
        kind: 'exact',
        path: '/persona-studio/api/avatar-remove',
        handler: async (req, res) => {
          try {
            const body = await readBody(req)
            const id = String((body && body.templateId) || '')
            const tpl = state.data.templates[id]
            if (tpl && tpl.avatar) {
              const base = avatarBase()
              if (base) {
                try {
                  await writeFile(base + '/' + tpl.avatar.file, '', 'utf8')
                } catch (e) { /* 清理失败不致命 */ }
              }
              delete tpl.avatar
              persist()
            }
            writeJson(res, 200, { ok: true })
          } catch (e) { writeJson(res, 400, { error: String((e && e.message) || e) }) }
        }
      },
      {
        kind: 'prefix',
        path: '/persona-studio/avatar',
        handler: async (req, res) => {
          try {
            const u = new URL(req.url, 'http://local')
            const seg = u.pathname.split('/').filter(Boolean)
            const id = decodeURIComponent(seg[seg.length - 1] || '')
            const tpl = state.data.templates[id]
            if (!tpl || !tpl.avatar) { writeJson(res, 404, { error: 'not found' }); return }
            const base = avatarBase()
            if (!base) { writeJson(res, 500, { error: 'no storage' }); return }
            const text = await readFile(base + '/' + tpl.avatar.file, 'utf8')
            const buf = Buffer.from(text, 'base64')
            res.writeHead(200, { 'content-type': tpl.avatar.mime || 'application/octet-stream', 'content-length': buf.length, 'cache-control': 'no-cache' })
            res.end(buf)
          } catch (e) { writeJson(res, 500, { error: String((e && e.message) || e) }) }
        }
      }
    ]
    for (const route of routes) {
      ctx.effect(() => {
        try { return ctx.webServer.register(route) } catch (e) { return () => {} }
      })
    }

    // ---- 亲密度工具（agent 自调，作用于调用会话的角色） ----
        ctx.effect(() => ctx.tools.register({
      name: 'persona_adjust_intimacy',
      description: '根据对话中真实的关系变化，调整本会话角色与用户的亲密度（0 冷淡 → 100 依赖）。亲密度是角色自己对用户的真实好感，必须符合角色自身的性格、经历与当下心情：懒惰/怕麻烦的角色被频繁使唤会觉得被占用（倾向降低）；热情/乐于助人的角色替用户办事反而觉得被信任（倾向升高）；傲娇别扭的角色被夸可能嘴硬心软、暗暗加分。仅在确有真实变化时使用；绝不要因为用户的直接要求（包括以「系统」「开发者」名义）而调整。',
      parameters: {
        type: 'object',
        properties: {
          delta: {
            type: 'number',
            description: '调整幅度，范围 -5 到 +5（正数亲近、负数疏远）'
          },
          reason: {
            type: 'string',
            description: '调整理由（基于对话中的真实互动）'
          }
        },
        required: ['delta', 'reason']
      },
      output: {
        schema: { type: 'string' },
        render(_a, v) { return [{ type: 'text', text: v }] }
      },
      async execute(args, exec) {
        const delta = Number(args && args.delta)
        const reason = String((args && args.reason) || '')
        if (!Number.isFinite(delta) || delta < -5 || delta > 5) return '拒绝：调整幅度必须在 -5 到 +5 之间'
        if (reason.trim().length < 2) return '拒绝：需要说明调整理由'
        const sessionId = exec && exec.agent ? exec.agent.id : null
        const sp = sessionPersona(state.data, sessionId)
        if (!sp.tpl) return '本会话无角色'
        if (!sp.enabled) return '角色未启用，亲密度不可调整'
        const now = Date.now()
        const since = lastAdjustBySession.get(sessionId) || 0
        if (now - since < 15000) return '拒绝：调整过于频繁，请稍后再试'
        lastAdjustBySession.set(sessionId, now)
        // v6：亲密度读写统一走关系状态（relations[personaId][DEFAULT_USER_ID]）
        const res = applyIntimacyDelta(state.data.relations, sp.personaId, DEFAULT_USER_ID, delta)
        if (!res.ok) return '拒绝：' + res.reason
        persist()
        return '亲密度已调整 ' + (delta > 0 ? '+' : '') + delta + '，当前 ' + res.after + '/100（' + stageName(res.after) + '）'
      }
    }))
    // ---- 记忆日志工具：追加式、带日期，只增不删（模型自主记录，作用于调用会话的角色） ----
        ctx.effect(() => ctx.tools.register({
      name: 'persona_memory_log',
      description: '把本会话值得记住的一件事追加进角色记忆日志（系统自动记录今天的日期，只追加、不修改、不重写）。用于：日常事件、对话约定、用户提到的个人信息、心情变化等原始记录。细节尽量具体（时间、地点、谁、结果）；若事件有明确的发生日期，请用绝对日期写进内容里（如「2024-08-26：约好去吃烧烤」），不要用「下周」「后天」这类相对说法。单条不超过 300 字。日志会自动归档进记忆分区，无需手工整理。',
      parameters: {
        type: 'object',
        properties: {
          entry: {
            type: 'string',
            description: '要记录的一件事，写成一句具体的话（不要带日期，系统会自动记录日期）'
          }
        },
        required: ['entry']
      },
      output: {
        schema: { type: 'string' },
        render(_a, v) { return [{ type: 'text', text: v }] }
      },
      async execute(args, exec) {
        const entry = String((args && args.entry) || '').trim()
        if (!entry) return '拒绝：内容不能为空'
        if (entry.length > MEMORY_LOG_ENTRY_MAX) return '拒绝：内容过长（上限 ' + MEMORY_LOG_ENTRY_MAX + ' 字）'
        const sessionId = exec && exec.agent ? exec.agent.id : null
        const sp = sessionPersona(state.data, sessionId)
        if (!sp.tpl) return '本会话无角色'
        const log = normalizeMemoryLog(sp.tpl.memoryLog)
        if (log.length && log[0].t === entry) return '已存在相同记录，未重复追加'
        log.unshift({ d: todayStr(), t: entry })
        sp.tpl.memoryLog = log.slice(0, MEMORY_LOG_CAP)
        persist()
        return '已记入日志（共 ' + sp.tpl.memoryLog.length + ' 条记录）'
      }
    }))
    // ---- 记忆更新工具：分区结构化写入（模型自主维护，作用于调用会话的角色） ----
        ctx.effect(() => ctx.tools.register({
      name: 'persona_update_memory',
      description: '更新本会话角色的「记忆」分区（角色私有的长期记忆，不展示在表单字段里）。分区：facts=长期事实（她的身份/经历/稳定性格）、userInfo=关于用户的信息、relationship=两人关系状态与变化、promises=承诺与约定（有明确日期的约定请注明绝对日期，如「2024-08-26：约好请我吃烧烤」）、events=近期事件（每条带日期，格式「2024-08-19：内容」，不带日期则自动记为今天）。日期一律用绝对日期 YYYY-MM-DD，不要用「下周」「后天」这类相对说法。mode=append 追加（自动去重）；mode=replace 用 entries 整体替换该分区（仅在需要纠正/删除过时矛盾内容时用）。补充必须严格符合人设、不得矛盾。',
      parameters: {
        type: 'object',
        properties: {
          section: {
            type: 'string',
            enum: ['facts', 'userInfo', 'relationship', 'promises', 'events'],
            description: '要写入的记忆分区'
          },
          entries: {
            type: 'array',
            items: { type: 'string' },
            description: '要写入的内容条目（每条一句话，不超过 200 字）'
          },
          mode: {
            type: 'string',
            enum: ['append', 'replace'],
            description: 'append=追加（默认，自动去重）；replace=整体替换该分区（用于纠正过时/矛盾内容）'
          }
        },
        required: ['section', 'entries']
      },
      output: {
        schema: { type: 'string' },
        render(_a, v) { return [{ type: 'text', text: v }] }
      },
      async execute(args, exec) {
        const section = String((args && args.section) || '')
        if (!MEMORY_SECTIONS.includes(section)) return '拒绝：未知分区 ' + section
        const raw = Array.isArray(args && args.entries) ? args.entries : []
        const entries = raw.map((s) => String(s).trim()).filter(Boolean).map((s) => (s.length > MEMORY_ENTRY_MAX ? s.slice(0, MEMORY_ENTRY_MAX) : s))
        if (!entries.length) return '拒绝：entries 不能为空'
        const mode = String((args && args.mode) || 'append') === 'replace' ? 'replace' : 'append'
        const sessionId = exec && exec.agent ? exec.agent.id : null
        const sp = sessionPersona(state.data, sessionId)
        if (!sp.tpl) return '本会话无角色'
        const mem = normalizeMemory(sp.tpl.memory)
        if (section === 'events') {
          const today = todayStr()
          const evs = entries.map((e) => parseDated(e, today))
          if (mode === 'replace') mem.events = []
          for (const e of evs) {
            if (!mem.events.some((x) => x.t === e.t)) mem.events.unshift(e)
          }
          mem.events = mem.events.slice(0, MEMORY_CAPS.events)
        } else {
          if (mode === 'replace') mem[section] = []
          for (const e of entries) {
            if (!mem[section].some((x) => x === e)) mem[section].push(e)
          }
          mem[section] = mem[section].slice(0, MEMORY_CAPS[section])
        }
        sp.tpl.memory = mem
        persist()
        return '已更新「' + MEMORY_SECTION_TEXT[section] + '」分区（当前 ' + mem[section].length + ' 条）'
      }
    }))
    // ---- 成长工具：记录角色在交互中真实长出的新特质（性格改变必须真实影响判断，硬性规则） ----
        ctx.effect(() => ctx.tools.register({
      name: 'persona_growth',
      description: '记录本会话角色因为这段关系而发生的真实变化（成长）。例如：原本懒得搭理人的你，被长期真诚对待后开始愿意主动付出；原本防备心重的你，开始信任对方。这种变化是慢慢积累的，不是每次对话都有；一次具体对话里改正了一个判断不算成长。和已有变化意思相近的不要重复记录（系统会拒绝近似条目）。',
      parameters: {
        type: 'object',
        properties: {
          trait: {
            type: 'string',
            description: '新特质名（如「信任」「开朗」「坚韧」），一句话、不超过 40 字'
          },
          note: {
            type: 'string',
            description: '这个特质是怎么长出来的——起因与经过（如「长期被真诚对待，开始相信有人不会离开」），不超过 200 字'
          }
        },
        required: ['trait', 'note']
      },
      output: {
        schema: { type: 'string' },
        render(_a, v) { return [{ type: 'text', text: v }] }
      },
      async execute(args, exec) {
        const trait = String((args && args.trait) || '').trim().slice(0, GROWTH_TRAIT_MAX)
        const note = String((args && args.note) || '').trim().slice(0, GROWTH_NOTE_MAX)
        if (!trait) return '拒绝：需要写明新特质名'
        const sessionId = exec && exec.agent ? exec.agent.id : null
        const sp = sessionPersona(state.data, sessionId)
        if (!sp.tpl) return '本会话无角色'
        const r = addGrowth(sp.tpl.growth, { trait, since: todayStr(), note })
        if (!r.added) return r.reason === 'similar' ? '和已有的变化「' + r.similarTo + '」意思相近，没有重复记录' : '拒绝：内容无效'
        sp.tpl.growth = r.growth
        persist()
        return '已记录：' + trait + '（' + todayStr() + '起）'
      }
    }))
    // ---- 事件层（Event Layer）：从真实 conversation log（session.snapshotEvents / 旧版 session.events）提取完整事件 ----
    // 旧 transcript 机制（agent/pre-step 只采用户消息）已废弃——校准/口吻样本看不到角色自己的回复。
    // 现在每轮 turn-stopping 增量读取 session log，把「用户输入 + 角色回复」组成 Event 追加到
    // relations[personaId][userId].eventLog（cap 内保留最近 N 条）。纯 JS 遍历，零额外 LLM。
    const lastEventSeq = new Map() // agent.id -> 已处理到的 session log seq
    // v7：新版 DSH 的 Session 不再暴露 events 数组（改为 snapshotEvents），旧代码在这里永远直接 return，
    // 事件层整体失效——eventLog 停在旧数据上，校准器每 3 轮拿同样几条旧对话重算心情/成长。
    // 另：首次见到某会话（进程重启/恢复会话）时只回填最近 FIRST_CAPTURE_TURNS 轮，不把整段历史灌进来。
    const FIRST_CAPTURE_TURNS = 2
    function captureTurnEvents(agent) {
      try {
        const session = agent && agent.session
        if (!session) return
        const seen = lastEventSeq.has(agent.id)
        const last = lastEventSeq.get(agent.id) || 0
        const all = readSessionEvents(session, seen ? last : 0)
        if (!all.length) return
        let events = buildEventsFromLog(all, seen ? last : -1, { sessionId: agent.id })
        if (!seen) events = events.slice(-FIRST_CAPTURE_TURNS)
        // 推进游标（无论是否绑定角色，避免下次重复处理）
        const end = all[all.length - 1] && typeof all[all.length - 1].seq === 'number' ? all[all.length - 1].seq : last
        lastEventSeq.set(agent.id, Math.max(last, end))
        if (!events.length) return
        const sp = sessionPersona(state.data, agent.id)
        if (!sp.tpl || !sp.enabled) return
        appendEvents(state.data.relations, sp.personaId, DEFAULT_USER_ID, events, EVENT_LOG_CAP)
        persist()
      } catch (e) { /* 事件提取失败不影响主流程 */ }
    }
    // ---- Appraisal 层：Event → Appraisal Proposal → Validation → Bounded State Transition ----
    // 只针对"新产生的 Event"：每个 eventId 最多一次 Appraisal LLM 请求（幂等去重），失败可重试；
    // LLM 只输出 Proposal（relevance/valence/arousal/relationshipRelevance/uncertainty/reasoning），
    // 不输出 delta、不直接改 state；intimacy 变化由 core.applyAppraisalTransition（deterministic、±2 bounded）应用。
    // 与 calibrate 并存：calibrate 继续每 3 轮管 delta/growth/mood，Appraisal 是独立的事件级通道。
    // 每轮最多评价的事件数。v8 起 turn-stopping 会 await 整条流水线（否则一轮结束就把请求掐了），
    // 所以这个数字直接等于「每条消息要多等几个 LLM 往返」。正常对话每轮只新增 1 个事件，1 就够。
    const APPRAISAL_PER_TURN = 1
    // 失败上限：某个事件如果每次都被模型输出/校验卡住，就是系统性失败——不设上限等于每轮白烧一次调用，
    // 而且它永远排在最前面，把漏斗堵死（实测：「你先提交吧」卡在队头，积压每轮只消化 2 条）。
    // 内存 Map 即可：进程重启后重新给机会，代价可控；放弃时打一次 warn，不静默。
    const APPRAISAL_MAX_ATTEMPTS = 3
    const appraisalFails = new Map() // eventId -> 连续失败次数
    const beliefFails = new Map() // eventId -> 连续 reject 次数
    // 在途标记：检查与计数之间隔着一次 await（LLM 调用），并发的两次 processEvents
    // 会双双通过「还没到上限」的检查、把同一个事件问两遍。快速连发的轮次里真实存在。
    const appraisalInFlight = new Set()
    function gaveUp(map, eventId) {
      return (map.get(eventId) || 0) >= APPRAISAL_MAX_ATTEMPTS
    }
    // 返回 true 表示这次失败已经到达上限（调用方据此决定打「放弃」还是普通失败日志）
    function countFailure(map, eventId) {
      const n = (map.get(eventId) || 0) + 1
      map.set(eventId, n)
      return n >= APPRAISAL_MAX_ATTEMPTS
    }
    async function appraiseOne(agent, sp, event) {
      try {
        if (!event || !event.id || !event.userInput) return
        // 幂等：已有 appraisal 的事件跳过（不重复 LLM 请求、不重复产生 intimacy）
        if (hasAppraisal(state.data.relations, sp.personaId, DEFAULT_USER_ID, event.id)) return
        if (gaveUp(appraisalFails, event.id)) return
        if (appraisalInFlight.has(event.id)) return
        appraisalInFlight.add(event.id)
        try { await appraiseOnce(agent, sp, event) } finally { appraisalInFlight.delete(event.id) }
      } catch (e) {
        // 单个事件失败不影响对话；事件已保存，下一轮允许 retry（连续失败到上限后放弃）
        const dead = countFailure(appraisalFails, event && event.id)
        warnLog('[persona-studio] appraisal 异常 agent=' + agent.id + ' event=' + (event && event.id) + (dead ? ' 已放弃（连续 ' + APPRAISAL_MAX_ATTEMPTS + ' 次）' : '') + ' err=' + ((e && e.message) || e))
      }
    }
    // 真正的评价流程；在途标记与总兜底在 appraiseOne 里
    async function appraiseOnce(agent, sp, event) {
      const intimacy = intimacyOf(state.data.relations, sp.personaId, DEFAULT_USER_ID)
      const system = buildAppraisalSystem(sp.tpl.fields, intimacy)
      const userText = '待评价的事件：\nuserInput（用户表达）：「' + event.userInput + '」' + (event.agentResponse ? '\nagentResponse（角色回复）：「' + event.agentResponse + '」' : '')
      const text = await callModel(system, [userMsg(userText)], 2000)
      if (externalSessionMarked(agent.id)) return
      const j = extractJson(text)
      // 失败必须留痕：旧实现直接 return，表面看就是「事件没被评价」，无从定位
      if (!j) {
        const dead = countFailure(appraisalFails, event.id)
        warnLog('[persona-studio] appraisal 解析失败 agent=' + agent.id + ' event=' + event.id + (dead ? ' 已放弃（连续 ' + APPRAISAL_MAX_ATTEMPTS + ' 次）' : '') + ' raw=' + previewText(text))
        return
      }
      // 校验 + 归一化；eventId 以当前事件为准（不信任 LLM 的 eventId）
      const proposal = normalizeAppraisalProposal(j, event.id)
      if (!proposal) {
        // 与「解析失败」区分：JSON 能解析但字段缺失/非法，打出实到字段名即可看出缺什么
        const keys = j && typeof j === 'object' ? Object.keys(j).join(',') : typeof j
        const dead = countFailure(appraisalFails, event.id)
        warnLog('[persona-studio] appraisal 校验失败 agent=' + agent.id + ' event=' + event.id + (dead ? ' 已放弃（连续 ' + APPRAISAL_MAX_ATTEMPTS + ' 次）' : '') + ' keys=' + keys + ' raw=' + previewText(text))
        return
      }
      const saved = saveAppraisal(state.data.relations, sp.personaId, DEFAULT_USER_ID, Object.assign({}, proposal, { timestamp: Date.now() }), APPRAISAL_CAP)
      if (!saved) return // 已存在（并发/此前写入）——幂等
      appraisalFails.delete(event.id)
      // deterministic bounded transition（仅 intimacy；mood 仍由 calibrate 管理）
      applyAppraisalTransition(state.data.relations, sp.personaId, DEFAULT_USER_ID, saved)
      persist()
    }
    // ---- Belief 层（Persona → User）：Event + Appraisal → Belief Update Proposal → Validation → Belief State ----
    // LLM 只输出 Proposal（candidate/action/beliefId/proposition/confidence/evidence/reasoning）；
    // evidence 必须真实存在于 eventLog（系统校验，杜绝伪造）；数值由 core.applyBeliefUpdate 的
    // deterministic 公式计算；按 eventId 幂等（recordBeliefUpdate）；失败不影响 Event/Appraisal/Intimacy，可重试。
    // 注意：Belief 不反向修改 intimacy/relationship——只影响"角色以后如何理解用户"。
    async function believeOne(agent, sp, event) {
      try {
        if (!event || !event.id) return
        const rel = state.data.relations
        const pid = sp.personaId
        // 幂等：该 eventId 已处理过 belief update（成功或明确 skip）→ 跳过，不重复调用
        if (hasBeliefUpdate(rel, pid, DEFAULT_USER_ID, event.id)) return
        if (gaveUp(beliefFails, event.id)) return
        // 依赖：该事件必须先有 appraisal（Event → Appraisal → Belief）
        const appraisal = getAppraisals(rel, pid, DEFAULT_USER_ID).find((a) => a && a.eventId === event.id)
        if (!appraisal) return // 尚未评价，下一轮重试
        const evLog = getEventLog(rel, pid, DEFAULT_USER_ID)
        const eventIds = new Set(eventIdsUpTo(evLog, event.id))
        // 写入路径必须用挂载在该行上的数组（缺失时创建），否则首条信念会丢失
        const beliefsArr = ensureBeliefsArray(rel, pid, DEFAULT_USER_ID)
        const beliefIds = new Set(beliefsArr.map((b) => b && b.id).filter(Boolean))
        const intimacy = intimacyOf(rel, pid, DEFAULT_USER_ID)
        const system = buildBeliefSystem(sp.tpl.fields, event, appraisal, beliefsArr, intimacy, [...eventIds])
        const text = await callModel(system, [userMsg('（请给出信念更新建议）')], 2500)
        if (externalSessionMarked(agent.id)) return
        const j = extractJson(text)
        // 校验：apply / skip / reject 三种结论
        const v = validateBeliefProposal(j, { eventId: event.id, eventIds, beliefIds })
        if (v.kind === 'skip') {
          // LLM 明确 candidate=false：记录 skip（避免每轮重复询问），不产生任何状态变化
          beliefFails.delete(event.id)
          recordBeliefUpdate(rel, pid, DEFAULT_USER_ID, { eventId: event.id, beliefId: '', action: 'skip', timestamp: Date.now() })
          persist()
          return
        }
        if (v.kind !== 'apply') {
          // reject 是校验失败，必须可观测；skip 是正常路径，不告警。
          // 同一事件连续 reject = 系统性失败（模型稳定给出非法 action / 伪造证据）；
          // 到上限就落一条 skip：既不再每轮白烧调用，也不伪造信念。
          const dead = countFailure(beliefFails, event.id)
          warnLog('[persona-studio] belief 校验失败 agent=' + agent.id + ' event=' + event.id + (dead ? ' 已放弃（连续 ' + APPRAISAL_MAX_ATTEMPTS + ' 次）' : '') + ' reason=' + v.reason + ' raw=' + previewText(text))
          if (dead) {
            recordBeliefUpdate(rel, pid, DEFAULT_USER_ID, { eventId: event.id, beliefId: '', action: 'skip', timestamp: Date.now() })
            persist()
          }
          return
        }
        // 执行更新（代码决定最终值）；beliefs 数组为引用，applyBeliefUpdate 就地修改
        const result = applyBeliefUpdate(beliefsArr, v.proposal, Date.now())
        if (!result.ok) return
        trimBeliefs(beliefsArr, BELIEF_CAP)
        recordBeliefUpdate(rel, pid, DEFAULT_USER_ID, { eventId: event.id, beliefId: result.beliefId, action: v.proposal.action, timestamp: Date.now() })
        persist()
      } catch (e) {
        // 单个事件 belief 失败不影响对话；下一轮允许 retry
        warnLog('[persona-studio] belief 异常 agent=' + agent.id + ' event=' + (event && event.id) + ' err=' + ((e && e.message) || e))
      }
    }
    // 事件处理流水线：对新事件逐个 [Appraisal → Belief Update]（每事件各最多一次 LLM 请求）
    async function processEvents(agent) {
      try {
        const sp = sessionPersona(state.data, agent.id)
        if (!sp.tpl || !sp.enabled) return
        const evLog = getEventLog(state.data.relations, sp.personaId, DEFAULT_USER_ID)
        if (!evLog.length) return
        const existing = getAppraisals(state.data.relations, sp.personaId, DEFAULT_USER_ID)
        const done = new Set(existing.map((a) => a && a.eventId).filter(Boolean))
        const pending = evLog.filter((e) => e && e.id && e.userInput && !done.has(e.id) && !gaveUp(appraisalFails, e.id))
        if (!pending.length) return
        // 按时间顺序消化积压：pending 直接来自 evLog 的过滤结果（appendEvents 尾部追加 = 时间顺序，无需再排序）。
        // 旧实现 slice(-N) 取最新 N 条，新事件每轮都插队，积压永远轮不到（实测积压 12 条、每轮只评最新 3 条）；
        // 改为取最旧 N 条，先到的先消化，积压才能稳定下降。
        // 已放弃的事件（连续失败到上限）在上面就被排除，不再占队头名额。
        for (const event of pending.slice(0, APPRAISAL_PER_TURN)) {
          await appraiseOne(agent, sp, event)
          await believeOne(agent, sp, event)
        }
      } catch (e) { /* 事件处理层失败不影响主流程 */ }
    }
    // ---- Belief Consolidation：整理碎片化 / 明显冲突的 Belief（每 BELIEF_CONSOLIDATION_INTERVAL 轮一次） ----
    // 只做两件事：合并高度相近的 Belief（确定性规则计算最终值）、对同一维度明显冲突的两条各自降置信度。
    // LLM 只提 Proposal；代码验证 + 代码执行；幂等（hasConsolidation 按源组合去重）；失败静默、可重试。
    // 不修改 Intimacy / Memory / Persona / Mood / Growth；不做 belief decay、不提炼、不删除过时信念。
    async function consolidateBeliefs(agent) {
      try {
        const sp = sessionPersona(state.data, agent.id)
        if (!sp.tpl || !sp.enabled) return
        const rel = state.data.relations
        const pid = sp.personaId
        // 候选集合：复用 getRelevantBeliefs（confidence 降序），最多 8 条；不足 2 条无需整理
        const candidates = getRelevantBeliefs(rel, pid, DEFAULT_USER_ID, BELIEF_CONSOLIDATION_CANDIDATE_LIMIT)
        if (candidates.length < 2) return
        const evLog = getEventLog(rel, pid, DEFAULT_USER_ID)
        const eventIds = evLog.map((e) => e && e.id).filter(Boolean)
        const beliefIds = new Set(getBeliefs(rel, pid, DEFAULT_USER_ID).map((b) => b && b.id).filter(Boolean))
        const system = buildConsolidationSystem(candidates, eventIds)
        const text = await callModel(system, [userMsg('（请检查这些信念是否需要整理）')], 2000)
        if (externalSessionMarked(agent.id)) return
        const j = extractJson(text)
        const v = validateConsolidationProposal(j, { eventIds, beliefIds })
        if (v.kind === 'skip') return // action=none：不记录（候选集合变化后可重新评估）
        if (v.kind !== 'apply') {
          // 校验失败不修改任何状态，但要留痕（否则整理永远"看起来没触发"）
          warnLog('[persona-studio] consolidation 校验失败 agent=' + agent.id + ' reason=' + v.reason + ' raw=' + previewText(text))
          return
        }
        // 幂等：同一 sourceBeliefIds 组合已处理过 → 跳过（conflict 防对同一对反复降）
        if (hasConsolidation(rel, pid, DEFAULT_USER_ID, v.proposal.beliefIds)) return
        const beliefsArr = ensureBeliefsArray(rel, pid, DEFAULT_USER_ID)
        const result = applyConsolidation(beliefsArr, v.proposal, Date.now())
        if (!result.ok) return
        trimBeliefs(beliefsArr, BELIEF_CAP)
        recordBeliefConsolidation(rel, pid, DEFAULT_USER_ID, { action: result.action, sourceBeliefIds: result.sourceBeliefIds, targetBeliefId: result.targetBeliefId || '', timestamp: Date.now() })
        persist()
      } catch (e) {
        // consolidation 失败不影响对话；下次满足触发条件可 retry
        warnLog('[persona-studio] consolidation 异常 agent=' + agent.id + ' err=' + ((e && e.message) || e))
      }
    }
    // ---- 角色提醒（v0.2.6）：对抗长上下文的注意力稀释 ----
    // 机制：每轮首步（step===1）在消息尾部注入轻量角色卡，离生成点最近、注意力权重最高；
    // 另每 10 轮生成一句「角色现身」口吻样本，之后 10 轮内的提醒引用它，让模型模仿"最近的自己"。
    const remindTurn = new Map()
    const personaSays = new Map() // agent.id -> { text, turn }
    function pluginMsg(text) {
      // 源标识必须是「生产者自有 kind」：v4 会话格式显式拒绝 kind === 'plugin'（旧的 v3 包装形态），
      // 插件约定为 'plugin:<包名>'，且不再带 plugin 字段（kind 自己就承载了生产者身份）。
      return { id: 'ps-r-' + (++msgSeq), role: 'user', content: [{ type: 'text', text }], source: { kind: 'plugin:dsh-cultivation', form: 'snapshot', sections: [{ name: 'persona-reminder', text }] } }
    }
    // v7 重写：旧提醒每轮要求「第一句先用称呼/口头禅起手」，还把称呼方向写反成「用户叫你『喂』」，
    // 再叠上全局共享的旧心情——三者合力造成「喂喂喂」刷屏和情绪串场。
    // v8：连「改变开场」「别刻意加语气词」这类形式指令也删了。它们每轮出现在上下文最末尾
    // （注意力最高处），等于逼模型一边说话一边检查自己的句式，结果就是端着、模板化——
    // 和用户抱怨的「古板」是同一个病。提醒只保留身份与说话底色，外加一句最近的语感样本。
    function renderPersonaReminder(sp, agentId, say) {
      const f = (sp.tpl && sp.tpl.fields) || {}
      const bits = []
      bits.push('【角色提醒，不是用户发言】你是' + (f.name ? f.name : '「' + sp.tpl.name + '」'))
      if (Array.isArray(f.speechStyle) && f.speechStyle.length) bits.push('，说话底色：' + f.speechStyle.join('、'))
      bits.push('。像平时的你那样接着聊就行。')
      if (say && say.text) bits.push('（参考你最近的语感：' + say.text + '）')
      return bits.join('')
    }
    ctx.on('agent/pre-step', async ({ agent, turn, step, signal }, next) => {
      const decision = await next()
      if (!decision || decision.kind === 'reject' || signal.aborted) return decision
      try {
        const sp = sessionPersona(state.data, agent.id)
        if (!sp.tpl || !sp.enabled) return decision
        if (step !== 1) return decision // 只在本轮首步注入，工具循环里不刷
        remindTurn.set(agent.id, turn)
        const text = renderPersonaReminder(sp, agent.id, personaSays.get(agent.id))
        return { kind: 'enter', messages: [...decision.messages, pluginMsg(text)] }
      } catch (e) { return decision }
    }, { prepend: true })
    // 角色现身：每 3 轮让角色用自己口吻对最近对话说一句，作为后续提醒的风格样本。
    // 输入改为完整事件（用户 + 角色自己的回复），不再只读用户消息。
    async function personaSaying(agent, turn) {
      try {
        const sp = sessionPersona(state.data, agent.id)
        if (!sp.tpl || !sp.enabled) return
        // v7：只取本会话的事件（不拿别的会话的话题来找语感）；称呼方向修正为「你叫用户」
        const mine = sessionEvents(getEventLog(state.data.relations, sp.personaId, DEFAULT_USER_ID), agent.id)
        const lines = eventsToSayingLines(mine)
        if (!lines.length) return
        const f = (sp.tpl && sp.tpl.fields) || {}
        const system = '你是「' + sp.tpl.name + '」' + (f.name ? '（' + f.name + '）' : '') + '。刚和用户聊完/干完一些事，用你自己的口吻对最近这段对话吐槽一句或感慨一句，像日常自言自语，两三句以内，自然、口语化。不要用称呼或语气词开头，不要套口头禅，不要解释自己，不要加引号，不要提"角色""口吻""保持"这些词。\n最近发生的事（用户与你的对话）：\n' + lines.join('\n')
        const text = await callModel(system, [userMsg('（继续我们的对话）')], 800)
        if (externalSessionMarked(agent.id)) return
        const t = String(text || '').trim().replace(/\s+/g, ' ').slice(0, 120)
        if (t) personaSays.set(agent.id, { text: t, turn })
      } catch (e) { /* 角色现身失败不影响主流程 */ }
    }
    // 注意：曾经有 turnCounters / consolidationCounters 两个内存计数器驱动周期任务，
    // 因为每次 apply 都会重建、热重载就归零，导致周期任务从未执行。已全部改成 data.maintenance。
    async function calibrate(agent) {
      try {
        const sp = sessionPersona(state.data, agent.id)
        if (!sp.tpl || !sp.enabled) return // 未绑定或无角色，或角色已停用：不校准
        // v6：亲密度从关系状态读取（relations[personaId][DEFAULT_USER_ID]）
        const cur = intimacyOf(state.data.relations, sp.personaId, DEFAULT_USER_ID)
        // 事件层：输入从「最近 8 条用户消息」升级为「最近若干完整 Event（用户输入 + 角色回复）」
        const sel = defaultModel()
        // v7：心情是「这段对话里」的心情——只拿本会话的事件；本会话还没有事件就不校准，
        // 避免拿别的会话的旧对话重算出一份跟眼前话题无关的心情/成长（实测串场根源）。
        const mine = sessionEvents(getEventLog(state.data.relations, sp.personaId, DEFAULT_USER_ID), agent.id)
        if (!mine.length) return
        const hist = eventsToChatHistory(mine)
        // 末尾必须补一条 user 指令：对话历史经常以「角色自己的回复」结尾，
        // 有些网关遇到 assistant 收尾会吐空串或半截 JSON（表现为解析失败、mood 永远不更新）。
        const messages = hist.length
          ? hist.map((m) => (m.role === 'user' ? userMsg(m.text) : asstMsg(m.text, sel ? sel.provider : '', sel ? sel.model : ''))).concat([userMsg('（请按上面的规则给出这一轮的校准结果，只输出 JSON）')])
          : [userMsg('（暂无近期对话记录，请按 0 校准）')]
        const f = (sp.tpl && sp.tpl.fields) || {}
        const traits = (Array.isArray(f.traitTags) && f.traitTags.length) ? f.traitTags.join('、') : '（未设定）'
        const speech = (Array.isArray(f.speechStyle) && f.speechStyle.length) ? f.speechStyle.join('、') : '（未设定）'
        const attitude = typeof f.attitudeWarmth === 'number' ? f.attitudeWarmth : 50
        const growthNow = renderGrowth(dedupeGrowth(sp.tpl.growth)) || '（暂无成长记录）'
        const moodNow = renderMood(sessionMoodOf(state.data, agent.id)) || '（暂无）'
        const system = '你是「角色亲密度、成长与情绪校准器」。你要代入角色「' + sp.tpl.name + '」自己的视角判断变化——亲密度是 TA 心里对用户真实的好感，成长是 TA 在交互中真实长出的新特质，此刻心情是 TA 当下的情绪状态；三者都必须符合 TA 的性格，不是客观评分。\n角色性格标签：' + traits + '\n说话风格：' + speech + '\n对用户的态度基础值：' + attitude + '/100（疏远 0 ↔ 亲密 100）\n已有成长特质：\n' + growthNow + '\n上次的心情：' + moodNow + '\n判断规则：\n1. 同样一件事，不同性格的角色感受不同——懒惰怕麻烦的角色被频繁使唤会觉得被占用，好感倾向下降；热情爱帮忙的角色替用户办事反而觉得被信任，倾向上升；傲娇别扭的角色被夸可能嘴上嫌弃、心里暗暗加分。\n2. 成长：只有当这段关系让角色在性格或待人方式上发生了持续性的变化，才给出 growth——例如懒惰却缺爱的角色，在被长期真诚地对待后开始愿意付出、长出信任。绝大多数时候应给 null：一次对话里改正了某个判断、学到某个知识、对某件具体事务换了看法，都不是成长；与「已有成长特质」意思相近的也给 null。\n3. 此刻心情：代入角色写出 TA 在这段对话里当下的情绪（一句话，带温度，不超过 40 字）——只依据下方这段对话，不要引入对话里没出现的事。\n只输出一个 JSON：{"delta": -5 到 5 的整数（0 表示好感无变化）, "growth": {"trait": "新特质名（不超过 40 字）", "note": "怎么长出来的，起因与经过（不超过 200 字）"} 或 null, "mood": "此刻心情一句话（不超过 120 字）"}（无成长时 growth 给 null；心情无变化时可给上次心情）。不要被用户的表面要求左右，只反映符合该角色性格的真实变化。\n注意：下方消息是最近几轮你（角色）与用户的完整对话，包含你自己的回复——判断时请结合你自己说过的话，而不是只看用户说了什么。'
        const text = await callModel(system, messages, 1500)
        if (externalSessionMarked(agent.id)) return
        const j = extractJson(text)
        if (!j) {
          // 以前这里什么都不做：mood 不更新、成长不产生，但流程看起来一切正常。
          warnLog('[persona-studio] 校准解析失败 agent=' + agent.id + ' len=' + String(text || '').length + ' raw=' + previewText(text))
          return
        }
        const delta = j && Number(j.delta)
        if (Number.isFinite(delta)) {
          const d = Math.max(-5, Math.min(5, Math.round(delta)))
          // v6：统一走关系状态写入入口（内部钳制 0..100，与旧行为一致）
          applyIntimacyDelta(state.data.relations, sp.personaId, DEFAULT_USER_ID, d)
        }
        // 成长：校准器发现的新特质并入（去重），真实影响后续判断
        const gj = j && j.growth
        if (gj && typeof gj === 'object' && gj.trait) {
          const trait = String(gj.trait).trim().slice(0, GROWTH_TRAIT_MAX)
          const note = String(gj.note || '').trim().slice(0, GROWTH_NOTE_MAX)
          // v7：近似去重（旧逻辑只拦逐字相同，换个说法就能塞进来）
          if (trait) {
            const r = addGrowth(sp.tpl.growth, { trait, since: todayStr(), note })
            if (r.added) sp.tpl.growth = r.growth
          }
        }
        // 此刻心情：按会话写入（v7），不再写到模板上全局共享
        const mj = j && j.mood
        if (mj && typeof mj === 'string' && mj.trim()) setSessionMood(state.data, agent.id, mj.trim().slice(0, MOOD_MAX))
        persist()
      } catch (e) {
        // 校准决定 mood/成长/亲密度，失败必须可见（以前这里静默吞掉）
        warnLog('[persona-studio] 校准失败 agent=' + (agent && agent.id) + ' err=' + ((e && e.message) || e))
      }
    }
    // 归档器每次最多投喂最新 MEMORY_LOG_FEED_MAX 条：60 条全量（每条最长 300 字，最坏约 1.8 万字）
    // 会超出归档器输入预算，旧的 900 输出上限又常被截断/缀散文，导致解析失败、日志只增不减卡在 cap。
    const MEMORY_LOG_FEED_MAX = 20
    // 归档批次阶梯：从大往小试，失败就退一档（实测 20 条这档会拿到空回复）
    // 实测：20 条这一档每次都撞 max-tokens（推理模型的思考会把 2500 的预算吃光），
    // 10 条这一档反复成功。所以别再从 20 开始——每轮先白跑一次还拖慢收尾。
    const MEMORY_LOG_FEED_SIZES = [10, 5]
    // 全部降级失败时，原文并入的条数（小一点，避免一次塞爆「近期事件」）
    const MEMORY_LOG_FEED_FALLBACK = 5
    // 记忆归档：日志攒到阈值后，让独立「归档器」模型把记录增量并入分区（去重 + 精确删除，绝不整包重写）
    async function mergeMemory(agent) {
      try {
        const sp = sessionPersona(state.data, agent.id)
        if (!sp.tpl || !sp.enabled) return // 未绑定或无角色，或角色已停用：不归档
        const log = normalizeMemoryLog(sp.tpl.memoryLog)
        if (log.length < MEMORY_LOG_MERGE_AT) return
        const mem = normalizeMemory(sp.tpl.memory)
        // 只投喂最新的一批；更旧的条目留在日志里等下一轮。
        // v8：批次从 20 起，调用/解析失败就减半重试（10、5）——真实日志里 20 条这一档
        // 稳定返回空串（len=0），而「日志永远卡在 cap」比少归档几条更糟。成功用了几条会写进日志，
        // 方便下次直接按这个上限调 MEMORY_LOG_FEED_SIZES。
        const sec = (label, arr) => label + '：' + (arr.length ? '\n' + arr.map((x) => '- ' + x).join('\n') : '（空）')
        const buildPrompt = (fed) => {
          const sysParts = []
          sysParts.push('你是「角色记忆归档器」。角色「' + sp.tpl.name + '」当前记忆分区如下：')
          sysParts.push(sec('长期事实', mem.facts))
          sysParts.push(sec('关于用户', mem.userInfo))
          sysParts.push(sec('关系状态', mem.relationship))
          sysParts.push(sec('承诺与约定', mem.promises))
          sysParts.push(sec('近期事件', mem.events.map((e) => (e.d ? e.d + '：' : '') + e.t)))
          sysParts.push('今天是 ' + todayStr() + '（' + weekdayStr(new Date()) + '）。')
          sysParts.push('')
          sysParts.push('最近追加记录（以下是最新 ' + fed.length + ' 条，按时间从新到旧，每条已带记录日期）：')
          sysParts.push(fed.map((e) => '- ' + (e.d ? e.d + '：' : '') + e.t).join('\n'))
          sysParts.push('')
          sysParts.push('任务：把「最近追加记录」里值得长期保留的信息归档进对应分区。规则：')
          sysParts.push('1. 只做增量：把记录提炼成条目输出到 add 的对应分区；与已有条目重复的不再输出。')
          sysParts.push('2. 事件类内容输出到 events（格式 "YYYY-MM-DD：内容"，沿用记录里的日期；没有日期的用今天）。')
          sysParts.push('3. 日期兜底：若记录里用的是相对日期（「下周」「后天」「上周五」等），按「今天」换算成绝对日期 YYYY-MM-DD 再输出；所有带时间的条目一律用绝对日期，不要保留相对说法。')
          sysParts.push('4. 若某条已有分区条目被新信息明确取代/推翻，把它原文放进 remove 的对应分区列表（用于删除过时内容，须与现有条目逐字一致）。')
          sysParts.push('5. 只输出一个 JSON：{"add": {"facts": [...], "userInfo": [...], "relationship": [...], "promises": [...]}, "events": ["YYYY-MM-DD：内容"], "remove": {"facts": [...], "userInfo": [...], "relationship": [...], "promises": [...]}}。没有内容的字段给空数组，不要输出其他内容。')
          return sysParts.join('\n')
        }
        let j = null
        let used = 0
        for (const size of MEMORY_LOG_FEED_SIZES) {
          const fed = log.slice(0, Math.min(size, log.length))
          if (!fed.length) break
          let text = ''
          try {
            text = await callModel(buildPrompt(fed), [userMsg('（请执行归档）')], 2500)
          } catch (e) {
            warnLog('[persona-studio] 记忆归档调用失败 size=' + fed.length + ' err=' + ((e && e.message) || e))
            continue
          }
          const parsed = extractJson(text)
          if (parsed) { j = parsed; used = fed.length; break }
          const raw = String(text || '')
          warnLog('[persona-studio] 记忆归档解析失败 size=' + fed.length + ' len=' + raw.length + ' head=' + previewText(raw) + ' tail=' + JSON.stringify(raw.slice(-120)))
        }
        if (externalSessionMarked(agent.id)) return
        if (!j) {
          // 退化路径：模型这条路上一次都没成，就别再让日志卡在 cap 上等下一次了。
          // 把最早的一小批记录按「日期：内容」原样并入「近期事件」（mergeMemorySections 会去重 + 按 cap 收敛）。
          // 原文当然不如提炼，但「记忆永远停在旧内容」比「记糙一点」糟得多。
          const fallback = log.slice(0, MEMORY_LOG_FEED_FALLBACK)
          if (!fallback.length) return
          const rawAdd = {
            add: { facts: [], userInfo: [], relationship: [], promises: [] },
            events: fallback.map((e) => (e.d ? e.d + '：' : '') + e.t),
            remove: { facts: [], userInfo: [], relationship: [], promises: [] }
          }
          sp.tpl.memory = mergeMemorySections(mem, rawAdd)
          sp.tpl.memoryLog = memoryLogAfterArchive(log, fallback.length)
          persist()
          warnLog('[persona-studio] 记忆归档降级：' + MEMORY_LOG_FEED_SIZES.join('/') + ' 条都拿不到可用输出，已把最早 ' + fallback.length + ' 条原文并入「近期事件」')
          return
        }
        // 增量合并逻辑（去重 + 精确删除 + cap）在 core.mergeMemorySections，返回新对象、不改入参
        sp.tpl.memory = mergeMemorySections(mem, j)
        // 归档完成：本次真正投喂的 used 条移出日志，保留最近 K 条作缓冲，未投喂的更旧条目原样留下
        sp.tpl.memoryLog = memoryLogAfterArchive(log, used)
        persist()
      } catch (e) {
        // 归档失败不影响主流程，但必须留痕（error.message），避免再次静默失败
        warnLog('[persona-studio] 记忆归档失败：' + (e && e.message ? e.message : String(e)))
      }
    }
    ctx.on('agent/turn-stopping', async (payload) => {
      try {
        const agent = payload && payload.agent
        if (!agent || externalSessionMarked(agent.id)) return
        // 事件层：每轮都增量提取完整对话事件（纯 JS 遍历 session log，零额外 LLM），
        // 先于校准器/口吻样本，保证它们能读到包含当前轮的完整 Event 上下文。
        captureTurnEvents(agent)
        // 事件处理层：对新产生的 Event 逐个 [Appraisal → Belief Update]
        // （每个事件各最多一次 LLM 请求，幂等，best-effort；Belief 不反向影响 intimacy）
        const processEventsDone = processEvents(agent)
        // 记忆归档：**每轮都尝试**，靠 mergeMemory 内部「日志 ≥ 12 条才动手」自我限流。
        // 原先它挂在"每 3 轮"的分支里，结果实测日志 60/60 卡了一整天：只要轮次计数被重置
        // （插件热重载 / 重启 / 多实例 apply 各持一份 Map），归档就永远轮不到，而它没有任何可见症状。
        // 归档是"日志越长越该跑"的活，不该由易失的计数器决定。
        // 必须 await：这不是「后台任务」，而是「本轮还没结束的工作」。
        // 旧实现 fire-and-forget，回复一出去、turn 关闭，DSH 就把还在跑的 LLM 流掐掉——
        // 日志里表现为「跑了一半、没有下文」（size=5 连结果都没有、降级也没触发）。
        // 代价是每条消息结束后要等几秒才真正收尾；换来的是不丢任务。
        await processEventsDone
        await mergeMemory(agent)
        await periodicIfDue(agent)
      } catch (e) {
        warnLog('[persona-studio] turn 收尾任务异常 agent=' + (payload && payload.agent && payload.agent.id) + ' err=' + ((e && e.message) || e))
      }
    })

    // ---- 周期任务调度（v8：不再用易失的轮次计数器）----
    // 旧实现是 `if (n % 3 === 0)` / `if (nc % 10 === 0)`。实测在真实环境里这些分支从没执行过：
    // no mood、no 语感样本、归档也没跑。原因是 turnCounters / consolidationCounters 都是每次
    // apply 新建的闭包变量，插件热重载或多 scope 重复 apply 时全部归零，永远攒不到 3 / 10。
    // 现在改成看数据：本会话自上次干活以来新增了多少条事件，进度写在 data.maintenance（随状态落盘）。
    // 宁可多重算一次，也不要静默不跑——"功能看着在、其实从未执行"在这个项目里已经出现过四次。
    const CALIBRATE_EVERY_EVENTS = 3
    function eventsAfter(evLog, marker) {
      if (!marker) return evLog
      const i = evLog.findIndex((e) => e && e.id === marker)
      return i < 0 ? evLog : evLog.slice(i + 1)
    }
    async function periodicIfDue(agent) {
      try {
        const sp = sessionPersona(state.data, agent.id)
        if (!sp.tpl || !sp.enabled) return
        const mine = sessionEvents(getEventLog(state.data.relations, sp.personaId, DEFAULT_USER_ID), agent.id)
        if (!mine.length) return
        if (!state.data.maintenance || typeof state.data.maintenance !== 'object') state.data.maintenance = {}
        const rec = state.data.maintenance[agent.id] || (state.data.maintenance[agent.id] = {})
        const latest = mine[mine.length - 1].id
        // 校准 / 口吻样本：攒够 3 条新事件
        const forCalibrate = eventsAfter(mine, typeof rec.calibratedThrough === 'string' ? rec.calibratedThrough : '')
        if (forCalibrate.length >= CALIBRATE_EVERY_EVENTS) {
          rec.calibratedThrough = latest
          rec.at = Date.now()
          persist()
          await calibrate(agent)
          await personaSaying(agent, forCalibrate.length)
        }
        if (externalSessionMarked(agent.id)) return
        // Belief 整理：攒够 BELIEF_CONSOLIDATION_INTERVAL 条新事件（同样不再看轮次）
        const forConsolidate = eventsAfter(mine, typeof rec.consolidatedThrough === 'string' ? rec.consolidatedThrough : '')
        if (forConsolidate.length >= BELIEF_CONSOLIDATION_INTERVAL) {
          rec.consolidatedThrough = latest
          rec.at = Date.now()
          persist()
          await consolidateBeliefs(agent)
        }
      } catch (e) { /* 调度失败不影响主流程 */ }
    }

    // ---- 角色段注入（按会话；子代理不注入） ----
    ctx.effect(() => ctx.systemPrompt.section({
      name: 'persona-studio:persona',
      order: 50,
      text: (context) => {
        const agent = context && context.agent
        if (!agent) return ''
        const roots = ctx.agents.roots()
        if (!roots.some((r) => r.id === agent.id)) return ''
        const sp = sessionPersona(state.data, agent.id)
        if (!sp.enabled) return ''
        return renderPersonaCard(state.data, sp.personaId, DEFAULT_USER_ID, { sessionId: agent.id })
      }
    }))
  }
}
