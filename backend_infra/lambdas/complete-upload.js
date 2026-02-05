const { S3Client, CompleteMultipartUploadCommand } = require("@aws-sdk/client-s3");
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { randomUUID } = require("crypto");

const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

exports.handler = async (event) => {

    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "OPTIONS,POST"
    };

    try {
        const body = JSON.parse(event.body);
        const { fileKey, uploadId, parts, fileName, fileSize, fileType, userId, userEmail } = body;
        const bucketName = process.env.BUCKET_NAME;
        const tableName = process.env.SHARED_TABLE_NAME;

        if (!fileKey || !uploadId || !parts || !Array.isArray(parts)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ message: "Missing required fields" })
            };
        }

        // S3 requires parts to be sorted by PartNumber
        const sortedParts = parts.sort((a, b) => a.PartNumber - b.PartNumber);

        const command = new CompleteMultipartUploadCommand({
            Bucket: bucketName,
            Key: fileKey,
            UploadId: uploadId,
            MultipartUpload: {
                Parts: sortedParts,
            },
        });

        const { Location, Key } = await s3.send(command);

        // Sync to DynamoDB
        if (tableName) {
            try {
                const now = new Date().toISOString();
                const item = {
                    id: { S: randomUUID() },
                    s3Key: { S: fileKey },
                    fileName: { S: fileName || fileKey.split('/').pop() },
                    fileSize: { N: (fileSize || 0).toString() },
                    formattedSize: { S: formatBytes(fileSize || 0) },
                    fileType: { S: fileType || 'application/octet-stream' },
                    ownerUserId: { S: userId || 'unknown' },
                    uploadedAt: { S: now },
                    status: { S: 'uploaded' },
                    isShared: { BOOL: false }
                };

                await dynamo.send(new PutItemCommand({
                    TableName: tableName,
                    Item: item
                }));
            } catch (dbError) {
                console.error("DynamoDB Sync Error:", dbError);
                // We log the error but do not fail the request since the upload succeeded
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ location: Location, key: Key }),
        };
    } catch (error) {
        console.error("Error:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: "Internal Server Error", error: error.message }),
        };
    }
};
