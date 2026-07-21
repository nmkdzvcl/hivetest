const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Phục vụ file tĩnh
app.use(express.static('public'));

// ====================== DỮ LIỆU GAME ======================

const TERRAIN = {
    GRASS: 'grass',
    FOREST: 'forest',
    SWAMP: 'swamp',
    CAVE: 'cave'
};

function generateMap() {
    const map = [];
    for (let row = 0; row < 10; row++) {
        map[row] = [];
        for (let col = 0; col < 10; col++) {
            if (row === 0 || row === 9 || col === 0 || col === 9) {
                map[row][col] = TERRAIN.GRASS;
            } else {
                const rand = Math.random();
                if (rand < 0.3) map[row][col] = TERRAIN.FOREST;
                else if (rand < 0.5) map[row][col] = TERRAIN.SWAMP;
                else map[row][col] = TERRAIN.GRASS;
            }
        }
    }
    return map;
}

const caves = [
    { id: 0, x: 200, y: 200, connectedTo: [1, 3] },
    { id: 1, x: 600, y: 150, connectedTo: [0, 2] },
    { id: 2, x: 800, y: 500, connectedTo: [1, 4] },
    { id: 3, x: 300, y: 700, connectedTo: [0, 4] },
    { id: 4, x: 700, y: 800, connectedTo: [2, 3] }
];

const recipes = {
    'Wax Shield': { 
        cost: { wax: 15, honey: 5 }, 
        desc: '🛡️ Giảm 30% sát thương',
        type: 'shield'
    },
    'Poison Sting': { 
        cost: { pollen: 10, gems: 3 }, 
        desc: '⚔️ Gây độc 5s',
        type: 'weapon'
    },
    'Forest Boots': { 
        cost: { wax: 8, honey: 12 }, 
        desc: '👢 Tăng tốc trong rừng',
        type: 'boots'
    },
    'Revive Flask': { 
        cost: { honey: 25, gems: 5 }, 
        desc: '🧪 Hồi sinh 50% HP',
        type: 'consumable'
    },
    'Radar': { 
        cost: { pollen: 10, gems: 3 }, 
        desc: '📡 Dò tìm Boss',
        type: 'consumable'
    }
};

// ====================== TRẠNG THÁI GAME ======================

const gameMap = generateMap();
let players = {};
let monsters = [];
let items = [];
let monsterId = 0;
let itemId = 0;

function createMonster(x, y, type) {
    const configs = {
        butterfly: { hp: 30, maxHp: 30, damage: 5, speed: 1, color: '#ff69b4', size: 15, drops: { honey: 3, pollen: 1 } },
        spider: { hp: 60, maxHp: 60, damage: 10, speed: 0.8, color: '#8b0000', size: 20, drops: { honey: 5, wax: 2 } },
        wasp: { hp: 150, maxHp: 150, damage: 20, speed: 1.2, color: '#ffd700', size: 30, drops: { honey: 10, pollen: 5, gems: 1 } },
        cavebat: { hp: 80, maxHp: 80, damage: 15, speed: 1.5, color: '#4a0080', size: 18, drops: { gems: 2, pollen: 3 } }
    };
    
    const config = configs[type];
    return {
        id: monsterId++,
        x: x,
        y: y,
        hp: config.hp,
        maxHp: config.maxHp,
        damage: config.damage,
        speed: config.speed,
        color: config.color,
        size: config.size,
        type: type,
        drops: config.drops,
        targetX: x,
        targetY: y,
        moveTimer: 0
    };
}

function initMonsters() {
    monsters = [];
    for (let i = 0; i < 15; i++) {
        const x = 100 + Math.random() * 800;
        const y = 100 + Math.random() * 800;
        const types = ['butterfly', 'butterfly', 'butterfly', 'spider', 'spider', 'wasp'];
        const type = types[Math.floor(Math.random() * types.length)];
        monsters.push(createMonster(x, y, type));
    }
    
    caves.forEach(cave => {
        for (let i = 0; i < 3; i++) {
            const x = cave.x + (Math.random() - 0.5) * 150;
            const y = cave.y + (Math.random() - 0.5) * 150;
            monsters.push(createMonster(x, y, 'cavebat'));
        }
    });
}

initMonsters();

function getTerrainAt(x, y) {
    const col = Math.floor(x / 100);
    const row = Math.floor(y / 100);
    if (row < 0 || row >= 10 || col < 0 || col >= 10) return TERRAIN.GRASS;
    return gameMap[row][col];
}

