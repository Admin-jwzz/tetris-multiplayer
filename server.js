// server.js

const express = require('express');
const app = express();
const http = require('http').Server(app);
const cookie = require('cookie');
const signature = require('cookie-signature');
const io = require('socket.io')(http);
const bodyParser = require('body-parser');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const fs = require('fs');
const PORT = 80;

// 存储界面状态，初始化为 null 表示未被占用
let interfaces = [null, null, null, null];

// 存储玩家的 sessionID 到界面索引的映射
let players = {};

// 存储界面索引到昵称的映射，仅用于显示
let nicknames = [null, null, null, null];

// 存储已被占用的昵称（小写），用于检查昵称是否已被使用
let reservedNicknames = new Set();

// 计时器数据
let selectionTimes = {}; // 记录玩家选择界面的时间戳
let gameTimes = {}; // 记录玩家游戏的开始时间、暂停状态等

// 加载持久化数据（如果存在）
function loadData() {
    if (fs.existsSync('data.json')) {
        const data = JSON.parse(fs.readFileSync('data.json', 'utf-8'));
        interfaces = data.interfaces || interfaces;
        players = data.players || players;
        nicknames = data.nicknames || nicknames;
        reservedNicknames = new Set(data.reservedNicknames || []);
        gameTimes = data.gameTimes || {}; // 加载 gameTimes
    }
}
loadData();

// 保存持久化数据
function saveData() {
    const data = {
        interfaces,
        players,
        nicknames,
        reservedNicknames: Array.from(reservedNicknames),
        gameTimes // 保存 gameTimes
    };
    fs.writeFileSync('data.json', JSON.stringify(data), 'utf-8');
}

// 每100毫秒更新一次计时器
setInterval(() => {
    const currentTime = Date.now();
    let selectionDurations = {};
    let gameDurations = {};

    // 更新选择时长
    for (let index in selectionTimes) {
        if (selectionTimes[index]) {
            selectionDurations[index] = (currentTime - selectionTimes[index]) / 1000;
        }
    }

    // 更新游戏时长
    for (let index in gameTimes) {
        const gameTimeObj = gameTimes[index];
        if (gameTimeObj) {
            if (gameTimeObj.isPaused) {
                gameDurations[index] = (gameTimeObj.pausedTime - gameTimeObj.startTime) / 1000;
            } else if (gameTimeObj.isOver) {
                gameDurations[index] = (gameTimeObj.endTime - gameTimeObj.startTime) / 1000;
            } else {
                gameDurations[index] = (currentTime - gameTimeObj.startTime) / 1000;
            }
        }
    }

    io.emit('updateTimers', {
        selectionDurations,
        gameDurations
    });
}, 100); // 每100毫秒更新一次

// 聊天记录
let chatHistory = []; // 可设置最大长度，例如保留最近100条消息

// 读取聊天记录
const chatHistoryFile = './chat_history.txt';
if (fs.existsSync(chatHistoryFile)) {
    try {
        const data = fs.readFileSync(chatHistoryFile, 'utf-8');
        chatHistory = JSON.parse(data);
    } catch (err) {
        console.error('读取聊天记录失败:', err);
    }
}

// 使用固定的 secretKey，确保与 cookie-signature 一致
const secretKey = 'Admin-jwzz'; // 请替换为您的密钥

// 单独创建 sessionStore
const sessionStore = new FileStore({
    path: './sessions',
    ttl: 86400 * 365 * 10, // sessions 持续 10 年
});

// 设置 session 中间件
const sessionMiddleware = session({
    store: sessionStore,
    secret: secretKey,
    resave: false,
    saveUninitialized: false, // 设置为 false，只有在 session 有修改时才保存
    cookie: {
        maxAge: 86400 * 365 * 10 * 1000, // cookies 持续 10 年
        sameSite: 'lax',
        secure: false, // 如果使用 HTTPS，需设置为 true
        httpOnly: false // 设置为 false，允许客户端 JavaScript 访问 cookie
    }
});

app.use(bodyParser.json());

// 创建设置昵称的路由
app.post('/setNickname', sessionMiddleware, (req, res) => {
    const nickname = req.body.nickname;
    if (!nickname) {
        return res.status(400).json({ success: false, message: '昵称不能为空' });
    }

    const nicknameLower = nickname.toLowerCase();

    // 检查昵称是否已被使用（不区分大小写）
    if (reservedNicknames.has(nicknameLower)) {
        return res.json({ success: false, message: '昵称已被使用' });
    } else {
        // 将昵称添加到 reservedNicknames（存储为小写）
        reservedNicknames.add(nicknameLower);
        // 保存数据
        saveData();

        // 设置昵称到 session 中，保留原始大小写的昵称
        req.session.nickname = nickname;
        // 保存 session
        req.session.save((err) => {
            if (err) {
                console.error('保存 session 失败:', err);
                return res.status(500).json({ success: false, message: '服务器内部错误' });
            }
            // 返回成功响应
            return res.json({ success: true });
        });
    }
});

