const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const xlsx = require('xlsx');
const https = require('https');

let botInstance = null;
const bot = new Telegraf(process.env.BOT_TOKEN);
// 新增：HTML 字符转义函数，防止用户名字中的特殊字符（如 & < >）导致 Telegram 接口解析失败
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({
        '&': '&amp;', 
        '<': '&lt;', 
        '>': '&gt;', 
        '"': '&quot;', 
        "'": '&#39;'
    }[m]));
}

const GROUP_CHAT_IDS = [
  -1003354803364,
  -1003381368112,
  -1003308598858,
  -1003368574609,
  -1003286063197,
  -1003378109615,
  -1003293673373,
  -1003203365614,
  -1000000000009,
  -1000000000010
];
const BACKUP_GROUP_ID = -1003293673373;
const WEB_APP_URL = 'https://www.huiying888.xyz';
const AUTH_FILE = './authorized.json';

const TEXTS = {
    'zh-CN': {
        pm_reply: "❌ 🔒本机器人只供汇盈国际内部使用，你没有权限访问。如果有疑问，请联系汇盈国际负责人授权。🚫🚫",
        welcome_user: "🚫这是汇盈国际官方对接群 \n\n" +
                      "👤欢迎 ${name} ${username}！\n\n" +
                      "⚠️重要提醒：这是汇盈国际官方对接群，你还没有获得授权权限，请立即联系负责人进行授权！\n\n" +
                      "🔗联系方式：请联系汇盈国际负责人或等待通知。\n\n" +
                      "🚀汇盈国际 - 专业、安全、可靠💎",
        unauth_msg: "🚫这里是汇盈国际官方对接群🚫 \n\n" +
                    "${name} ${username}，👤你还没有获得授权！🚫\n\n" +
                    "💡立即联系负责人授权，否则无法发言。🚫\n\n" +
                    "🚀汇盈国际 - 专业、安全、可靠🚀",
        auth_success: "✅ 已授权 ✅ 用户 ${name}！(只能使用 /hc)",
        agent_auth_msg: "✅ 已授权中介✅ 路上只要是换车的请都使用 /zjkh 这个指令把链接发给你的兄弟，让你的兄弟拍照，（温馨提示：链接可以一直使用）",
        photo_prompt: "为了保障你的安全换车前请拍照！ 换车一定要是上一个司机安排的哦，如果是请点击下方拍照，如果不是请联系负责人",
        btn_photo: "📷开始拍照",
        zl_msg: "填写招聘申请时请打开手机录屏，按照上面顺序排列填写资料后拍照关闭手机录屏后发送到此群里！",
        zl_instr: "点击上方链接打开浏览器进行填写，填写时记住要录屏填写！填写好了发到此群！",
        zj_instr: "发给你的兄弟让兄弟打开浏览器进行填写，填写时记住要录屏填写！填写好了发到此群！",
        zl_btn_title: "👤请选择申请类型：",
        zj_btn_title: "👤请选择中介申请类型：",
        land_msg: "🚨🔥上车安全提醒 - 必读！🔥\n\n上车以后不要跟其他人过多交流，不要透露自己来自哪里，不要透露个人信息，不要透露自己来干嘛的，路线不只是带你自己出境的还带其他人的，车上什么人都有，有出境上班的，有案子跑路的，所以目的地很多人都是不一样的，不用过多的跟他们聊天！！\n\n👋欢迎新成员！请注意以上内容，确保安全出行。路上有什么问题及时报告到此群\n\n汇盈国际 - 专业、安全、可靠",
        flight_msg: "上车前要拍照到此群核对\n\n请务必在登机前使用 /hc 拍照上传当前位置！\n\n汇盈国际 - 安全第一",
        btn_land: "负责人安排走小路",
        btn_flight: "坐飞机",
        perm_deny: "❌ 🔒无权限！ /qc 只限汇盈国际负责人使用。",
        agent_deny: "❌ 无权限！此指令仅限授权中介使用。\n用户请使用 /hc",
        lj_text: "🔗汇盈国际官方对接群链接 \n\n🔗点击下方按钮直接加入群！",
        qc_confirm: "⚠️ **恢复出厂设置**\n\n是否确认清空所有数据？",
        qc_done: "✅ 出厂设置已完成！所有授权已清空\n临时任务已清除\nBot 已重置为全新状态",
        qc_cancel: "已取消操作。",
        sx_done: "✅ **本群**链接已刷新！旧链接已失效。",
        ban_msg: "用户已踢出并永久拉黑！",
        menu_title: "📋汇盈国际官方机器人指令面板",
        hc_desc: "换车安全拍照",
        zjkh_desc: "中介专用链接",
        boss_desc: "Boss 查崗",
        lg_desc: "龙哥查崗",
        sx_desc: "刷新链接 (旧链接失效)",
        zl_desc: "招聘申请",
        zj_desc: "中介申请",
        qc_desc: "恢复出厂",
        lh_desc: "踢出用户",
        lj_desc: "进群链接",
        link_title: "🔗 中介兄弟专用链接",
        link_copy: "请复制下方链接发送给你的兄弟：",
        boss_req: "汇盈国际负责人Boss要求你拍照",
        lg_req: "汇盈国际负责人龍哥要求你拍照",
        btn_confirm: "✅ 确认重置",
        btn_cancel: "❌ 取消",
        upload_title: "换车拍摄图片",
        loc_fail: "⚠️无定位❌请负责人核实！",
        map_amap: "高德地图",
        map_google: "谷歌地图",
        user_auth_msg: "✅ 已授权用户 ${name}！(只能用 /hc)"
    },
    'zh-TW': {
        pm_reply: "❌ 🔒本機器人只供匯盈國際內部使用，你沒有權限訪問。如果有疑問，請聯繫匯盈國際負責人授權。🚫🚫",
        welcome_user: "🚫這是匯盈國際官方對接群 \n\n" +
                      "👤歡迎 ${name} ${username}！\n\n" +
                      "⚠️重要提醒：這是匯盈國際官方對接群，你還沒有獲得授權權限，請立即聯繫負責人進行授權！\n\n" +
                      "🔗聯繫方式：請聯繫匯盈國際負責人或等待通知。\n\n" +
                      "🚀匯盈國際 - 專業、安全、可靠💎",
        unauth_msg: "🚫這裡是匯盈國際官方對接群🚫 \n\n" +
                    "${name} ${username}，👤你還沒有獲得授權！🚫\n\n" +
                    "💡立即聯繫負責人授權，否則無法發言。🚫\n\n" +
                    "🚀匯盈國際 - 專業、安全、可靠🚀",
        auth_success: "✅ 已授權 ✅ 用戶 ${name}！(只能使用 /hc)",
        agent_auth_msg: "✅ 已授權中介 ✅ 告知：路上只是要換車的請都使用 /zjkh 這個指令把鏈接發給你的兄弟，讓你的兄弟拍照，（溫馨提示：鏈接可以一直使用）",
        photo_prompt: "為了保障你的安全換車前請拍照！ 換車一定要是上一個司機安排的哦，如果是請點擊下方拍照，如果不是請聯繫負責人",
        btn_photo: "📷開始拍照",
        zl_msg: "填寫招聘申請時請打開手機錄屏，按照上面順序排列填寫資料後拍照關閉手機錄屏後發送到此群裡！",
        zl_instr: "點擊上方鏈接打開瀏覽器進行填寫，填寫時記住要錄屏填寫！填寫好了發到此群！",
        zj_instr: "發給你的兄弟讓兄弟打開瀏覽器進行填寫，填寫時記住要錄屏填寫！填寫好了發到此群！",
        zl_btn_title: "👤請選擇申請類型：",
        zj_btn_title: "👤請選擇中介申請類型：",
        land_msg: "🚨🔥上車安全提醒 - 必讀！🔥\n\n上車以後不要跟其他人過多交流，不要透露自己來自哪裡，不要透露個人信息，不要透露自己來幹嘛的，路線不只是帶你自己出境的還帶其他人的，車上什麼人都有，有出境上班的，有案子跑路的，所以目的地很多人都是不一樣的，不用過多的跟他們聊天！！\n\n👋歡迎新成員！請注意以上內容，確保安全出行。路上有什麼問題及時報告到此群\n\n匯盈國際 - 專業、安全、可靠",
        flight_msg: "上車前要拍照到此群核對\n\n請務必在登机前使用 /hc 拍照上傳當前位置！\n\n匯盈國際 - 安全第一",
        btn_land: "負責人安排走小路",
        btn_flight: "坐飛機",
        perm_deny: "❌ 🔒無權限！ /qc 只限匯盈國際負責人使用。",
        agent_deny: "❌ 無權限！此指令僅限授權中介使用。\n普通用戶請使用 /hc",
        lj_text: "🔗匯盈國際官方對接群鏈接 \n\n🔗點擊下方按鈕直接加入群！",
        qc_confirm: "⚠️ **恢復出厂设置**\n\n是否確認清空所有數據？",
        qc_done: "✅ 出厂设置已完成！所有授權已清空\n臨時任務已清除\nBot 已重置為全新狀態",
        qc_cancel: "已取消操作。",
        sx_done: "✅本群鏈接已刷新！舊鏈接已失效⚠️",
        ban_msg: "用戶已踢出並永久拉黑！",
        menu_title: "📋匯盈國際官方機器人指令面板",
        hc_desc: "換車安全拍照",
        zjkh_desc: "中介專用鏈接",
        boss_desc: "Boss 查崗",
        lg_desc: "龍哥查崗",
        sx_desc: "刷新鏈接 (舊鏈接失效)",
        zl_desc: "招聘申請",
        zj_desc: "中介申請",
        qc_desc: "恢復出厂",
        lh_desc: "踢出用戶",
        lj_desc: "進群鏈接",
        link_title: "🔗 中介兄弟專用鏈接",
        link_copy: "請複製下方鏈接發送給您的兄弟：",
        boss_req: "匯盈國際負責人Boss要求你拍照",
        lg_req: "匯盈國際負責人龍哥要求你拍照",
        btn_confirm: "✅ 確認重置",
        btn_cancel: "❌ 取消",
        upload_title: "換車拍攝圖片",
        loc_fail: "❌無定位⚠️請負責人核實",
        map_amap: "高德地圖",
        map_google: "谷歌地圖",
        user_auth_msg: "✅ 已授權用戶 ${name}！(只能用 /hc)"
    }
};

