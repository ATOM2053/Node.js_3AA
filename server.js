const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ให้ Express อ่านไฟล์ Static ทั้งจาก root และโฟลเดอร์ public
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

// Route สำหรับส่งหน้า index.html (รองรับทั้งการวางไฟล์นอกและใน public)
app.get('/', (req, res) => {
  const publicIndexPath = path.join(__dirname, 'public', 'index.html');
  const rootIndexPath = path.join(__dirname, 'index.html');

  if (fs.existsSync(publicIndexPath)) {
    res.sendFile(publicIndexPath);
  } else if (fs.existsSync(rootIndexPath)) {
    res.sendFile(rootIndexPath);
  } else {
    res.status(404).send('<h1>ไม่พบไฟล์ index.html ในโปรเจกต์! กรุณาตรวจสอบบน GitHub</h1>');
  }
});

// Database ในหน่วยความจำ (In-Memory)
const users = {}; 
const onlineUsers = new Map(); 
const matchmakingQueue = [];
const activeBattles = {};

// ฐานข้อมูลตัวละครสามก๊ก
const HERO_DATABASE = [
  { id: 'caocao', name: 'โจโฉ', faction: 'Wei', rarity: 'UR', hp: 120, atk: 25, skill: 'บังคับบัญชาทัพ', desc: 'เพิ่มพลังโจมตีไพ่ใบอื่นในมือ 10%', effectColor: '#3b82f6' },
  { id: 'guanyu', name: 'กวนอู', faction: 'Shu', rarity: 'UR', hp: 130, atk: 30, skill: 'คมดาบมังกรเขียว', desc: 'คริติคอลความเสียหาย 200%', effectColor: '#22c55e' },
  { id: 'liubei', name: 'เล่าปี่', faction: 'Shu', rarity: 'SSR', hp: 110, atk: 18, skill: 'เมตตาธรรม', desc: 'ฟื้นฟู HP 25 หน่วย', effectColor: '#16a34a' },
  { id: 'zhugeliang', name: 'ขงเบ้ง', faction: 'Shu', rarity: 'UR', hp: 90, atk: 35, skill: 'เรียกลมตะวันออก', desc: 'แช่แข็งการ์ดศัตรู 1 ตา', effectColor: '#06b6d4' },
  { id: 'sunquan', name: 'ซุนกวน', faction: 'Wu', rarity: 'SSR', hp: 115, atk: 20, skill: 'ปราการง่อก๊ก', desc: 'สร้างโล่ป้องกัน 30 หน่วย', effectColor: '#eab308' },
  { id: 'zhouyu', name: 'จิวยี่', faction: 'Wu', rarity: 'UR', hp: 95, atk: 32, skill: 'เพลิงกัลป์เซ็กบิ๊ก', desc: 'เผาผลาญศัตรูต่อเนื่อง 2 ตา', effectColor: '#ef4444' },
  { id: 'lubu', name: 'ลิโป้', faction: 'Qun', rarity: 'UR', hp: 150, atk: 40, skill: 'ไร้เทียมทาน', desc: 'โจมตีข้ามเกราะและโล่', effectColor: '#a855f7' },
  { id: 'diaochan', name: 'เตียวเสี้ยน', faction: 'Qun', rarity: 'SSR', hp: 85, atk: 15, skill: 'มารยาเสน่หา', desc: 'ลดพลังโจมตีศัตรูลง 50%', effectColor: '#ec4899' },
  { id: 'simali', name: 'สุมาอี้', faction: 'Wei', rarity: 'UR', hp: 100, atk: 28, skill: 'กลยุทธ์ซ่อนเร้น', desc: 'สะท้อนความเสียหาย 30%', effectColor: '#6366f1' },
  { id: 'zhaoyun', name: 'จูล่ง', faction: 'Shu', rarity: 'SSR', hp: 105, atk: 26, skill: 'ฝ่าทัพรับอาเต๊า', desc: 'หลบหลีกการโจมตีถัดไป 100%', effectColor: '#38bdf8' }
];

function generateUID() {
  return '3K-' + Math.floor(100000 + Math.random() * 900000);
}

function validateAuth(username, password) {
  const userRegex = /^[a-zA-Z]+$/;
  const passRegex = /^[a-zA-Z0-9]{6,}$/;
  if (!userRegex.test(username)) return { valid: false, msg: 'ชื่อผู้ใช้ต้องเป็นตัวอักษรภาษาอังกฤษเท่านั้น (A-Z, a-z)' };
  if (!passRegex.test(password)) return { valid: false, msg: 'รหัสผ่านต้องเป็นตัวอักษรหรือตัวเลขความยาว 6 ตัวขึ้นไป' };
  return { valid: true };
}

