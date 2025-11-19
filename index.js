const { Telegraf } = require('telegraf');
const express = require('express');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

// 群组配置
const GROUP_CHAT_IDS = [
  -1003354803364, -1003381368112, -1003308598858, -1003368574609, 
  -1003286063197, -1003378109615, -1003293673373, -1003203365614,
  -1000000000009, -1000000000010
];
const BACKUP_GROUP_ID = -1003293673373;

// 中间件
app.use(express.raw({ type: '*/*', limit: '50mb' }));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// 调试中间件
app.use((req, res, next) => {
  console.log('=== 收到请求 ===');
  console.log('方法:', req.method);
  console.log('路径:', req.path);
  console.log('查询参数:', req.query);
  console.log('内容类型:', req.get('Content-Type'));
  console.log('内容长度:', req.get('Content-Length'));
  console.log('================');
  next();
});

// 发送消息到群组
async function sendToChat(chatId, photoBuffer, caption) {
  try {
    await bot.telegram.sendPhoto(chatId, { source: photoBuffer }, {
      caption,
      parse_mode: 'Markdown'
    });
    console.log(`✅ 成功发送到群组 ${chatId}`);
    return true;
  } catch (error) {
    console.error(`发送到群组 ${chatId} 失败:`, error.message);
    return false;
  }
}

// 上传接口
app.post('/upload', async (req, res) => {
  console.log('📸 收到上传请求');
  
  try {
    // 获取查询参数
    const { name = '测试用户', time, chatid } = req.query;
    
    console.log('📋 查询参数:', { name, time, chatid });
    console.log('📦 请求体大小:', req.body.length);
    
    // 验证图片数据
    if (!req.body || req.body.length < 100) {
      console.log('❌ 图片数据无效');
      return res.status(400).json({ code: 1, msg: '图片数据无效' });
    }

    const formattedTime = time 
      ? new Date(parseInt(time)).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      : new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

    const caption = `【测试拍照上传】\n用户：${name}\n时间：${formattedTime}\n备注：无定位信息测试`;

    console.log(`📤 准备发送照片，chatid: ${chatid}`);

    let success = false;

    // 发送到指定群组
    if (chatid && GROUP_CHAT_IDS.includes(Number(chatid))) {
      console.log(`📤 发送到来源群组: ${chatid}`);
      const sent = await sendToChat(Number(chatid), req.body, caption);
      if (sent) success = true;
    }

    // 发送到备份群组
    console.log(`📤 发送到备份群组: ${BACKUP_GROUP_ID}`);
    const backupSent = await sendToChat(BACKUP_GROUP_ID, req.body, `[备份] ${caption}`);
    if (backupSent) success = true;

    if (success) {
      console.log('✅ 照片上传和处理完成');
      res.json({ code: 0, msg: 'success' });
    } else {
      throw new Error('所有群组发送失败');
    }

  } catch (err) {
    console.error('❌ 上传失败:', err);
    res.status(500).json({ code: 1, msg: err.message });
  }
});

// 健康检查
app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    message: '测试服务运行正常',
    timestamp: new Date().toISOString()
  });
});

app.get('/test', (req, res) => {
  res.json({ 
    code: 0, 
    message: '后端服务正常运行',
    timestamp: new Date().toISOString()
  });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 服务器启动成功，端口: ${PORT}`);
});

// 延迟启动Bot
setTimeout(() => {
  bot.launch().then(() => {
    console.log('🚀 Bot 启动成功！');
  }).catch(err => {
    console.error('❌ Bot 启动失败:', err.message);
  });
}, 3000);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
