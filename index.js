const { Telegraf } = require('telegraf');
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

// 中间件 - 允许所有类型的请求体
app.use(express.raw({ type: '*/*', limit: '50mb' }));
app.use(express.text({ limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, *');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// 调试中间件 - 记录所有请求
app.use((req, res, next) => {
  console.log('=== 收到请求 ===');
  console.log('方法:', req.method);
  console.log('路径:', req.path);
  console.log('查询参数:', req.query);
  console.log('请求头:', req.headers);
  console.log('内容类型:', req.get('Content-Type'));
  console.log('内容长度:', req.get('Content-Length'));
  console.log('================');
  next();
});

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

// ==================== 上传接口 ====================
app.post('/upload', async (req, res) => {
  console.log('📸 收到上传请求 - 开始处理');
  
  try {
    // 获取查询参数
    const { lat, lng, name = '汇盈用户', time, chatid } = req.query;
    
    console.log('📋 查询参数:', { lat, lng, name, time, chatid });
    
    // 验证必需参数
    if (!lat || !lng) {
      console.log('❌ 缺少经纬度参数');
      return res.status(400).json({ code: 1, msg: '缺少经纬度参数: lat 和 lng' });
    }

    // 获取请求体
    let imageBuffer;
    
    if (req.body && Buffer.isBuffer(req.body)) {
      // 如果是Buffer类型
      imageBuffer = req.body;
      console.log('📦 接收到Buffer数据，大小:', imageBuffer.length);
    } else if (typeof req.body === 'string') {
      // 如果是字符串（可能是base64）
      if (req.body.startsWith('data:')) {
        // 处理base64数据URL
        const base64Data = req.body.split(',')[1];
        imageBuffer = Buffer.from(base64Data, 'base64');
        console.log('📦 接收到base64数据，解码后大小:', imageBuffer.length);
      } else {
        // 普通字符串
        imageBuffer = Buffer.from(req.body);
        console.log('📦 接收到字符串数据，大小:', imageBuffer.length);
      }
    } else {
      console.log('❌ 无法识别的请求体类型:', typeof req.body);
      return res.status(400).json({ code: 1, msg: '无法识别的请求格式' });
    }

    // 验证图片数据
    if (!imageBuffer || imageBuffer.length < 100) {
      console.log('❌ 图片数据无效或太小:', imageBuffer?.length);
      return res.status(400).json({ code: 1, msg: '图片数据无效或太小' });
    }

    const formattedTime = time 
      ? new Date(parseInt(time)).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      : new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

    const caption = `【H5拍照上传】\n用户：${name}\n时间：${formattedTime}\n位置：${parseFloat(lat).toFixed(6)}, ${parseFloat(lng).toFixed(6)}\n高德地图：https://amap.com/dir?destination=${lng},${lat}\n谷歌地图：https://www.google.com/maps?q=${lat},${lng}`;

    console.log(`📤 准备发送照片，chatid: ${chatid}, 图片大小: ${imageBuffer.length} bytes`);

    let success = false;

    // 发送到指定群组
    if (chatid && GROUP_CHAT_IDS.includes(Number(chatid))) {
      console.log(`📤 发送到来源群组: ${chatid}`);
      const sent = await sendToChat(Number(chatid), imageBuffer, caption, lat, lng);
      if (sent) success = true;
    } else {
      console.log(`⚠️ 无效的群组ID或未提供: ${chatid}`);
    }

    // 发送到备份群组
    console.log(`📤 发送到备份群组: ${BACKUP_GROUP_ID}`);
    const backupSent = await sendToChat(BACKUP_GROUP_ID, imageBuffer, `[备份] ${caption}`, lat, lng);
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
    endpoints: {
      test: '/test',
      upload: '/upload (POST)'
    }
  });
});

app.get('/test', (req, res) => {
  res.json({ 
    code: 0, 
    message: '后端服务正常运行',
    timestamp: new Date().toISOString(),
    upload_instructions: 'POST to /upload with query params: lat, lng, name, time, chatid'
  });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Express 服务器启动成功，端口: ${PORT}`);
  console.log(`📍 健康检查: https://huiying888.onrender.com/`);
  console.log(`🧪 测试端点: https://huiying888.onrender.com/test`);
});

// 延迟启动Bot避免冲突
setTimeout(() => {
  bot.launch().then(() => {
    console.log('🚀 Bot 启动成功！');
  }).catch(err => {
    console.error('❌ Bot 启动失败:', err.message);
    console.log('⚠️ Bot 功能不可用，但上传接口正常');
  });
}, 5000);

// 优雅关闭
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
