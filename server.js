const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  const publicIndexPath = path.join(__dirname, 'public', 'index.html');
  const rootIndexPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(publicIndexPath)) res.sendFile(publicIndexPath);
  else if (fs.existsSync(rootIndexPath)) res.sendFile(rootIndexPath);
  else res.status(404).send('<h1>ไม่พบไฟล์ index.html</h1>');
});

// ฐานข้อมูลผู้เล่นทั้งหมดในเซิร์ฟเวอร์เดียวกัน
const users = {}; 
const onlineUsers = new Map(); 
const matchmakingQueue = [];
const activeBattles = {};

const HERO_DATABASE = [
  { id: 'caocao', name: 'โจโฉ', faction: 'วุยก๊ก', rarity: 'UR', hp: 120, atk: 25, color: 'text-blue-400' },
  { id: 'guanyu', name: 'กวนอู', faction: 'จ๊กก๊ก', rarity: 'UR', hp: 130, atk: 30, color: 'text-green-400' },
  { id: 'liubei', name: 'เล่าปี่', faction: 'จ๊กก๊ก', rarity: 'SSR', hp: 110, atk: 18, color: 'text-green-300' },
  { id: 'zhugeliang', name: 'ขงเบ้ง', faction: 'จ๊กก๊ก', rarity: 'UR', hp: 90, atk: 35, color: 'text-cyan-400' },
  { id: 'sunquan', name: 'ซุนกวน', faction: 'ง่อก๊ก', rarity: 'SSR', hp: 115, atk: 20, color: 'text-yellow-400' },
  { id: 'zhouyu', name: 'จิวยี่', faction: 'ง่อก๊ก', rarity: 'UR', hp: 95, atk: 32, color: 'text-red-400' },
  { id: 'lubu', name: 'ลิโป้', faction: 'ต่างก๊ก', rarity: 'UR', hp: 150, atk: 40, color: 'text-purple-400' },
  { id: 'diaochan', name: 'เตียวเสี้ยน', faction: 'ต่างก๊ก', rarity: 'SSR', hp: 85, atk: 15, color: 'text-pink-400' },
  { id: 'simali', name: 'สุมาอี้', faction: 'วุยก๊ก', rarity: 'UR', hp: 100, atk: 28, color: 'text-indigo-400' },
  { id: 'zhaoyun', name: 'จูล่ง', faction: 'จ๊กก๊ก', rarity: 'SSR', hp: 105, atk: 26, color: 'text-sky-400' }
];

function generateUID() {
  return '3K-' + Math.floor(100000 + Math.random() * 900000);
}

