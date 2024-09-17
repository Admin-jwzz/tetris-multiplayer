/**
 * 版权所有 © 2024 Admin-jwzz
 * 许可证：CC BY-NC 4.0
 * 详情请参阅 LICENSE 文件。
 */

// build.js

const fs = require('fs');
const path = require('path');

const fileListPath = path.join(__dirname, '../js/fileList.json');
const outputFilePath = path.join(__dirname, '../dist/bundle.js');
const modulesDir = path.join(__dirname, '../js');

function build() {
    // 读取文件列表
    const fileList = JSON.parse(fs.readFileSync(fileListPath, 'utf8'));

    let bundleContent = '';

    fileList.forEach(file => {
        const filePath = path.join(modulesDir, file);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        bundleContent += fileContent + '\n\n';
    });

    // 写入合并后的文件
    fs.writeFileSync(outputFilePath, bundleContent, 'utf8');
    console.log('构建完成，生成文件：' + outputFilePath);
}

build();
