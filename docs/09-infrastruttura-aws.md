# ☁️ Infrastruttura AWS

## Overview

Backend serverless su AWS con:
- **Lambda Functions** per la logica
- **API Gateway** per le API REST
- **S3** per lo storage file
- **DynamoDB** per metadata
- **Cognito** per autenticazione
- **CloudFormation** per IaC

---

## Architettura Generale

```
┌──────────────────────────────────────────────────────────────────────┐
│                           INTERNET                                    │
└─────────────────────────────────┬────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        API Gateway                                    │
│  ┌────────────────┐  ┌─────────────────┐  ┌───────────────────────┐  │
│  │ Multipart API  │  │  File Sharing   │  │    User Files API     │  │
│  │  /upload/*     │  │   /share        │  │   /user/files/*       │  │
│  └───────┬────────┘  └────────┬────────┘  └───────────┬───────────┘  │
└──────────┼────────────────────┼───────────────────────┼──────────────┘
           │                    │                       │
           ▼                    ▼                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        Lambda Functions                               │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  Multipart Upload:                                            │    │
│  │  - initiate-upload    - get-presigned-urls                   │    │
│  │  - complete-upload    - abort-upload                         │    │
│  └──────────────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  File Operations:                                             │    │
│  │  - upload-file        - delete-file                          │    │
│  │  - get-user-files     - share-file                           │    │
│  │  - get-shared-files   - create-share-link                    │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
           │                    │                       │
           ▼                    ▼                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          AWS Services                                 │
│  ┌─────────────────────────┐    ┌─────────────────────────────────┐  │
│  │          S3             │    │          DynamoDB               │  │
│  │   letransferbucket      │    │   SharedFiles table             │  │
│  │                         │    │   ┌───────────────────────────┐ │  │
│  │   /uploads/files/       │    │   │ PK: id                    │ │  │
│  │   /uploads/profiles/    │    │   │ SK: ownerUserId           │ │  │
│  │                         │    │   │ s3Key, fileName, etc.     │ │  │
│  └─────────────────────────┘    │   └───────────────────────────┘ │  │
│                                 └─────────────────────────────────┘  │
│  ┌─────────────────────────┐                                         │
│  │        Cognito          │                                         │
│  │   User Pool             │                                         │
│  │   - Email/Password      │                                         │
│  │   - Google OAuth        │                                         │
│  └─────────────────────────┘                                         │
└──────────────────────────────────────────────────────────────────────┘
```

---

## CloudFormation Stack

File: `backend_infra/multipart-upload-stack.yaml`

### Parametri

```yaml
Parameters:
  StageName:
    Type: String
    Default: dev
  BucketName:
    Type: String
    Default: letransferbucket
  SharedTableName:
    Type: String
    Default: SharedFiles
```

### Risorse Create

1. **LambdaExecutionRole** - IAM Role con policy per S3 e DynamoDB
2. **MultipartApi** - API Gateway REST API
3. **Lambda Functions** - 4 funzioni per multipart upload
4. **API Resources/Methods** - Endpoint REST
5. **Lambda Permissions** - Autorizzazioni API Gateway → Lambda

---

## Lambda Functions

### 1. initiate-upload

**Trigger:** `POST /upload/multipart/init`

```javascript
exports.handler = async (event) => {
    const { fileName, fileType, userId } = JSON.parse(event.body);
    
    const fileKey = `uploads/files/${userId}/${fileName}`;
    
    const command = new CreateMultipartUploadCommand({
        Bucket: process.env.BUCKET_NAME,
        Key: fileKey,
        ContentType: fileType
    });
    
    const { UploadId } = await s3.send(command);
    
    return {
        statusCode: 200,
        body: JSON.stringify({ uploadId: UploadId, fileKey })
    };
};
```

### 2. get-presigned-urls

**Trigger:** `POST /upload/multipart/urls`

```javascript
exports.handler = async (event) => {
    const { fileKey, uploadId, partNumbers } = JSON.parse(event.body);
    
    const urls = {};
    
    await Promise.all(partNumbers.map(async (part) => {
        const cmd = new UploadPartCommand({
            Bucket: process.env.BUCKET_NAME,
            Key: fileKey,
            UploadId: uploadId,
            PartNumber: part
        });
        urls[part] = await getSignedUrl(s3, cmd, { expiresIn: 3600 });
    }));
    
    return { statusCode: 200, body: JSON.stringify({ urls }) };
};
```

### 3. complete-upload

**Trigger:** `POST /upload/multipart/complete`

