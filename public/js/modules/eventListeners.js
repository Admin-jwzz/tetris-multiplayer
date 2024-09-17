/**
 * 版权所有 © 2024 Admin-jwzz
 * 许可证：CC BY-NC 4.0
 * 详情请参阅 LICENSE 文件。
 */

// eventListeners.js

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

// 处理选择按钮点击事件
document.querySelectorAll('.selectBtn').forEach(function(button) {
    button.addEventListener('click', function(event) {
        if (selectedIndex !== null) {
            alert('您已选择了一个界面，无法再次选择。');
            return;
        }
        var parent = event.target.closest('.game-interface');
        var index = parseInt(parent.getAttribute('data-index'));
        selectedIndex = index; // 立即设置 selectedIndex
        socket.emit('selectInterface', index);

        // 立即缩小其他界面
        updateInterfaceDisplay();
    });
});

// 处理取消按钮点击事件
document.querySelectorAll('.cancelBtn').forEach(function(button) {
    button.addEventListener('click', function() {
        releaseInterface();
    });
});

// 点击缩小的界面，切换大小
document.querySelectorAll('.game-interface').forEach(function(element) {
    element.addEventListener('click', function(e) {
        // 防止点击自己选择的界面或点击按钮时触发
        var index = parseInt(element.getAttribute('data-index'));
        if (index === selectedIndex || e.target.tagName === 'BUTTON') return;

        // 切换 minimized 类
        element.classList.toggle('minimized');

        // 获取对应的下一个方块画布和上下文
        var otherNextCanvas = document.getElementById('nextCanvas' + index);
        var otherNextCtx = otherNextCanvas ? otherNextCanvas.getContext('2d') : null;

        if (otherNextCtx) {
            if (!element.classList.contains('minimized')) {
                // 如果界面被展开，重新绘制下一个方块
                var otherPlayerState = otherPlayersState[index];
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
