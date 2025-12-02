const { Telegraf } = require('telegraf');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto'); // 用于生成随机令牌

// ==================== 1. 全局配置区 ====================
let botInstance = null;
const bot = new Telegraf(process.env.BOT_TOKEN);

// 允许运行机器人的群组 ID 列表
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
const WEB_APP_URL = 'https://huiying8.netlify.app'; // 你的前端网址
const AUTH_FILE = './authorized.json';

// ==================== 2. 内存数据库与状态 ====================

// 授权用户列表 (存储结构: userId -> roleString)
// role: 'user' (普通用户), 'agent' (中介), 'banned' (拉黑)
let authorizedUsers = new Map(); 

// 全局安全令牌 (用于控制链接失效)
let sessionToken = ""; 

// 临时消息记录
const warningMessages = new Map();
const unauthorizedMessages = new Map();
const zlMessages = new Map();

// 链接配置
const ZL_LINKS = {
  '租车': 'https://che88.netlify.app',
  '大飞': 'https://fei88.netlify.app',
  '走药': 'https://yao88.netlify.app',
  '背债': 'https://bei88.netlify.app'
};
const ZJ_LINKS = {
  '租车': 'https://zjc88.netlify.app',
  '大飞': 'https://zjf88.netlify.app',
  '走药': 'https://zjy88.netlify.app',
  '背债': 'https://zjb88.netlify.app'
};

// ==================== 3. 核心工具函数 ====================

// 生成新的安全令牌
function refreshSessionToken() {
    sessionToken = crypto.randomBytes(8).toString('hex');
    console.log('安全令牌已刷新:', sessionToken);
    saveAuth(); // 保存新令牌
    return sessionToken;
}

// 加载数据
function loadAuth() {
    try {
        if (fs.existsSync(AUTH_FILE)) {
            const data = fs.readFileSync(AUTH_FILE, 'utf8');
            const parsed = JSON.parse(data);
            
            // 恢复用户授权
            authorizedUsers.clear();
            if (parsed.users) {
                for (let [key, value] of Object.entries(parsed.users)) {
                    authorizedUsers.set(Number(key), value);
                }
            }
            
            // 恢复令牌 (如果没有则生成新的)
            sessionToken = parsed.token || crypto.randomBytes(8).toString('hex');
            
            console.log(`数据加载成功: ${authorizedUsers.size} 用户, 令牌: ${sessionToken}`);
        } else {
            refreshSessionToken();
        }
    } catch (e) { 
        console.log('加载失败，重置数据');
        refreshSessionToken();
    }
}

// 保存数据
function saveAuth() {
    try {
        const data = {
            users: Object.fromEntries(authorizedUsers),
            token: sessionToken
        };
        fs.writeFileSync(AUTH_FILE, JSON.stringify(data));
    } catch (e) { console.error('保存失败', e); }
}

// 初始化
loadAuth();

// 出厂设置 (同时也刷新令牌)
function factoryReset() {
    authorizedUsers.clear();
    warningMessages.clear();
    unauthorizedMessages.clear();
    zlMessages.clear();
    
    // 刷新令牌，让旧链接失效
    refreshSessionToken();
    
    try { if(fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE); } catch(e){}
    console.log('出厂设置完成，令牌已重置');
}

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
        console.error(`发送失败 ${chatId}:`, error);
        try { await bot.telegram.sendMessage(BACKUP_GROUP_ID, `⚠️ 错误报告: ${error.message}`); } catch {}
    }
}

async function isAdmin(chatId, userId) {
    try {
        const member = await bot.telegram.getChatMember(chatId, userId);
        return member.status === 'administrator' || member.status === 'creator';
    } catch (e) { return false; }
}

// ==================== 4. Bot 中间件与指令 ====================

// 私聊保护
bot.use(async (ctx, next) => {
    if (ctx.message && ctx.chat?.type === 'private') {
        await ctx.reply(`❌ 🔒本机器人只供汇盈国际内部使用。`);
        return;
    }
    await next();
});