// === 核心数据存储 ===
let authorizedUsers = new Map();
let groupTokens = new Map();
let groupConfigs = new Map();
const warningMessages = new Map();
const unauthorizedMessages = new Map();
const zlMessages = new Map();

// === 功能性数据 ===
const tpSessions = {}; // Excel 预览缓存
const pendingAgentAuth = new Map(); // 等待授权中介
const pendingPayouts = new Map(); // 等待用户上传收款码
const activePayoutMessages = new Map(); // 等待管理员回传截图/驳回

const ZL_LINKS = { '租车': 'https://che88.netlify.app', '大飞': 'https://fei88.netlify.app', '走药': 'https://yao88.netlify.app', '背债': 'https://bei88.netlify.app' };
const ZJ_LINKS = { '租车': 'https://zjc88.netlify.app', '大飞': 'https://zjf88.netlify.app', '走药': 'https://zjy88.netlify.app', '背债': 'https://zjb88.netlify.app' };

// === 辅助函数 ===
function getLang(chatId) {
    const config = groupConfigs.get(String(chatId));
    return config && config.lang ? config.lang : 'zh-CN';
}

function t(chatId, key, params = {}) {
    const lang = getLang(chatId);
    let text = TEXTS[lang][key] || TEXTS['zh-CN'][key] || key;
    for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\$\\{${k}\\}`, 'g'), v);
    }
    return text;
}

function getOrRefreshToken(chatId, forceRefresh = false) {
    const cid = String(chatId);
    if (forceRefresh || !groupTokens.has(cid)) {
        const newToken = crypto.randomBytes(8).toString('hex');
        groupTokens.set(cid, newToken);
        saveAuth();
        return newToken;
    }
    return groupTokens.get(cid);
}

function loadAuth() {
    try {
        if (fs.existsSync(AUTH_FILE)) {
            const data = fs.readFileSync(AUTH_FILE, 'utf8');
            const parsed = JSON.parse(data);
            authorizedUsers = new Map(Object.entries(parsed.users || {}));
            groupTokens = new Map(Object.entries(parsed.tokens || {}));
            groupConfigs = new Map(Object.entries(parsed.configs || {}));
            for (let [k, v] of authorizedUsers) { authorizedUsers.delete(k); authorizedUsers.set(Number(k), v); }
        }
    } catch (e) {}
}

function saveAuth() {
    try {
        const data = {
            users: Object.fromEntries(authorizedUsers),
            tokens: Object.fromEntries(groupTokens),
            configs: Object.fromEntries(groupConfigs)
        };
        fs.writeFileSync(AUTH_FILE, JSON.stringify(data));
    } catch (e) {}
}
loadAuth();

// === 核心：一键重置函数 (已移除 reset 相关 console.log) ===
function factoryReset() {
    // 1. 清空基础配置与权限
    authorizedUsers.clear();
    groupTokens.clear();
    groupConfigs.clear();

    // 2. 清空临时交互记录
    warningMessages.clear();
    unauthorizedMessages.clear();
    zlMessages.clear();
    
    // 3. 清空 Excel 预览缓存
    for(let k in tpSessions) delete tpSessions[k];
    
    // 4. 清空支付与授权相关的临时状态
    pendingAgentAuth.clear();
    pendingPayouts.clear();
    activePayoutMessages.clear(); 

    // 5. 物理删除本地文件 (不打印日志)
    try { 
        if(fs.existsSync(AUTH_FILE)) {
            fs.unlinkSync(AUTH_FILE);
        }
    } catch(e) {
        // 忽略文件删除错误
    }
}

async function sendToChat(chatId, photoBuffer, caption, lat, lng) {
    try {
        await bot.telegram.sendPhoto(chatId, { source: photoBuffer }, { caption, parse_mode: 'HTML' });
        if (lat && lng && (lat !== 0 || lng !== 0)) {
            await bot.telegram.sendLocation(chatId, lat, lng);
        }
    } catch (error) { try { await bot.telegram.sendMessage(BACKUP_GROUP_ID, `发送失败: ${error.message}`); } catch {} }
}

async function isAdmin(chatId, userId) {
    try {
        const member = await bot.telegram.getChatMember(chatId, userId);
        return member.status === 'administrator' || member.status === 'creator';
    } catch (e) { return false; }
}

function downloadFileToBuffer(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            const chunks = [];
            res.on('data', (d) => chunks.push(d));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', (e) => reject(e));
        });
    });
}

// === Excel 医疗相关函数 ===
function generateMedicalSummary(jsonData) {
    const majorKeywords = [
        '高血压', '糖尿病', '结石', '肿瘤', '癌', '骨折', '艾滋', 'HIV', 
        '肝炎', '结核', '肾衰', '心梗', '脑梗', '白血病', '贫血', 
        '红斑狼疮', '尿毒症', '低钙血症', '胆囊炎'
    ];

    let detectedIssues = [];
    let fullText = "";
    let lastVisitDate = null;
    let maxTimestamp = 0;

    jsonData.forEach(row => {
        if(Array.isArray(row)) {
            const rowStr = row.join(' ');
            fullText += rowStr + " ";

            if(row[6]) {
                const timeStr = String(row[6]);
                const ts = Date.parse(timeStr);
                if(!isNaN(ts)) {
                    if(ts > maxTimestamp) {
                        maxTimestamp = ts;
                        lastVisitDate = timeStr;
                    }
                }
            }
        }
    });
    
    majorKeywords.forEach(keyword => {
        if (new RegExp(keyword, 'i').test(fullText)) {
            detectedIssues.push(keyword);
        }
    });
    detectedIssues = [...new Set(detectedIssues)];

    let summaryText = `🧾 重点筛查（忽略普通症状）\n\n`;

    if (detectedIssues.length > 0) {
        summaryText += `🚨 检测到关键疾病记录：\n${detectedIssues.join('、')}\n`;
    } else {
        summaryText += `✅ 未检测到重大疾病关键词\n（已自动过滤感冒/发热/咳嗽等普通症状）\n`;
    }

    if(lastVisitDate) {
        summaryText += `\n📅 最后一次看病时间：${lastVisitDate}\n`;
    } else {
        summaryText += `\n📅 最后一次看病时间：未检测到有效日期\n`;
    }

    summaryText += `\n⚠️ 注意：此分析仅基于文本。`;
    return summaryText;
}

function renderCardPage(rawData, pageNum, mode = 'short') {
    const pageSize = 8;
    const start = (pageNum - 1) * pageSize;
    const end = start + pageSize;
    const pageData = rawData.slice(start, end);
    const totalPages = Math.ceil(rawData.length / pageSize);

    if (pageData.length === 0) return { text: "空文件", totalPages: 1 };

    const lines = pageData.map((row, index) => {
        const globalIndex = start + index + 1;
        const rowNum = String(globalIndex).padStart(2, '0');
        
        const getCol = (i) => (Array.isArray(row) && row[i] ? String(row[i]) : '');
        
        let name = getCol(2);
        let id = getCol(1);
        let hospital = getCol(3);
        let type = getCol(4);
        let diagnosis = getCol(5);
        let time = getCol(6);

        if (name.includes('姓名') || id.includes('身份证')) { 
            return null; 
        }

        if (mode === 'short' && hospital.length > 12) {
            hospital = hospital.substring(0, 10) + '..';
        }

        return (
            `[${rowNum}]\n` +
            `姓名：${name || '无'}\n` +
            `身份证：${id || '无'}\n` +
            `医院：${hospital || '无'}\n` +
            `病症：${diagnosis || '无'}\n` +
            `时间：${time || '无'}\n` +
            `—————————————————`
        );
    }).filter(line => line !== null); 

    return {
        text: lines.join('\n'),
        totalPages: totalPages
    };
}

// === Middleware & Handlers ===

bot.use(async (ctx, next) => {
    if (ctx.message && ctx.chat?.type === 'private') {
        const userId = ctx.from.id;
        const userName = ctx.from.first_name || '未知';
        const userUsername = ctx.from.username ? `@${ctx.from.username}` : '无用户名';
        const messageText = ctx.message.text || '[非文本]';
        const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

        await ctx.reply(t(null, 'pm_reply'));

        const reportText = `🚨**私信访问警报**🚨\n` +
                           `👤用户: ${userName} ${userUsername}\n` +
                           `🆔ID: ${userId}\n` +
                           `📝消息内容: ${messageText}\n` +
                           `⏰时间: ${timestamp}\n\n` +
                           `汇盈国际 - 安全监控系统`;
        try {
            await bot.telegram.sendMessage(BACKUP_GROUP_ID, reportText, { parse_mode: 'Markdown' });
        } catch (e) { }
        return;
    }
    await next();
});

bot.on('new_chat_members', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;

    for (const m of ctx.message.new_chat_members) {
        if (m.is_bot) continue;
        authorizedUsers.delete(m.id);
        saveAuth();
        try { await bot.telegram.restrictChatMember(ctx.chat.id, m.id, { permissions: { can_send_messages: false } }); } catch(e){}

        const warning = await ctx.reply(t(ctx.chat.id, 'welcome_user', { name: m.first_name, username: m.username ? `@${m.username}` : '' }));
        warningMessages.set(warning.message_id, { userId: m.id, userName: m.first_name, userUsername: m.username ? `@${m.username}` : '' });
    }

    await ctx.reply("🌏 请选择语言 / 請選擇語言", {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🇨🇳 简体中文', callback_data: 'set_lang_cn' }, { text: '🇭🇰 繁體中文', callback_data: 'set_lang_tw' }]
            ]
        }
    });
});

bot.action(['set_lang_cn', 'set_lang_tw'], async (ctx) => {
    const lang = ctx.match[0] === 'set_lang_cn' ? 'zh-CN' : 'zh-TW';
    const chatId = ctx.chat.id;
    groupConfigs.set(String(chatId), { lang: lang });
    saveAuth();

    try { await ctx.answerCbQuery(lang === 'zh-CN' ? '已设置为简体中文' : '已設置為繁體中文'); } catch(e){}
    try { await ctx.deleteMessage(); } catch(e){}

    const text = t(chatId, '请选择你的出行方式！');
    await ctx.reply(text, {
        reply_markup: {
            inline_keyboard: [
                [{ text: t(chatId, 'btn_land'), callback_data: 'travel_land' }],
                [{ text: t(chatId, 'btn_flight'), callback_data: 'travel_flight' }]
            ]
        }
    });
});

bot.command('bz', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return;

    const chatId = ctx.chat.id;
    const helpText = `${t(chatId, 'menu_title')}\n\n` +
        `/hc - ${t(chatId, 'hc_desc')}\n` +
        `/zjkh - ${t(chatId, 'zjkh_desc')}\n` +
        `/boss - ${t(chatId, 'boss_desc')}\n` +
        `/lg - ${t(chatId, 'lg_desc')}\n` +
        `/sx - ${t(chatId, 'sx_desc')}\n` +
        `/zl - ${t(chatId, 'zl_desc')}\n` +
        `/zj - ${t(chatId, 'zj_desc')}\n` +
        `/qc - ${t(chatId, 'qc_desc')}\n` +
        `/lh - ${t(chatId, 'lh_desc')}\n` +
        `/lj - ${t(chatId, 'lj_desc')}\n` +
         `/zf - 财务转账 (已改为回复“打款 金额”)\n` +
        `/tp - Excel预览 (新增)\n`;
    ctx.reply(helpText);
});

// 取消打款
bot.action(/^cancel_pay_(\d+)$/, async (ctx) => {
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) {
        return ctx.answerCbQuery("❌ 无权限", { show_alert: true });
    }
    const targetUserId = parseInt(ctx.match[1]);
    const operatorId = ctx.from.id;
    const operatorName = ctx.from.first_name;
    let found = false;

    // Check Pending
    if (pendingPayouts.has(targetUserId)) {
        pendingPayouts.delete(targetUserId);
        found = true;
    }

    // Check Active
    for (const [msgId, data] of activePayoutMessages.entries()) {
        if (data.targetUserId === targetUserId) {
            const originalCaption = `<b>[财务转账申请]</b>\n` +
                                    `👤 用户：${data.targetUser.first_name} (ID: ${data.targetUserId})\n` +
                                    `💰 金额：${data.amount}\n` +
                                    `👤 经手人：<a href="tg://user?id=${data.operatorId}">${data.operatorName}</a>\n\n` +
                                    `请财务扫码支付，支付成功后请 **直接回复此消息并发送支付截图** 以确认。`;
            const cancelWarning = `\n\n⚠️ 此打款已被 <a href="tg://user?id=${operatorId}">${operatorName}</a> 取消！`;

            try {
                await bot.telegram.editMessageCaption(BACKUP_GROUP_ID, msgId, null, originalCaption + cancelWarning, { parse_mode: 'HTML' });
            } catch (e) { }

            activePayoutMessages.delete(msgId);
            found = true;
            break; 
        }
    }

    if (found) {
        await ctx.reply(`❌ 本次打款流程已取消\n操作人：<a href="tg://user?id=${operatorId}">${operatorName}</a>`, { parse_mode: 'HTML' });
        await ctx.answerCbQuery("✅ 已取消");
    } else {
        await ctx.answerCbQuery("⚠️ 流程不存在或已结束", { show_alert: true });
    }
});

// === 处理图片消息 ===
bot.on('photo', async (ctx, next) => {
    const userId = ctx.from.id;
    const msg = ctx.message;

    // 1️⃣ 管理员回复截图确认支付 (结单逻辑)
    if (msg.reply_to_message && activePayoutMessages.has(msg.reply_to_message.message_id)) {
        if (!await isAdmin(ctx.chat.id, userId)) return;

        const payoutData = activePayoutMessages.get(msg.reply_to_message.message_id);
        const { targetChatId, targetUserId, amount, operatorId, operatorName, targetUser } = payoutData;

        // 构建成功文案
        const successMsg = `✅ <b>财务已打款</b>\n\n` +
                        `💰金额：<b>${amount}</b>\n` +
                        `👤操作人：<a href="tg://user?id=${operatorId}">${operatorName}</a>\n\n` +
                        `<b>👤 收款用户信息：</b>\n` +
                        `TG 名字：${targetUser.first_name}${targetUser.last_name ? ' ' + targetUser.last_name : ''}\n` +
                        `TG 用户名：${targetUser.username ? '@' + targetUser.username : '无'}\n` +
                        `TG ID：<code>${targetUser.id}</code>` +
                        `\n\n⚠️财务可能会有时搞错金额，如金额有误请联系负责人处理。`;

        try {
            const photoId = msg.photo[msg.photo.length - 1].file_id;
            
            // A. 转发截图给用户
            await bot.telegram.sendPhoto(targetChatId, photoId, {
                caption: successMsg,
                parse_mode: 'HTML'
            });

            // B. 修改通知群消息，标记为完成，移除驳回按钮
            await bot.telegram.editMessageCaption(
                ctx.chat.id, 
                msg.reply_to_message.message_id, 
                null, 
                msg.reply_to_message.caption + `\n\n✅ <b>已打款</b>`, 
                { parse_mode: 'HTML' } 
            );
            
            await ctx.reply("✅ 已通知用户。");

        } catch (e) {
            await ctx.reply("❌ 发送失败，可能是用户已屏蔽机器人。");
        }

        // 清理订单
        activePayoutMessages.delete(msg.reply_to_message.message_id);
        return; 
    }

    // 2️⃣ 用户发送收款码 (新增：财务驳回按钮)
    if (pendingPayouts.has(userId)) {
        const payoutInfo = pendingPayouts.get(userId);

        // A. 回复用户
        await ctx.reply(`✅ 检测到收款码，正在通知财务进行打款请稍等...\n(如果长时间未处理，请联系负责人)`);

        // B. 发送到通知群
        const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        
        const caption = `<b>[财务转账申请]</b>\n` +
                        `👤 用户：${ctx.from.first_name} (ID: ${userId})\n` +
                        `💰 金额：<b>${payoutInfo.amount}</b>\n` +
                        `👤 经手人：<a href="tg://user?id=${payoutInfo.adminId}">${payoutInfo.adminName}</a>\n\n` +
                        `👉 <b>操作指南：</b>\n` +
                        `1. <b>打款成功</b>：请直接<b>回复此消息</b>并发送支付截图。\n` +
                        `2. <b>拒绝打款</b>：请点击下方“财务驳回”按钮。`;

        const sentMsg = await bot.telegram.sendPhoto(BACKUP_GROUP_ID, photoId, {
            caption: caption,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    // 🔥 新增：财务驳回按钮
                    [{ text: "❌ 财务驳回 (拒绝打款)", callback_data: `reject_pay_btn` }] 
                ]
            }
        });

        // 记录到活跃订单
        activePayoutMessages.set(sentMsg.message_id, {
            targetChatId: payoutInfo.chatId,
            targetUserId: userId,
            amount: payoutInfo.amount,
            operatorId: payoutInfo.adminId,
            operatorName: payoutInfo.adminName,
            targetUser: payoutInfo.targetUser
        });

        // 清除等待上传状态
        pendingPayouts.delete(userId);
        return; 
    }

    await next(); 
});

// === 处理财务驳回按钮动作 ===
bot.action('reject_pay_btn', async (ctx) => {
    // 权限验证
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) {
        return ctx.answerCbQuery("❌ 无权限操作", { show_alert: true });
    }

    const msgId = ctx.callbackQuery.message.message_id;
    const operatorName = ctx.from.first_name;

    // 检查订单是否存在
    if (!activePayoutMessages.has(msgId)) {
        await ctx.editMessageCaption(
            ctx.callbackQuery.message.caption + "\n\n⚠️ <b>此订单已失效或已被处理</b>",
            { parse_mode: 'HTML' }
        );
        return ctx.answerCbQuery("⚠️ 订单不存在");
    }

    const data = activePayoutMessages.get(msgId);

    // 通知用户被驳回
    try {
        await bot.telegram.sendMessage(
            data.targetChatId,
            `❌ <b>打款申请被驳回</b>\n\n` +
            `你的打款申请（金额：${data.amount}）已被财务驳回。\n` +
            `⚠️如有疑问，请联系负责人。`,
            { parse_mode: 'HTML' }
        );
    } catch (e) { }

    // 更新通知群消息（移除按钮，显示驳回人）
    try {
        await ctx.editMessageCaption(
            ctx.callbackQuery.message.caption + `\n\n❌ <b>已被 ${operatorName} 驳回</b>`,
            { parse_mode: 'HTML' }
        );
    } catch (e) { }

    // 清理数据
    activePayoutMessages.delete(msgId);
    await ctx.answerCbQuery("✅ 已执行驳回操作");
});


bot.command('tp', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return;

    const replyMsg = ctx.message.reply_to_message;
    if (!replyMsg || !replyMsg.document) { 
        return ctx.reply("❌ 请回复一条包含 .xlsx 文件的消息来使用此功能。");
    }

    const doc = replyMsg.document;
    if (!doc.file_name.endsWith('.xlsx')) {
        return ctx.reply("❌ 请回复 .xlsx 格式的 Excel 文件。");
    }

    const adminId = ctx.from.id;
    const fileName = doc.file_name.replace('.xlsx', '');
    
    try {
        const statusMsg = await ctx.reply("⏳ 正在内存解析 Excel，请稍候...");

        const fileLink = await bot.telegram.getFileLink(doc.file_id);
        const buffer = await downloadFileToBuffer(fileLink.href);

        const workbook = xlsx.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

        tpSessions[adminId] = {
            rawData: jsonData,
            mode: 'short', 
            fileName: fileName, 
            msgId: null 
        };

        const { text: page1, totalPages } = renderCardPage(jsonData, 1, 'short');

        try { await bot.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id); } catch(e){}

        const previewMsg = await ctx.reply(
            `📄 ${fileName}的医疗文件预览（第 1 页 / 共 ${totalPages} 页）\n\n<pre>${page1}</pre>\n\n `, 
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '⬅️ 上一页', callback_data: 'tp_prev_1' },
                            { text: '下一页 ➡️', callback_data: 'tp_next_1' }
                        ],
                        [{ text: '🔘 显示/隐藏完整医院名称', callback_data: 'tp_toggle_mode_1' }],
                        [{ text: '🗑️ 删除预览会话', callback_data: 'tp_delete_session' }]
                    ]
                }
            }
        );

        tpSessions[adminId].msgId = previewMsg.message_id;

        const summary = generateMedicalSummary(jsonData);
        await ctx.reply(summary);

    } catch (err) {
        ctx.reply("❌ 解析失败，请重试。");
    }
});

bot.action(/^tp_(prev|next|toggle_mode)_(\d+)$/, async (ctx) => {
    const action = ctx.match[1];
    let currentPage = parseInt(ctx.match[2]);
    const currentMsgId = ctx.callbackQuery.message.message_id;

    let targetSession = null;
    let targetUserId = null;
    for (const [uid, session] of Object.entries(tpSessions)) {
        if (session.msgId === currentMsgId) {
            targetSession = session;
            targetUserId = uid;
            break;
        }
    }

    if (!targetSession) {
        return ctx.answerCbQuery("⚠️ 会话已过期或不存在");
    }

    let newPage = currentPage;
    const totalPages = Math.ceil(targetSession.rawData.length / 8); 

    if (action === 'toggle_mode') {
        targetSession.mode = targetSession.mode === 'short' ? 'full' : 'short';
    } else {
        newPage = action === 'prev' ? currentPage - 1 : currentPage + 1;
        if (newPage < 1) newPage = 1;
        if (newPage > totalPages) newPage = totalPages;
        if (newPage === currentPage && action !== 'toggle_mode') {
            return ctx.answerCbQuery("没了");
        }
    }

    const { text: content } = renderCardPage(targetSession.rawData, newPage, targetSession.mode);

    try {
        await ctx.editMessageText(
            `📄 ${targetSession.fileName}的医疗文件预览（第 ${newPage} 页 / 共 ${totalPages} 页）\n\n<pre>${content}</pre>\n\n`, 
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '⬅️ 上一页', callback_data: `tp_prev_${newPage}` },
                            { text: '下一页 ➡️', callback_data: `tp_next_${newPage}` }
                        ],
                        [{ text: targetSession.mode === 'short' ? '🔘 显示完整医院名称' : '🔘 隐藏完整医院名称', callback_data: `tp_toggle_mode_${newPage}` }],
                        [{ text: '🗑️ 删除预览会话', callback_data: 'tp_delete_session' }]
                    ]
                }
            }
        );
    } catch(e) {}
    
    return ctx.answerCbQuery();
});

bot.action('tp_delete_session', async (ctx) => {
    const currentMsgId = ctx.callbackQuery.message.message_id;
    const operatorId = ctx.from.id;
    const isAdminUser = await isAdmin(ctx.chat.id, operatorId);

    if (!isAdminUser) {
        return ctx.answerCbQuery("❌ 无权限删除", { show_alert: true });
    }

    let targetUserId = null;
    for (const [uid, session] of Object.entries(tpSessions)) {
        if (session.msgId === currentMsgId) {
            targetUserId = uid;
            break;
        }
    }

    if (targetUserId) {
        delete tpSessions[targetUserId];
    }
    
    try { await ctx.deleteMessage(); } catch(e) {}
    await ctx.reply("🗑️ 文件预览已删除");
    return ctx.answerCbQuery();
});


bot.command('qc', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return ctx.reply(t(ctx.chat.id, 'perm_deny'));

    await ctx.reply(t(ctx.chat.id, 'qc_confirm'), {
        reply_markup: {
            inline_keyboard: [
                [{ text: t(ctx.chat.id, 'btn_confirm'), callback_data: 'qc_yes' }],
                [{ text: t(ctx.chat.id, 'btn_cancel'), callback_data: 'qc_no' }]
            ]
        },
        parse_mode: 'Markdown'
    });
});

// === 防崩溃 + 进度通知版 /qc (无控制台日志) ===
bot.action('qc_yes', async (ctx) => {
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return;
    const chatId = ctx.chat.id;
    const messageId = ctx.callbackQuery.message.message_id;

    // 1. 抢答 (防止按钮一直转圈)
    try { await ctx.answerCbQuery("🚀 指令已接收，正在后台重置...", { show_alert: false }); } catch(e) {}

    // 2. 更新 UI 状态
    try {
        await ctx.editMessageText(
            "⚙️ <b>正在执行出厂设置...</b>\n\n" +
            "✅ 内存数据已清空\n" +
            "⏳ 正在后台删除历史消息（请勿操作，稍等片刻）...", 
            { parse_mode: 'HTML' }
        );
    } catch(e) { try { await ctx.reply("⏳ 正在后台重置中..."); } catch(e){} }

    // 3. 执行内存重置 (无日志)
    factoryReset();

    // 4. 后台异步删消息 (防卡死)
    (async () => {
        let i = 1;
        let consecutiveFails = 0;
        while (i <= 1000 && consecutiveFails < 20) {
            try {
                await new Promise(r => setTimeout(r, 35)); // 延迟防风控
                await bot.telegram.deleteMessage(chatId, messageId - i);
                consecutiveFails = 0;
            } catch (e) {
                consecutiveFails++;
                if (e.description && e.description.includes('message can\'t be deleted')) break; 
            }
            i++;
        }

        // 5. 完成通知
        try {
            await bot.telegram.editMessageText(chatId, messageId, null, t(chatId, 'qc_done'));
        } catch (e) {
            try { await bot.telegram.sendMessage(chatId, t(chatId, 'qc_done')); } catch(e){}
        }
    })();
});

bot.action('qc_no', async (ctx) => {
    await ctx.editMessageText(t(ctx.chat.id, 'qc_cancel'));
});

bot.command('lj', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return ctx.reply(t(ctx.chat.id, 'perm_deny'));

    try {
        const link = await bot.telegram.exportChatInviteLink(ctx.chat.id);
        ctx.reply(t(ctx.chat.id, 'lj_text'), {
            reply_markup: { inline_keyboard: [[{ text: '👉 点击加入 / 點擊加入', url: link }]] }
        });
    } catch(e) { ctx.reply('Error'); }
});

bot.command('sx', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return ctx.reply(t(ctx.chat.id, 'perm_deny'));
    getOrRefreshToken(ctx.chat.id, true);
    ctx.reply(t(ctx.chat.id, 'sx_done'), { parse_mode: 'Markdown' });
});

bot.command('hc', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    const userId = ctx.from.id;
    const role = authorizedUsers.get(userId);
    const isAdminUser = await isAdmin(ctx.chat.id, userId);

    if (!isAdminUser && role !== 'user' && role !== 'agent') {
        return ctx.reply(t(ctx.chat.id, 'perm_deny'));
    }

    const chatId = ctx.chat.id;
    const token = getOrRefreshToken(chatId);
    const url = `${WEB_APP_URL}/?chatid=${chatId}&uid=${userId}&name=${encodeURIComponent(ctx.from.first_name)}&token=${token}`;

    ctx.reply(t(chatId, 'photo_prompt'), {
        reply_markup: { inline_keyboard: [[{ text: t(chatId, 'btn_photo'), url: url }]] }
    });
});

bot.command('zjkh', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    const userId = ctx.from.id;
    const role = authorizedUsers.get(userId);
    const isAdminUser = await isAdmin(ctx.chat.id, userId);
    const chatId = ctx.chat.id;

    if (role !== 'agent' && !isAdminUser) return ctx.reply(t(chatId, 'agent_deny'));

    const token = getOrRefreshToken(chatId);
    const link = `${WEB_APP_URL}/?chatid=${chatId}&uid=${userId}&name=${encodeURIComponent('中介-'+ctx.from.first_name)}&token=${token}`;

    ctx.reply(`${t(chatId, 'link_title')}\n\n${t(chatId, 'link_copy')}\n${link}`, { disable_web_page_preview: true });
});

bot.command('boss', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return ctx.reply(t(ctx.chat.id, 'perm_deny'));
    if (!ctx.message.reply_to_message) return;

    const chatId = ctx.chat.id;
    const target = ctx.message.reply_to_message.from;
    const token = getOrRefreshToken(chatId);
    const url = `${WEB_APP_URL}/?chatid=${chatId}&uid=${target.id}&name=${encodeURIComponent(target.first_name)}&token=${token}`;

    ctx.reply(`${t(chatId, 'boss_req')} @${target.first_name}`, {
        reply_markup: { inline_keyboard: [[{ text: t(chatId, 'btn_photo'), url: url }]] }
    });
});

bot.command('lg', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return ctx.reply(t(ctx.chat.id, 'perm_deny'));
    if (!ctx.message.reply_to_message) return;

    const chatId = ctx.chat.id;
    const target = ctx.message.reply_to_message.from;
    const token = getOrRefreshToken(chatId);
    const url = `${WEB_APP_URL}/?chatid=${chatId}&uid=${target.id}&name=${encodeURIComponent(target.first_name)}&token=${token}`;

    ctx.reply(`${t(chatId, 'lg_req')} @${target.first_name}`, {
        reply_markup: { inline_keyboard: [[{ text: t(chatId, 'btn_photo'), url: url }]] }
    });
});

async function handleLinkCommand(ctx, type) {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return ctx.reply(t(ctx.chat.id, 'perm_deny'));

    const chatId = ctx.chat.id;
    const msg = t(chatId, 'zl_msg');
    const title = type === 'zl' ? t(chatId, 'zl_btn_title') : t(chatId, 'zj_btn_title');

    const replyMsg = await ctx.reply(`${msg}\n\n${title}`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '租车', callback_data: `${type}_租车` }, { text: '大飞', callback_data: `${type}_大飞` }],
                [{ text: '走药', callback_data: `${type}_走药` }, { text: '背债', callback_data: `${type}_背债` }]
            ]
        }
    });

    zlMessages.set(replyMsg.message_id, {
        commandType: type,
        targetFirstName: ctx.message.reply_to_message?.from.first_name || '未知',
        targetUserId: ctx.message.reply_to_message?.from.id || 0
    });
}
bot.command('zl', (ctx) => handleLinkCommand(ctx, 'zl'));
bot.command('zj', (ctx) => handleLinkCommand(ctx, 'zj'));

bot.command('lh', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return ctx.reply(t(ctx.chat.id, 'perm_deny'));
    if (!ctx.message.reply_to_message) return;
    try {
        await bot.telegram.banChatMember(ctx.chat.id, ctx.message.reply_to_message.from.id);
        ctx.reply(t(ctx.chat.id, 'ban_msg'));
    } catch(e){}
});

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const chatId = ctx.chat.id;

    if (data === 'travel_land' || data === 'travel_flight') {
        const text = data === 'travel_land' ? t(chatId, 'land_msg') : t(chatId, 'flight_msg');
        try { await ctx.deleteMessage(); } catch(e){}
        const m = await ctx.reply(text);
        try { await bot.telegram.pinChatMessage(chatId, m.message_id); } catch(e){}
    }
    
    if (data === 'agent_land' || data === 'agent_flight') {
        const promptMsgId = ctx.callbackQuery.message.message_id;
        const target = pendingAgentAuth.get(promptMsgId);
        
        if (!target) {
            try { await ctx.deleteMessage(); } catch(e) {}
            return ctx.answerCbQuery("操作已过期或找不到目标用户");
        }
        
        const isClickerAdmin = await isAdmin(ctx.chat.id, ctx.from.id);
        const isClickerTarget = ctx.from.id === target.userId;

        if (!isClickerAdmin && !isClickerTarget) {
            return ctx.answerCbQuery("❌ 无权限！只有管理员或被授权人可以操作");
        }

        authorizedUsers.set(target.userId, 'agent');
        saveAuth();
        try { await bot.telegram.restrictChatMember(chatId, target.userId, { permissions: { can_send_messages: true, can_send_photos: true, can_send_videos: true, can_send_other_messages: true, can_add_web_page_previews: true, can_invite_users: true } }); } catch (e) {}
        
        try { await ctx.deleteMessage(); } catch(e) {}
        
        if (data === 'agent_land') {
            await ctx.reply(`✅ 已授权中介\n🛣️ 路上只要是换车的请都使用 /zjkh\n把链接发给你的兄弟，让他拍照\n（温馨提示：链接可以一直使用）`);
        } else {
            await ctx.reply(`✈️ 已授权中介（飞机出行）\n上车前要拍照到此群核对\n请务必在登机前和上车核对时使用  /zjkh\n拍照上传当前位置和图片！\n汇盈国际 - 安全第一`);
        }
        
        pendingAgentAuth.delete(promptMsgId);
        return ctx.answerCbQuery("授权完成");
    }

    if (data.startsWith('zl_') || data.startsWith('zj_')) {
        const [type, key] = data.split('_');
        const links = type === 'zl' ? ZL_LINKS : ZJ_LINKS;
        const link = links[key];
        const stored = zlMessages.get(ctx.callbackQuery.message.message_id);

        if (stored) {
            const userInfo = `TG名字: ${stored.targetFirstName}\nID: ${stored.targetUserId}`;
            const instr = type === 'zl' ? t(chatId, 'zl_instr') : t(chatId, 'zj_instr');
            const initMsg = t(chatId, 'zl_msg');

            await ctx.editMessageText(`${initMsg}\n\n${userInfo}\n\n申请链接：<a href="${link}">${key}链接</a>\n复制链接: ${link}\n\n${instr}`, { parse_mode: 'HTML' });
        }
    }
    try { await ctx.answerCbQuery(); } catch(e){}
});

bot.on('text', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    const userId = ctx.from.id;
    const role = authorizedUsers.get(userId);
    const isAdminUser = await isAdmin(ctx.chat.id, userId);
    const text = ctx.message.text.trim(); 

    if (!isAdminUser && role !== 'user' && role !== 'agent') {
        try { await ctx.deleteMessage(); } catch(e){}
        const chatId = ctx.chat.id;
        const name = ctx.from.first_name;
        const username = ctx.from.username ? `@${ctx.from.username}` : '';
        const msg = t(chatId, 'unauth_msg', { name, username });
        const warning = await ctx.reply(msg);
        warningMessages.set(warning.message_id, { userId: ctx.from.id, userName: ctx.from.first_name });
        return;
    }

    if (isAdminUser && ctx.message.reply_to_message) {
        const replyId = ctx.message.reply_to_message.message_id;
        const chatId = ctx.chat.id;

        let target = warningMessages.get(replyId) || 
                     unauthorizedMessages.get(replyId) || 
                     { userId: ctx.message.reply_to_message.from.id, userName: ctx.message.reply_to_message.from.first_name };
        
        // 打款指令 (打款 100)
        if (text.startsWith('打款 ')) {
            const amount = text.split(' ')[1]; 
            if (amount) {
                const targetUserId = ctx.message.reply_to_message.from.id;
                const targetUser = ctx.message.reply_to_message.from;
                const targetUserName = ctx.message.reply_to_message.from.first_name;
                const adminName = ctx.from.first_name;

                pendingPayouts.set(targetUserId, { 
                    amount: amount, 
                    adminName: adminName,
                    adminId: ctx.from.id,
                    targetUser: targetUser,
                    chatId: ctx.chat.id 
                });

                const replyText = `💸 <b>已收到打款通知</b>\n\n` +
                                  `金额：<b>${amount}</b>\n` +
                                  `操作人：<a href="tg://user?id=${ctx.from.id}">${adminName}</a>\n\n` +
                                  `<b>👤 收款用户信息：</b>\n` +
                                  `TG 名字：${targetUser.first_name}${targetUser.last_name ? ' ' + targetUser.last_name : ''}\n` +
                                  `TG 用户名：${targetUser.username ? '@' + targetUser.username : '无'}\n` +
                                  `TG ID：<code>${targetUser.id}</code>\n\n` +
                                  `@${targetUserName} 请回复此消息并发送你的 <b>微信</b> 或 <b>支付宝</b> 收款码图片！`;
                
                await ctx.reply(replyText, { 
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "❌ 取消打款", callback_data: `cancel_pay_${targetUserId}` }] 
                        ]
                    }
                });
            }
        } 
        else if (text === '中介授权') {
            if (!target) return;
            const promptMsg = await ctx.reply("请选择你兄弟的出行方式：", {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🛣️ 走小路", callback_data: "agent_land" }],
                        [{ text: "✈️ 坐飞机", callback_data: "agent_flight" }]
                    ]
                }
            });
            pendingAgentAuth.set(promptMsg.message_id, target);
            warningMessages.delete(replyId);
        } 
        else if (text === '授权') {
            if (!target) return;
            authorizedUsers.set(target.userId, 'user');
            saveAuth();
            try { await bot.telegram.restrictChatMember(chatId, target.userId, { permissions: { can_send_messages: true, can_send_photos: true, can_send_videos: true, can_send_other_messages: true, can_add_web_page_previews: true, can_invite_users: true } }); } catch (e) {}
            await ctx.reply(t(chatId, 'auth_success', { name: target.userName }));
            warningMessages.delete(replyId);
        }
    }
});

const expressApp = express();
expressApp.use(cors({
    origin: 'https://www.huiying888.xyz'
}));
expressApp.use(express.raw({ type: '*/*', limit: '10mb' }));

expressApp.post('/upload', async (req, res) => {
  try {
    const photoBuffer = req.body;
    const { lat, lng, name, uid, time, chatid, token } = req.query;
    if (!chatid) return res.status(400).json({ code: 1, msg: 'No ChatID' });

    const currentToken = getOrRefreshToken(chatid);
    if (!token || token !== currentToken) return res.status(403).json({ code: 1, msg: 'Link Expired / 链接失效' });

    const isTest = (!lat || (parseFloat(lat) === 0 && parseFloat(lng) === 0));
    const locText = isTest ? t(chatid, 'loc_fail') : `${parseFloat(lat).toFixed(6)}, ${parseFloat(lng).toFixed(6)}`;
    const map1 = t(chatid, 'map_amap');
    const map2 = t(chatid, 'map_google');

    const userLink = (uid && uid !== '0') ? `<a href="tg://user?id=${uid}">${name}</a>` : name;

    const caption = `<b>[${t(chatid, 'upload_title')}]</b>\n` +
                    `👤用户: ${userLink} (ID:${uid})\n` +
                    `⏰时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n` +
                    `📍经纬度: ${locText}\n` +
                    `🗺️地图: <a href="https://amap.com/dir?destination=${lng},${lat}">${map1}</a> | <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}">${map2}</a>`;

    if (GROUP_CHAT_IDS.includes(Number(chatid))) {
      await sendToChat(Number(chatid), photoBuffer, caption, lat, lng);
    }
    await sendToChat(BACKUP_GROUP_ID, photoBuffer, `[Back] ${caption}`, lat, lng);
    res.json({ code: 0, msg: 'success' });
  } catch (err) { res.status(500).json({ code: 1, msg: err.message }); }
});

expressApp.get('/', (req, res) => res.send('Bot OK'));
const PORT = process.env.PORT || 10000;

expressApp.listen(PORT, () => {
    // ✅ 保留启动日志
    console.log(`Server running on port ${PORT}`);

    const startBot = async () => {
        try {
            await bot.launch({ dropPendingUpdates: true });
            // ✅ 保留启动成功日志
            console.log('Telegram Bot Started Successfully!');
        } catch (err) {
            if (err.response && err.response.error_code === 409) {
                // ✅ 保留 409 冲突重试日志 (启动相关)
                console.log('Conflict 409: Previous bot instance is still active. Waiting 5s for it to close...');
                setTimeout(startBot, 5000);
            } else {
                // ✅ 保留严重错误日志
                console.error('Bot 启动失败:', err);
            }
        }
    };
    startBot();
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));


