/**
 * 版权所有 © 2024 Admin-jwzz
 * 许可证：CC BY-NC 4.0
 * 详情请参阅 LICENSE 文件。
 */

// variables.js

// 全局变量
var socket;
var sessionID;
var nickname = '';
var nicknameContainer = document.getElementById('nicknameContainer');
var nicknameInput = document.getElementById('nicknameInput');
var setNicknameBtn = document.getElementById('setNicknameBtn');
var chatContainer = document.getElementById('chatContainer');
var chatHeader = document.getElementById('chatHeader');
var chatMessages = document.getElementById('chatMessages');
var chatInput = document.getElementById('chatInput');
var chatHistory = [];
var storedGameState = null;

// 保存其他玩家的游戏状态
var otherPlayersState = {};

// 游戏相关变量
var selectedIndex = null;
var canvas, ctx, nextCanvas, nextCtx;
var scale = 30; // 每个方块的尺寸
var rows, cols;
var board = [];
var currentTetromino, nextTetromino;
var score = 0;
var lastTime = 0;
var dropCounter = 0;
var dropInterval = 1000;
var gameStarted = false;
var isPaused = false;
var animationFrameId;
var pausedTime;

// 计时器数据
var selectionDurations = {};
var gameDurations = {};

// 俄罗斯方块形状
var tetrominoes = [
    { shape: [[1, 1, 1, 1]], color: 'cyan' }, // I
    { shape: [[1, 1], [1, 1]], color: 'yellow' }, // O
    { shape: [[1, 1, 0], [0, 1, 1]], color: 'green' }, // S
    { shape: [[0, 1, 1], [1, 1, 0]], color: 'red' }, // Z
    { shape: [[1, 1, 1], [0, 1, 0]], color: 'blue' }, // T
    { shape: [[1, 1, 1], [1, 0, 0]], color: 'orange' }, // L
    { shape: [[1, 1, 1], [0, 0, 1]], color: 'purple' } // J
];