// 静态文件中间件，放在 sessionMiddleware 之后
app.use(sessionMiddleware);
app.use(express.static('public'));

// 手动将 sessionMiddleware 绑定到 Socket.io
io.use((socket, next) => {
    // 解析 cookie，获取 session ID
    let cookies = socket.handshake.headers.cookie;
    let sessionId = null;
    if (cookies) {
        let parsedCookies = cookie.parse(cookies);
        let sessionCookie = parsedCookies['connect.sid']; // 默认情况下，session ID 存储在 'connect.sid' 中
        if (sessionCookie) {
            if (sessionCookie.startsWith('s:')) {
                // 解码签名的 session ID
                sessionId = signature.unsign(sessionCookie.slice(2), secretKey);
                if (!sessionId) {
                    console.log('Session ID 解码失败');
                    return next(new Error('Authentication error'));
                }
            } else {
                sessionId = sessionCookie;
            }
        }
    }

    if (!sessionId) {
        console.log('无法获取 session ID');
        return next(new Error('Authentication error'));
    }

    console.log('解析的 sessionId:', sessionId);

    // 使用 sessionStore 而不是 sessionMiddleware.store
    sessionStore.get(sessionId, (err, sessionData) => {
        if (err || !sessionData) {
            console.log('无法获取 session 数据:', err);
            return next(new Error('Authentication error'));
        }

        console.log('获取的 session 数据:', sessionData);

        // 将 sessionData 存储在 socket.session 中
        socket.session = sessionData;
        socket.sessionID = sessionId;
        next();
    });
});

let gameStates = {}; // 存储每个玩家的游戏状态
let latestGameStates = {}; // 存储每个界面的最新游戏状态

