const { Telegraf } = require('telegraf');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

// ==========================================================
// ✅ 修复依赖：使用 canvas 代替 node-html-to-image 以适配 Render
// 必须确保 package.json 安装了: npm install canvas xlsx axios
// ==========================================================
const axios = require('axios');
const xlsx = require('xlsx');
const { createCanvas } = require('canvas'); // 纯内存绘图库

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
        boss_desc: "Boss 查岗",
        lg_desc: "龙哥查岗",
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
        flight_msg: "上車前要拍照到此群核對\n\n請務必在登機前使用 /hc 拍照上傳當前位置！\n\n匯盈國際 - 安全第一",
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
        qc_desc: "恢復出廠",
        lh_desc: "踢出用戶",
        lj_desc: "進群鏈接",
        link_title: "🔗 中介兄弟專用鏈接",
        link_copy: "請複製下方鏈接發送給您的兄弟：",
        boss_req: "匯盈國際負責人Boss要求你拍照",
        lg_req: "匯盈國際負責人龍哥要求你拍照",
        btn_confirm: "✅ 確認重置",
        btn_cancel: "❌ 取消",
        upload_title: "换车拍摄图片",
        loc_fail: "❌無定位⚠️請負責人核實",
        map_amap: "高德地圖",
        map_google: "谷歌地圖",
        user_auth_msg: "✅ 已授權用戶 ${name}！(只能用 /hc)"
    }
};

let authorizedUsers = new Map();
let groupTokens = new Map();
let groupConfigs = new Map();

const warningMessages = new Map();
const unauthorizedMessages = new Map();
const zlMessages = new Map();

const ZL_LINKS = { '租车': 'https://che88.netlify.app', '大飞': 'https://fei88.netlify.app', '走药': 'https://yao88.netlify.app', '背债': 'https://bei88.netlify.app' };
const ZJ_LINKS = { '租车': 'https://zjc88.netlify.app', '大飞': 'https://zjf88.netlify.app', '走药': 'https://zjy88.netlify.app', '背债': 'https://zjb88.netlify.app' };

function getLang(chatId) {
    const config = groupConfigs.get(String(chatId));
    return config && config.lang ? config.lang : 'zh-CN';
}

