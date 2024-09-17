/**
 * 版权所有 © 2024 Admin-jwzz
 * 许可证：CC BY-NC 4.0
 * 详情请参阅 LICENSE 文件。
 */

// uiHandlers.js

// 更新计时器显示
function updateTimersDisplay() {
    for (var index in selectionDurations) {
        var selectionTimerElement = document.getElementById('selectionTimer' + index);
        selectionTimerElement.innerText = '选择时长: ' + selectionDurations[index].toFixed(3) + ' 秒';
    }
    for (var index in gameDurations) {
        var gameTimerElement = document.getElementById('gameTimer' + index);
        gameTimerElement.innerText = '游戏时长: ' + gameDurations[index].toFixed(3) + ' 秒';
    }
}

// 更新界面显示的函数
function updateInterfaceDisplay() {
    if (selectedIndex !== null) {
        document.querySelectorAll('.game-interface').forEach(function(element) {
            var index = parseInt(element.getAttribute('data-index'));
            if (index !== selectedIndex) {
                element.classList.add('minimized');
            } else {
                element.classList.remove('minimized');
            }
        });
    } else {
        // 还原所有界面
        document.querySelectorAll('.game-interface').forEach(function(element) {
            element.classList.remove('minimized');
        });
    }
}

// 重置界面状态
function resetInterface(index) {
    // 重置分数显示
    document.getElementById('score' + index).innerText = '分数: 0';

    // 清空画布
    var otherCanvas = document.getElementById('gameCanvas' + index);
    var otherCtx = otherCanvas.getContext('2d');
    otherCtx.clearRect(0, 0, otherCanvas.width, otherCanvas.height);

    // 清空下一个方块画布
    var otherNextCanvas = document.getElementById('nextCanvas' + index);
    var otherNextCtx = otherNextCanvas.getContext('2d');
    otherNextCtx.clearRect(0, 0, otherNextCanvas.width, otherNextCanvas.height);

    // 重置计时器显示
    document.getElementById('selectionTimer' + index).innerText = '选择时长: 0.000 秒';
    document.getElementById('gameTimer' + index).innerText = '游戏时长: 0.000 秒';

    // 重置计时器数据
    selectionDurations[index] = null;
    gameDurations[index] = null;

    // 清除保存的其他玩家状态
    delete otherPlayersState[index];
}

// 设置游戏界面
function setupGameInterface(index) {
    canvas = document.getElementById('gameCanvas' + index);
    ctx = canvas.getContext('2d');
    nextCanvas = document.getElementById('nextCanvas' + index);
    nextCtx = nextCanvas.getContext('2d');

    var startBtn = document.querySelector('.game-interface[data-index="' + index + '"] .startBtn');
    var pauseBtn = document.querySelector('.game-interface[data-index="' + index + '"] .pauseBtn');

    startBtn.style.display = 'inline-block';
    pauseBtn.style.display = 'inline-block';

    startBtn.addEventListener('click', startGame);
    pauseBtn.addEventListener('click', pauseGame);

    // 根据游戏是否已开始，更新开始按钮文本
    if (gameStarted) {
        startBtn.innerText = '重新开始';
    } else {
        startBtn.innerText = '开始游戏';
    }

    // 根据是否暂停，更新暂停按钮文本
    if (isPaused) {
        pauseBtn.innerText = '继续游戏';
    } else {
        pauseBtn.innerText = '暂停游戏';
    }
}

