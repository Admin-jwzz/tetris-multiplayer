// client.js

// 全局变量
let socket;
let sessionID;
let nickname = '';
let nicknameContainer = document.getElementById('nicknameContainer');
let nicknameInput = document.getElementById('nicknameInput');
let setNicknameBtn = document.getElementById('setNicknameBtn');
let chatContainer = document.getElementById('chatContainer');
let chatHeader = document.getElementById('chatHeader');
let chatMessages = document.getElementById('chatMessages');
let chatInput = document.getElementById('chatInput');
let chatHistory = [];
let storedGameState = null;

// 保存其他玩家的游戏状态
let otherPlayersState = {};

// 游戏相关变量
let selectedIndex = null;
let canvas, ctx, nextCanvas, nextCtx;
let scale = 30; // 每个方块的尺寸
let rows, cols;
let board = [];
let currentTetromino, nextTetromino;
let score = 0;
let lastTime = 0;
let dropCounter = 0;
let dropInterval = 1000;
let gameStarted = false;
let isPaused = false;
let animationFrameId;
let pausedTime;

// 计时器数据
let selectionDurations = {};
let gameDurations = {};

// 俄罗斯方块形状
const tetrominoes = [
    { shape: [[1, 1, 1, 1]], color: 'cyan' }, // I
    { shape: [[1, 1], [1, 1]], color: 'yellow' }, // O
    { shape: [[1, 1, 0], [0, 1, 1]], color: 'green' }, // S
    { shape: [[0, 1, 1], [1, 1, 0]], color: 'red' }, // Z
    { shape: [[1, 1, 1], [0, 1, 0]], color: 'blue' }, // T
    { shape: [[1, 1, 1], [1, 0, 0]], color: 'orange' }, // L
    { shape: [[1, 1, 1], [0, 0, 1]], color: 'purple' } // J
];

// 检查是否有 session cookie
function hasSessionCookie() {
    const hasCookie = document.cookie.includes('connect.sid');
    console.log('是否有 session cookie:', hasCookie);
    return hasCookie;
}

// 检查是否有已存储的昵称
if (hasSessionCookie()) {
    nickname = localStorage.getItem('nickname') || '';
    console.log('从 localStorage 获取的昵称:', nickname);
    nicknameContainer.style.display = 'none';
    document.getElementById('interfaces').style.display = 'flex';

    // 初始化 Socket.io 连接
    initSocketConnection();

    // 允许使用聊天室
    chatInput.disabled = false;
} else {
    // 显示昵称输入框
    nicknameContainer.style.display = 'block';
}

setNicknameBtn.addEventListener('click', () => {
    let newNickname = nicknameInput.value.trim();
    if (newNickname === '') {
        alert('请输入有效的昵称！');
        return;
    }

    // 发送昵称到服务器
    fetch('/setNickname', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ nickname: newNickname })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            nickname = newNickname;
            localStorage.setItem('nickname', nickname);
            nicknameContainer.style.display = 'none';
            document.getElementById('interfaces').style.display = 'flex';

            // 初始化 Socket.io 连接
            initSocketConnection();

            // 允许使用聊天室
            chatInput.disabled = false;
        } else {
            alert(data.message);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('无法连接到服务器，请稍后重试。');
    });
});