```javascript
exports.handler = async (event) => {
    const { fileKey, uploadId, parts } = JSON.parse(event.body);
    
    // Complete S3 multipart upload
    const completeCmd = new CompleteMultipartUploadCommand({
        Bucket: process.env.BUCKET_NAME,
        Key: fileKey,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts }
    });
    
    const { Location, Key } = await s3.send(completeCmd);
    
    // Opzionale: salva metadata in DynamoDB
    
    return { statusCode: 200, body: JSON.stringify({ location, key }) };
};
```

### 4. abort-upload

**Trigger:** `POST /upload/multipart/abort`

```javascript
exports.handler = async (event) => {
    const { fileKey, uploadId } = JSON.parse(event.body);
    
    const cmd = new AbortMultipartUploadCommand({
        Bucket: process.env.BUCKET_NAME,
        Key: fileKey,
        UploadId: uploadId
    });
    
    await s3.send(cmd);
    
    return { statusCode: 200, body: JSON.stringify({ status: "aborted" }) };
};
```

---

## API Gateway Endpoints

| Method | Path | Lambda | Descrizione |
|--------|------|--------|-------------|
| POST | /upload/multipart/init | initiate-upload | Inizia multipart |
| POST | /upload/multipart/urls | get-presigned-urls | Ottieni URL firmati |
| POST | /upload/multipart/complete | complete-upload | Finalizza upload |
| POST | /upload/multipart/abort | abort-upload | Annulla upload |

### CORS Configuration

```yaml
IntegrationResponses:
  - StatusCode: 200
    ResponseParameters:
      method.response.header.Access-Control-Allow-Headers: "'Content-Type,Authorization'"
      method.response.header.Access-Control-Allow-Methods: "'POST,OPTIONS'"
      method.response.header.Access-Control-Allow-Origin: "'*'"
```

---

## IAM Policies

### S3 Access

```yaml
- Effect: Allow
  Action:
    - s3:PutObject
    - s3:GetObject
    - s3:CreateMultipartUpload
    - s3:UploadPart
    - s3:CompleteMultipartUpload
    - s3:AbortMultipartUpload
    - s3:ListMultipartUploadParts
  Resource: !Sub 'arn:aws:s3:::${BucketName}/*'
```

### DynamoDB Access

```yaml
- Effect: Allow
  Action:
    - dynamodb:PutItem
    - dynamodb:GetItem
    - dynamodb:UpdateItem
  Resource: !Sub 'arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/${SharedTableName}'
```

---

## Deploy

### Script PowerShell

File: `backend_infra/update_lambdas.ps1`

```powershell
# Aggiorna codice Lambda
aws lambda update-function-code `
    --function-name InitiateUploadFunction `
    --zip-file fileb://lambdas/initiate-upload.zip

# Deploy stack CloudFormation
aws cloudformation deploy `
    --template-file multipart-upload-stack.yaml `
    --stack-name letransfer-multipart `
    --capabilities CAPABILITY_IAM
```

### Comandi Manuali

```bash
# Deploy stack
aws cloudformation create-stack \
    --stack-name letransfer-multipart \
    --template-body file://multipart-upload-stack.yaml \
    --capabilities CAPABILITY_IAM

# Update stack
aws cloudformation update-stack \
    --stack-name letransfer-multipart \
    --template-body file://multipart-upload-stack.yaml \
    --capabilities CAPABILITY_IAM
```

---

## Output Stack

```yaml
Outputs:
  ApiBaseUrl:
    Description: "Base URL for the API"
    Value: !Sub "https://${MultipartApi}.execute-api.${AWS::Region}.amazonaws.com/${StageName}/upload/multipart"
```

---

## Struttura S3

```
letransferbucket/
├── uploads/
│   ├── files/
│   │   └── {userId}/
│   │       └── {fileName}
│   └── profiles/
│       └── {userId}/
│           └── avatar.{ext}
```

---

## DynamoDB Schema

### SharedFiles Table

| Attributo | Tipo | Descrizione |
|-----------|------|-------------|
| id | String (PK) | UUID del file |
| ownerUserId | String | ID proprietario |
| s3Key | String | Path S3 completo |
| fileName | String | Nome file |
| fileSize | Number | Dimensione in bytes |
| formattedSize | String | Dimensione formattata |
| fileType | String | MIME type |
| uploadedAt | String (ISO) | Data upload |
| status | String | uploaded, shared, deleted |
| isShared | Boolean | Se condiviso |

---

## Considerazioni

1. **Cold Start** - Lambda con Node.js 18.x, ~200ms cold start
2. **Timeout** - 10 secondi per le Lambda (aumentare se necessario)
3. **Memoria** - 128MB default (sufficiente per operazioni semplici)
4. **Logging** - CloudWatch Logs abilitati
5. **Costi** - Pay-per-use, gratuito per < 1M richieste/mese
