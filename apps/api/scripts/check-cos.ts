/**
 * 检查腾讯云 COS 存储桶连接与配置
 * 使用: npx ts-node scripts/check-cos.ts (需在 apps/api 目录下，且 .env 已配置 COS_*)
 */
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
const env: Record<string, string> = {};
envContent.split('\n').forEach((line) => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const value = parts.slice(1).join('=').trim();
    env[key] = value;
  }
});

const bucket = env['COS_BUCKET'];
const region = env['COS_REGION'] || 'ap-hongkong';
const secretId = env['COS_SECRET_ID'];
const secretKey = env['COS_SECRET_KEY'];

if (!bucket || !secretId || !secretKey) {
  console.error('请在 .env 中配置 COS_BUCKET、COS_SECRET_ID、COS_SECRET_KEY');
  process.exit(1);
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const COS = require('cos-nodejs-sdk-v5');
const cos = new COS({ SecretId: secretId, SecretKey: secretKey });

console.log('COS 配置:', {
  bucket,
  region,
  secretId: secretId ? '***' + secretId.slice(-4) : 'undefined',
});

cos.getBucket(
  {
    Bucket: bucket,
    Region: region,
    MaxKeys: 10,
  },
  (err: Error | null, data: { Contents?: { Key: string; Size: string; LastModified: string }[] }) => {
    if (err) {
      console.error('访问 COS 失败:', err.message);
      process.exit(1);
    }
    const list = data?.Contents || [];
    console.log('对象数量(本次列出):', list.length);
    list.forEach((obj) => {
      console.log(` - ${obj.Key} (${obj.Size} bytes) ${obj.LastModified}`);
    });
  }
);
