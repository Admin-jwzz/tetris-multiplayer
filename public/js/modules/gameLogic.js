/**
 * 版权所有 © 2024 Admin-jwzz
 * 许可证：CC BY-NC 4.0
 * 详情请参阅 LICENSE 文件。
 */

// gameLogic.js

// 开始游戏
function startGame() {
    if (gameStarted) {
        // 重新开始游戏
        resetGameState();
    } else {
        gameStarted = true;
    }
    isPaused = false;

    // 修改按钮文本
    var startBtn = document.querySelector('.game-interface[data-index="' + selectedIndex + '"] .startBtn');
    var pauseBtn = document.querySelector('.game-interface[data-index="' + selectedIndex + '"] .pauseBtn');
    startBtn.innerText = '重新开始';
    pauseBtn.innerText = '暂停游戏';

    // 初始化游戏参数
    scale = 30; // 每个方块的尺寸
    rows = canvas.height / scale;
    cols = canvas.width / scale;

    // 初始化游戏状态
    board = Array.from({ length: rows }, function() { return Array(cols).fill(0); });
    score = 0;
    lastTime = 0;
    dropCounter = 0;
    dropInterval = 1000;

    currentTetromino = newTetromino();
    nextTetromino = newTetromino();

    drawNextTetromino();

    // 更新分数显示
    updateScore();

    // 添加键盘事件监听
    document.addEventListener('keydown', keyDownHandler);

    // 防止方向键滚动页面
    window.addEventListener('keydown', preventArrowKeyScroll);

    // 通知服务器游戏已重新开始
    socket.emit('gameRestarted');

    // 开始游戏循环
    animationFrameId = requestAnimationFrame(update);
}

// 暂停游戏
function pauseGame() {
    if (!gameStarted) return;
    isPaused = !isPaused;
    var pauseBtn = document.querySelector('.game-interface[data-index="' + selectedIndex + '"] .pauseBtn');
    pauseBtn.innerText = isPaused ? '继续游戏' : '暂停游戏';
    if (!isPaused) {
        lastTime = performance.now();
        animationFrameId = requestAnimationFrame(update);

        // 通知服务器游戏已恢复
        socket.emit('resumeGame');
    } else {
        cancelAnimationFrame(animationFrameId);

        // 通知服务器游戏已暂停
        socket.emit('pauseGame');

        // 发送游戏状态给服务器
        socket.emit('gameState', {
            board: board,
            currentTetromino: currentTetromino,
            nextTetromino: nextTetromino,
            score: score,
            isPaused: isPaused
        });
    }
}

// 游戏循环更新
function update(time) {
    if (time === undefined) time = 0;
    var deltaTime = time - lastTime;
    lastTime = time;

    dropCounter += deltaTime;
    if (dropCounter >= dropInterval) {
        if (!moveTetromino('down')) {
            placeTetromino();
            currentTetromino = nextTetromino;
            nextTetromino = newTetromino();
            drawNextTetromino();
            if (checkCollision(currentTetromino, currentTetromino.x, currentTetromino.y)) {
                gameOver();
                return;
            }
        }
        dropCounter = 0;
    }

    drawBoard();
    drawTetromino(currentTetromino, currentTetromino.x, currentTetromino.y);

    // 发送游戏状态给服务器
    socket.emit('gameState', {
        board: board,
        currentTetromino: currentTetromino,
        nextTetromino: nextTetromino,
        score: score,
        isPaused: isPaused
    });

    if (!isPaused) {
        animationFrameId = requestAnimationFrame(update);
    }
}

// 绘制游戏板
function drawBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
            if (board[r][c]) {
                ctx.fillStyle = board[r][c];
                ctx.fillRect(c * scale, r * scale, scale, scale);
                ctx.strokeRect(c * scale, r * scale, scale, scale);
            }
        }
    }
}

// 绘制当前方块
function drawTetromino(tetromino, x, y) {
    ctx.fillStyle = tetromino.color;
    for (var r = 0; r < tetromino.shape.length; r++) {
        for (var c = 0; c < tetromino.shape[r].length; c++) {
            if (tetromino.shape[r][c]) {
                ctx.fillRect((x + c) * scale, (y + r) * scale, scale, scale);
                ctx.strokeRect((x + c) * scale, (y + r) * scale, scale, scale);
            }
        }
    }
}

// 绘制下一个方块
function drawNextTetromino() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    var scaleNext = 30;
    nextCtx.fillStyle = nextTetromino.color;
    for (var r = 0; r < nextTetromino.shape.length; r++) {
        for (var c = 0; c < nextTetromino.shape[r].length; c++) {
            if (nextTetromino.shape[r][c]) {
                nextCtx.fillRect(c * scaleNext, r * scaleNext, scaleNext, scaleNext);
                nextCtx.strokeRect(c * scaleNext, r * scaleNext, scaleNext, scaleNext);
            }
        }
    }
}

// 创建新的方块
function newTetromino() {
    var tetromino = tetrominoes[Math.floor(Math.random() * tetrominoes.length)];
    return {
        shape: tetromino.shape,
        color: tetromino.color,
        x: Math.floor(cols / 2) - Math.floor(tetromino.shape[0].length / 2),
        y: 0
    };
}

