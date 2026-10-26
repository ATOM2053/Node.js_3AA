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

// ฐานข้อมูลผู้เล่นจำจด
const users = {};
const onlineUsers = new Map();
const matchmakingQueue = [];
const activeBattles = {};
const globalChat = [];

// ฐานข้อมูลการ์ดสามก๊ก 40 ตัวละคร
const HERO_DATABASE = [
  { id: 'caocao', name: 'โจโฉ', faction: 'วุยก๊ก', rarity: 'UR', hp: 140, atk: 35, color: 'text-blue-400' },
  { id: 'guanyu', name: 'กวนอู', faction: 'จ๊กก๊ก', rarity: 'UR', hp: 150, atk: 40, color: 'text-green-400' },
  { id: 'liubei', name: 'เล่าปี่', faction: 'จ๊กก๊ก', rarity: 'SSR', hp: 120, atk: 25, color: 'text-green-300' },
  { id: 'zhugeliang', name: 'ขงเบ้ง', faction: 'จ๊กก๊ก', rarity: 'UR', hp: 100, atk: 45, color: 'text-cyan-400' },
  { id: 'sunquan', name: 'ซุนกวน', faction: 'ง่อก๊ก', rarity: 'SSR', hp: 125, atk: 26, color: 'text-yellow-400' },
  { id: 'zhouyu', name: 'จิวยี่', faction: 'ง่อก๊ก', rarity: 'UR', hp: 110, atk: 38, color: 'text-red-400' },
  { id: 'lubu', name: 'ลิโป้', faction: 'ต่างก๊ก', rarity: 'UR', hp: 180, atk: 55, color: 'text-purple-400' },
  { id: 'diaochan', name: 'เตียวเสี้ยน', faction: 'ต่างก๊ก', rarity: 'SSR', hp: 95, atk: 22, color: 'text-pink-400' },
  { id: 'simali', name: 'สุมาอี้', faction: 'วุยก๊ก', rarity: 'UR', hp: 115, atk: 36, color: 'text-indigo-400' },
  { id: 'zhaoyun', name: 'จูล่ง', faction: 'จ๊กก๊ก', rarity: 'SSR', hp: 130, atk: 32, color: 'text-sky-400' },
  { id: 'zhangfei', name: 'เตียวหุย', faction: 'จ๊กก๊ก', rarity: 'SSR', hp: 160, atk: 34, color: 'text-emerald-400' },
  { id: 'machao', name: 'ม้าเฉียว', faction: 'จ๊กก๊ก', rarity: 'SSR', hp: 125, atk: 30, color: 'text-teal-400' },
  { id: 'huangzhong', name: 'ฮองตง', faction: 'จ๊กก๊ก', rarity: 'SR', hp: 110, atk: 28, color: 'text-green-200' },
  { id: 'pangtong', name: 'บังทอง', faction: 'จ๊กก๊ก', rarity: 'SR', hp: 90, atk: 33, color: 'text-lime-400' },
  { id: 'jiangwei', name: 'เกงอุย', faction: 'จ๊กก๊ก', rarity: 'SR', hp: 115, atk: 27, color: 'text-emerald-300' },
  { id: 'xiahoudun', name: 'แฮหัวตั๋น', faction: 'วุยก๊ก', rarity: 'SSR', hp: 150, atk: 31, color: 'text-blue-300' },
  { id: 'xuchu', name: 'เคาทู', faction: 'วุยก๊ก', rarity: 'SR', hp: 170, atk: 29, color: 'text-blue-200' },
  { id: 'zhangliao', name: 'เตียวเลี้ยว', faction: 'วุยก๊ก', rarity: 'SSR', hp: 135, atk: 30, color: 'text-sky-300' },
  { id: 'guojia', name: 'กุยแก', faction: 'วุยก๊ก', rarity: 'SR', hp: 85, atk: 35, color: 'text-cyan-300' },
  { id: 'xiahouyuan', name: 'แฮหัวหยู', faction: 'วุยก๊ก', rarity: 'SR', hp: 120, atk: 26, color: 'text-blue-500' },
  { id: 'ganning', name: 'กำหนิง', faction: 'ง่อก๊ก', rarity: 'SSR', hp: 135, atk: 33, color: 'text-amber-400' },
  { id: 'taishici', name: 'ไทสูจู้', faction: 'ง่อก๊ก', rarity: 'SSR', hp: 140, atk: 32, color: 'text-yellow-300' },
  { id: 'sunce', name: 'ซุนเซี๋ยน', faction: 'ง่อก๊ก', rarity: 'SSR', hp: 145, atk: 34, color: 'text-orange-400' },
  { id: 'lvmeng', name: 'ลิบอง', faction: 'ง่อก๊ก', rarity: 'SR', hp: 120, atk: 28, color: 'text-amber-300' },
  { id: 'huanggai', name: 'อุยกาย', faction: 'ง่อก๊ก', rarity: 'SR', hp: 155, atk: 24, color: 'text-yellow-600' },
  { id: 'diaochan2', name: 'ซุนฮูหยิน', faction: 'ง่อก๊ก', rarity: 'SR', hp: 100, atk: 25, color: 'text-orange-300' },
  { id: 'dongzhuo', name: 'ตั๋งโต๊ะ', faction: 'ต่างก๊ก', rarity: 'SSR', hp: 190, atk: 28, color: 'text-purple-300' },
  { id: 'lvbu2', name: 'ลิบองสลับร่าง', faction: 'ต่างก๊ก', rarity: 'UR', hp: 160, atk: 48, color: 'text-fuchsia-400' },
  { id: 'huatuo', name: 'ฮัวโต๋', faction: 'ต่างก๊ก', rarity: 'SR', hp: 90, atk: 15, color: 'text-rose-300' },
  { id: 'yuanshao', name: 'อ้วนเสี้ยว', faction: 'ต่างก๊ก', rarity: 'SR', hp: 130, atk: 27, color: 'text-violet-400' },
  { id: 'menghuo', name: 'เบ้งเฮ็ก', faction: 'ต่างก๊ก', rarity: 'SR', hp: 165, atk: 26, color: 'text-purple-500' },
  { id: 'zhurong', name: 'จูโร่ง', faction: 'ต่างก๊ก', rarity: 'SR', hp: 110, atk: 29, color: 'text-pink-500' },
  { id: 'zuoci', name: 'โจจี๋', faction: 'ต่างก๊ก', rarity: 'SSR', hp: 95, atk: 38, color: 'text-violet-500' },
  { id: 'xushu', name: 'ชีซี', faction: 'จ๊กก๊ก', rarity: 'SR', hp: 105, atk: 27, color: 'text-teal-300' },
  { id: 'jiaxu', name: 'กาเซี่ยง', faction: 'วุยก๊ก', rarity: 'SR', hp: 95, atk: 34, color: 'text-indigo-300' },
  { id: 'luxun', name: 'ลกซุน', faction: 'ง่อก๊ก', rarity: 'SSR', hp: 105, atk: 37, color: 'text-red-300' },
  { id: 'pangde', name: 'บังเต็ก', faction: 'วุยก๊ก', rarity: 'SR', hp: 140, atk: 29, color: 'text-blue-600' },
  { id: 'yanliang', name: 'งันเหลียง', faction: 'ต่างก๊ก', rarity: 'SR', hp: 145, atk: 28, color: 'text-fuchsia-300' },
  { id: 'wenchou', name: 'บุนทิว', faction: 'ต่างก๊ก', rarity: 'SR', hp: 145, atk: 28, color: 'text-fuchsia-500' },
  { id: 'caoren', name: 'โจหยิน', faction: 'วุยก๊ก', rarity: 'SR', hp: 160, atk: 22, color: 'text-sky-600' }
];

