import { S3Client, ListObjectsCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';

// Load .env manually
const envPath = path.resolve(__dirname, '../.env');
console.log('Loading .env from:', envPath);
const envContent = fs.readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};
envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim(); // handle values with =
        env[key] = value;
    }
});

const accountId = env['R2_ACCOUNT_ID'];
const accessKeyId = env['R2_ACCESS_KEY_ID'];
const secretAccessKey = env['R2_SECRET_ACCESS_KEY'];
const bucket = env['R2_BUCKET_NAME'];

console.log('Config:', {
    accountId: accountId ? '***' + accountId.slice(-4) : 'undefined',
    bucket,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`
});

const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId,
        secretAccessKey,
    },
});

async function checkR2() {
    try {
        console.log('Listing objects in bucket...');
        const command = new ListObjectsCommand({
            Bucket: bucket,
            MaxKeys: 10
        });
        const response = await s3.send(command);
        console.log('Objects found:', response.Contents?.length || 0);

        if (response.Contents) {
            response.Contents.forEach(obj => {
                console.log(` - ${obj.Key} (${obj.Size} bytes) LastModified: ${obj.LastModified}`);
            });
        }

        // Check specific file if needed
        // const key = '...';
        // const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        // console.log('Specific file exists:', key);

    } catch (err) {
        console.error('Error accessing R2:', err);
    }
}

checkR2();
