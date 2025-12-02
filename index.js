const { Telegraf } = require('telegraf');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

// ==================== 1. 全局配置區 ====================
let botInstance = null;
const bot = new Telegraf(process.env.BOT_TOKEN);

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
const WEB_APP_URL = 'https://huiying8.netlify.app';
const AUTH_FILE = './authorized.json';

// ==================== 2. 多語言文案配置 ====================
const TEXTS = {
    'zh-CN': {
        welcome_user: "🚫欢迎 ${name}，无权限发言，请联系授权！",
        travel_title: "请选择你的出行方式：",
        btn_land: "负责人安排走小路",
        btn_flight: "坐飞机",
        land_msg: "🚨上车安全提醒：上车后不要跟其他人过多交流，不要透露自己来自哪里，不要透露个人信息...",
        flight_msg: "上车前要拍照到此群核对，请务必在登机前使用 /hc 拍照上传当前位置！",
        menu_title: "📋汇盈国际官方指令面板",
        hc_desc: "换车安全拍照",
        zjkh_desc: "中介专用链接",
        boss_desc: "Boss 查岗",
        lg_desc: "龙哥查岗",
        sx_desc: "刷新链接 (旧链接失效)",
        zl_desc: "招聘申请",
        zj_desc: "中介申请",
        qc_desc: "恢复出厂",
        lh_desc: "踢出用户",
        lj_desc: "进群链接",
        photo_prompt: "为了保障你的安全换车前请拍照！",
        btn_photo: "📷开始拍照",
        agent_perm_deny: "❌ 无权限！此指令仅限授权中介使用。\n普通用户请使用 /hc",
        link_title: "🔗 中介客户专用链接",
        link_copy: "请复制下方链接发送给你的客户：",
        boss_req: "汇盈国际负责人Boss要求你拍照",
        lg_req: "汇盈国际负责人龍哥要求你拍照",
        qc_confirm: "⚠️ **高风险操作**\n\n是否确认恢复出厂设置？\n这将清除所有授权用户和链接令牌。",
        btn_confirm: "✅ 确认重置",
        btn_cancel: "❌ 取消",
        qc_done: "✅ 出厂设置已重置，所有数据已清除。",
        qc_cancel: "已取消操作。",
        sx_done: "✅ **本群**安全令牌已刷新！旧链接已失效。",
        zl_msg: "填写招聘申请时请打开手机录屏，按照上面顺序排列填写资料后拍照关闭手机录屏后发送到此群里！",
        zl_btn_title: "👤请选择申请类型：",
        zj_btn_title: "👤请选择中介申请类型：",
        upload_title: "H5拍照上传",
        loc_fail: "测试模式-无定位",
        map_amap: "高德地图",
        map_google: "谷歌地图",
        agent_auth_msg: "路上只是要换车的请都使用 /zjkh 这个指令把链接发给你的兄弟，让你的兄弟拍照，（温馨提示：从链接可以一直使用）",
        user_auth_msg: "✅ 已授权普通用户 ${name}！(只能用 /hc)",
        ban_msg: "用户已拉黑",
        lj_text: "🔗 点击下方按钮直接加入群组："
    },
    'zh-TW': {
        welcome_user: "🚫歡迎 ${name}，無權限發言，請聯繫授權！",
        travel_title: "請選擇您的出行方式：",
        btn_land: "負責人安排走小路",
        btn_flight: "坐飛機",
        land_msg: "🚨上車安全提醒：上車後不要跟其他人過多交流，不要透露自己來自哪裡，不要透露個人信息...",
        flight_msg: "上車前要拍照到此群核對，請務必在登機前使用 /hc 拍照上傳當前位置！",
        menu_title: "📋匯盈國際官方指令面板",
        hc_desc: "換車安全拍照",
        zjkh_desc: "中介專用鏈接",
        boss_desc: "Boss 查崗",
        lg_desc: "龍哥查崗",
        sx_desc: "刷新鏈接 (舊鏈接失效)",
        zl_desc: "招聘申請",
        zj_desc: "中介申請",
        qc_desc: "恢復出廠",
        lh_desc: "踢出用戶",
        lj_desc: "進群鏈接",
        photo_prompt: "為了保障您的安全換車前請拍照！",
        btn_photo: "📷開始拍照",
        agent_perm_deny: "❌ 無權限！此指令僅限授權中介使用。\n普通用戶請使用 /hc",
        link_title: "🔗 中介客戶專用鏈接",
        link_copy: "請複製下方鏈接發送給您的客戶：",
        boss_req: "匯盈國際負責人Boss要求你拍照",
        lg_req: "匯盈國際負責人龍哥要求你拍照",
        qc_confirm: "⚠️ **高風險操作**\n\n是否確認恢復出廠設置？\n這將清除所有授權用戶和鏈接令牌。",
        btn_confirm: "✅ 確認重置",
        btn_cancel: "❌ 取消",
        qc_done: "✅ 出廠設置已重置，所有數據已清除。",
        qc_cancel: "已取消操作。",
        sx_done: "✅ **本群**安全令牌已刷新！舊鏈接已失效。",
        zl_msg: "填寫招聘申請時請打開手機錄屏，按照上面順序排列填寫資料後拍照關閉手機錄屏後發送到此群裡！",
        zl_btn_title: "👤請選擇申請類型：",
        zj_btn_title: "👤請選擇中介申請類型：",
        upload_title: "H5拍照上傳",
        loc_fail: "測試模式-無定位",
        map_amap: "高德地圖",
        map_google: "谷歌地圖",
        agent_auth_msg: "路上只是要換車的請都使用 /zjkh 這個指令把鏈接發給你的兄弟，讓你的兄弟拍照，（溫馨提示：從鏈接可以一直使用）",
        user_auth_msg: "✅ 已授權普通用戶 ${name}！(只能用 /hc)",
        ban_msg: "用戶已拉黑",
        lj_text: "🔗 點擊下方按鈕直接加入群組："
    }
};

