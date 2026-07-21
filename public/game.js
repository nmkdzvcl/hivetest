// ====================== KHỞI TẠO ======================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 900;
canvas.height = 700;

const minimap = document.getElementById('minimap');
const minimapCtx = minimap.getContext('2d');
minimap.width = 150;
minimap.height = 150;

const socket = io();

// ====================== BIẾN TOÀN CỤC ======================

let gameData = {
    players: {},
    monsters: [],
    items: []
};

let myId = null;
let myPlayer = null;
let mapData = [];
let caveData = [];
let recipeData = {};
let camera = { x: 0, y: 0 };
let mouseX = 0, mouseY = 0;
let targetX = 0, targetY = 0;
let isMoving = false;
let showCraft = false;

// ====================== XỬ LÝ SOCKET ======================

socket.on('init', (data) => {
    myId = data.id;
    mapData = data.map;
    caveData = data.caves;
    recipeData = data.recipes;
    gameData.players = data.players;
    gameData.monsters = data.monsters;
    gameData.items = data.items;
    
    myPlayer = gameData.players[myId];
    targetX = myPlayer.x;
    targetY = myPlayer.y;
    
    updateUI();
    renderCraftUI();
});

socket.on('gameState', (data) => {
    // Cập nhật dữ liệu game
    gameData.players = data.players;
    gameData.monsters = data.monsters;
    gameData.items = data.items;
    myPlayer = gameData.players[myId];
    updateUI();
});

socket.on('craftSuccess', (data) => {
    showNotification(data.message, '#4CAF50');
    myPlayer.inventory = data.inventory;
    if (data.equipment) myPlayer.equipment = data.equipment;
    if (data.consumables) myPlayer.consumables = data.consumables;
    updateUI();
    renderCraftUI();
});

socket.on('craftFail', (message) => {
    showNotification('❌ ' + message, '#ff4444');
});

socket.on('levelUp', (data) => {
    showNotification(`🎉 LEVEL UP! Bạn đã lên cấp ${data.level}!`, '#ffd700');
    myPlayer.level = data.level;
    myPlayer.maxHp = data.newHp;
    myPlayer.hp = data.newHp;
    myPlayer.damage = data.newDamage;
    updateUI();
});

socket.on('takeDamage', (data) => {
    showNotification(`💥 Bị tấn công! -${data.damage} HP`, '#ff4444');
});

socket.on('respawn', (data) => {
    showNotification('💀 ' + data.message, '#ff4444');
    myPlayer.x = data.position.x;
    myPlayer.y = data.position.y;
    targetX = myPlayer.x;
    targetY = myPlayer.y;
});

socket.on('revived', (data) => {
    showNotification('🧪 ' + data.message, '#4CAF50');
    myPlayer.hp = data.hp;
});

socket.on('enterCaveSuccess', (data) => {
    showNotification('🏔️ Đã vào hang!', '#4CAF50');
    myPlayer.x = data.position.x;
    myPlayer.y = data.position.y;
    myPlayer.inCave = true;
    myPlayer.caveId = data.caveId;
});

socket.on('exitCaveSuccess', (data) => {
    showNotification('🌞 Đã ra khỏi hang!', '#4CAF50');
    myPlayer.x = data.position.x;
    myPlayer.y = data.position.y;
    myPlayer.inCave = false;
    myPlayer.caveId = -1;
});

socket.on('pickupSuccess', (data) => {
    myPlayer.inventory = data.inventory;
    showNotification(`📦 Nhặt được ${data.amount} ${data.material}!`, '#4CAF50');
    updateUI();
});

socket.on('radarResult', (data) => {
    if (data) {
        showNotification(`📡 Tìm thấy Boss Wasp tại (${Math.round(data.x)}, ${Math.round(data.y)})!`, '#ffd700');
        // Đánh dấu trên minimap
        drawMinimap(data.x, data.y);
    } else {
        showNotification('📡 Không tìm thấy Boss nào!', '#ff9800');
    }
});

// ====================== UI UPDATE ======================

function updateUI() {
    if (!myPlayer) return;
    
    document.getElementById('hpDisplay').textContent = 
        `${Math.round(myPlayer.hp)}/${myPlayer.maxHp}`;
    document.getElementById('levelDisplay').textContent = myPlayer.level;
    document.getElementById('expDisplay').textContent = 
        `${Math.round(myPlayer.exp)}/${myPlayer.expToNext}`;
    document.getElementById('damageDisplay').textContent = myPlayer.damage;
    document.getElementById('killDisplay').textContent = myPlayer.killCount || 0;
    
    document.getElementById('honeyCount').textContent = myPlayer.inventory.honey || 0;
    document.getElementById('pollenCount').textContent = myPlayer.inventory.pollen || 0;
    document.getElementById('waxCount').textContent = myPlayer.inventory.wax || 0;
    document.getElementById('gemCount').textContent = myPlayer.inventory.gems || 0;
    
    document.getElementById('shieldStatus').textContent = myPlayer.equipment.shield ? '✅' : '❌';
    document.getElementById('weaponStatus').textContent = myPlayer.equipment.weapon ? '✅' : '❌';
    document.getElementById('bootsStatus').textContent = myPlayer.equipment.boots ? '✅' : '❌';
}