function spawnItem(x, y, drops) {
    for (let [material, amount] of Object.entries(drops)) {
        if (amount > 0 && Math.random() < 0.7) {
            items.push({
                id: itemId++,
                x: x + (Math.random() - 0.5) * 30,
                y: y + (Math.random() - 0.5) * 30,
                material: material,
                amount: Math.ceil(amount * (0.5 + Math.random() * 0.5)),
                life: 600
            });
        }
    }
}

// ====================== SOCKET.IO ======================

io.on('connection', (socket) => {
    console.log('✅ Player connected:', socket.id);
    
    const player = {
        id: socket.id,
        x: 500 + (Math.random() - 0.5) * 100,
        y: 500 + (Math.random() - 0.5) * 100,
        radius: 20,
        hp: 100,
        maxHp: 100,
        level: 1,
        exp: 0,
        expToNext: 50,
        speed: 3,
        inventory: {
            honey: 5,
            pollen: 2,
            wax: 1,
            gems: 0
        },
        equipment: {
            shield: false,
            weapon: false,
            boots: false
        },
        consumables: {
            revive: 0,
            radar: 0
        },
        inCave: false,
        caveId: -1,
        attackCooldown: 0,
        damage: 10,
        killCount: 0
    };
    players[socket.id] = player;
    
    // Gửi dữ liệu ban đầu
    socket.emit('init', {
        id: socket.id,
        map: gameMap,
        caves: caves,
        recipes: recipes,
        players: players,
        monsters: monsters,
        items: items
    });
    
    console.log('📤 Đã gửi init cho player:', socket.id);
    
    // ========== DI CHUYỂN ==========
    socket.on('move', (data) => {
        const p = players[socket.id];
        if (!p) return;
        
        p.x = Math.max(20, Math.min(980, data.x));
        p.y = Math.max(20, Math.min(980, data.y));
    });
    
    // ========== TẤN CÔNG ==========
    socket.on('attack', (targetId) => {
        const p = players[socket.id];
        if (!p) return;
        if (p.attackCooldown > 0) return;
        
        const monster = monsters.find(m => m.id === targetId);
        if (!monster) return;
        
        const dist = Math.sqrt((p.x - monster.x) ** 2 + (p.y - monster.y) ** 2);
        if (dist > 80) return;
        
        let damage = p.damage;
        if (p.equipment.weapon) damage *= 1.3;
        
        monster.hp -= damage;
        
        if (monster.hp <= 0) {
            spawnItem(monster.x, monster.y, monster.drops);
            
            const expGain = Math.floor(10 + Math.random() * 15);
            p.exp += expGain;
            p.killCount++;
            
            while (p.exp >= p.expToNext) {
                p.exp -= p.expToNext;
                p.level++;
                p.expToNext = Math.floor(p.expToNext * 1.3);
                p.maxHp += 10;
                p.hp = p.maxHp;
                p.damage += 2;
                
                socket.emit('levelUp', {
                    level: p.level,
                    newHp: p.maxHp,
                    newDamage: p.damage
                });
            }
            
            monsters = monsters.filter(m => m.id !== targetId);
            
            setTimeout(() => {
                const newX = 100 + Math.random() * 800;
                const newY = 100 + Math.random() * 800;
                const types = ['butterfly', 'butterfly', 'spider'];
                const type = types[Math.floor(Math.random() * types.length)];
                monsters.push(createMonster(newX, newY, type));
            }, 5000);
        }
        
        p.attackCooldown = 30;
    });
    
    // ========== NHẶT ĐỒ ==========
    socket.on('pickup', () => {
        const p = players[socket.id];
        if (!p) return;
        
        const itemIndex = items.findIndex(item => {
            const dist = Math.sqrt((p.x - item.x) ** 2 + (p.y - item.y) ** 2);
            return dist < 50;
        });
        
        if (itemIndex !== -1) {
            const item = items[itemIndex];
            p.inventory[item.material] = (p.inventory[item.material] || 0) + item.amount;
            items.splice(itemIndex, 1);
            socket.emit('pickupSuccess', {
                material: item.material,
                amount: item.amount,
                inventory: p.inventory
            });
        }
    });
    
    // ========== CRAFT ==========
    socket.on('craft', (recipeName) => {
        const p = players[socket.id];
        if (!p) return;
        
        const recipe = recipes[recipeName];
        if (!recipe) {
            socket.emit('craftFail', 'Công thức không tồn tại!');
            return;
        }
        
        let canCraft = true;
        for (let [material, amount] of Object.entries(recipe.cost)) {
            if ((p.inventory[material] || 0) < amount) {
                canCraft = false;
                break;
            }
        }
        
        if (!canCraft) {
            socket.emit('craftFail', 'Không đủ nguyên liệu!');
            return;
        }
        
        for (let [material, amount] of Object.entries(recipe.cost)) {
            p.inventory[material] -= amount;
        }
        
        if (recipe.type === 'shield') {
            p.equipment.shield = true;
            socket.emit('craftSuccess', {
                recipe: recipeName,
                message: `✅ Đã chế tạo ${recipeName}!`,
                inventory: p.inventory,
                equipment: p.equipment
            });
        } else if (recipe.type === 'weapon') {
            p.equipment.weapon = true;
            socket.emit('craftSuccess', {
                recipe: recipeName,
                message: `✅ Đã chế tạo ${recipeName}!`,
                inventory: p.inventory,
                equipment: p.equipment
            });
        } else if (recipe.type === 'boots') {
            p.equipment.boots = true;
            socket.emit('craftSuccess', {
                recipe: recipeName,
                message: `✅ Đã chế tạo ${recipeName}!`,
                inventory: p.inventory,
                equipment: p.equipment
            });
        } else if (recipe.type === 'consumable') {
            if (recipeName === 'Revive Flask') {
                p.consumables.revive = (p.consumables.revive || 0) + 1;
            } else if (recipeName === 'Radar') {
                p.consumables.radar = (p.consumables.radar || 0) + 1;
            }
            socket.emit('craftSuccess', {
                recipe: recipeName,
                message: `✅ Đã chế tạo ${recipeName}!`,
                inventory: p.inventory,
                consumables: p.consumables
            });
        }
    });
    
    // ========== HANG ĐỘNG ==========
    socket.on('enterCave', (caveId) => {
        const p = players[socket.id];
        if (!p || p.inCave) return;
        
        const cave = caves.find(c => c.id === caveId);
        if (!cave) return;
        
        const dist = Math.sqrt((p.x - cave.x) ** 2 + (p.y - cave.y) ** 2);
        if (dist > 60) return;
        
        p.inCave = true;
        p.caveId = caveId;
        p.x = cave.x + (Math.random() - 0.5) * 100;
        p.y = cave.y + (Math.random() - 0.5) * 100;
        
        socket.emit('enterCaveSuccess', {
            caveId: caveId,
            position: { x: p.x, y: p.y }
        });
    });
    
    socket.on('exitCave', () => {
        const p = players[socket.id];
        if (!p || !p.inCave) return;
        
        const cave = caves.find(c => c.id === p.caveId);
        if (!cave) return;
        
        p.inCave = false;
        p.x = cave.x + (Math.random() - 0.5) * 50;
        p.y = cave.y + (Math.random() - 0.5) * 50;
        p.caveId = -1;
        
        socket.emit('exitCaveSuccess', {
            position: { x: p.x, y: p.y }
        });
    });
    
    // ========== NGẮT KẾT NỐI ==========
    socket.on('disconnect', () => {
        delete players[socket.id];
        console.log('❌ Player disconnected:', socket.id);
    });
});

