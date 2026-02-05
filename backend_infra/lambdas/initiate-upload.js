const { S3Client, CreateMultipartUploadCommand } = require("@aws-sdk/client-s3");

const s3 = new S3Client({});

exports.handler = async (event) => {

    // Handle CORS
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "OPTIONS,POST"
    };

    try {
        const body = JSON.parse(event.body);
        const { fileName, fileType } = body;
        const bucketName = process.env.BUCKET_NAME;


        if (!fileName || !fileType) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ message: "Missing fileName or fileType" })
            };
        }

        const { userId } = body;

        if (!userId) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ message: "Missing userId" })
            };
        }

        const fileKey = `uploads/files/${userId}/${fileName}`;

        const command = new CreateMultipartUploadCommand({
            Bucket: bucketName,
            Key: fileKey,
            ContentType: fileType,
        });

        const { UploadId } = await s3.send(command);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ uploadId: UploadId, fileKey }),
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
