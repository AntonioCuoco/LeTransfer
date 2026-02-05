const { S3Client, UploadPartCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const s3 = new S3Client({});

exports.handler = async (event) => {

    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "OPTIONS,POST"
    };

    try {
        const body = JSON.parse(event.body);
        const { fileKey, uploadId, partNumbers } = body;
        const bucketName = process.env.BUCKET_NAME;

        if (!fileKey || !uploadId || !partNumbers || !Array.isArray(partNumbers)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ message: "Missing required fields" })
            };
        }

        const urls = {};

        // Generate URLs in parallel
        await Promise.all(partNumbers.map(async (partNumber) => {
            const command = new UploadPartCommand({
                Bucket: bucketName,
                Key: fileKey,
                UploadId: uploadId,
                PartNumber: partNumber,
            });

            // URL expires in 1 hour
            urls[partNumber] = await getSignedUrl(s3, command, { expiresIn: 3600 });
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ urls }),
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
