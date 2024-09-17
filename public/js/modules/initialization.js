/**
 * 版权所有 © 2024 Admin-jwzz
 * 许可证：CC BY-NC 4.0
 * 详情请参阅 LICENSE 文件。
 */

// initialization.js

// 检查是否有 session cookie
function hasSessionCookie() {
    var hasCookie = document.cookie.includes('connect.sid');
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

setNicknameBtn.addEventListener('click', function() {
    var newNickname = nicknameInput.value.trim();
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
    .then(function(response) { return response.json(); })
    .then(function(data) {
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
    .catch(function(error) {
        console.error('Error:', error);
        alert('无法连接到服务器，请稍后重试。');
    });
});