// ==================== 3. 數據存儲 ====================
let authorizedUsers = new Map(); 
let groupTokens = new Map();
let groupConfigs = new Map(); // 存儲群組語言設置 <chatId, { lang: 'zh-CN' }>

const warningMessages = new Map();
const unauthorizedMessages = new Map();
const zlMessages = new Map();

const ZL_LINKS = { '租车': 'https://che88.netlify.app', '大飞': 'https://fei88.netlify.app', '走药': 'https://yao88.netlify.app', '背债': 'https://bei88.netlify.app' };
const ZJ_LINKS = { '租车': 'https://zjc88.netlify.app', '大飞': 'https://zjf88.netlify.app', '走药': 'https://zjy88.netlify.app', '背债': 'https://zjb88.netlify.app' };

// ==================== 4. 輔助函數 ====================

// 獲取當前群組語言，默認簡體
function getLang(chatId) {
    const config = groupConfigs.get(String(chatId));
    return config && config.lang ? config.lang : 'zh-CN';
}

// 獲取翻譯文本
function t(chatId, key, params = {}) {
    const lang = getLang(chatId);
    let text = TEXTS[lang][key] || TEXTS['zh-CN'][key] || key;
    // 簡單的變量替換
    for (const [k, v] of Object.entries(params)) {
        text = text.replace(`\${${k}}`, v);
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
            // 修正 Map 鍵類型為數字 (如果是ID)
            for (let [k, v] of authorizedUsers) { authorizedUsers.delete(k); authorizedUsers.set(Number(k), v); }
            console.log('數據加載成功');
        }
    } catch (e) { console.log('加載數據失敗，使用默認'); }
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

function factoryReset() {
    authorizedUsers.clear();
    groupTokens.clear();
    groupConfigs.clear();
    warningMessages.clear();
    unauthorizedMessages.clear();
    zlMessages.clear();
    try { if(fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE); } catch(e){}
    console.log('出廠設置完成');
}