// 菜单
bot.command('bz', (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    const helpText = `📋汇盈国际官方指令\n\n` +
        `/hc - 换车安全拍照 (普通用户/中介)\n` +
        `/zjkh - 中介专用开户/换车链接 (仅中介)\n` +
        `/boss - Boss 查岗拍照\n` +
        `/lg - 龙哥查岗拍照\n` +
        `/sx - 刷新链接 (让之前所有链接失效)\n` +
        `/zl - 招聘申请\n` +
        `/zj - 中介申请\n` +
        `/qc - 恢复出厂\n` +
        `/lh - 踢人\n` +
        `/lj - 进群链接\n`;
    ctx.reply(helpText);
});

// 1. 刷新链接指令 (新增 - 让所有旧链接失效)
bot.command('sx', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return ctx.reply('无权限');

    refreshSessionToken();
    ctx.reply('✅ 安全令牌已刷新！\n\n⚠️ 注意：之前发出的所有拍照链接现在都已失效（无法上传）。\n请使用指令重新生成新链接。');
});

// 2. 换车指令 (普通用户 + 中介)
bot.command('hc', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const userId = ctx.from.id;
    
    // 检查权限 (存在且不是false)
    const role = authorizedUsers.get(userId);
    const isAuthorized = role === 'user' || role === 'agent';
    const isAdminUser = await isAdmin(chatId, userId);

    if (!isAuthorized && !isAdminUser) return ctx.reply('无权限，请先联系管理授权');

    // 链接带上 token
    const webAppUrl = `${WEB_APP_URL}/?chatid=${chatId}&uid=${userId}&name=${encodeURIComponent(ctx.from.first_name)}&token=${sessionToken}`;

    await ctx.reply('为了保障你的安全换车前请拍照！', {
        reply_markup: {
            inline_keyboard: [[ { text: '📷开始拍照', url: webAppUrl } ]]
        }
    });
});

// 3. 中介客户专用指令 (仅中介)
bot.command('zjkh', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    
    const userId = ctx.from.id;
    const role = authorizedUsers.get(userId);
    const isAdminUser = await isAdmin(chatId, userId);

    // 只有管理员 或者 角色是 'agent' 的可以使用
    if (role !== 'agent' && !isAdminUser) {
        return ctx.reply('❌ 无权限！此指令仅限授权中介使用。\n普通用户请使用 /hc');
    }

    const agentName = ctx.from.first_name;
    // 标记名字为 "中介客户-XXX"
    const clientName = `中介客户-${agentName}`;
    
    // 生成带 token 的链接
    const clientLink = `${WEB_APP_URL}/?chatid=${chatId}&uid=${userId}&name=${encodeURIComponent(clientName)}&token=${sessionToken}`;

    const msg = `🔗 **中介客户专用链接**\n\n` +
                `请复制下方链接发送给你的兄弟/客户：\n` +
                `${clientLink}`;
    
    ctx.reply(msg, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

// 4. Boss 查岗
bot.command('boss', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    if (!await isAdmin(chatId, ctx.from.id)) return;

    let targetUser, targetUserId;
    if (ctx.message.reply_to_message) {
        targetUser = ctx.message.reply_to_message.from.first_name;
        targetUserId = ctx.message.reply_to_message.from.id;
    } else {
        return ctx.reply('请回复用户消息');
    }

    const webAppUrl = `${WEB_APP_URL}/?chatid=${chatId}&uid=${targetUserId}&name=${encodeURIComponent(targetUser)}&token=${sessionToken}`;

    await ctx.reply(`汇盈国际负责人Boss要求你拍照 @${targetUser}`, {
        reply_markup: { inline_keyboard: [[ { text: '📷点击拍照', url: webAppUrl } ]] }
    });
});

// 5. 龙哥查岗
bot.command('lg', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    if (!await isAdmin(chatId, ctx.from.id)) return;

    let targetUser, targetUserId;
    if (ctx.message.reply_to_message) {
        targetUser = ctx.message.reply_to_message.from.first_name;
        targetUserId = ctx.message.reply_to_message.from.id;
    } else {
        return ctx.reply('请回复用户消息');
    }

    const webAppUrl = `${WEB_APP_URL}/?chatid=${chatId}&uid=${targetUserId}&name=${encodeURIComponent(targetUser)}&token=${sessionToken}`;

    await ctx.reply(`汇盈国际负责人龍哥要求你拍照 @${targetUser}`, {
        reply_markup: { inline_keyboard: [[ { text: '📷点击拍照', url: webAppUrl } ]] }
    });
});