// 初始化 Socket.io 连接的函数
function initSocketConnection() {
    socket = io({
        withCredentials: true
    });

    // 用于存储 sessionID
    sessionID = '';

    // 接收服务器发送的 sessionID
    socket.on('setSessionID', (id) => {
        sessionID = id;
    });

    // 接收其他玩家的昵称更新
    socket.on('updateNicknames', (nicknames) => {
        for (let i = 0; i < 4; i++) {
            const nicknameElement = document.getElementById(`nickname${i}`);
            if (nicknames[i]) {
                nicknameElement.innerText = `昵称：${nicknames[i]}`;
            } else {
                nicknameElement.innerText = `昵称：未设置`;
            }
        }
    });

    // 接收界面状态更新
    socket.on('interfaceStatus', (interfaces) => {
        document.querySelectorAll('.game-interface').forEach((element) => {
            const index = parseInt(element.getAttribute('data-index'));
            const selectButton = element.querySelector('.selectBtn');
            const cancelButton = element.querySelector('.cancelBtn');

            if (interfaces[index] === null) {
                selectButton.disabled = false;
                selectButton.innerText = `选择界面 ${index + 1}`;
                cancelButton.style.display = 'none';

                // 重置计时器
                selectionDurations[index] = null;
                gameDurations[index] = null;

                // 如果不是自己释放的界面，需要重置该界面的游戏状态
                if (index !== selectedIndex) {
                    resetInterface(index);
                }
            } else {
                selectButton.disabled = true;
                if (interfaces[index] === sessionID) {
                    selectButton.innerText = `已选择`;
                    cancelButton.style.display = 'inline-block';

                    // 设置 selectedIndex
                    if (selectedIndex === null) {
                        selectedIndex = index;

                        // 恢复游戏界面
                        setupGameInterface(index);

                        // 请求服务器发送保存的游戏状态
                        socket.emit('requestGameState', index);
                    }
                } else {
                    selectButton.innerText = `已被占用`;
                    cancelButton.style.display = 'none';
                }
            }

            // 如果用户已占用一个界面，禁用其他选择按钮
            if (selectedIndex !== null) {
                document.querySelectorAll('.selectBtn').forEach((btn) => {
                    const parent = btn.closest('.game-interface');
                    const idx = parseInt(parent.getAttribute('data-index'));
                    if (idx !== selectedIndex) {
                        btn.disabled = true;
                        btn.innerText = `已选择其他界面`;
                    }
                });
            }
        });

        // 更新界面显示
        updateInterfaceDisplay();
    });

    // 接收服务器发送的游戏状态
    socket.on('restoreGameState', (state) => {
        if (state && selectedIndex !== null) {
            // 恢复游戏状态
            restoreGameState(state);
        }
    });

    // 接收其他玩家的游戏状态更新
    socket.on('updateGameState', ({ id, index, state }) => {
        // 保存其他玩家的游戏状态
        otherPlayersState[index] = state;

        // 获取对应的 canvas 和 context
        const otherCanvas = document.getElementById(`gameCanvas${index}`);
        const otherCtx = otherCanvas ? otherCanvas.getContext('2d') : null;

        if (otherCtx) {
            // 绘制其他玩家的游戏板
            drawOtherPlayerBoard(otherCtx, state.board);

            // 绘制其他玩家的当前方块
            drawOtherPlayerTetromino(otherCtx, state.currentTetromino);

            // 绘制其他玩家的下一个方块
            drawOtherPlayerNextTetromino(index, state.nextTetromino);

            // 更新其他玩家的分数显示
            const otherScoreElement = document.getElementById(`score${index}`);
            if (otherScoreElement) {
                otherScoreElement.innerText = `分数: ${state.score}`;
            }
        }
    });

    // 接收所有玩家的游戏状态
    socket.on('updateAllGameStates', (gameStates) => {
        for (let index in gameStates) {
            const state = gameStates[index];
            // 保存其他玩家的游戏状态
            otherPlayersState[index] = state;

            // 绘制其他玩家的游戏板
            const otherCanvas = document.getElementById(`gameCanvas${index}`);
            const otherCtx = otherCanvas ? otherCanvas.getContext('2d') : null;

            if (otherCtx) {
                // 绘制其他玩家的游戏板
                drawOtherPlayerBoard(otherCtx, state.board);

                // 绘制其他玩家的当前方块
                drawOtherPlayerTetromino(otherCtx, state.currentTetromino);

                // 绘制其他玩家的下一个方块
                drawOtherPlayerNextTetromino(index, state.nextTetromino);

                // 更新其他玩家的分数显示
                const otherScoreElement = document.getElementById(`score${index}`);
                if (otherScoreElement) {
                    otherScoreElement.innerText = `分数: ${state.score}`;
                }
            }
        }
    });

    // 接收计时器数据
    socket.on('updateTimers', (data) => {
        selectionDurations = data.selectionDurations;
        gameDurations = data.gameDurations;
        updateTimersDisplay();
    });

    // 更新计时器显示
    function updateTimersDisplay() {
        for (let index in selectionDurations) {
            const selectionTimerElement = document.getElementById(`selectionTimer${index}`);
            selectionTimerElement.innerText = `选择时长: ${selectionDurations[index].toFixed(3)} 秒`;
        }
        for (let index in gameDurations) {
            const gameTimerElement = document.getElementById(`gameTimer${index}`);
            gameTimerElement.innerText = `游戏时长: ${gameDurations[index].toFixed(3)} 秒`;
        }
    }

    // 处理选择按钮点击事件
    document.querySelectorAll('.selectBtn').forEach((button) => {
        button.addEventListener('click', (event) => {
            if (selectedIndex !== null) {
                alert('您已选择了一个界面，无法再次选择。');
                return;
            }
            const parent = event.target.closest('.game-interface');
            const index = parseInt(parent.getAttribute('data-index'));
            selectedIndex = index; // 立即设置 selectedIndex
            socket.emit('selectInterface', index);

            // 立即缩小其他界面
            updateInterfaceDisplay();
        });
    });

    // 更新界面显示的函数
    function updateInterfaceDisplay() {
        if (selectedIndex !== null) {
            document.querySelectorAll('.game-interface').forEach((element) => {
                const index = parseInt(element.getAttribute('data-index'));
                if (index !== selectedIndex) {
                    element.classList.add('minimized');
                } else {
                    element.classList.remove('minimized');
                }
            });
        } else {
            // 还原所有界面
            document.querySelectorAll('.game-interface').forEach((element) => {
                element.classList.remove('minimized');
            });
        }
    }

    // 处理取消按钮点击事件
    document.querySelectorAll('.cancelBtn').forEach((button) => {
        button.addEventListener('click', () => {
            releaseInterface();
        });
    });

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
                const startBtn = document.querySelector(`.game-interface[data-index="${selectedIndex}"] .startBtn`);
                const pauseBtn = document.querySelector(`.game-interface[data-index="${selectedIndex}"] .pauseBtn`);
                startBtn.innerText = '开始游戏';
                pauseBtn.innerText = '暂停游戏';
                startBtn.style.display = 'none';
                pauseBtn.style.display = 'none';

                // 移除按钮事件监听
                startBtn.removeEventListener('click', startGame);
                pauseBtn.removeEventListener('click', pauseGame);
            }

            // 重置界面显示
            const cancelBtn = document.querySelector(`.game-interface[data-index="${selectedIndex}"] .cancelBtn`);
            const selectBtn = document.querySelector(`.game-interface[data-index="${selectedIndex}"] .selectBtn`);
            cancelBtn.style.display = 'none';
            selectBtn.disabled = false;
            selectBtn.innerText = `选择界面 ${parseInt(selectedIndex) + 1}`;

            // 更新 selectedIndex
            selectedIndex = null;

            // 通知服务器释放界面
            socket.emit('releaseInterface');

            // 更新界面显示
            updateInterfaceDisplay();
        }
    }

    // 接收开始游戏的通知
    socket.on('startGame', (index) => {
        setupGameInterface(index);

        if (storedGameState) {
            restoreGameState(storedGameState);
            storedGameState = null;
        }
    });

    // 设置游戏界面
    function setupGameInterface(index) {
        canvas = document.getElementById(`gameCanvas${index}`);
        ctx = canvas.getContext('2d');
        nextCanvas = document.getElementById(`nextCanvas${index}`);
        nextCtx = nextCanvas.getContext('2d');

        const startBtn = document.querySelector(`.game-interface[data-index="${index}"] .startBtn`);
        const pauseBtn = document.querySelector(`.game-interface[data-index="${index}"] .pauseBtn`);

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

        const startBtn = document.querySelector(`.game-interface[data-index="${selectedIndex}"] .startBtn`);
        const pauseBtn = document.querySelector(`.game-interface[data-index="${selectedIndex}"] .pauseBtn`);

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
        const startBtn = document.querySelector(`.game-interface[data-index="${selectedIndex}"] .startBtn`);
        const pauseBtn = document.querySelector(`.game-interface[data-index="${selectedIndex}"] .pauseBtn`);
        startBtn.innerText = '重新开始';
        pauseBtn.innerText = '暂停游戏';
    
        // 初始化游戏参数
        scale = 30; // 每个方块的尺寸
        rows = canvas.height / scale;
        cols = canvas.width / scale;
    
        // 初始化游戏状态
        board = Array.from({ length: rows }, () => Array(cols).fill(0));
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


    // 重置游戏状态
    function resetGameState() {
        // 清除游戏循环
        cancelAnimationFrame(animationFrameId);

        // 重置游戏状态
        board = Array.from({ length: rows }, () => Array(cols).fill(0));
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

    // 暂停游戏
    function pauseGame() {
        if (!gameStarted) return;
        isPaused = !isPaused;
        const pauseBtn = document.querySelector(`.game-interface[data-index="${selectedIndex}"] .pauseBtn`);
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

    // 防止方向键滚动页面
    function preventArrowKeyScroll(e) {
        // 如果焦点在输入框中，不阻止默认行为
        if (e.target.tagName.toLowerCase() === 'input') return;

        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
        }
    }

    // 键盘事件处理
    function keyDownHandler(event) {
        if (!gameStarted || isPaused) return;
        if (event.key === 'ArrowLeft') moveTetromino('left');
        if (event.key === 'ArrowRight') moveTetromino('right');
        if (event.key === 'ArrowDown') moveTetromino('down');
        if (event.key === 'ArrowUp') rotateTetromino();
    }

    // 更新游戏状态
    function update(time = 0) {
        const deltaTime = time - lastTime;
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
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
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
        for (let r = 0; r < tetromino.shape.length; r++) {
            for (let c = 0; c < tetromino.shape[r].length; c++) {
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
        const scaleNext = 30;
        nextCtx.fillStyle = nextTetromino.color;
        for (let r = 0; r < nextTetromino.shape.length; r++) {
            for (let c = 0; c < nextTetromino.shape[r].length; c++) {
                if (nextTetromino.shape[r][c]) {
                    nextCtx.fillRect(c * scaleNext, r * scaleNext, scaleNext, scaleNext);
                    nextCtx.strokeRect(c * scaleNext, r * scaleNext, scaleNext, scaleNext);
                }
            }
        }
    }

    // 创建新的方块
    function newTetromino() {
        const tetromino = tetrominoes[Math.floor(Math.random() * tetrominoes.length)];
        return {
            shape: tetromino.shape,
            color: tetromino.color,
            x: Math.floor(cols / 2) - Math.floor(tetromino.shape[0].length / 2),
            y: 0
        };
    }

    // 移动方块
    function moveTetromino(dir) {
        const oldX = currentTetromino.x;
        const oldY = currentTetromino.y;

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
        for (let r = 0; r < currentTetromino.shape.length; r++) {
            for (let c = 0; c < currentTetromino.shape[r].length; c++) {
                if (currentTetromino.shape[r][c]) {
                    board[currentTetromino.y + r][currentTetromino.x + c] = currentTetromino.color;
                }
            }
        }
        removeFullLines();
    }

    // 消除完整的行
    function removeFullLines() {
        let linesRemoved = 0;
        for (let r = rows - 1; r >= 0; r--) {
            if (board[r].every(cell => cell)) {
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
        const scoreElement = document.getElementById(`score${selectedIndex}`);
        scoreElement.innerText = `分数: ${score}`;
    }

    // 检查碰撞
    function checkCollision(tetromino, x, y) {
        for (let r = 0; r < tetromino.shape.length; r++) {
            for (let c = 0; c < tetromino.shape[r].length; c++) {
                if (tetromino.shape[r][c]) {
                    const newX = x + c;
                    const newY = y + r;
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
        const oldShape = currentTetromino.shape;
        const newShape = currentTetromino.shape[0].map((_, index) =>
            currentTetromino.shape.map(row => row[index]).reverse()
        );
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
        const startBtn = document.querySelector(`.game-interface[data-index="${selectedIndex}"] .startBtn`);
        startBtn.innerText = '重新开始';

        // 可以在这里添加游戏结束的处理，例如重新开始按钮
    }

    // 绘制其他玩家的游戏板
    function drawOtherPlayerBoard(ctx, boardData) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        const rows = boardData.length;
        const cols = boardData[0].length;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
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
            for (let r = 0; r < tetromino.shape.length; r++) {
                for (let c = 0; c < tetromino.shape[r].length; c++) {
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
        const interfaceElement = document.querySelector(`.game-interface[data-index="${index}"]`);
        
        // 检查界面是否被展开（没有 minimized 类）
        if (!interfaceElement.classList.contains('minimized')) {
            const otherNextCanvas = document.getElementById(`nextCanvas${index}`);
            const otherNextCtx = otherNextCanvas ? otherNextCanvas.getContext('2d') : null;

            if (otherNextCtx) {
                otherNextCtx.clearRect(0, 0, otherNextCanvas.width, otherNextCanvas.height);
                const scaleNext = 30;
                if (nextTetromino && nextTetromino.shape) {
                    otherNextCtx.fillStyle = nextTetromino.color;
                    for (let r = 0; r < nextTetromino.shape.length; r++) {
                        for (let c = 0; c < nextTetromino.shape[r].length; c++) {
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
            const otherNextCanvas = document.getElementById(`nextCanvas${index}`);
            const otherNextCtx = otherNextCanvas ? otherNextCanvas.getContext('2d') : null;

            if (otherNextCtx) {
                otherNextCtx.clearRect(0, 0, otherNextCanvas.width, otherNextCanvas.height);
            }
        }
    }

    // 接收重置界面的通知
    socket.on('resetInterface', (index) => {
        if (index !== selectedIndex) {
            resetInterface(index);
        }
    });

    // 重置界面状态
    function resetInterface(index) {
        // 重置分数显示
        document.getElementById(`score${index}`).innerText = `分数: 0`;

        // 清空画布
        const otherCanvas = document.getElementById(`gameCanvas${index}`);
        const otherCtx = otherCanvas.getContext('2d');
        otherCtx.clearRect(0, 0, otherCanvas.width, otherCanvas.height);

        // 清空下一个方块画布
        const otherNextCanvas = document.getElementById(`nextCanvas${index}`);
        const otherNextCtx = otherNextCanvas.getContext('2d');
        otherNextCtx.clearRect(0, 0, otherNextCanvas.width, otherNextCanvas.height);

        // 重置计时器显示
        document.getElementById(`selectionTimer${index}`).innerText = `选择时长: 0.000 秒`;
        document.getElementById(`gameTimer${index}`).innerText = `游戏时长: 0.000 秒`;

        // 重置计时器数据
        selectionDurations[index] = null;
        gameDurations[index] = null;

        // 清除保存的其他玩家状态
        delete otherPlayersState[index];
    }

    // 点击缩小的界面，切换大小
    document.querySelectorAll('.game-interface').forEach((element) => {
        element.addEventListener('click', (e) => {
            // 防止点击自己选择的界面或点击按钮时触发
            const index = parseInt(element.getAttribute('data-index'));
            if (index === selectedIndex || e.target.tagName === 'BUTTON') return;

            // 切换 minimized 类
            element.classList.toggle('minimized');

            // 获取对应的下一个方块画布和上下文
            const otherNextCanvas = document.getElementById(`nextCanvas${index}`);
            const otherNextCtx = otherNextCanvas ? otherNextCanvas.getContext('2d') : null;

            if (otherNextCtx) {
                if (!element.classList.contains('minimized')) {
                    // 如果界面被展开，重新绘制下一个方块
                    const otherPlayerState = otherPlayersState[index];
                    if (otherPlayerState && otherPlayerState.nextTetromino) {
                        drawOtherPlayerNextTetromino(index, otherPlayerState.nextTetromino);
                    }
                } else {
                    // 如果界面被最小化，清空下一个方块的画布
                    otherNextCtx.clearRect(0, 0, otherNextCanvas.width, otherNextCanvas.height);
                }
            }
        });
    });

    // 聊天室功能
    // 聊天室拖动功能
    chatHeader.addEventListener('mousedown', function(e) {
        e.preventDefault(); // 阻止默认的文本选择行为
        let startX = e.clientX;
        let startY = e.clientY;
        let offsetX = e.clientX - chatContainer.offsetLeft;
        let offsetY = e.clientY - chatContainer.offsetTop;

        function mouseMoveHandler(e) {
            document.body.style.userSelect = 'none'; // 防止文本选择
            let newX = e.clientX - offsetX;
            let newY = e.clientY - offsetY;

            // 保持聊天室在视口内
            let maxX = window.innerWidth - chatContainer.offsetWidth;
            let maxY = window.innerHeight - chatContainer.offsetHeight;
            if (newX < 0) newX = 0;
            if (newY < 0) newY = 0;
            if (newX > maxX) newX = maxX;
            if (newY > maxY) newY = maxY;

            chatContainer.style.left = `${newX}px`;
            chatContainer.style.top = `${newY}px`;

            // 固定最小化尺寸，只有双击才能恢复
            let snapMargin = 20; // 距离边缘多少像素自动最小化

            if (e.clientX <= snapMargin || window.innerWidth - e.clientX <= snapMargin) {
                if (!chatContainer.classList.contains('minimized')) {
                    chatContainer.classList.add('minimized');
                }
            }
        }

        function mouseUpHandler() {
            document.body.style.userSelect = 'auto'; // 恢复文本选择
            document.removeEventListener('mousemove', mouseMoveHandler);
            document.removeEventListener('mouseup', mouseUpHandler);
        }

        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
    });

    // 双击聊天室恢复原大小
    chatContainer.addEventListener('dblclick', () => {
        chatContainer.classList.toggle('minimized');
        chatContainer.classList.remove('flash'); // 移除闪烁效果
    });

    // 发送聊天消息
    function sendMessage(message) {
        if (message === '') return;
        if (!nickname) {
            alert('请先设置昵称！');
            return;
        }
        socket.emit('chatMessage', { nickname, message });
    }

    // 发送聊天消息
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            let message = chatInput.value.trim();
            sendMessage(message);
            chatInput.value = '';
        }
    });

    // 接收聊天消息
    socket.on('chatMessage', (data) => {
        // 处理注销指令
        if (data.message === '/logout' && data.nickname === nickname) {
            // 服务器将处理注销
            return;
        }

        // 处理系统消息
        if (data.systemMessage) {
            let p = document.createElement('p');
            p.style.color = 'red';
            p.innerText = `系统消息: ${data.systemMessage}`;
            chatMessages.appendChild(p);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            return;
        }

        chatHistory.push(data);
        updateChatMessages();

        // 如果聊天室是最小化状态，添加闪烁效果
        if (chatContainer.classList.contains('minimized')) {
            chatContainer.classList.add('flash');
        }
    });

    // 接收系统消息
    socket.on('systemMessage', (message) => {
        let p = document.createElement('p');
        p.style.color = 'red';
        p.innerText = `系统消息: ${message}`;
        chatMessages.appendChild(p);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // 如果聊天室是最小化状态，添加闪烁效果
        if (chatContainer.classList.contains('minimized')) {
            chatContainer.classList.add('flash');
        }
    });

    // 初始加载聊天记录
    socket.on('chatHistory', (history) => {
        chatHistory = history;
        updateChatMessages();
    });

    // 更新聊天消息
    function updateChatMessages() {
        chatMessages.innerHTML = '';
        chatHistory.forEach((data) => {
            let p = document.createElement('p');
            p.innerText = `${data.nickname}: ${data.message}`;
            chatMessages.appendChild(p);
        });
        // 滚动到底部
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // 处理重命名事件
    socket.on('userRenamed', (data) => {
        // 更新聊天记录中的昵称
        chatHistory.forEach((message) => {
            if (message.nickname === data.oldNickname) {
                message.nickname = data.newNickname;
            }
        });
        updateChatMessages();
    });

    // 处理重命名结果
    socket.on('renameResult', (data) => {
        if (data.success) {
            nickname = data.newNickname;
            localStorage.setItem('nickname', nickname);
            alert(`昵称已更改为 ${nickname}`);
        } else {
            alert(data.message);
        }
    });

    // 处理注销事件
    socket.on('loggedOut', () => {
        // 清除本地存储的昵称
        localStorage.removeItem('nickname');
        // 清除 session cookie
        document.cookie = 'connect.sid=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        // 重新加载页面
        location.reload();
    });

    // 在窗口关闭或刷新时，自动暂停游戏并保存状态
    window.addEventListener('beforeunload', () => {
        if (selectedIndex !== null && gameStarted && !isPaused) {
            pauseGame();
        }
        if (selectedIndex !== null && gameStarted) {
            // 发送游戏状态给服务器进行保存
            socket.emit('saveGameState', {
                board: board,
                currentTetromino: currentTetromino,
                nextTetromino: nextTetromino,
                score: score,
                isPaused: isPaused
            });
        }
    });


    // 当用户切换标签页或窗口失去焦点时，自动暂停游戏
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && gameStarted && !isPaused) {
            pauseGame();
        }
    });

    // 处理浏览器窗口失去焦点时的自动暂停
    window.addEventListener('blur', () => {
        if (gameStarted && !isPaused) {
            pauseGame();
        }
    });

    // 处理浏览器窗口获得焦点时的行为（可选）
    window.addEventListener('focus', () => {
        // 可以在此处添加逻辑，例如提示用户继续游戏
    });
}