function renderCraftUI() {
    const list = document.getElementById('craftList');
    list.innerHTML = '';
    
    Object.entries(recipeData).forEach(([name, recipe]) => {
        const div = document.createElement('div');
        div.className = 'craft-item';
        
        const info = document.createElement('div');
        info.innerHTML = `<strong>${name}</strong><br><span class="cost">${recipe.desc}</span>`;
        
        const costText = Object.entries(recipe.cost)
            .map(([mat, amount]) => `${amount} ${mat}`)
            .join(', ');
        
        const btn = document.createElement('button');
        btn.textContent = `Craft (${costText})`;
        btn.onclick = () => socket.emit('craft', name);
        
        div.appendChild(info);
        div.appendChild(btn);
        list.appendChild(div);
    });
}

function showNotification(text, color = '#ffd700') {
    const el = document.getElementById('notification');
    el.textContent = text;
    el.style.borderColor = color;
    el.classList.add('show');
    clearTimeout(el._timeout);
    el._timeout = setTimeout(() => el.classList.remove('show'), 2000);
}

// ====================== CRAFT UI ======================

document.addEventListener('keydown', (e) => {
    if (e.key === 'c' || e.key === 'C') {
        showCraft = !showCraft;
        document.getElementById('craftUI').classList.toggle('hidden', !showCraft);
    }
    
    if (e.key === 'e' || e.key === 'E') {
        handleCaveInteraction();
    }
});

function closeCraft() {
    showCraft = false;
    document.getElementById('craftUI').classList.add('hidden');
}

function handleCaveInteraction() {
    if (!myPlayer) return;
    
    if (myPlayer.inCave) {
        socket.emit('exitCave');
        return;
    }
    
    // Tìm hang gần nhất
    let nearestCave = null;
    let minDist = Infinity;
    caveData.forEach(cave => {
        const dist = Math.sqrt((myPlayer.x - cave.x) ** 2 + (myPlayer.y - cave.y) ** 2);
        if (dist < minDist) {
            minDist = dist;
            nearestCave = cave;
        }
    });
    
    if (nearestCave && minDist < 60) {
        socket.emit('enterCave', nearestCave.id);
    } else {
        showNotification('🏔️ Đến gần cửa hang hơn để vào!', '#ff9800');
    }
}

// ====================== GAME LOOP (RENDER) ======================