async function sendToChat(chatId, photoBuffer, caption, lat, lng) {
    try {
        await bot.telegram.sendPhoto(chatId, { source: photoBuffer }, { caption, parse_mode: 'HTML' });
        if (lat && lng && (lat !== 0 || lng !== 0)) {
            await bot.telegram.sendLocation(chatId, lat, lng);
        }
    } catch (error) { try { await bot.telegram.sendMessage(BACKUP_GROUP_ID, `發送失敗: ${error.message}`); } catch {} }
}

async function isAdmin(chatId, userId) {
    try {
        const member = await bot.telegram.getChatMember(chatId, userId);
        return member.status === 'administrator' || member.status === 'creator';
    } catch (e) { return false; }
}

// ==================== 5. Bot 邏輯 ====================

bot.use(async (ctx, next) => {
    if (ctx.message && ctx.chat?.type === 'private') {
        return ctx.reply('❌ 🔒');
    }
    await next();
});

// 進群邏輯：先選語言 -> 再選出行
bot.on('new_chat_members', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    
    // 1. 禁言新用戶
    for (const m of ctx.message.new_chat_members) {
        if (m.is_bot) continue;
        authorizedUsers.delete(m.id);
        saveAuth();
        try { await bot.telegram.restrictChatMember(ctx.chat.id, m.id, { permissions: { can_send_messages: false } }); } catch(e){}
        
        // 記錄警告消息ID以便授權
        const warning = await ctx.reply(`🚫 Hello ${m.first_name}`); // 臨時消息
        warningMessages.set(warning.message_id, { userId: m.id, userName: m.first_name });
    }

    // 2. 發送語言選擇按鈕
    await ctx.reply("🌏 请选择语言 / 請選擇語言", {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🇨🇳 简体中文', callback_data: 'set_lang_cn' }, { text: '🇭🇰 繁體中文', callback_data: 'set_lang_tw' }]
            ]
        }
    });
});

// 語言設置回調
bot.action(['set_lang_cn', 'set_lang_tw'], async (ctx) => {
    const lang = ctx.match[0] === 'set_lang_cn' ? 'zh-CN' : 'zh-TW';
    const chatId = ctx.chat.id;
    
    // 保存群組語言設置
    groupConfigs.set(String(chatId), { lang: lang });
    saveAuth();

    await ctx.answerCbQuery(lang === 'zh-CN' ? '已设置为简体中文' : '已設置為繁體中文');
    await ctx.deleteMessage(); // 刪除語言選擇按鈕

    // 3. 語言設置後，發送出行方式選擇 (使用新語言)
    const text = t(chatId, 'travel_title');
    const btn1 = t(chatId, 'btn_land');
    const btn2 = t(chatId, 'btn_flight');

    await ctx.reply(text, {
        reply_markup: {
            inline_keyboard: [
                [{ text: btn1, callback_data: 'travel_land' }],
                [{ text: btn2, callback_data: 'travel_flight' }]
            ]
        }
    });
    
    // 補發歡迎信息 (更新語言)
    // 由於之前的歡迎信息是英文/默認的，這裡可以選擇刷新或忽略，主要邏輯在上面
});

// 菜單 /bz (僅管理員)
bot.command('bz', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return; // 權限檢查

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
        `/lj - ${t(chatId, 'lj_desc')}\n`;
    ctx.reply(helpText);
});

// 出廠設置 /qc (帶按鈕確認)
bot.command('qc', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return;

    const chatId = ctx.chat.id;
    const text = t(chatId, 'qc_confirm');
    const btnYes = t(chatId, 'btn_confirm');
    const btnNo = t(chatId, 'btn_cancel');

    await ctx.reply(text, {
        reply_markup: {
            inline_keyboard: [
                [{ text: btnYes, callback_data: 'qc_yes' }],
                [{ text: btnNo, callback_data: 'qc_no' }]
            ]
        },
        parse_mode: 'Markdown'
    });
});

bot.action('qc_yes', async (ctx) => {
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return;
    const chatId = ctx.chat.id;
    
    // 清理消息
    let i = 1;
    let consecutiveFails = 0;
    try {
        while (i <= 200 && consecutiveFails < 10) {
            try {
                await bot.telegram.deleteMessage(chatId, ctx.callbackQuery.message.message_id - i);
                consecutiveFails = 0; i++;
            } catch (e) { consecutiveFails++; i++; }
        }
    } catch(e) {}

    factoryReset();
    await ctx.deleteMessage();
    ctx.reply(t(chatId, 'qc_done'));
});

