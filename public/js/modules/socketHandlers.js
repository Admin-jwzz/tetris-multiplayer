/**
 * 版权所有 © 2024 Admin-jwzz
 * 许可证：CC BY-NC 4.0
 * 详情请参阅 LICENSE 文件。
 */

// socketHandlers.js

// 初始化 Socket.io 连接的函数
function initSocketConnection() {
    socket = io({
        withCredentials: true
    });

    // 用于存储 sessionID
    sessionID = '';

    // 接收服务器发送的 sessionID
    socket.on('setSessionID', function(id) {
        sessionID = id;
    });

    // 接收其他玩家的昵称更新
    socket.on('updateNicknames', function(nicknames) {
        for (var i = 0; i < 4; i++) {
            var nicknameElement = document.getElementById('nickname' + i);
            if (nicknames[i]) {
                nicknameElement.innerText = '昵称：' + nicknames[i];
            } else {
                nicknameElement.innerText = '昵称：未设置';
            }
        }
    });

    // 接收界面状态更新
    socket.on('interfaceStatus', function(interfaces) {
        document.querySelectorAll('.game-interface').forEach(function(element) {
            var index = parseInt(element.getAttribute('data-index'));
            var selectButton = element.querySelector('.selectBtn');
            var cancelButton = element.querySelector('.cancelBtn');

            if (interfaces[index] === null) {
                selectButton.disabled = false;
                selectButton.innerText = '选择界面 ' + (index + 1);
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
                    selectButton.innerText = '已选择';
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
                    selectButton.innerText = '已被占用';
                    cancelButton.style.display = 'none';
                }
            }

            // 如果用户已占用一个界面，禁用其他选择按钮
            if (selectedIndex !== null) {
                document.querySelectorAll('.selectBtn').forEach(function(btn) {
                    var parent = btn.closest('.game-interface');
                    var idx = parseInt(parent.getAttribute('data-index'));
                    if (idx !== selectedIndex) {
                        btn.disabled = true;
                        btn.innerText = '已选择其他界面';
                    }
                });
            }
        });

        // 更新界面显示
        updateInterfaceDisplay();
    });

    // 接收服务器发送的游戏状态
    socket.on('restoreGameState', function(state) {
        if (state && selectedIndex !== null) {
            // 恢复游戏状态
            restoreGameState(state);
        }
    });

    // 接收其他玩家的游戏状态更新
    socket.on('updateGameState', function(data) {
        var id = data.id;
        var index = data.index;
        var state = data.state;

        // 保存其他玩家的游戏状态
        otherPlayersState[index] = state;

        // 获取对应的 canvas 和 context
        var otherCanvas = document.getElementById('gameCanvas' + index);
        var otherCtx = otherCanvas ? otherCanvas.getContext('2d') : null;

        if (otherCtx) {
            // 绘制其他玩家的游戏板
            drawOtherPlayerBoard(otherCtx, state.board);

            // 绘制其他玩家的当前方块
            drawOtherPlayerTetromino(otherCtx, state.currentTetromino);

            // 绘制其他玩家的下一个方块
            drawOtherPlayerNextTetromino(index, state.nextTetromino);

            // 更新其他玩家的分数显示
            var otherScoreElement = document.getElementById('score' + index);
            if (otherScoreElement) {
                otherScoreElement.innerText = '分数: ' + state.score;
            }
        }
    });

    // 接收所有玩家的游戏状态
    socket.on('updateAllGameStates', function(gameStates) {
        for (var index in gameStates) {
            var state = gameStates[index];
            // 保存其他玩家的游戏状态
            otherPlayersState[index] = state;

            // 绘制其他玩家的游戏板
            var otherCanvas = document.getElementById('gameCanvas' + index);
            var otherCtx = otherCanvas ? otherCanvas.getContext('2d') : null;

            if (otherCtx) {
                // 绘制其他玩家的游戏板
                drawOtherPlayerBoard(otherCtx, state.board);

                // 绘制其他玩家的当前方块
                drawOtherPlayerTetromino(otherCtx, state.currentTetromino);

                // 绘制其他玩家的下一个方块
                drawOtherPlayerNextTetromino(index, state.nextTetromino);

                // 更新其他玩家的分数显示
                var otherScoreElement = document.getElementById('score' + index);
                if (otherScoreElement) {
                    otherScoreElement.innerText = '分数: ' + state.score;
                }
            }
        }
    });

    // 接收计时器数据
    socket.on('updateTimers', function(data) {
        selectionDurations = data.selectionDurations;
        gameDurations = data.gameDurations;
        updateTimersDisplay();
    });

    // 接收开始游戏的通知
    socket.on('startGame', function(index) {
        setupGameInterface(index);

        if (storedGameState) {
            restoreGameState(storedGameState);
            storedGameState = null;
        }
    });

    // 接收重置界面的通知
    socket.on('resetInterface', function(index) {
        if (index !== selectedIndex) {
            resetInterface(index);
        }
    });

    // 聊天室功能
    // 接收聊天消息
    socket.on('chatMessage', function(data) {
        receiveChatMessage(data);
    });

    // 接收系统消息
    socket.on('systemMessage', function(message) {
        receiveSystemMessage(message);
    });

    // 初始加载聊天记录
    socket.on('chatHistory', function(history) {
        chatHistory = history;
        updateChatMessages();
    });

    // 处理重命名事件
    socket.on('userRenamed', function(data) {
        // 更新聊天记录中的昵称
        chatHistory.forEach(function(message) {
            if (message.nickname === data.oldNickname) {
                message.nickname = data.newNickname;
            }
        });
        updateChatMessages();
    });

    // 处理重命名结果
    socket.on('renameResult', function(data) {
        if (data.success) {
            nickname = data.newNickname;
            localStorage.setItem('nickname', nickname);
            alert('昵称已更改为 ' + nickname);
        } else {
            alert(data.message);
        }
    });

    // 处理注销事件
    socket.on('loggedOut', function() {
        // 清除本地存储的昵称
        localStorage.removeItem('nickname');
        // 清除 session cookie
        document.cookie = 'connect.sid=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        // 重新加载页面
        location.reload();
    });

    // 在窗口关闭或刷新时，自动暂停游戏并保存状态
    window.addEventListener('beforeunload', function() {
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
    document.addEventListener('visibilitychange', function() {
        if (document.hidden && gameStarted && !isPaused) {
            pauseGame();
        }
    });

    // 处理浏览器窗口失去焦点时的自动暂停
    window.addEventListener('blur', function() {
        if (gameStarted && !isPaused) {
            pauseGame();
        }
    });
}
