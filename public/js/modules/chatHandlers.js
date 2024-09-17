/**
 * 版权所有 © 2024 Admin-jwzz
 * 许可证：CC BY-NC 4.0
 * 详情请参阅 LICENSE 文件。
 */

// chatHandlers.js

// 聊天室拖动功能
chatHeader.addEventListener('mousedown', function(e) {
    e.preventDefault(); // 阻止默认的文本选择行为
    var startX = e.clientX;
    var startY = e.clientY;
    var offsetX = e.clientX - chatContainer.offsetLeft;
    var offsetY = e.clientY - chatContainer.offsetTop;

    function mouseMoveHandler(e) {
        document.body.style.userSelect = 'none'; // 防止文本选择
        var newX = e.clientX - offsetX;
        var newY = e.clientY - offsetY;

        // 保持聊天室在视口内
        var maxX = window.innerWidth - chatContainer.offsetWidth;
        var maxY = window.innerHeight - chatContainer.offsetHeight;
        if (newX < 0) newX = 0;
        if (newY < 0) newY = 0;
        if (newX > maxX) newX = maxX;
        if (newY > maxY) newY = maxY;

        chatContainer.style.left = newX + 'px';
        chatContainer.style.top = newY + 'px';

        // 固定最小化尺寸，只有双击才能恢复
        var snapMargin = 20; // 距离边缘多少像素自动最小化

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
chatContainer.addEventListener('dblclick', function() {
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
    socket.emit('chatMessage', { nickname: nickname, message: message });
}

// 发送聊天消息
chatInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        var message = chatInput.value.trim();
        sendMessage(message);
        chatInput.value = '';
    }
});

// 接收聊天消息
function receiveChatMessage(data) {
    // 处理注销指令
    if (data.message === '/logout' && data.nickname === nickname) {
        // 服务器将处理注销
        return;
    }

    // 处理系统消息
    if (data.systemMessage) {
        var p = document.createElement('p');
        p.style.color = 'red';
        p.innerText = '系统消息: ' + data.systemMessage;
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
}

// 更新聊天消息
function updateChatMessages() {
    chatMessages.innerHTML = '';
    chatHistory.forEach(function(data) {
        var p = document.createElement('p');
        p.innerText = data.nickname + ': ' + data.message;
        chatMessages.appendChild(p);
    });
    // 滚动到底部
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 接收系统消息
function receiveSystemMessage(message) {
    var p = document.createElement('p');
    p.style.color = 'red';
    p.innerText = '系统消息: ' + message;
    chatMessages.appendChild(p);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // 如果聊天室是最小化状态，添加闪烁效果
    if (chatContainer.classList.contains('minimized')) {
        chatContainer.classList.add('flash');
    }
}
