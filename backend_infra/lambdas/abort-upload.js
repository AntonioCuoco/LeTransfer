const { S3Client, AbortMultipartUploadCommand } = require("@aws-sdk/client-s3");

const s3 = new S3Client({});

exports.handler = async (event) => {

    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "OPTIONS,POST"
    };

    try {
        const body = JSON.parse(event.body);
        const { fileKey, uploadId } = body;
        const bucketName = process.env.BUCKET_NAME;

        if (!fileKey || !uploadId) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ message: "Missing required fields" })
            };
        }

        const command = new AbortMultipartUploadCommand({
            Bucket: bucketName,
            Key: fileKey,
            UploadId: uploadId,
        });

        await s3.send(command);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ status: "aborted" }),
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
