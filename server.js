const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);

// Phục vụ file tĩnh trong thư mục public
app.use(express.static('public'));

// ====================== DỮ LIỆU GAME ======================

// Map địa hình (10x10, mỗi ô 100x100)
const TERRAIN = {
    GRASS: 'grass',
    FOREST: 'forest',
    SWAMP: 'swamp',
    CAVE: 'cave'
};

// Tạo map ngẫu nhiên
function generateMap() {
    const map = [];
    for (let row = 0; row < 10; row++) {
        map[row] = [];
        for (let col = 0; col < 10; col++) {
            // Rìa map là cỏ, bên trong có rừng và đầm lầy
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

// Cấu hình hang động (5 hang, mỗi hang có cửa vào riêng)
const caves = [
    { id: 0, x: 200, y: 200, connectedTo: [1, 3] },
    { id: 1, x: 600, y: 150, connectedTo: [0, 2] },
    { id: 2, x: 800, y: 500, connectedTo: [1, 4] },
    { id: 3, x: 300, y: 700, connectedTo: [0, 4] },
    { id: 4, x: 700, y: 800, connectedTo: [2, 3] }
];

// Công thức Craft
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

// Hàm tạo quái
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

// Khởi tạo quái ban đầu
function initMonsters() {
    monsters = [];
    for (let i = 0; i < 15; i++) {
        const x = 100 + Math.random() * 800;
        const y = 100 + Math.random() * 800;
        const types = ['butterfly', 'butterfly', 'butterfly', 'spider', 'spider', 'wasp'];
        const type = types[Math.floor(Math.random() * types.length)];
        monsters.push(createMonster(x, y, type));
    }
    
    // Thêm quái trong hang (3 con mỗi hang)
    caves.forEach(cave => {
        for (let i = 0; i < 3; i++) {
            const x = cave.x + (Math.random() - 0.5) * 150;
            const y = cave.y + (Math.random() - 0.5) * 150;
            monsters.push(createMonster(x, y, 'cavebat'));
        }
    });
}

initMonsters();

// ====================== HÀM XỬ LÝ ======================

// Lấy loại địa hình tại vị trí
function getTerrainAt(x, y) {
    const col = Math.floor(x / 100);
    const row = Math.floor(y / 100);
    if (row < 0 || row >= 10 || col < 0 || col >= 10) return TERRAIN.GRASS;
    return gameMap[row][col];
}

// Kiểm tra có đang trong hang không
function isInCave(player) {
    return player && player.inCave !== undefined && player.inCave;
}

// Tìm hang gần nhất
function findNearestCave(x, y) {
    let nearest = null;
    let minDist = Infinity;
    caves.forEach(cave => {
        const dist = Math.sqrt((cave.x - x) ** 2 + (cave.y - y) ** 2);
        if (dist < minDist) {
            minDist = dist;
            nearest = cave;
        }
    });
    return nearest;
}

// Tạo item rơi
function spawnItem(x, y, drops) {
    for (let [material, amount] of Object.entries(drops)) {
        if (amount > 0 && Math.random() < 0.7) { // 70% tỉ lệ rơi
            items.push({
                id: itemId++,
                x: x + (Math.random() - 0.5) * 30,
                y: y + (Math.random() - 0.5) * 30,
                material: material,
                amount: Math.ceil(amount * (0.5 + Math.random() * 0.5)),
                life: 600 // biến mất sau 30 giây (600 ticks)
            });
        }
    }
}

// ====================== SOCKET.IO ======================

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);
    
    // Tạo người chơi mới
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
    
    // Gửi dữ liệu ban đầu cho client
    socket.emit('init', {
        id: socket.id,
        map: gameMap,
        caves: caves,
        recipes: recipes,
        players: players,
        monsters: monsters,
        items: items
    });
    
    // ========== SỰ KIỆN DI CHUYỂN ==========
    socket.on('move', (data) => {
        const p = players[socket.id];
        if (!p) return;
        
        // Kiểm tra vị trí hợp lệ
        let newX = Math.max(20, Math.min(980, data.x));
        let newY = Math.max(20, Math.min(980, data.y));
        
        // Nếu đang trong hang, không ra ngoài biên
        if (p.inCave) {
            const cave = caves.find(c => c.id === p.caveId);
            if (cave) {
                newX = Math.max(cave.x - 150, Math.min(cave.x + 150, newX));
                newY = Math.max(cave.y - 150, Math.min(cave.y + 150, newY));
            }
        }
        
        // Áp dụng hiệu ứng địa hình
        const terrain = getTerrainAt(newX, newY);
        let speedMod = 1;
        if (terrain === TERRAIN.FOREST) speedMod = 0.8;
        if (terrain === TERRAIN.SWAMP) speedMod = 0.65;
        if (terrain === TERRAIN.CAVE) speedMod = 0.9;
        
        // Nếu có giày rừng và đang ở rừng
        if (p.equipment.boots && terrain === TERRAIN.FOREST) {
            speedMod = 0.9; // Giảm bớt hiệu ứng chậm
        }
        
        p.x = newX;
        p.y = newY;
        p.speedMod = speedMod;
    });
    
    // ========== SỰ KIỆN TẤN CÔNG ==========
    socket.on('attack', (targetId) => {
        const p = players[socket.id];
        if (!p) return;
        if (p.attackCooldown > 0) return;
        
        // Tìm quái hoặc người chơi
        const monster = monsters.find(m => m.id === targetId);
        const targetPlayer = players[targetId];
        
        let target = null;
        let isMonster = false;
        if (monster) {
            target = monster;
            isMonster = true;
        } else if (targetPlayer && targetPlayer.id !== socket.id) {
            target = targetPlayer;
        }
        
        if (!target) return;
        
        // Kiểm tra khoảng cách
        const dist = Math.sqrt((p.x - target.x) ** 2 + (p.y - target.y) ** 2);
        if (dist > 80) return;
        
        // Tính sát thương
        let damage = p.damage;
        if (p.equipment.weapon) damage *= 1.3; // Châm độc +30% sát thương
        
        // Nếu có khiên, giảm sát thương phải chịu (khi bị tấn công)
        if (isMonster) {
            target.hp -= damage;
            
            // Boss Wasp có khả năng triệu tập
            if (target.type === 'wasp' && target.hp < target.maxHp * 0.5 && Math.random() < 0.3) {
                for (let i = 0; i < 3; i++) {
                    const wasp = createMonster(
                        target.x + (Math.random() - 0.5) * 80,
                        target.y + (Math.random() - 0.5) * 80,
                        'butterfly'
                    );
                    wasp.maxHp = 20;
                    wasp.hp = 20;
                    wasp.size = 12;
                    monsters.push(wasp);
                }
            }
        } else {
            // Đánh người chơi
            let actualDamage = damage;
            if (targetPlayer.equipment && targetPlayer.equipment.shield) {
                actualDamage *= 0.7;
            }
            target.hp -= actualDamage;
            
            // Gửi thông báo cho người bị đánh
            io.to(target.id).emit('takeDamage', {
                damage: actualDamage,
                from: socket.id
            });
        }
        
        // Kiểm tra target chết
        if (target.hp <= 0) {
            if (isMonster) {
                // Quái chết
                const monsterData = target;
                spawnItem(monsterData.x, monsterData.y, monsterData.drops);
                
                // Tăng exp cho người chơi
                const expGain = Math.floor(10 + Math.random() * 15);
                p.exp += expGain;
                p.killCount++;
                
                // Kiểm tra level up
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
                
                // Xóa quái
                monsters = monsters.filter(m => m.id !== target.id);
                
                // Tạo quái mới
                setTimeout(() => {
                    const newX = 100 + Math.random() * 800;
                    const newY = 100 + Math.random() * 800;
                    const types = ['butterfly', 'butterfly', 'spider'];
                    const type = types[Math.floor(Math.random() * types.length)];
                    monsters.push(createMonster(newX, newY, type));
                }, 5000);
            } else {
                // Người chơi chết (xử lý sau)
            }
        }
        
        p.attackCooldown = 30; // 1.5 giây cooldown (30 ticks * 50ms)
    });
    
    // ========== SỰ KIỆN NHẶT ĐỒ ==========
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
    
    // ========== SỰ KIỆN CRAFT ==========
    socket.on('craft', (recipeName) => {
        const p = players[socket.id];
        if (!p) return;
        
        const recipe = recipes[recipeName];
        if (!recipe) {
            socket.emit('craftFail', 'Công thức không tồn tại!');
            return;
        }
        
        // Kiểm tra nguyên liệu
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
        
        // Trừ nguyên liệu
        for (let [material, amount] of Object.entries(recipe.cost)) {
            p.inventory[material] -= amount;
        }
        
        // Thêm đồ
        if (recipe.type === 'shield') {
            p.equipment.shield = true;
            socket.emit('craftSuccess', {
                recipe: recipeName,
                message: `✅ Đã chế tạo ${recipeName}! Khiên đã được trang bị.`,
                inventory: p.inventory,
                equipment: p.equipment
            });
        } else if (recipe.type === 'weapon') {
            p.equipment.weapon = true;
            socket.emit('craftSuccess', {
                recipe: recipeName,
                message: `✅ Đã chế tạo ${recipeName}! Vũ khí đã được trang bị.`,
                inventory: p.inventory,
                equipment: p.equipment
            });
        } else if (recipe.type === 'boots') {
            p.equipment.boots = true;
            socket.emit('craftSuccess', {
                recipe: recipeName,
                message: `✅ Đã chế tạo ${recipeName}! Giày đã được trang bị.`,
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
                message: `✅ Đã chế tạo ${recipeName}! Vào túi đồ.`,
                inventory: p.inventory,
                consumables: p.consumables
            });
        }
    });
    
    // ========== SỰ KIỆN VÀO HANG ==========
    socket.on('enterCave', (caveId) => {
        const p = players[socket.id];
        if (!p) return;
        if (p.inCave) return;
        
        const cave = caves.find(c => c.id === caveId);
        if (!cave) return;
        
        // Kiểm tra khoảng cách đến cửa hang
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
    
    // ========== SỰ KIỆN RA KHỎI HANG ==========
    socket.on('exitCave', () => {
        const p = players[socket.id];
        if (!p) return;
        if (!p.inCave) return;
        
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
    
    // ========== SỰ KIỆN SỬ DỤNG VẬT PHẨM ==========
    socket.on('useItem', (itemType) => {
        const p = players[socket.id];
        if (!p) return;
        
        if (itemType === 'revive' && p.consumables.revive > 0) {
            p.consumables.revive--;
            socket.emit('useItemSuccess', {
                type: 'revive',
                message: '🧪 Đã kích hoạt Bình Hồi Sinh! Sẽ tự hồi khi chết.',
                consumables: p.consumables
            });
        } else if (itemType === 'radar' && p.consumables.radar > 0) {
            p.consumables.radar--;
            // Tìm Boss gần nhất
            const bosses = monsters.filter(m => m.type === 'wasp');
            if (bosses.length > 0) {
                const nearest = bosses.reduce((a, b) => {
                    const da = Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
                    const db = Math.sqrt((p.x - b.x) ** 2 + (p.y - b.y) ** 2);
                    return da < db ? a : b;
                });
                socket.emit('radarResult', {
                    x: nearest.x,
                    y: nearest.y,
                    type: 'wasp'
                });
            } else {
                socket.emit('radarResult', null);
            }
            socket.emit('useItemSuccess', {
                type: 'radar',
                message: '📡 Đã quét radar!',
                consumables: p.consumables
            });
        }
    });
    
    // ========== NGẮT KẾT NỐI ==========
    socket.on('disconnect', () => {
        delete players[socket.id];
        console.log('Player disconnected:', socket.id);
    });
});

// ====================== GAME LOOP ======================

setInterval(() => {
    // 1. Cập nhật quái
    monsters.forEach(monster => {
        // Di chuyển ngẫu nhiên
        if (Math.random() < 0.05) {
            monster.targetX = monster.x + (Math.random() - 0.5) * 200;
            monster.targetY = monster.y + (Math.random() - 0.5) * 200;
            
            // Giới hạn trong map
            if (monster.type === 'cavebat') {
                const cave = caves.find(c => {
                    const dist = Math.sqrt((c.x - monster.x) ** 2 + (c.y - monster.y) ** 2);
                    return dist < 200;
                });
                if (cave) {
                    monster.targetX = Math.max(cave.x - 150, Math.min(cave.x + 150, monster.targetX));
                    monster.targetY = Math.max(cave.y - 150, Math.min(cave.y + 150, monster.targetY));
                }
            } else {
                monster.targetX = Math.max(50, Math.min(950, monster.targetX));
                monster.targetY = Math.max(50, Math.min(950, monster.targetY));
            }
        }
        
        // Di chuyển đến target
        const dx = monster.targetX - monster.x;
        const dy = monster.targetY - monster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 5) {
            monster.x += (dx / dist) * monster.speed;
            monster.y += (dy / dist) * monster.speed;
        }
        
        // Tấn công người chơi gần nhất (bán kính 100)
        let nearestPlayer = null;
        let minDist = Infinity;
        Object.values(players).forEach(p => {
            const d = Math.sqrt((p.x - monster.x) ** 2 + (p.y - monster.y) ** 2);
            if (d < minDist && d < 100) {
                minDist = d;
                nearestPlayer = p;
            }
        });
        
        if (nearestPlayer) {
            nearestPlayer.hp -= monster.damage * 0.1;
            if (nearestPlayer.hp <= 0) {
                // Xử lý khi người chơi chết
                const pId = nearestPlayer.id;
                if (players[pId]) {
                    // Kiểm tra có bình hồi sinh không
                    if (players[pId].consumables.revive > 0) {
                        players[pId].consumables.revive--;
                        players[pId].hp = players[pId].maxHp * 0.5;
                        io.to(pId).emit('revived', {
                            message: '🧪 Bạn đã được hồi sinh! HP: 50%',
                            hp: players[pId].hp
                        });
                    } else {
                        // Respawn về vị trí an toàn
                        players[pId].hp = players[pId].maxHp;
                        players[pId].x = 500 + (Math.random() - 0.5) * 100;
                        players[pId].y = 500 + (Math.random() - 0.5) * 100;
                        players[pId].inCave = false;
                        players[pId].caveId = -1;
                        io.to(pId).emit('respawn', {
                            message: '💀 Bạn đã chết! Respawn tại trung tâm.',
                            position: { x: players[pId].x, y: players[pId].y }
                        });
                    }
                }
            }
        }
    });
    
    // 2. Giảm cooldown tấn công cho người chơi
    Object.values(players).forEach(p => {
        if (p.attackCooldown > 0) p.attackCooldown--;
        
        // Tự động hồi phục HP
        if (p.hp < p.maxHp) {
            p.hp = Math.min(p.maxHp, p.hp + 0.1);
        }
    });
    
    // 3. Giảm thời gian sống của item
    items.forEach(item => {
        item.life--;
    });
    items = items.filter(item => item.life > 0);
    
    // 4. Broadcast trạng thái game
    io.emit('gameState', {
        players: players,
        monsters: monsters,
        items: items
    });
    
}, 50); // 20 FPS

// ====================== KHỞI ĐỘNG SERVER ======================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
    console.log(`📊 Số lượng quái: ${monsters.length}`);
    console.log(`🗺️ Map đã được tạo!`);
});