// 6. 出厂设置 (同时刷新 Token)
bot.command('qc', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return;
    
    // 清屏
    let startMessageId = ctx.message.message_id;
    if (ctx.message.reply_to_message) startMessageId = ctx.message.reply_to_message.message_id;
    let i = 1;
    let consecutiveFails = 0;
    ctx.reply('正在清理消息...');
    while (i <= 300 && consecutiveFails < 10) {
        try {
            await bot.telegram.deleteMessage(ctx.chat.id, startMessageId - i);
            consecutiveFails = 0;
            i++;
            await new Promise(r => setTimeout(r, 40)); 
        } catch (e) { consecutiveFails++; i++; }
    }
    
    factoryReset(); // 这里面会刷新 token
    ctx.reply('✅ 出厂设置已重置，旧链接已全部失效。');
});

// 7. 招聘链接指令 /zl (独立展开)
bot.command('zl', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) return ctx.reply('❌ 🔒无权限！');

    let targetUserId, targetFirstName, targetUsername;
    const replyTo = ctx.message.reply_to_message;

    if (replyTo) {
        targetUserId = replyTo.from.id;
        targetFirstName = replyTo.from.first_name || '未知';
        targetUsername = replyTo.from.username ? `@${replyTo.from.username}` : '无用户名';
    } else {
        const match = ctx.message.text.match(/@(\w+)/);
        if (match) {
            try {
                // 尝试从群成员中获取 (仅限已缓存的用户)
                targetUserId = 0; // 无法直接获取ID，标记为0等待处理
                targetFirstName = '未知';
                targetUsername = `@${match[1]}`;
            } catch (e) { return ctx.reply('用户不存在'); }
        } else {
            return ctx.reply('请回复用户消息或输入 /zl @用户名');
        }
    }

    try {
        const replyMsg = await ctx.reply(`填写招聘申请时请打开手机录屏，按照上面顺序排列填写资料后拍照关闭手机录屏后发送到此群里！\n\n👤请选择申请类型：`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '租车', callback_data: 'zl_租车' }, { text: '大飞', callback_data: 'zl_大飞' }],
                    [{ text: '走药', callback_data: 'zl_走药' }, { text: '背债', callback_data: 'zl_背债' }]
                ]
            }
        });
        zlMessages.set(replyMsg.message_id, { targetUserId, targetFirstName, targetUsername, commandType: 'zl', chatId });
    } catch (error) { ctx.reply('指令执行失败'); }
});

// 8. 中介申请指令 /zj (独立展开)
bot.command('zj', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) return ctx.reply('❌ 🔒无权限！');

    let targetUserId, targetFirstName, targetUsername;
    const replyTo = ctx.message.reply_to_message;
    
    if (replyTo) {
        targetUserId = replyTo.from.id;
        targetFirstName = replyTo.from.first_name;
        targetUsername = replyTo.from.username;
    } else {
        return ctx.reply('请回复用户消息');
    }

    try {
        const replyMsg = await ctx.reply(`填写招聘申请时请打开手机录屏，按照上面顺序排列填写资料后拍照关闭手机录屏后发送到此群里！\n\n👤请选择中介申请类型：`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '租车', callback_data: 'zj_租车' }, { text: '大飞', callback_data: 'zj_大飞' }],
                    [{ text: '走药', callback_data: 'zj_走药' }, { text: '背债', callback_data: 'zj_背债' }]
                ]
            }
        });
        zlMessages.set(replyMsg.message_id, { targetUserId, targetFirstName, targetUsername, commandType: 'zj', chatId });
    } catch (error) { ctx.reply('失败'); }
});