// ====================== GAME LOOP ======================

setInterval(() => {
    // Quái di chuyển
    monsters.forEach(monster => {
        if (Math.random() < 0.05) {
            monster.targetX = monster.x + (Math.random() - 0.5) * 200;
            monster.targetY = monster.y + (Math.random() - 0.5) * 200;
            monster.targetX = Math.max(50, Math.min(950, monster.targetX));
            monster.targetY = Math.max(50, Math.min(950, monster.targetY));
        }
        
        const dx = monster.targetX - monster.x;
        const dy = monster.targetY - monster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 5) {
            monster.x += (dx / dist) * monster.speed;
            monster.y += (dy / dist) * monster.speed;
        }
    });
    
    // Giảm cooldown
    Object.values(players).forEach(p => {
        if (p.attackCooldown > 0) p.attackCooldown--;
        if (p.hp < p.maxHp) {
            p.hp = Math.min(p.maxHp, p.hp + 0.1);
        }
    });
    
    // Xóa item hết hạn
    items.forEach(item => item.life--);
    items = items.filter(item => item.life > 0);
    
    // Broadcast
    io.emit('gameState', {
        players: players,
        monsters: monsters,
        items: items
    });
    
}, 50);

// ====================== KHỞI ĐỘNG ======================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
    console.log(`📊 Số lượng quái: ${monsters.length}`);
});