io.on('connection', (socket) => {
  io.emit('online_count', io.engine.clientsCount);

  // ระบบล็อกอิน / สมัครสมาชิก
  socket.on('login', ({ username, password }) => {
    const check = validateAuth(username, password);
    if (!check.valid) {
      return socket.emit('login_res', { success: false, msg: check.msg });
    }

    if (!users[username]) {
      const isAdmin = (username.toLowerCase() === 'admin' && password === 'Admin1234');
      users[username] = {
        uid: generateUID(),
        username,
        password,
        role: isAdmin ? 'ADMIN' : 'ผู้เล่น',
        vip: 0,
        title: 'ผู้กล้าใหม่',
        coins: 1000,
        gems: 100,
        cards: ['liubei', 'sunquan'],
        rareShowcase: [],
        lastDailyClaim: ''
      };
    } else {
      if (users[username].password !== password) {
        return socket.emit('login_res', { success: false, msg: 'รหัสผ่านไม่ถูกต้อง!' });
      }
    }

    onlineUsers.set(socket.id, username);
    socket.emit('login_res', { success: true, user: users[username] });
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

    if (user[currency] < cost) {
      return socket.emit('notify', { msg: `ทรัพยากรไม่พอ! ต้องการ ${cost} ${type === 'gems' ? 'เพชร' : 'เหรียญ'}` });
    }

    user[currency] -= cost;

    let pool = type === 'gems' ? HERO_DATABASE.filter(c => c.rarity === 'UR' || c.rarity === 'SSR') : HERO_DATABASE;
    const reward = pool[Math.floor(Math.random() * pool.length)];

    if (!user.cards.includes(reward.id)) {
      user.cards.push(reward.id);
    }

    if (reward.rarity === 'UR' && !user.rareShowcase.includes(reward.id)) {
      user.rareShowcase.push(reward.id);
    }

    socket.emit('gacha_result', { card: reward, user });
  });

  // ระบบรับของประจำวัน
  socket.on('claim_daily', ({ username }) => {
    const user = users[username];
    if (!user) return;

    const today = new Date().toISOString().split('T')[0];
    if (user.lastDailyClaim === today) {
      return socket.emit('notify', { msg: 'คุณรับของขวัญประจำวันไปแล้ว!' });
    }

    user.lastDailyClaim = today;
    user.coins += 500;
    user.gems += 50;
    socket.emit('user_update', user);
    socket.emit('notify', { msg: 'รับของขวัญประจำวันสำเร็จ: +500 เหรียญ, +50 เพชร' });
  });

  // ระบบ PvP
  socket.on('find_match', ({ username }) => {
    if (matchmakingQueue.find(q => q.username === username)) return;
    
    matchmakingQueue.push({ socketId: socket.id, username });
    socket.emit('notify', { msg: 'กำลังค้นหาห้องแข่งขัน...' });

    if (matchmakingQueue.length >= 2) {
      const p1 = matchmakingQueue.shift();
      const p2 = matchmakingQueue.shift();

      const battleId = `battle_${Date.now()}`;
      activeBattles[battleId] = {
        p1: { username: p1.username, hp: 100, socketId: p1.socketId },
        p2: { username: p2.username, hp: 100, socketId: p2.socketId },
        turn: p1.username
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
    const damage = card.atk;
    defender.hp = Math.max(0, defender.hp - damage);

    io.to(attacker.socketId).emit('battle_update', { myHp: attacker.hp, oppHp: defender.hp, log: `คุณใช้ ${card.name} ทำความเสียหาย ${damage}!` });
    io.to(defender.socketId).emit('battle_update', { myHp: defender.hp, oppHp: attacker.hp, log: `ศัตรูใช้ ${card.name} ทำความเสียหาย ${damage}!` });

    if (defender.hp <= 0) {
      io.to(attacker.socketId).emit('battle_end', { result: 'VICTORY', msg: 'คุณเป็นผู้ชนะ!' });
      io.to(defender.socketId).emit('battle_end', { result: 'DEFEAT', msg: 'คุณพ่ายแพ้!' });
      delete activeBattles[battleId];
    }
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    io.emit('online_count', io.engine.clientsCount);
  });
});

// Bot Keep-Alive (ป้องกัน Render Sleep 24/7)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[3K Server] Running on port ${PORT}`);
  
  setInterval(() => {
    const renderUrl = process.env.RENDER_EXTERNAL_URL;
    if (renderUrl) {
      fetch(renderUrl)
        .then(() => console.log('[Keep-Alive Bot] Ping Server successful.'))
        .catch(err => console.error('[Keep-Alive Bot] Ping error:', err.message));
    }
  }, 8 * 60 * 1000);
});