function t(chatId, key, params = {}) {
    const lang = getLang(chatId);
    let text = TEXTS[lang][key] || TEXTS['zh-CN'][key] || key;
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

function factoryReset() {
    authorizedUsers.clear();
    groupTokens.clear();
    groupConfigs.clear();
    warningMessages.clear();
    unauthorizedMessages.clear();
    zlMessages.clear();
    try { if(fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE); } catch(e){}
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

bot.use(async (ctx, next) => {
    if (ctx.message && ctx.chat?.type === 'private') {
        const userId = ctx.from.id;
        const userName = ctx.from.first_name || '未知';
        const userUsername = ctx.from.username ? `@${ctx.from.username}` : '无用户名';
        const messageText = ctx.message.text || '[非文本]';
        const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

        await ctx.reply(t(null, 'pm_reply'));

        const reportText = `🚨**私信访问警报**🚨\n\n` +
                           `👤用户: ${userName} ${userUsername}\n` +
                           `🆔ID: ${userId}\n` +
                           `📝消息内容: ${messageText}\n` +
                           `⏰时间: ${timestamp}\n\n` +
                           `汇盈国际 - 安全监控系统`;
        try {
            await bot.telegram.sendMessage(BACKUP_GROUP_ID, reportText, { parse_mode: 'Markdown' });
        } catch (e) { console.error('发送警报失败', e); }
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

// ==========================================================
// ✅ 功能 1 修复：/tp 使用 Canvas 纯内存生成图片
// ==========================================================
bot.command('tp', async (ctx) => {
    // 1. 权限与输入检查
    if (!GROUP_CHAT_IDS.includes(ctx.chat.id)) return;
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return ctx.reply("❌ 无权限使用此指令。");
    if (!ctx.message.reply_to_message) return ctx.reply("⚠️ 请回复一条 .xlsx 文件消息来执行转换。");
    const doc = ctx.message.reply_to_message.document;
    if (!doc || (!doc.file_name.endsWith('.xlsx') && doc.mime_type !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
        return ctx.reply("❌ 请回复有效的 .xlsx Excel 文件。");
    }

    const processingMsg = await ctx.reply("⏳ 正在处理 Excel (Canvas模式)...");

    try {
        // 2. 内存下载
        const fileLink = await ctx.telegram.getFileLink(doc.file_id);
        const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);

        // 3. 解析 Excel
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = xlsx.utils.sheet_to_json(sheet, { header: 1 }); // 二维数组

        if (!json || json.length === 0) throw new Error("Excel 是空的");

        // 4. Canvas 绘图逻辑
        const fontSize = 16;
        const padding = 10;
        const rowHeight = 40;
        // 估算每列最大宽度
        const colWidths = [];
        json.forEach(row => {
            row.forEach((cell, i) => {
                const text = String(cell || '');
                const width = (text.length * fontSize) + (padding * 2); 
                if (!colWidths[i] || width > colWidths[i]) colWidths[i] = width;
            });
        });

        const totalWidth = colWidths.reduce((a, b) => a + b, 0) + padding;
        const totalHeight = (json.length * rowHeight) + padding;

        const canvas = createCanvas(totalWidth, totalHeight);
        const ctx2d = canvas.getContext('2d');

        // 背景白
        ctx2d.fillStyle = '#ffffff';
        ctx2d.fillRect(0, 0, totalWidth, totalHeight);

        // 绘制文字和线
        ctx2d.font = `${fontSize}px Arial`;
        ctx2d.fillStyle = '#000000';
        ctx2d.strokeStyle = '#cccccc';

        let y = padding + fontSize;
        let lineY = 0;

        json.forEach((row, rowIndex) => {
            let x = padding;
            // 简单隔行换色
            if (rowIndex % 2 === 0) {
                ctx2d.fillStyle = '#f2f2f2';
                ctx2d.fillRect(0, lineY, totalWidth, rowHeight);
                ctx2d.fillStyle = '#000000';
            }
            
            row.forEach((cell, colIndex) => {
                ctx2d.fillText(String(cell || ''), x, y);
                x += colWidths[colIndex];
            });
            
            // 绘制横线
            lineY += rowHeight;
            ctx2d.beginPath();
            ctx2d.moveTo(0, lineY);
            ctx2d.lineTo(totalWidth, lineY);
            ctx2d.stroke();
            
            y += rowHeight;
        });

        // 5. 输出图片并发送
        const imgBuffer = canvas.toBuffer('image/png');
        await ctx.replyWithPhoto({ source: imgBuffer }, { caption: `✅ 转换成功：${doc.file_name}` });
        await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id);

    } catch (error) {
        console.error('TP Error:', error);
        await ctx.reply(`❌ 转换失败: ${error.message}`);
    }
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
        `/lj - ${t(chatId, 'lj_desc')}\n`;
    ctx.reply(helpText);
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

bot.action('qc_yes', async (ctx) => {
    if (!await isAdmin(ctx.chat.id, ctx.from.id)) return;
    const chatId = ctx.chat.id;
    const startId = ctx.callbackQuery.message.message_id;

    try { await ctx.answerCbQuery(); } catch(e) {}
    try { await ctx.deleteMessage(); } catch(e) {}

    (async () => {
        factoryReset();

        let i = 1;
        let consecutiveFails = 0;

        while (i <= 1000 && consecutiveFails < 20) {
            try {
                await new Promise(r => setTimeout(r, 40));
                await bot.telegram.deleteMessage(chatId, startId - i);
                consecutiveFails = 0;
            } catch (e) {
                consecutiveFails++;
                if (e.description && e.description.includes('message can\'t be deleted')) {
                    break;
                }
            }
            i++;
        }

        await bot.telegram.sendMessage(chatId, t(chatId, 'qc_done'));
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
    const link = `${WEB_APP_URL}/?chatid=${chatId}&uid=${userId}&name=${encodeURIComponent(`中介-${ctx.from.first_name}`)}&token=${token}`;

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

// ==========================================================
// ✅ 功能 2 修复：中介授权 Action 处理器
// 必须放在 bot.on('callback_query') 之前，防止被拦截
// ==========================================================
bot.action(/^agent_(land|flight)_(\d+)$/, async (ctx) => {
    const type = ctx.match[1]; // land 或 flight
    const targetUserId = parseInt(ctx.match[2]);
    const chatId = ctx.chat.id;

    // 1. 执行真正的授权
    authorizedUsers.set(targetUserId, 'agent');
    saveAuth();

    // 2. 恢复禁言权限
    try { 
        await bot.telegram.restrictChatMember(chatId, targetUserId, { permissions: { can_send_messages: true, can_send_photos: true, can_send_videos: true, can_send_other_messages: true, can_add_web_page_previews: true, can_invite_users: true } }); 
    } catch (e) {}

    // 3. 根据选择发送不同文案
    if (type === 'land') {
        // 小路文案
        const landText = "✅ 已授权中介\n" +
                         "🛣️ 路上只要是换车的请都使用 /zjkh\n" +
                         "把链接发给你的兄弟，让他拍照\n" +
                         "（温馨提示：链接可以一直使用）";
        await ctx.reply(landText);
    } else {
        // 飞机文案
        const flightText = "✈️ 已授权中介（飞机出行）\n" +
                           "上车前要拍照到此群核对\n" +
                           "请务必在登机前和上车核对时使用 /hc\n" +
                           "拍照上传当前位置和图片！\n" +
                           "汇盈国际 - 安全第一";
        await ctx.reply(flightText);
    }

    try { await ctx.answerCbQuery(); } catch(e){}
    try { await ctx.deleteMessage(); } catch(e){}
});

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    // ⚠️ 防止双重触发：如果数据以 agent_ 开头，说明是上面的处理器负责，这里直接退出
    if (data.startsWith('agent_')) return;

    const chatId = ctx.chat.id;

    if (data === 'travel_land' || data === 'travel_flight') {
        const text = data === 'travel_land' ? t(chatId, 'land_msg') : t(chatId, 'flight_msg');
        try { await ctx.deleteMessage(); } catch(e){}
        const m = await ctx.reply(text);
        try { await bot.telegram.pinChatMessage(chatId, m.message_id); } catch(e){}
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
        const text = ctx.message.text.trim();
        const replyId = ctx.message.reply_to_message.message_id;
        const chatId = ctx.chat.id;

        let target = warningMessages.get(replyId) ||
                     unauthorizedMessages.get(replyId) ||
                     { userId: ctx.message.reply_to_message.from.id, userName: ctx.message.reply_to_message.from.first_name };

        if (!target) return;

        if (text === '中介授权') {
            // ==========================================================
            // ✅ 功能 2 修复：中介授权不直接通过，而是弹出选择
            // 移除了这里的 authorizedUsers.set，改为只发消息
            // ==========================================================
            await ctx.reply("请选择兄弟的出行方式：", {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🛣️ 走小路", callback_data: `agent_land_${target.userId}` }], 
                        [{ text: "✈️ 坐飞机", callback_data: `agent_flight_${target.userId}` }]
                    ]
                }
            });
            // 移除警告消息（如果存在）
            warningMessages.delete(replyId);

        } else if (text === '授权') {
            authorizedUsers.set(target.userId, 'user');
            saveAuth();
            try { await bot.telegram.restrictChatMember(chatId, target.userId, { permissions: { can_send_messages: true, can_send_photos: true, can_send_videos: true, can_send_other_messages: true, can_add_web_page_previews: true, can_invite_users: true } }); } catch (e) {}
            await ctx.reply(t(chatId, 'auth_success', { name: target.userName }));
            warningMessages.delete(replyId);
        }
    }
});

const expressApp = express();
expressApp.use(cors());
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

expressApp.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    const startBot = async () => {
        try {
            await bot.launch({ dropPendingUpdates: true });
            console.log('Telegram Bot Started Successfully!');
        } catch (err) {
            if (err.response && err.response.error_code === 409) {
                console.log('Conflict 409: Previous bot instance is still active. Waiting 5s for it to close...');
                setTimeout(startBot, 5000);
            } else {
                console.error('Bot 启动失败:', err);
            }
        }
    };
    startBot();
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