// 移动方块
function moveTetromino(dir) {
    var oldX = currentTetromino.x;
    var oldY = currentTetromino.y;

    if (dir === 'left') currentTetromino.x--;
    if (dir === 'right') currentTetromino.x++;
    if (dir === 'down') currentTetromino.y++;

    if (checkCollision(currentTetromino, currentTetromino.x, currentTetromino.y)) {
        currentTetromino.x = oldX;
        currentTetromino.y = oldY;
        if (dir === 'down') {
            placeTetromino();
            currentTetromino = nextTetromino;
            nextTetromino = newTetromino();
            drawNextTetromino();
            if (checkCollision(currentTetromino, currentTetromino.x, currentTetromino.y)) {
                gameOver();
                return false;
            }
        }
    }
    return true;
}

// 放置方块
function placeTetromino() {
    for (var r = 0; r < currentTetromino.shape.length; r++) {
        for (var c = 0; c < currentTetromino.shape[r].length; c++) {
            if (currentTetromino.shape[r][c]) {
                board[currentTetromino.y + r][currentTetromino.x + c] = currentTetromino.color;
            }
        }
    }
    removeFullLines();
}

// 消除完整的行
function removeFullLines() {
    var linesRemoved = 0;
    for (var r = rows - 1; r >= 0; r--) {
        if (board[r].every(function(cell) { return cell; })) {
            board.splice(r, 1);
            board.unshift(Array(cols).fill(0));
            linesRemoved++;
            r++; // 重新检查当前行
        }
    }
    if (linesRemoved > 0) {
        score += linesRemoved * 100; // 每删除一行增加100分
        updateScore();
    }
}

// 更新分数显示
function updateScore() {
    var scoreElement = document.getElementById('score' + selectedIndex);
    scoreElement.innerText = '分数: ' + score;
}

// 检查碰撞
function checkCollision(tetromino, x, y) {
    for (var r = 0; r < tetromino.shape.length; r++) {
        for (var c = 0; c < tetromino.shape[r].length; c++) {
            if (tetromino.shape[r][c]) {
                var newX = x + c;
                var newY = y + r;
                if (newX < 0 || newX >= cols || newY >= rows || (newY >= 0 && board[newY][newX])) {
                    return true;
                }
            }
        }
    }
    return false;
}

// 旋转方块
function rotateTetromino() {
    var oldShape = currentTetromino.shape;
    var newShape = currentTetromino.shape[0].map(function(_, index) {
        return currentTetromino.shape.map(function(row) { return row[index]; }).reverse();
    });
    currentTetromino.shape = newShape;

    if (checkCollision(currentTetromino, currentTetromino.x, currentTetromino.y)) {
        currentTetromino.shape = oldShape;
    }
}

// 游戏结束
function gameOver() {
    if (isPaused || !gameStarted) return; // 防止重复调用
    isPaused = true;
    gameStarted = false;

    // 通知服务器游戏已结束
    socket.emit('gameOver');

    // 发送游戏状态给服务器
    socket.emit('gameState', {
        board: board,
        currentTetromino: currentTetromino,
        nextTetromino: nextTetromino,
        score: score,
        isPaused: isPaused
    });

    alert('游戏结束！');

    // 修改按钮文本
    var startBtn = document.querySelector('.game-interface[data-index="' + selectedIndex + '"] .startBtn');
    startBtn.innerText = '重新开始';
}

// 恢复游戏状态的函数
function restoreGameState(state) {
    board = state.board;
    currentTetromino = state.currentTetromino;
    nextTetromino = state.nextTetromino;
    score = state.score;
    isPaused = state.isPaused;

    // 初始化游戏参数
    scale = 30; // 每个方块的尺寸
    rows = canvas.height / scale;
    cols = canvas.width / scale;

    // 更新分数显示
    updateScore();

    // 绘制下一个方块
    drawNextTetromino();

    // 添加键盘事件监听
    document.addEventListener('keydown', keyDownHandler);

    // 防止方向键滚动页面
    window.addEventListener('keydown', preventArrowKeyScroll);

    gameStarted = true;

    var startBtn = document.querySelector('.game-interface[data-index="' + selectedIndex + '"] .startBtn');
    var pauseBtn = document.querySelector('.game-interface[data-index="' + selectedIndex + '"] .pauseBtn');

    // 更新按钮文本
    startBtn.innerText = '重新开始';
    pauseBtn.innerText = isPaused ? '继续游戏' : '暂停游戏';

    // 绘制当前游戏状态
    drawBoard();
    drawTetromino(currentTetromino, currentTetromino.x, currentTetromino.y);

    if (!isPaused) {
        lastTime = performance.now();
        animationFrameId = requestAnimationFrame(update);
    }
}

// 重置游戏状态
function resetGameState() {
    // 清除游戏循环
    cancelAnimationFrame(animationFrameId);

    // 重置游戏状态
    board = Array.from({ length: rows }, function() { return Array(cols).fill(0); });
    score = 0;
    lastTime = 0;
    dropCounter = 0;
    dropInterval = 1000;

    currentTetromino = newTetromino();
    nextTetromino = newTetromino();

    drawNextTetromino();

    // 更新分数显示
    updateScore();

    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 通知服务器游戏已开始
    socket.emit('gameStarted');

    // 重新开始游戏循环
    animationFrameId = requestAnimationFrame(update);
}