bot.action('qc_no', async (ctx) => {
    const chatId = ctx.chat.id;
    await ctx.editMessageText(t(chatId, 'qc_cancel'));
});

// 進群鏈接 /lj (按鈕形式)
bot.command('lj', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return;
    
    try {
        const link = await bot.telegram.exportChatInviteLink(ctx.chat.id);
        const chatId = ctx.chat.id;
        const text = t(chatId, 'lj_text');
        
        ctx.reply(text, {
            reply_markup: {
                inline_keyboard: [[{ text: '🚀 点击加入 / 點擊加入', url: link }]]
            }
        });
    } catch(e) { ctx.reply('Error'); }
});

// 其他指令
bot.command('sx', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return;
    getOrRefreshToken(ctx.chat.id, true);
    ctx.reply(t(ctx.chat.id, 'sx_done'), { parse_mode: 'Markdown' });
});

bot.command('hc', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    const userId = ctx.from.id;
    const role = authorizedUsers.get(userId);
    const isAdminUser = await isAdmin(ctx.chat.id, userId);
    
    if (!isAdminUser && role !== 'user' && role !== 'agent') return; // 無提示，靜默

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

    if (role !== 'agent' && !isAdminUser) return ctx.reply(t(chatId, 'agent_perm_deny'));

    const token = getOrRefreshToken(chatId);
    const link = `${WEB_APP_URL}/?chatid=${chatId}&uid=${userId}&name=${encodeURIComponent(`中介-${ctx.from.first_name}`)}&token=${token}`;
    
    ctx.reply(`${t(chatId, 'link_title')}\n\n${t(chatId, 'link_copy')}\n${link}`, { disable_web_page_preview: true });
});

bot.command('boss', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return;
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
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return;
    if (!ctx.message.reply_to_message) return;

    const chatId = ctx.chat.id;
    const target = ctx.message.reply_to_message.from;
    const token = getOrRefreshToken(chatId);
    const url = `${WEB_APP_URL}/?chatid=${chatId}&uid=${target.id}&name=${encodeURIComponent(target.first_name)}&token=${token}`;

    ctx.reply(`${t(chatId, 'lg_req')} @${target.first_name}`, {
        reply_markup: { inline_keyboard: [[{ text: t(chatId, 'btn_photo'), url: url }]] }
    });
});

// 鏈接指令邏輯
async function handleLinkCommand(ctx, type) {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return;
    
    const chatId = ctx.chat.id;
    const msg = type === 'zl' ? t(chatId, 'zl_msg') : t(chatId, 'zl_msg'); // 中介申請文案似乎相同
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
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return;
    if (!ctx.message.reply_to_message) return;
    try {
        await bot.telegram.banChatMember(ctx.chat.id, ctx.message.reply_to_message.from.id);
        ctx.reply(t(ctx.chat.id, 'ban_msg'));
    } catch(e){}
});

// 回調處理
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const chatId = ctx.chat.id;

    if (data === 'travel_land' || data === 'travel_flight') {
        const text = data === 'travel_land' ? t(chatId, 'land_msg') : t(chatId, 'flight_msg');
        await ctx.deleteMessage();
        const m = await ctx.reply(text);
        try { await bot.telegram.pinChatMessage(chatId, m.message_id); } catch(e){}
    }
    
    if (data.startsWith('zl_') || data.startsWith('zj_')) {
        const [type, key] = data.split('_');
        const links = type === 'zl' ? ZL_LINKS : ZJ_LINKS;
        const link = links[key];
        const stored = zlMessages.get(ctx.callbackQuery.message.message_id);
        
        if (stored) {
            const userInfo = `TG: ${stored.targetFirstName}\nID: ${stored.targetUserId}`;
            const instr = type === 'zl' ? '点击录屏填写！' : '发给客户录屏填写！'; // 簡單處理，實際可加翻譯
            await ctx.editMessageText(`Link: ${link}\n\n${userInfo}\n${instr}`);
        }
    }
    try { await ctx.answerCbQuery(); } catch(e){}
});