function generateUID() {
  return '3K-' + Math.floor(100000 + Math.random() * 900000);
}

io.on('connection', (socket) => {
  io.emit('online_count', io.engine.clientsCount);

  // ระบบล็อกอิน / สมัครสมาชิก (จดจำข้อมูลผู้เล่น)
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
        stars: 1,
        avatar: 'https://i.imgur.com/8Km9tLL.png',
        border: 'normal',
        coins: 2000,
        gems: 200,
        cards: ['liubei', 'sunquan', 'zhaoyun', 'guanyu'],
        rareShowcase: ['guanyu'],
        banned: false
      };
    } else {
      if (users[username].banned) return socket.emit('login_res', { success: false, msg: 'บัญชีนี้ถูกแบน!' });
      if (users[username].password !== password) return socket.emit('login_res', { success: false, msg: 'รหัสผ่านไม่ถูกต้อง!' });
    }

    onlineUsers.set(socket.id, username);
    socket.emit('login_res', { success: true, user: users[username], chatHistory: globalChat, allUsers: getUsersList() });
  });

  socket.on('update_avatar', ({ username, avatarData, border }) => {
    if (users[username]) {
      users[username].avatar = avatarData;
      if (border) users[username].border = border;
      socket.emit('user_update', users[username]);
      socket.emit('notify', { msg: 'อัปเดตโปรไฟล์ RoV สำเร็จ!' });
    }
  });

  // ระบบแชทโลก
  socket.on('send_chat', ({ username, message }) => {
    const user = users[username];
    if (!user || user.banned) return;
    const chatData = { username, role: user.role, vip: user.vip, message, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    globalChat.push(chatData);
    if (globalChat.length > 50) globalChat.shift();
    io.emit('broadcast_chat', chatData);
  });

  // ระบบสุ่มกาชา (แยกตู้เหรียญ กับ ตู้เพชร)
  socket.on('draw_gacha', ({ username, type }) => {
    const user = users[username];
    if (!user) return;
    let cost = type === 'gems' ? 50 : 200;
    let currency = type === 'gems' ? 'gems' : 'coins';

    if (user[currency] < cost) return socket.emit('notify', { msg: 'ทรัพยากรไม่เพียงพอ!' });
    user[currency] -= cost;

    // ตู้เพชรโอกาสออก UR/SSR สูงกว่า
    let pool = type === 'gems' ? HERO_DATABASE.filter(c => c.rarity === 'UR' || c.rarity === 'SSR') : HERO_DATABASE;
    const reward = pool[Math.floor(Math.random() * pool.length)];

    if (!user.cards.includes(reward.id)) user.cards.push(reward.id);
    if (reward.rarity === 'UR' && !user.rareShowcase.includes(reward.id)) user.rareShowcase.push(reward.id);

    socket.emit('gacha_result', { card: reward, user });
  });

  // ระบบแอดมินพลังเทพ (เสกการ์ด, แบน, แจกเงิน, แจกเพชร)
  socket.on('admin_action', ({ adminUser, targetUser, action, value }) => {
    if (!users[adminUser] || users[adminUser].role !== 'ADMIN') return socket.emit('notify', { msg: 'ไม่มีสิทธิ์แอดมิน!' });
    const target = users[targetUser];
    if (!target) return socket.emit('notify', { msg: 'ไม่พบชื่อผู้เล่นนี้' });

    if (action === 'give_card') {
      if (!target.cards.includes(value)) target.cards.push(value);
      socket.emit('notify', { msg: `เสกการ์ด ${value} ให้ ${targetUser} สำเร็จ` });
    } else if (action === 'give_coins') {
      target.coins += parseInt(value || 0);
      socket.emit('notify', { msg: `แจกเงิน ${value} ให้ ${targetUser} สำเร็จ` });
    } else if (action === 'give_gems') {
      target.gems += parseInt(value || 0);
      socket.emit('notify', { msg: `แจกเพชร ${value} ให้ ${targetUser} สำเร็จ` });
    } else if (action === 'set_role') {
      target.role = value; // ผู้เล่น, นักแข่ง, ครีเอเตอร์, VIP 1, VIP 2, VIP 3, ADMIN
      socket.emit('notify', { msg: `เปลี่ยนยศ ${targetUser} เป็น ${value}` });
    } else if (action === 'ban') {
      target.banned = true;
      socket.emit('notify', { msg: `แบนผู้เล่น ${targetUser} เรียบร้อย` });
    }
    io.emit('refresh_admin_list', getUsersList());
  });

  function getUsersList() {
    return Object.values(users).map(u => ({ username: u.username, role: u.role, uid: u.uid, banned: u.banned }));
  }

  // ระบบ PvP แรงค์ RoV
  socket.on('find_match', ({ username, deck }) => {
    if (!deck || deck.length !== 5) return socket.emit('notify', { msg: 'ต้องเลือกการ์ดจัดเด็ค 5 ใบ!' });
    if (matchmakingQueue.find(q => q.username === username)) return;

    matchmakingQueue.push({ socketId: socket.id, username, deck });
    socket.emit('notify', { msg: 'กำลังเข้าสู่สนามประลองจัดอันดับ (Ranked)...' });

    if (matchmakingQueue.length >= 2) {
      const p1 = matchmakingQueue.shift();
      const p2 = matchmakingQueue.shift();
      const battleId = `battle_${Date.now()}`;

      activeBattles[battleId] = {
        p1: { username: p1.username, socketId: p1.socketId, deck: p1.deck, hp: 120 },
        p2: { username: p2.username, socketId: p2.socketId, deck: p2.deck, hp: 120 }
      };

      io.to(p1.socketId).emit('match_found', { battleId, opponent: p2.username, myDeck: p1.deck, oppDeck: p2.deck });
      io.to(p2.socketId).emit('match_found', { battleId, opponent: p1.username, myDeck: p2.deck, oppDeck: p1.deck });
    }
  });

  socket.on('play_pvp_card', ({ battleId, username, cardId }) => {
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
      io.to(attacker.socketId).emit('battle_end', { result: 'VICTORY', msg: 'Victory! ชนะการประลองแรงค์!' });
      io.to(defender.socketId).emit('battle_end', { result: 'DEFEAT', msg: 'Defeat! พ่ายแพ้ในศึกนี้!' });
      delete activeBattles[battleId];
    }
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    io.emit('online_count', io.engine.clientsCount);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[3K Server] Running on port ${PORT}`));