// 释放界面
function releaseInterface() {
    if (selectedIndex !== null) {
        // 停止游戏
        if (gameStarted) {
            cancelAnimationFrame(animationFrameId);
            gameStarted = false;
            isPaused = false;

            // 移除键盘事件监听
            document.removeEventListener('keydown', keyDownHandler);
            window.removeEventListener('keydown', preventArrowKeyScroll);

            // 重置游戏状态
            board = [];
            currentTetromino = null;
            nextTetromino = null;
            score = 0;

            // 清空画布
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);

            // 重置按钮文本
            var startBtn = document.querySelector('.game-interface[data-index="' + selectedIndex + '"] .startBtn');
            var pauseBtn = document.querySelector('.game-interface[data-index="' + selectedIndex + '"] .pauseBtn');
            startBtn.innerText = '开始游戏';
            pauseBtn.innerText = '暂停游戏';
            startBtn.style.display = 'none';
            pauseBtn.style.display = 'none';

            // 移除按钮事件监听
            startBtn.removeEventListener('click', startGame);
            pauseBtn.removeEventListener('click', pauseGame);
        }

        // 重置界面显示
        var cancelBtn = document.querySelector('.game-interface[data-index="' + selectedIndex + '"] .cancelBtn');
        var selectBtn = document.querySelector('.game-interface[data-index="' + selectedIndex + '"] .selectBtn');
        cancelBtn.style.display = 'none';
        selectBtn.disabled = false;
        selectBtn.innerText = '选择界面 ' + (parseInt(selectedIndex) + 1);

        // 更新 selectedIndex
        selectedIndex = null;

        // 通知服务器释放界面
        socket.emit('releaseInterface');

        // 更新界面显示
        updateInterfaceDisplay();
    }
}

// 绘制其他玩家的游戏板
function drawOtherPlayerBoard(ctx, boardData) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    var rows = boardData.length;
    var cols = boardData[0].length;
    for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
            if (boardData[r][c]) {
                ctx.fillStyle = boardData[r][c];
                ctx.fillRect(c * scale, r * scale, scale, scale);
                ctx.strokeRect(c * scale, r * scale, scale, scale);
            }
        }
    }
}

// 绘制其他玩家的当前方块
function drawOtherPlayerTetromino(ctx, tetromino) {
    if (tetromino && tetromino.shape) {
        ctx.fillStyle = tetromino.color;
        for (var r = 0; r < tetromino.shape.length; r++) {
            for (var c = 0; c < tetromino.shape[r].length; c++) {
                if (tetromino.shape[r][c]) {
                    ctx.fillRect((tetromino.x + c) * scale, (tetromino.y + r) * scale, scale, scale);
                    ctx.strokeRect((tetromino.x + c) * scale, (tetromino.y + r) * scale, scale, scale);
                }
            }
        }
    }
}

// 绘制其他玩家的下一个方块
function drawOtherPlayerNextTetromino(index, nextTetromino) {
    // 获取对应的界面元素
    var interfaceElement = document.querySelector('.game-interface[data-index="' + index + '"]');

    // 检查界面是否被展开（没有 minimized 类）
    if (!interfaceElement.classList.contains('minimized')) {
        var otherNextCanvas = document.getElementById('nextCanvas' + index);
        var otherNextCtx = otherNextCanvas ? otherNextCanvas.getContext('2d') : null;

        if (otherNextCtx) {
            otherNextCtx.clearRect(0, 0, otherNextCanvas.width, otherNextCanvas.height);
            var scaleNext = 30;
            if (nextTetromino && nextTetromino.shape) {
                otherNextCtx.fillStyle = nextTetromino.color;
                for (var r = 0; r < nextTetromino.shape.length; r++) {
                    for (var c = 0; c < nextTetromino.shape[r].length; c++) {
                        if (nextTetromino.shape[r][c]) {
                            otherNextCtx.fillRect(c * scaleNext, r * scaleNext, scaleNext, scaleNext);
                            otherNextCtx.strokeRect(c * scaleNext, r * scaleNext, scaleNext, scaleNext);
                        }
                    }
                }
            }
        }
    } else {
        // 如果界面被最小化，清空下一个方块的画布
        var otherNextCanvas = document.getElementById('nextCanvas' + index);
        var otherNextCtx = otherNextCanvas ? otherNextCanvas.getContext('2d') : null;

        if (otherNextCtx) {
            otherNextCtx.clearRect(0, 0, otherNextCanvas.width, otherNextCanvas.height);
        }
    }
}