io.on('connection', (socket) => {
  io.emit('online_count', io.engine.clientsCount);

  // ระบบล็อกอิน / สมัครสมาชิก
  socket.on('login', ({ username, password }) => {
    const userRegex = /^[a-zA-Z]+$/;
    const passRegex = /^[a-zA-Z0-9]{6,}$/;
    if (!userRegex.test(username)) return socket.emit('login_res', { success: false, msg: 'ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษเท่านั้น' });
    if (!passRegex.test(password)) return socket.emit('login_res', { success: false, msg: 'รหัสผ่านต้อง 6 ตัวขึ้นไป (A-Z, a-z, 0-9)' });

    if (!users[username]) {
      const isAdmin = (username.toLowerCase() === 'admin' && password === 'Admin1234');
      users[username] = {
        uid: generateUID(),
        username,
        password,
        role: isAdmin ? 'ADMIN' : 'ผู้เล่น', // ยศ: ผู้เล่น, นักแข่ง, ครีเอเตอร์, VIP, ADMIN
        vip: 0,
        title: 'ผู้กล้าใหม่',
        avatar: 'https://i.imgur.com/8Km9tLL.png', // รูปโปรไฟล์เริ่มต้น
        coins: 1000,
        gems: 100,
        cards: ['liubei', 'sunquan'],
        rareShowcase: [],
        lastDailyClaim: '',
        banned: false
      };
    } else {
      if (users[username].banned) return socket.emit('login_res', { success: false, msg: 'บัญชีนี้ถูกแบนจากระบบแล้ว!' });
      if (users[username].password !== password) return socket.emit('login_res', { success: false, msg: 'รหัสผ่านไม่ถูกต้อง!' });
    }

    onlineUsers.set(socket.id, username);
    socket.emit('login_res', { success: true, user: users[username], allUsers: getUsersList() });
  });

  // อัปเดตรูปโปรไฟล์
  socket.on('update_avatar', ({ username, avatarUrl }) => {
    if (users[username]) {
      users[username].avatar = avatarUrl;
      socket.emit('user_update', users[username]);
      socket.emit('notify', { msg: 'เปลี่ยนรูปโปรไฟล์สำเร็จ!' });
    }
  });

  // ระบบเติมเงิน
  socket.on('topup', ({ username, amount }) => {
    if (amount < 10) return socket.emit('notify', { msg: 'เติมเงินขั้นต่ำ 10 บาทขึ้นไป' });
    if (!users[username]) return;

    const gemsGained = amount * 10;
    users[username].gems += gemsGained;
    if (amount >= 500) users[username].vip = 3;
    else if (amount >= 200) users[username].vip = 2;
    else if (amount >= 50) users[username].vip = 1;

    socket.emit('user_update', users[username]);
    socket.emit('notify', { msg: `เติมเงินสำเร็จ! ได้รับ ${gemsGained} เพชร` });
  });

  // ระบบสุ่มการ์ด (Gacha)
  socket.on('draw_gacha', ({ username, type }) => {
    const user = users[username];
    if (!user) return;

    let cost = type === 'gems' ? 50 : 200;
    let currency = type === 'gems' ? 'gems' : 'coins';

    if (user[currency] < cost) return socket.emit('notify', { msg: `ทรัพยากรไม่พอ!` });
    user[currency] -= cost;

    let pool = type === 'gems' ? HERO_DATABASE.filter(c => c.rarity === 'UR' || c.rarity === 'SSR') : HERO_DATABASE;
    const reward = pool[Math.floor(Math.random() * pool.length)];

    if (!user.cards.includes(reward.id)) user.cards.push(reward.id);
    if (reward.rarity === 'UR' && !user.rareShowcase.includes(reward.id)) user.rareShowcase.push(reward.id);

    socket.emit('gacha_result', { card: reward, user });
  });

  // ระบบรับของประจำวัน
  socket.on('claim_daily', ({ username }) => {
    const user = users[username];
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];
    if (user.lastDailyClaim === today) return socket.emit('notify', { msg: 'รับของขวัญประจำวันไปแล้ววันนี้!' });

    user.lastDailyClaim = today;
    user.coins += 500;
    user.gems += 50;
    socket.emit('user_update', user);
    socket.emit('notify', { msg: 'รับสำเร็จ: +500 เหรียญ, +50 เพชร' });
  });

  // --- ADMIN COMMANDS ---
  socket.on('admin_action', ({ adminUser, targetUser, action, value }) => {
    if (!users[adminUser] || users[adminUser].role !== 'ADMIN') {
      return socket.emit('notify', { msg: 'คุณไม่มีสิทธิ์ผู้ดูแลระบบ!' });
    }
    const target = users[targetUser];
    if (!target) return socket.emit('notify', { msg: 'ไม่พบชื่อผู้เล่นนี้' });

    if (action === 'set_role') {
      target.role = value; // ผู้เล่น, นักแข่ง, ครีเอเตอร์, VIP 1, VIP 2, VIP 3
      socket.emit('notify', { msg: `เปลี่ยนยศของ ${targetUser} เป็น ${value} สำเร็จ` });
    } else if (action === 'ban') {
      target.banned = true;
      socket.emit('notify', { msg: `แบนผู้เล่น ${targetUser} สำเร็จ` });
    } else if (action === 'give_gems') {
      target.gems += parseInt(value || 0);
      socket.emit('notify', { msg: `เสกเพชรให้ ${targetUser} จำนวน ${value} เพชรสำเร็จ` });
    }

    io.emit('refresh_admin_list', getUsersList());
  });

  function getUsersList() {
    return Object.values(users).map(u => ({ username: u.username, role: u.role, uid: u.uid, banned: u.banned }));
  }

  // ระบบ PvP
  socket.on('find_match', ({ username }) => {
    if (matchmakingQueue.find(q => q.username === username)) return;
    matchmakingQueue.push({ socketId: socket.id, username });
    socket.emit('notify', { msg: 'กำลังค้นหาคู่ต่อสู้ในเซิร์ฟเวอร์...' });

    if (matchmakingQueue.length >= 2) {
      const p1 = matchmakingQueue.shift();
      const p2 = matchmakingQueue.shift();
      const battleId = `battle_${Date.now()}`;
      activeBattles[battleId] = {
        p1: { username: p1.username, hp: 100, socketId: p1.socketId },
        p2: { username: p2.username, hp: 100, socketId: p2.socketId }
      };
      io.to(p1.socketId).emit('match_found', { battleId, opponent: p2.username, myHp: 100, oppHp: 100 });
      io.to(p2.socketId).emit('match_found', { battleId, opponent: p1.username, myHp: 100, oppHp: 100 });
    }
  });

  socket.on('play_card', ({ battleId, username, cardId }) => {
    const battle = activeBattles[battleId];
    if (!battle) return;
    const isP1 = battle.p1.username === username;
    const attacker = isP1 ? battle.p1 : battle.p2;
    const defender = isP1 ? battle.p2 : battle.p1;
    const card = HERO_DATABASE.find(c => c.id === cardId) || HERO_DATABASE[0];

    defender.hp = Math.max(0, defender.hp - card.atk);
    io.to(attacker.socketId).emit('battle_update', { myHp: attacker.hp, oppHp: defender.hp, log: `คุณใช้ ${card.name} โจมตีสร้างความเสียหาย ${card.atk}!` });
    io.to(defender.socketId).emit('battle_update', { myHp: defender.hp, oppHp: attacker.hp, log: `ศัตรูใช้ ${card.name} โจมตีสร้างความเสียหาย ${card.atk}!` });

    if (defender.hp <= 0) {
      io.to(attacker.socketId).emit('battle_end', { result: 'VICTORY', msg: 'คุณชนะการประลอง!' });
      io.to(defender.socketId).emit('battle_end', { result: 'DEFEAT', msg: 'คุณพ่ายแพ้!' });
      delete activeBattles[battleId];
    }
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    io.emit('online_count', io.engine.clientsCount);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[3K Server] Running on port ${PORT}`);
  setInterval(() => {
    const renderUrl = process.env.RENDER_EXTERNAL_URL;
    if (renderUrl) fetch(renderUrl).catch(() => {});
  }, 8 * 60 * 1000);
});