io.on('connection', (socket) => {
    console.log(`用户连接：${socket.id}`);

    // 检查是否已设置昵称
    if (socket.session.nickname) {
        socket.nickname = socket.session.nickname;

        // 发送聊天记录
        socket.emit('chatHistory', chatHistory);

        // 发送当前界面状态和昵称
        socket.emit('interfaceStatus', interfaces);
        socket.emit('updateNicknames', nicknames); // 用于显示每个界面的昵称

        // 发送 sessionID 给客户端
        socket.emit('setSessionID', socket.sessionID);

        // 如果玩家已占用界面，发送保存的游戏状态
        let index = players[socket.sessionID];
        if (index !== undefined) {
            // 发送界面状态
            socket.emit('interfaceStatus', interfaces);
            socket.emit('updateNicknames', nicknames);

            // 发送保存的游戏状态
            let state = gameStates[socket.sessionID];
            if (state) {
                socket.emit('restoreGameState', state);
            }
        }

        // 发送所有玩家的最新游戏状态
        socket.emit('updateAllGameStates', latestGameStates);

    } else {
        // 如果没有昵称，拒绝连接
        console.log('未设置昵称，断开连接');
        socket.disconnect();
        return;
    }

    // 监听玩家选择界面
    socket.on('selectInterface', (index) => {
        if (interfaces[index] === null && !players[socket.sessionID]) {
            interfaces[index] = socket.sessionID;
            players[socket.sessionID] = index;
            nicknames[index] = socket.nickname || '匿名'; // 仅用于显示

            selectionTimes[index] = Date.now();

            // 保存数据
            saveData();

            io.emit('interfaceStatus', interfaces);
            io.emit('updateNicknames', nicknames);
            console.log(`用户${socket.sessionID}选择了界面${index}`);

            // 通知该玩家可以开始游戏
            socket.emit('startGame', index);
        } else {
            // 如果界面已被占用或玩家已占用其他界面，可以发送错误信息（可选）
            socket.emit('selectError', '无法选择该界面');
        }
    });

    // 监听玩家游戏开始
    socket.on('gameStarted', () => {
        let index = players[socket.sessionID];
        if (index !== undefined) {
            if (!gameTimes[index]) {
                gameTimes[index] = {
                    startTime: Date.now(),
                    isPaused: false,
                    isOver: false
                };
            } else {
                // 如果之前游戏已经暂停，调整开始时间
                if (gameTimes[index].isPaused) {
                    let pausedDuration = Date.now() - gameTimes[index].pausedTime;
                    gameTimes[index].startTime += pausedDuration;
                    gameTimes[index].isPaused = false;
                }
            }

            console.log(`用户${socket.sessionID}在界面${index}开始了游戏`);
        }
    });

    // 监听玩家游戏重新开始
    socket.on('gameRestarted', () => {
        let index = players[socket.sessionID];
        if (index !== undefined) {
            gameTimes[index] = {
                startTime: Date.now(),
                isPaused: false,
                isOver: false
            };
    
            console.log(`用户${socket.sessionID}在界面${index}重新开始了游戏`);
        }
    });

    // 监听游戏暂停
    socket.on('pauseGame', () => {
        let index = players[socket.sessionID];
        if (index !== undefined) {
            if (!gameTimes[index]) {
                gameTimes[index] = {
                    startTime: Date.now(),
                    isPaused: true,
                    pausedTime: Date.now(),
                    isOver: false
                };
            } else {
                gameTimes[index].isPaused = true;
                gameTimes[index].pausedTime = Date.now();
            }

            console.log(`用户${socket.sessionID}在界面${index}暂停了游戏`);
        }
    });

    // 监听游戏继续
    socket.on('resumeGame', () => {
        let index = players[socket.sessionID];
        if (index !== undefined) {
            if (!gameTimes[index]) {
                gameTimes[index] = {
                    startTime: Date.now(),
                    isPaused: false,
                    isOver: false
                };
            } else {
                if (gameTimes[index].isPaused) {
                    let pausedDuration = Date.now() - gameTimes[index].pausedTime;
                    gameTimes[index].startTime += pausedDuration;
                    gameTimes[index].isPaused = false;
                    delete gameTimes[index].pausedTime;
                }
            }

            console.log(`用户${socket.sessionID}在界面${index}恢复了游戏`);
        }
    });

    // 监听游戏结束
    socket.on('gameOver', () => {
        let index = players[socket.sessionID];
        if (index !== undefined && gameTimes[index]) {
            gameTimes[index].isOver = true;
            gameTimes[index].endTime = Date.now();

            console.log(`用户${socket.sessionID}在界面${index}的游戏结束`);
        }
    });

    // 监听玩家释放界面
    socket.on('releaseInterface', () => {
        let index = players[socket.sessionID];
        if (index !== undefined) {
            interfaces[index] = null;
            nicknames[index] = null; // 清除界面昵称显示
            delete players[socket.sessionID];
            delete selectionTimes[index];
            delete gameTimes[index];

            // 删除保存的游戏状态
            delete gameStates[socket.sessionID];
            delete latestGameStates[index];

            // 保存数据
            saveData();

            io.emit('interfaceStatus', interfaces);
            io.emit('updateNicknames', nicknames);
            io.emit('resetInterface', index); // 通知客户端重置界面状态
            console.log(`用户${socket.sessionID}释放了界面${index}`);
        }
    });

    // 监听玩家的游戏状态
    socket.on('gameState', (data) => {
        let index = players[socket.sessionID];
        if (index !== undefined) {
            // 将玩家的游戏状态发送给所有其他玩家，包括 nextTetromino
            socket.broadcast.emit('updateGameState', {
                id: socket.sessionID,
                index: index,
                state: data
            });

            // 保存最新的游戏状态
            latestGameStates[index] = data;
        }
    });

    // 监听玩家保存游戏状态
    socket.on('saveGameState', (state) => {
        let index = players[socket.sessionID];
        if (index !== undefined) {
            gameStates[socket.sessionID] = state;
            console.log(`保存了用户${socket.sessionID}的游戏状态`);
        }
    });

    // 监听客户端请求游戏状态
    socket.on('requestGameState', (index) => {
        if (players[socket.sessionID] === index) {
            let state = gameStates[socket.sessionID];
            if (state) {
                socket.emit('restoreGameState', state);
            }
        }
    });

    // 聊天消息监听
    socket.on('chatMessage', (data) => {
        // 处理注销命令
        if (data.message === '/logout') {
            // 注销用户
            let oldNickname = socket.nickname;
            if (oldNickname) {
                let index = players[socket.sessionID];
                if (index !== undefined) {
                    interfaces[index] = null;
                    nicknames[index] = null; // 清除界面昵称显示
                    delete players[socket.sessionID];
                    delete selectionTimes[index];
                    delete gameTimes[index];

                    // 删除保存的游戏状态
                    delete gameStates[socket.sessionID];
                    delete latestGameStates[index];

                    // 保存数据
                    saveData();

                    io.emit('interfaceStatus', interfaces);
                    io.emit('updateNicknames', nicknames);
                    io.emit('resetInterface', index); // 通知客户端重置界面状态
                    console.log(`用户${socket.sessionID}释放了界面${index}`);
                }

                // 从 reservedNicknames 中移除昵称，释放昵称占用
                reservedNicknames.delete(oldNickname.toLowerCase());
                // 保存数据
                saveData();

                delete socket.session.nickname;
                // 销毁 session
                sessionStore.destroy(socket.sessionID, (err) => {
                    if (err) {
                        console.error('销毁 session 失败:', err);
                    }
                });

                // 通知客户端清除 cookie
                socket.emit('loggedOut');
                socket.disconnect(true);
            }
            return;
        }

        // 处理清除聊天记录命令
        if (data.message === '/clear') {
            // 将昵称转换为小写，进行不区分大小写的比较
            if (socket.nickname && socket.nickname.toLowerCase() === 'admin') {
                chatHistory = [];
                // 将空的聊天记录写入文件
                try {
                    fs.writeFileSync(chatHistoryFile, JSON.stringify(chatHistory), 'utf-8');
                } catch (err) {
                    console.error('清除聊天记录失败:', err);
                }

                // 广播清除聊天记录事件
                io.emit('chatHistory', chatHistory);
            } else {
                socket.emit('systemMessage', '只有管理员才能清除聊天记录。');
            }
            return;
        }

        // 处理重命名命令
        if (data.message.startsWith('/rename ')) {
            let newNickname = data.message.substring(8).trim();
            if (!newNickname) {
                socket.emit('renameResult', { success: false, message: '新昵称不能为空' });
                return;
            }

            let newNicknameLower = newNickname.toLowerCase();

            // 检查昵称是否已被使用（不区分大小写）
            if (reservedNicknames.has(newNicknameLower)) {
                socket.emit('renameResult', { success: false, message: '昵称已被使用' });
                return;
            }

            let oldNickname = socket.nickname;
            socket.nickname = newNickname;
            socket.session.nickname = newNickname;

            // 更新 session 中的昵称
            sessionStore.set(socket.sessionID, socket.session, (err) => {
                if (err) {
                    console.error('更新 session 失败:', err);
                    socket.emit('renameResult', { success: false, message: '服务器内部错误' });
                    return;
                }

                // 更新 reservedNicknames
                reservedNicknames.delete(oldNickname.toLowerCase());
                reservedNicknames.add(newNicknameLower);
                // 保存数据
                saveData();

                // 更新 nicknames（用于显示）
                let index = players[socket.sessionID];
                if (index !== undefined) {
                    nicknames[index] = newNickname;
                    io.emit('updateNicknames', nicknames);
                }

                // 更新聊天记录中的昵称
                chatHistory.forEach((msg) => {
                    if (msg.nickname === oldNickname) {
                        msg.nickname = newNickname;
                    }
                });

                // 将聊天记录写入文件
                try {
                    fs.writeFileSync(chatHistoryFile, JSON.stringify(chatHistory), 'utf-8');
                } catch (err) {
                    console.error('保存聊天记录失败:', err);
                }

                // 广播用户重命名事件
                io.emit('userRenamed', { oldNickname, newNickname });

                // 返回成功结果
                socket.emit('renameResult', { success: true, newNickname });
            });
            return;
        }

        // 将聊天消息添加到聊天记录并广播
        chatHistory.push(data);
        // 限制聊天记录长度
        if (chatHistory.length > 100) {
            chatHistory.shift();
        }

        // 将聊天记录写入文件
        try {
            fs.writeFileSync(chatHistoryFile, JSON.stringify(chatHistory), 'utf-8');
        } catch (err) {
            console.error('保存聊天记录失败:', err);
        }

        io.emit('chatMessage', data);
    });

    // 处理用户断开连接
    socket.on('disconnect', () => {
        console.log(`用户断开：${socket.id}`);

        // 不从 reservedNicknames 中移除昵称，昵称保持占用
        // 只有在用户主动使用 /logout 命令时才释放昵称

        // 不释放界面，保持界面状态，以便用户重新连接后恢复

        // 可以选择是否删除游戏状态，如果想在断开后仍然保存游戏状态，可以不删除
        // delete gameStates[socket.sessionID];
    });
});

http.listen(PORT, () => {
    console.log(`服务器正在运行在 http://localhost:${PORT}`);
});
