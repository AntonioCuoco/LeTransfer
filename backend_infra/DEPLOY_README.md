# Deployment Instructions: S3 Multipart Upload Backend

This guide explains how to deploy the CloudFormation stack, connecting to your **existing S3 Bucket** and **IAM Role**.

## Prerequisites
1.  **AWS CLI Installed**: [Install Link](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
2.  **AWS Credentials Configured**: `aws configure`
3.  **Existing Resources Info**:
    *   **Bucket Name**: `letransferbucket` (or your custom name)
    *   **IAM Role ARN**: The ARN of your existing Lambda role (e.g., `arn:aws:iam::123456789:role/MyLambdaRole`)

## Deployment Steps

1.  **Navigate to the infrastructure directory**:
    ```bash
    cd backend_infra
    ```

2.  **Deploy the Stack**:
    You MUST provide the `LambdaExecutionRoleArn`. The bucket name defaults to `letransferbucket`, but you can override it if needed.

    Replace `YOUR_ROLE_ARN_HERE` with your actual IAM Role ARN.

    ```bash
    aws cloudformation deploy \
      --template-file multipart-upload-stack.yaml \
      --stack-name LeTransferMultipartStack \
      --parameter-overrides \
        LambdaExecutionRoleArn="YOUR_ROLE_ARN_HERE" \
        BucketName="letransferbucket"
    ```

3.  **Wait for completion**:
    This takes about 1 minute since it only creates the API Gateway and Lambdas.

4.  **Get the API URL**:
    ```bash
    aws cloudformation describe-stacks --stack-name LeTransferMultipartStack --query "Stacks[0].Outputs[?OutputKey=='ApiBaseUrl'].OutputValue" --output text
    ```

## Post-Deployment Configuration

1.  **Copy the URL**: The command above will print a URL.
2.  **Update Frontend**:
    *   Open `.env` (or create it) in the project root.
    *   Add/Update the variable:
        ```env
        VITE_API_MULTIPART_URL=https://xyz123.execute-api.eu-south-1.amazonaws.com/dev/upload/multipart
        ```

## Troubleshooting
*   **Permissions**: Ensure your existing IAM Role (`YOUR_ROLE_ARN_HERE`) has `s3:PutObject` and `s3:AbortMultipartUpload` permissions for the bucket `letransferbucket`.
*   **CORS**: Ensure your existing S3 Bucket has CORS enabled.