// 9. 踢人 /lh
bot.command('lh', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return;
    if (!ctx.message.reply_to_message) return ctx.reply('请回复消息');
    try {
        await bot.telegram.banChatMember(ctx.chat.id, ctx.message.reply_to_message.from.id);
        ctx.reply('已拉黑');
    } catch(e) { ctx.reply('失败'); }
});

// 10. 进群链接 /lj
bot.command('lj', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return;
    try {
        const link = await bot.telegram.exportChatInviteLink(ctx.chat.id);
        ctx.reply(`群链接: ${link}`);
    } catch(e) { ctx.reply('生成失败'); }
});

// ==================== 5. 事件处理 (回调、进群、文本) ====================

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    
    if (data.startsWith('zl_') || data.startsWith('zj_')) {
        const [type, key] = data.split('_');
        const links = type === 'zl' ? ZL_LINKS : ZJ_LINKS;
        const link = links[key];
        const stored = zlMessages.get(ctx.callbackQuery.message.message_id);
        
        if (stored) {
             const userInfo = `TG名字: ${stored.targetFirstName}\nID: ${stored.targetUserId}`;
             const instruction = type === 'zl' ? '点击上方链接打开浏览器进行填写，填写时记住要录屏填写！填写好了发到此群！' : '发给你的客户让客户打开浏览器进行填写，填写时记住要录屏填写！填写好了发到此群！';
             const initialText = '填写招聘申请时请打开手机录屏，按照上面顺序排列填写资料后拍照关闭手机录屏后发送到此群里！';
             await ctx.editMessageText(`${initialText}\n\n申请链接：<a href="${link}">${key}链接</a>\n复制链接: ${link}\n\n${userInfo}\n\n${instruction}`, { parse_mode: 'HTML' });
        }
    }
    if (data === 'travel_land' || data === 'travel_flight') {
        const text = data === 'travel_land' ? '🚨上车安全提醒...' : '上车前拍照核对...';
        await ctx.deleteMessage();
        const m = await ctx.reply(text);
        try { await bot.telegram.pinChatMessage(ctx.chat.id, m.message_id); } catch(e){}
    }
    ctx.answerCbQuery();
});

bot.on('new_chat_members', async (ctx) => {
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    for (const m of ctx.message.new_chat_members) {
        if(m.is_bot) continue;
        // 新人默认无权限 (role = undefined or false)
        authorizedUsers.delete(m.id); 
        saveAuth();
        try { await bot.telegram.restrictChatMember(ctx.chat.id, m.id, { permissions: { can_send_messages: false } }); } catch(e){}
        const warning = await ctx.reply(`🚫欢迎 ${m.first_name}，无权限发言，请联系授权！`);
        warningMessages.set(warning.message_id, { userId: m.id, userName: m.first_name });
    }
    await ctx.reply(`请选择出行方式：`, {
        reply_markup: { inline_keyboard: [[{ text: `走小路`, callback_data: 'travel_land' }], [{ text: `坐飞机`, callback_data: 'travel_flight' }]] }
    });
});

