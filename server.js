const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 1e8 });

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  const publicIndexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(publicIndexPath)) res.sendFile(publicIndexPath);
  else res.sendFile(path.join(__dirname, 'index.html'));
});

const users = {};
const onlineUsers = new Map();
const matchmakingQueue = [];
const activeBattles = {};
const globalChat = [];

const HERO_DATABASE = [
  { id: 'caocao', name: 'โจโฉ', faction: 'วุยก๊ก', rarity: 'UR', hp: 140, atk: 35 },
  { id: 'guanyu', name: 'กวนอู', faction: 'จ๊กก๊ก', rarity: 'UR', hp: 150, atk: 40 },
  { id: 'liubei', name: 'เล่าปี่', faction: 'จ๊กก๊ก', rarity: 'SSR', hp: 120, atk: 25 },
  { id: 'zhugeliang', name: 'ขงเบ้ง', faction: 'จ๊กก๊ก', rarity: 'UR', hp: 100, atk: 45 },
  { id: 'sunquan', name: 'ซุนกวน', faction: 'ง่อก๊ก', rarity: 'SSR', hp: 125, atk: 26 },
  { id: 'zhouyu', name: 'จิวยี่', faction: 'ง่อก๊ก', rarity: 'UR', hp: 110, atk: 38 },
  { id: 'lubu', name: 'ลิโป้', faction: 'ต่างก๊ก', rarity: 'UR', hp: 180, atk: 55 },
  { id: 'diaochan', name: 'เตียวเสี้ยน', faction: 'ต่างก๊ก', rarity: 'SSR', hp: 95, atk: 22 },
  { id: 'simali', name: 'สุมาอี้', faction: 'วุยก๊ก', rarity: 'UR', hp: 115, atk: 36 },
  { id: 'zhaoyun', name: 'จูล่ง', faction: 'จ๊กก๊ก', rarity: 'SSR', hp: 130, atk: 32 },
  { id: 'zhangfei', name: 'เตียวหุย', faction: 'จ๊กก๊ก', rarity: 'SSR', hp: 160, atk: 34 },
  { id: 'machao', name: 'ม้าเฉียว', faction: 'จ๊กก๊ก', rarity: 'SSR', hp: 125, atk: 30 },
  { id: 'huangzhong', name: 'ฮองตง', faction: 'จ๊กก๊ก', rarity: 'SR', hp: 110, atk: 28 },
  { id: 'pangtong', name: 'บังทอง', faction: 'จ๊กก๊ก', rarity: 'SR', hp: 90, atk: 33 },
  { id: 'jiangwei', name: 'เกงอุย', faction: 'จ๊กก๊ก', rarity: 'SR', hp: 115, atk: 27 },
  { id: 'xiahoudun', name: 'แฮหัวตั๋น', faction: 'วุยก๊ก', rarity: 'SSR', hp: 150, atk: 31 },
  { id: 'xuchu', name: 'เคาทู', faction: 'วุยก๊ก', rarity: 'SR', hp: 170, atk: 29 },
  { id: 'zhangliao', name: 'เตียวเลี้ยว', faction: 'วุยก๊ก', rarity: 'SSR', hp: 135, atk: 30 },
  { id: 'guojia', name: 'กุยแก', faction: 'วุยก๊ก', rarity: 'SR', hp: 85, atk: 35 },
  { id: 'xiahouyuan', name: 'แฮหัวหยู', faction: 'วุยก๊ก', rarity: 'SR', hp: 120, atk: 26 },
  { id: 'ganning', name: 'กำหนิง', faction: 'ง่อก๊ก', rarity: 'SSR', hp: 135, atk: 33 },
  { id: 'taishici', name: 'ไทสูจู้', faction: 'ง่อก๊ก', rarity: 'SSR', hp: 140, atk: 32 },
  { id: 'sunce', name: 'ซุนเซี๋ยน', faction: 'ง่อก๊ก', rarity: 'SSR', hp: 145, atk: 34 },
  { id: 'lvmeng', name: 'ลิบอง', faction: 'ง่อก๊ก', rarity: 'SR', hp: 120, atk: 28 },
  { id: 'huanggai', name: 'อุยกาย', faction: 'ง่อก๊ก', rarity: 'SR', hp: 155, atk: 24 },
  { id: 'diaochan2', name: 'ซุนฮูหยิน', faction: 'ง่อก๊ก', rarity: 'SR', hp: 100, atk: 25 },
  { id: 'dongzhuo', name: 'ตั๋งโต๊ะ', faction: 'ต่างก๊ก', rarity: 'SSR', hp: 190, atk: 28 },
  { id: 'lvbu2', name: 'ลิบองสลับร่าง', faction: 'ต่างก๊ก', rarity: 'UR', hp: 160, atk: 48 },
  { id: 'huatuo', name: 'ฮัวโต๋', faction: 'ต่างก๊ก', rarity: 'SR', hp: 90, atk: 15 },
  { id: 'yuanshao', name: 'อ้วนเสี้ยว', faction: 'ต่างก๊ก', rarity: 'SR', hp: 130, atk: 27 },
  { id: 'menghuo', name: 'เบ้งเฮ็ก', faction: 'ต่างก๊ก', rarity: 'SR', hp: 165, atk: 26 },
  { id: 'zhurong', name: 'จูโร่ง', faction: 'ต่างก๊ก', rarity: 'SR', hp: 110, atk: 29 },
  { id: 'zuoci', name: 'โจจี๋', faction: 'ต่างก๊ก', rarity: 'SSR', hp: 95, atk: 38 },
  { id: 'xushu', name: 'ชีซี', faction: 'จ๊กก๊ก', rarity: 'SR', hp: 105, atk: 27 },
  { id: 'jiaxu', name: 'กาเซี่ยง', faction: 'วุยก๊ก', rarity: 'SR', hp: 95, atk: 34 },
  { id: 'luxun', name: 'ลกซุน', faction: 'ง่อก๊ก', rarity: 'SSR', hp: 105, atk: 37 },
  { id: 'pangde', name: 'บังเต็ก', faction: 'วุยก๊ก', rarity: 'SR', hp: 140, atk: 29 },
  { id: 'yanliang', name: 'งันเหลียง', faction: 'ต่างก๊ก', rarity: 'SR', hp: 145, atk: 28 },
  { id: 'wenchou', name: 'บุนทิว', faction: 'ต่างก๊ก', rarity: 'SR', hp: 145, atk: 28 },
  { id: 'caoren', name: 'โจหยิน', faction: 'วุยก๊ก', rarity: 'SR', hp: 160, atk: 22 }
];