function draw() {
    if (!myPlayer) {
        requestAnimationFrame(draw);
        return;
    }
    
    // Cập nhật camera
    camera.x = myPlayer.x - canvas.width / 2;
    camera.y = myPlayer.y - canvas.height / 2;
    
    // Xóa canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Vẽ map
    drawMap();
    
    // Vẽ items
    gameData.items.forEach(item => {
        const screenX = item.x - camera.x;
        const screenY = item.y - camera.y;
        if (screenX > -50 && screenX < canvas.width + 50 && 
            screenY > -50 && screenY < canvas.height + 50) {
            ctx.fillStyle = getMaterialColor(item.material);
            ctx.beginPath();
            ctx.arc(screenX, screenY, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'white';
            ctx.font = '8px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(item.material, screenX, screenY + 3);
        }
    });
    
    // Vẽ quái
    gameData.monsters.forEach(monster => {
        const screenX = monster.x - camera.x;
        const screenY = monster.y - camera.y;
        if (screenX > -50 && screenX < canvas.width + 50 && 
            screenY > -50 && screenY < canvas.height + 50) {
            
            // Body
            ctx.fillStyle = monster.color;
            ctx.beginPath();
            ctx.arc(screenX, screenY, monster.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            // HP bar
            const hpPercent = monster.hp / monster.maxHp;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(screenX - 20, screenY - monster.size - 10, 40, 4);
            ctx.fillStyle = hpPercent > 0.5 ? '#4CAF50' : hpPercent > 0.2 ? '#ff9800' : '#ff4444';
            ctx.fillRect(screenX - 20, screenY - monster.size - 10, 40 * hpPercent, 4);
            
            // Tên
            ctx.fillStyle = 'white';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(monster.type, screenX, screenY - monster.size - 15);
            
            // Click để tấn công
            monster._screenX = screenX;
            monster._screenY = screenY;
            monster._radius = monster.size;
        }
    });
    
    // Vẽ người chơi khác
    Object.values(gameData.players).forEach(p => {
        if (p.id === myId) return;
        
        const screenX = p.x - camera.x;
        const screenY = p.y - camera.y;
        if (screenX > -50 && screenX < canvas.width + 50 && 
            screenY > -50 && screenY < canvas.height + 50) {
            
            // Body
            ctx.fillStyle = '#ff6b35';
            ctx.beginPath();
            ctx.arc(screenX, screenY, p.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // HP bar
            const hpPercent = p.hp / p.maxHp;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(screenX - 20, screenY - p.radius - 10, 40, 4);
            ctx.fillStyle = hpPercent > 0.5 ? '#4CAF50' : '#ff9800';
            ctx.fillRect(screenX - 20, screenY - p.radius - 10, 40 * hpPercent, 4);
            
            ctx.fillStyle = 'white';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`Lv.${p.level}`, screenX, screenY - p.radius - 18);
        }
    });
    
    // Vẽ người chơi hiện tại (lớn hơn và nổi bật)
    const screenX = myPlayer.x - camera.x;
    const screenY = myPlayer.y - camera.y;
    
    // Glow effect
    const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, 40);
    gradient.addColorStop(0, 'rgba(255, 215, 0, 0.3)');
    gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(screenX, screenY, 40, 0, Math.PI * 2);
    ctx.fill();
    
    // Body
    ctx.fillStyle = '#ffd700';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(screenX, screenY, myPlayer.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // HP bar
    const hpPercent = myPlayer.hp / myPlayer.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(screenX - 25, screenY - myPlayer.radius - 15, 50, 6);
    ctx.fillStyle = hpPercent > 0.5 ? '#4CAF50' : hpPercent > 0.2 ? '#ff9800' : '#ff4444';
    ctx.fillRect(screenX - 25, screenY - myPlayer.radius - 15, 50 * hpPercent, 6);
    
    // Level
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`⭐${myPlayer.level}`, screenX, screenY - myPlayer.radius - 22);
    
    // Equipments indicator
    let equipText = '';
    if (myPlayer.equipment.shield) equipText += '🛡️';
    if (myPlayer.equipment.weapon) equipText += '⚔️';
    if (myPlayer.equipment.boots) equipText += '👢';
    if (equipText) {
        ctx.font = '12px Arial';
        ctx.fillText(equipText, screenX, screenY + myPlayer.radius + 18);
    }
    
    // Vẽ minimap
    drawMinimap();
    
    requestAnimationFrame(draw);
}

// ====================== VẼ MAP ======================

function drawMap() {
    // Vẽ từng ô
    for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 10; col++) {
            const type = mapData[row]?.[col] || 'grass';
            const x = col * 100 - camera.x;
            const y = row * 100 - camera.y;
            
            if (x > -110 && x < canvas.width + 10 && y > -110 && y < canvas.height + 10) {
                let color;
                switch(type) {
                    case 'grass': color = '#7cc46c'; break;
                    case 'forest': color = '#2d6a1e'; break;
                    case 'swamp': color = '#4a7c70'; break;
                    case 'cave': color = '#555555'; break;
                    default: color = '#7cc46c';
                }
                ctx.fillStyle = color;
                ctx.fillRect(x, y, 100, 100);
                ctx.strokeStyle = 'rgba(0,0,0,0.1)';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, 100, 100);
            }
        }
    }
    
    // Vẽ cửa hang
    caveData.forEach(cave => {
        const x = cave.x - camera.x;
        const y = cave.y - camera.y;
        if (x > -50 && x < canvas.width + 50 && y > -50 && y < canvas.height + 50) {
            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath();
            ctx.moveTo(x - 15, y - 10);
            ctx.lineTo(x + 15, y - 10);
            ctx.lineTo(x, y + 15);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#ffd700';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('🏔️', x, y - 18);
            
            // Nếu đang ở gần, highlight
            if (myPlayer) {
                const dist = Math.sqrt((myPlayer.x - cave.x) ** 2 + (myPlayer.y - cave.y) ** 2);
                if (dist < 60) {
                    ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([5, 5]);
                    ctx.beginPath();
                    ctx.arc(x, y, 30, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }
        }
    });
}

// ====================== MINIMAP ======================

function drawMinimap(highlightX = null, highlightY = null) {
    minimapCtx.clearRect(0, 0, 150, 150);
    
    // Vẽ map thu nhỏ
    const scale = 150 / 1000;
    for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 10; col++) {
            const type = mapData[row]?.[col] || 'grass';
            let color;
            switch(type) {
                case 'grass': color = '#3d7a2e'; break;
                case 'forest': color = '#1a4a0f'; break;
                case 'swamp': color = '#2a5a50'; break;
                case 'cave': color = '#3a3a3a'; break;
                default: color = '#3d7a2e';
            }
            minimapCtx.fillStyle = color;
            minimapCtx.fillRect(col * 15, row * 15, 15, 15);
        }
    }
    
    // Vẽ người chơi
    Object.values(gameData.players).forEach(p => {
        const x = p.x * scale;
        const y = p.y * scale;
        minimapCtx.fillStyle = p.id === myId ? '#ffd700' : '#ff6b35';
        minimapCtx.beginPath();
        minimapCtx.arc(x, y, 3, 0, Math.PI * 2);
        minimapCtx.fill();
    });
    
    // Vẽ quái
    gameData.monsters.forEach(m => {
        const x = m.x * scale;
        const y = m.y * scale;
        minimapCtx.fillStyle = m.type === 'wasp' ? '#ffd700' : '#ff4444';
        minimapCtx.fillRect(x - 1, y - 1, 2, 2);
    });
    
    // Vẽ highlight (radar)
    if (highlightX !== null && highlightY !== null) {
        minimapCtx.strokeStyle = '#ffd700';
        minimapCtx.lineWidth = 2;
        minimapCtx.beginPath();
        minimapCtx.arc(highlightX * scale, highlightY * scale, 5, 0, Math.PI * 2);
        minimapCtx.stroke();
    }
    
    // Viewport
    const vx = camera.x * scale;
    const vy = camera.y * scale;
    const vw = canvas.width * scale;
    const vh = canvas.height * scale;
    minimapCtx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    minimapCtx.lineWidth = 1;
    minimapCtx.strokeRect(vx, vy, vw, vh);
}