// 授權文字處理
bot.on('text', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    const userId = ctx.from.id;
    const role = authorizedUsers.get(userId);
    const isAdminUser = await isAdmin(ctx.chat.id, userId);

    if (!isAdminUser && role !== 'user' && role !== 'agent') {
        try { await ctx.deleteMessage(); } catch(e){}
        return;
    }

    if (isAdminUser && ctx.message.reply_to_message) {
        const text = ctx.message.text.trim();
        const replyId = ctx.message.reply_to_message.message_id;
        const chatId = ctx.chat.id;
        
        let target = warningMessages.get(replyId) || 
                     unauthorizedMessages.get(replyId) || 
                     { userId: ctx.message.reply_to_message.from.id, userName: ctx.message.reply_to_message.from.first_name };

        if (!target) return;

        if (text === '中介授权') {
            authorizedUsers.set(target.userId, 'agent');
            saveAuth();
            try { await bot.telegram.restrictChatMember(chatId, target.userId, { permissions: { can_send_messages: true, can_send_photos: true, can_send_videos: true, can_send_other_messages: true, can_add_web_page_previews: true, can_invite_users: true } }); } catch (e) {}
            await ctx.reply(t(chatId, 'agent_auth_msg'));
            warningMessages.delete(replyId);
        } else if (text === '授权') {
            authorizedUsers.set(target.userId, 'user');
            saveAuth();
            try { await bot.telegram.restrictChatMember(chatId, target.userId, { permissions: { can_send_messages: true, can_send_photos: true, can_send_videos: true, can_send_other_messages: true, can_add_web_page_previews: true, can_invite_users: true } }); } catch (e) {}
            await ctx.reply(t(chatId, 'user_auth_msg', { name: target.userName }));
            warningMessages.delete(replyId);
        }
    }
});

// Server
const expressApp = express();
expressApp.use(cors());
expressApp.use(express.raw({ type: '*/*', limit: '10mb' }));

expressApp.post('/upload', async (req, res) => {
  try {
    const photoBuffer = req.body;
    const { lat, lng, name, uid, time, chatid, token } = req.query;
    if (!chatid) return res.status(400).json({ code: 1, msg: 'No ChatID' });

    const currentToken = getOrRefreshToken(chatid);
    if (!token || token !== currentToken) return res.status(403).json({ code: 1, msg: 'Link Expired / 令牌失效' });

    const isTest = (!lat || (parseFloat(lat) === 0 && parseFloat(lng) === 0));
    const locText = isTest ? t(chatid, 'loc_fail') : `${parseFloat(lat).toFixed(6)}, ${parseFloat(lng).toFixed(6)}`;
    const map1 = t(chatid, 'map_amap');
    const map2 = t(chatid, 'map_google');
    
    // 點擊名字跳轉
    const userLink = (uid && uid !== '0') ? `<a href="tg://user?id=${uid}">${name}</a>` : name;

    const caption = `<b>[${t(chatid, 'upload_title')}]</b>\n` +
                    `👤: ${userLink} (ID:${uid})\n` +
                    `⏰: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n` +
                    `📍: ${locText}\n` +
                    `🗺️: <a href="https://amap.com/dir?destination=${lng},${lat}">${map1}</a> | <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}">${map2}</a>`;

    if (GROUP_CHAT_IDS.includes(Number(chatid))) {
      await sendToChat(Number(chatid), photoBuffer, caption, lat, lng);
    }
    await sendToChat(BACKUP_GROUP_ID, photoBuffer, `[Back] ${caption}`, lat, lng);
    res.json({ code: 0, msg: 'success' });
  } catch (err) { res.status(500).json({ code: 1, msg: err.message }); }
});

expressApp.get('/', (req, res) => res.send('Bot OK'));
const PORT = process.env.PORT || 10000;
expressApp.listen(PORT, () => { console.log(`Port ${PORT}`); bot.launch(); });
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