function generateUID() {
  return '3K-' + Math.floor(100000 + Math.random() * 900000);
}

io.on('connection', (socket) => {
  io.emit('online_count', io.engine.clientsCount);

  // ระบบตรวจสอบชื่อซ้ำและล็อกอิน
  socket.on('login', ({ username, password, isRegister }) => {
    const userRegex = /^[a-zA-Z]+$/;
    const passRegex = /^[a-zA-Z0-9]{6,}$/;
    if (!userRegex.test(username)) return socket.emit('login_res', { success: false, msg: 'ชื่อต้องเป็นภาษาอังกฤษเท่านั้น' });
    if (!passRegex.test(password)) return socket.emit('login_res', { success: false, msg: 'รหัสผ่านต้อง 6 ตัวขึ้นไป' });

    if (!users[username]) {
      // ถ้าชื่อยังไม่มีในระบบ (สมัครสมาชิกใหม่)
      const isAdmin = (username.toLowerCase() === 'admin' && password === 'Admin1234');
      users[username] = {
        uid: generateUID(),
        username,
        password,
        role: isAdmin ? 'ADMIN' : 'ผู้เล่น',
        vip: 0,
        title: 'ผู้กล้าหน้าใหม่',
        rank: 'Bronze III',
        avatar: 'https://i.imgur.com/8Km9tLL.png',
        coins: 2000,
        gems: 200,
        cards: ['liubei', 'sunquan', 'zhaoyun', 'guanyu'],
        rareShowcase: ['guanyu'],
        banned: false
      };
    } else {
      // ถ้ามีชื่อนี้อยู่แล้ว (เข้าสู่ระบบ)
      if (users[username].banned) return socket.emit('login_res', { success: false, msg: 'บัญชีนี้ถูกแบน!' });
      if (users[username].password !== password) return socket.emit('login_res', { success: false, msg: 'รหัสผ่านไม่ถูกต้อง!' });
    }

    onlineUsers.set(socket.id, username);
    socket.emit('login_res', { success: true, user: users[username], chatHistory: globalChat, allUsers: getUsersList() });
  });

  socket.on('update_avatar', ({ username, avatarData }) => {
    if (users[username]) {
      users[username].avatar = avatarData;
      socket.emit('user_update', users[username]);
      socket.emit('notify', { msg: 'อัปเดตโปรไฟล์สำเร็จ!' });
    }
  });

  socket.on('send_chat', ({ username, message }) => {
    const user = users[username];
    if (!user || user.banned) return;
    const chatData = { username, role: user.role, message, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    globalChat.push(chatData);
    if (globalChat.length > 50) globalChat.shift();
    io.emit('broadcast_chat', chatData);
  });

  socket.on('draw_gacha', ({ username, type }) => {
    const user = users[username];
    if (!user) return;
    let cost = type === 'gems' ? 50 : 200;
    let currency = type === 'gems' ? 'gems' : 'coins';

    if (user[currency] < cost) return socket.emit('notify', { msg: 'ทรัพยากรไม่เพียงพอ!' });
    user[currency] -= cost;

    let pool = type === 'gems' ? HERO_DATABASE.filter(c => c.rarity === 'UR' || c.rarity === 'SSR') : HERO_DATABASE;
    const reward = pool[Math.floor(Math.random() * pool.length)];

    if (!user.cards.includes(reward.id)) user.cards.push(reward.id);
    if (reward.rarity === 'UR' && !user.rareShowcase.includes(reward.id)) user.rareShowcase.push(reward.id);

    socket.emit('gacha_result', { card: reward, user });
  });

  socket.on('admin_action', ({ adminUser, targetUser, action, value }) => {
    if (!users[adminUser] || users[adminUser].role !== 'ADMIN') return socket.emit('notify', { msg: 'ไม่มีสิทธิ์แอดมิน!' });
    const target = users[targetUser];
    if (!target) return socket.emit('notify', { msg: 'ไม่พบชื่อผู้เล่นนี้' });

    if (action === 'give_card') {
      if (!target.cards.includes(value)) target.cards.push(value);
    } else if (action === 'give_coins') {
      target.coins += parseInt(value || 0);
    } else if (action === 'give_gems') {
      target.gems += parseInt(value || 0);
    } else if (action === 'set_role') {
      target.role = value;
    } else if (action === 'ban') {
      target.banned = true;
    }
    io.emit('refresh_admin_list', getUsersList());
  });

  function getUsersList() {
    return Object.values(users).map(u => ({ username: u.username, role: u.role, uid: u.uid, banned: u.banned }));
  }

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    io.emit('online_count', io.engine.clientsCount);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[3K Server] Running on port ${PORT}`));
