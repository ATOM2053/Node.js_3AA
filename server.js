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

// ฐานข้อมูลขุนพลสามก๊ก (ดีไซน์ลายเส้นการ์ตูนน่ารัก Chibi)
const HERO_DATABASE = [
  { id: 'caocao', name: 'โจโฉจิบิ', faction: 'วุยก๊ก', rarity: 'UR', hp: 120, atk: 25, color: '#3b82f6', bg: '#1e3a8a' },
  { id: 'guanyu', name: 'กวนอูจิบิ', faction: 'จ๊กก๊ก', rarity: 'UR', hp: 130, atk: 30, color: '#22c55e', bg: '#14532d' },
  { id: 'liubei', name: 'เล่าปี่จิบิ', faction: 'จ๊กก๊ก', rarity: 'SSR', hp: 110, atk: 18, color: '#4ade80', bg: '#064e3b' },
  { id: 'zhugeliang', name: 'ขงเบ้งจิบิ', faction: 'จ๊กก๊ก', rarity: 'UR', hp: 90, atk: 35, color: '#06b6d4', bg: '#164e63' },
  { id: 'sunquan', name: 'ซุนกวนจิบิ', faction: 'ง่อก๊ก', rarity: 'SSR', hp: 115, atk: 20, color: '#eab308', bg: '#713f12' },
  { id: 'zhouyu', name: 'จิวยี่จิบิ', faction: 'ง่อก๊ก', rarity: 'UR', hp: 95, atk: 32, color: '#ef4444', bg: '#7f1d1d' },
  { id: 'lubu', name: 'ลิโป้จิบิ', faction: 'ต่างก๊ก', rarity: 'UR', hp: 150, atk: 40, color: '#a855f7', bg: '#581c87' },
  { id: 'diaochan', name: 'เตียวเสี้ยนจิบิ', faction: 'ต่างก๊ก', rarity: 'SSR', hp: 85, atk: 15, color: '#ec4899', bg: '#831843' },
  { id: 'simali', name: 'สุมาอี้จิบิ', faction: 'วุยก๊ก', rarity: 'UR', hp: 100, atk: 28, color: '#6366f1', bg: '#312e81' },
  { id: 'zhaoyun', name: 'จูล่งจิบิ', faction: 'จ๊กก๊ก', rarity: 'SSR', hp: 105, atk: 26, color: '#38bdf8', bg: '#0369a1' }
];

// รายการสุ่มค่าย RoV (จำลองตู้สุ่มฮีโร่/สกิน RoV)
const ROV_GACHA_POOL = [
  { name: 'Yorn สกินวันเกิด', rarity: 'Legendary', type: 'Skin' },
  { name: 'Tulen เทพสายฟ้า', rarity: 'Epic', type: 'Hero' },
  { name: 'Nakroth ซามูไร', rarity: 'Rare', type: 'Hero' },
  { name: 'Violet ราชินีปืน', rarity: 'Legendary', type: 'Skin' },
  { name: 'Butterfly นักฆ่า', rarity: 'Epic', type: 'Hero' },
  { name: 'Valhein มือปืนเรโทร', rarity: 'Normal', type: 'Hero' }
];

function generateUID() {
  return '3K-' + Math.floor(100000 + Math.random() * 900000);
}

io.on('connection', (socket) => {
  io.emit('online_count', io.engine.clientsCount);

  socket.on('login', ({ username, password }) => {
    const userRegex = /^[a-zA-Z]+$/;
    const passRegex = /^[a-zA-Z0-9]{6,}$/;
    if (!userRegex.test(username)) return socket.emit('login_res', { success: false, msg: 'ชื่อต้องเป็นภาษาอังกฤษเท่านั้น' });
    if (!passRegex.test(password)) return socket.emit('login_res', { success: false, msg: 'รหัสผ่านต้อง 6 ตัวขึ้นไป' });

    if (!users[username]) {
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
        coins: 1500,
        gems: 150,
        cards: ['liubei', 'sunquan', 'zhaoyun'],
        rareShowcase: ['zhaoyun'],
        banned: false
      };
    } else {
      if (users[username].banned) return socket.emit('login_res', { success: false, msg: 'บัญชีถูกแบน!' });
      if (users[username].password !== password) return socket.emit('login_res', { success: false, msg: 'รหัสผ่านไม่ถูกต้อง!' });
    }

    onlineUsers.set(socket.id, username);
    socket.emit('login_res', { success: true, user: users[username] });
  });

  // ระบบสุ่มค่าย RoV
  socket.on('draw_rov_gacha', ({ username }) => {
    const user = users[username];
    if (!user) return;
    if (user.gems < 30) return socket.emit('notify', { msg: 'เพชรไม่พอสำหรับสุ่มกาชา RoV (ต้องการ 30 เพชร)' });

    user.gems -= 30;
    const reward = ROV_GACHA_POOL[Math.floor(Math.random() * ROV_GACHA_POOL.length)];
    user.coins += 200; // ได้เหรียญตอบแทน
    socket.emit('rov_gacha_result', { reward, user });
  });

  // ระบบสุ่มการ์ดสามก๊ก
  socket.on('draw_gacha', ({ username, type }) => {
    const user = users[username];
    if (!user) return;
    let cost = type === 'gems' ? 50 : 200;
    let currency = type === 'gems' ? 'gems' : 'coins';

    if (user[currency] < cost) return socket.emit('notify', { msg: 'ทรัพยากรไม่พอ!' });
    user[currency] -= cost;

    let pool = type === 'gems' ? HERO_DATABASE.filter(c => c.rarity === 'UR' || c.rarity === 'SSR') : HERO_DATABASE;
    const reward = pool[Math.floor(Math.random() * pool.length)];

    if (!user.cards.includes(reward.id)) user.cards.push(reward.id);
    if (reward.rarity === 'UR' && !user.rareShowcase.includes(reward.id)) user.rareShowcase.push(reward.id);

    socket.emit('gacha_result', { card: reward, user });
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    io.emit('online_count', io.engine.clientsCount);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