// === 核心文本处理：鉴权 + 授权逻辑 ===
bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    
    const userId = ctx.from.id;
    const role = authorizedUsers.get(userId); // 'user' | 'agent'
    const isAdminUser = await isAdmin(chatId, userId);

    // 1. 鉴权：如果你不是管理员，也不是授权用户(user)或中介(agent)，则删除消息
    if (!isAdminUser && role !== 'user' && role !== 'agent') {
        try { await ctx.deleteMessage(); } catch(e){}
        return;
    }

    // 2. 管理员授权逻辑
    if (isAdminUser && ctx.message.reply_to_message) {
        const text = ctx.message.text.trim();
        const replyId = ctx.message.reply_to_message.message_id;
        
        // 尝试找到目标用户
        let target = warningMessages.get(replyId) || 
                     unauthorizedMessages.get(replyId) || 
                     { userId: ctx.message.reply_to_message.from.id, userName: ctx.message.reply_to_message.from.first_name };

        if (!target) return;

        // === A. 中介授权 (权限更高，可用 /zjkh) ===
        if (text === '中介授权') {
            authorizedUsers.set(target.userId, 'agent'); // 设为中介
            saveAuth();
            
            // 解禁
            try {
                await bot.telegram.restrictChatMember(chatId, target.userId, {
                    permissions: { can_send_messages: true, can_send_photos: true, can_send_videos: true, can_send_other_messages: true, can_add_web_page_previews: true, can_invite_users: true }
                });
            } catch (e) {}
            
            // 回复指定文案
            await ctx.reply(`路上只是要换车的请都使用 /zjkh 这个指令把链接发给你的兄弟，让你的兄弟拍照，（温馨提示：从链接可以一直使用）`);
            
            // 清理警告
            warningMessages.delete(replyId);
        }
        
        // === B. 普通授权 (权限低，只能用 /hc) ===
        else if (text === '授权') {
            authorizedUsers.set(target.userId, 'user'); // 设为普通用户
            saveAuth();
            
            // 解禁
            try {
                await bot.telegram.restrictChatMember(chatId, target.userId, {
                    permissions: { can_send_messages: true, can_send_photos: true, can_send_videos: true, can_send_other_messages: true, can_add_web_page_previews: true, can_invite_users: true }
                });
            } catch (e) {}

            await ctx.reply(`✅ 已授权普通用户 ${target.userName}！\n(只能使用 /hc，无法使用 /zjkh)`);
            warningMessages.delete(replyId);
        }
    }
});

// ==================== 6. Express 服务器区 ====================
const expressApp = express();
expressApp.use(cors());
expressApp.use(express.raw({ type: '*/*', limit: '10mb' }));

expressApp.post('/upload', async (req, res) => {
  try {
    const photoBuffer = req.body;
    const { lat, lng, name = '用户', uid = '未知', time, chatid, token } = req.query;
    
    // 1. 检查 ChatID
    if (!chatid) return res.status(400).json({ code: 1, msg: '无ChatID' });

    // 2. 检查 Token (实现一键失效的关键)
    if (!token || token !== sessionToken) {
        return res.status(403).json({ code: 1, msg: '⛔️ 链接已失效！\n\n群内已刷新安全令牌，请联系管理员或中介重新获取最新链接。' });
    }

    const latitude = parseFloat(lat) || 0;
    const longitude = parseFloat(lng) || 0;
    const isTestMode = (latitude === 0 && longitude === 0);
    const googleMapUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    const amapUrl = `https://amap.com/dir?destination=${longitude},${latitude}`;
    
    let locationText = isTestMode ? `位置：(测试模式-无定位)` : `位置：${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    
    // 名字加链接
    let userLink = name;
    if (uid && uid !== '未知') {
        userLink = `<a href="tg://user?id=${uid}">${name}</a>`;
    }

    const caption = `<b>[H5拍照上传]</b>\n👤用户：${userLink} (ID:${uid})\n⏰时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n📍${locationText}\n🗺️<a href="${amapUrl}">高德地图</a> | <a href="${googleMapUrl}">谷歌地图</a>`;

    if (GROUP_CHAT_IDS.includes(Number(chatid))) {
      await sendToChat(Number(chatid), photoBuffer, caption, latitude, longitude);
    }
    await sendToChat(BACKUP_GROUP_ID, photoBuffer, `[备份] ${caption}`, latitude, longitude);
    res.json({ code: 0, msg: 'success' });
  } catch (err) {
    res.status(500).json({ code: 1, msg: err.message });
  }
});

expressApp.get('/', (req, res) => res.send('Bot OK'));
const PORT = process.env.PORT || 10000;
expressApp.listen(PORT, () => {
    console.log(`Server: ${PORT}`);
    bot.launch();
});
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