// ====================== MATERIAL COLOR ======================

function getMaterialColor(material) {
    const colors = {
        honey: '#ffd700',
        pollen: '#ff69b4',
        wax: '#f5e6ca',
        gems: '#00e5ff'
    };
    return colors[material] || '#888';
}

// ====================== SỰ KIỆN CHUỘT ======================

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    mouseX = (e.clientX - rect.left) * scaleX;
    mouseY = (e.clientY - rect.top) * scaleY;
});

canvas.addEventListener('click', (e) => {
    // Di chuyển đến vị trí click
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const worldX = (e.clientX - rect.left) * scaleX + camera.x;
    const worldY = (e.clientY - rect.top) * scaleY + camera.y;
    
    // Kiểm tra click vào quái để tấn công
    let attacked = false;
    gameData.monsters.forEach(monster => {
        const screenX = monster.x - camera.x;
        const screenY = monster.y - camera.y;
        const dist = Math.sqrt(
            (mouseX - screenX) ** 2 + 
            (mouseY - screenY) ** 2
        );
        if (dist < monster.size + 10) {
            socket.emit('attack', monster.id);
            attacked = true;
        }
    });
    
    // Nếu không tấn công thì di chuyển
    if (!attacked) {
        targetX = worldX;
        targetY = worldY;
        isMoving = true;
    }
});

// Di chuyển liên tục theo target
function updateMovement() {
    if (!myPlayer) return;
    
    if (isMoving) {
        const dx = targetX - myPlayer.x;
        const dy = targetY - myPlayer.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 2) {
            isMoving = false;
            return;
        }
        
        const speed = myPlayer.speed * (myPlayer.speedMod || 1);
        myPlayer.x += (dx / dist) * Math.min(speed, dist);
        myPlayer.y += (dy / dist) * Math.min(speed, dist);
        
        // Gửi vị trí lên server
        socket.emit('move', { x: myPlayer.x, y: myPlayer.y });
    }
    
    // Nhặt đồ tự động
    gameData.items.forEach(item => {
        const dist = Math.sqrt((myPlayer.x - item.x) ** 2 + (myPlayer.y - item.y) ** 2);
        if (dist < 50) {
            socket.emit('pickup');
        }
    });
    
    requestAnimationFrame(updateMovement);
}

// ====================== KHỞI CHẠY GAME ======================

draw();
updateMovement();

// Xử lý resize canvas
function resizeCanvas() {
    const ratio = canvas.width / canvas.height;
    let w = window.innerWidth - 20;
    let h = window.innerHeight - 20;
    if (w / h > ratio) {
        canvas.style.width = (h * ratio) + 'px';
        canvas.style.height = h + 'px';
    } else {
        canvas.style.width = w + 'px';
        canvas.style.height = (w / ratio) + 'px';
    }
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

console.log('🐝 Hive.io đã sẵn sàng!');
console.log('📖 Hướng dẫn: Di chuyển (click chuột phải), Tấn công (click chuột trái vào quái)');
console.log('🔨 Craft: Phím C');
console.log('🏔️ Vào hang: Phím E (gần cửa hang)');