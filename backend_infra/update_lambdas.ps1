# PowerShell script to update Lambda functions directly from local files
# Assumes 'aws' CLI is installed and configured.
# Assumes StackName is "LeTransferMultipartStack".

$StackName = "LeTransferMultipartStack"
$LambdaDir = "$PSScriptRoot\lambdas"
$TempDir = "$PSScriptRoot\temp_build"

Write-Host "Starting Lambda Direct Update..."
Write-Host "Target Stack: $StackName"

# Ensure temp directory exists
if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force }
New-Item -ItemType Directory -Path $TempDir | Out-Null

function Update-Lambda {
    param (
        [string]$LogicalId,
        [string]$SourceFile
    )

    Write-Host "`nProcessing $LogicalId..."
    
    # 1. Get Physical Function Name
    try {
        $FunctionName = aws cloudformation describe-stack-resources --stack-name $StackName --logical-resource-id $LogicalId --query "StackResources[0].PhysicalResourceId" --output text
        if (-not $FunctionName -or $FunctionName -eq "None") {
            Write-Error "Could not find physical resource ID for $LogicalId."
            return
        }
        Write-Host "  Physical Name: $FunctionName"
    }
    catch {
        Write-Error "  Failed to describe stack resource. Is the stack name correct?"
        return
    }

    # 2. Prepare Zip
    # The Lambda Handler is likely configured as 'index.handler' in CloudFormation.
    # So we must rename the source file to 'index.js' in the zip.
    $SourcePath = Join-Path $LambdaDir $SourceFile
    $DestPath = Join-Path $TempDir "index.js"
    $ZipPath = Join-Path $TempDir "$LogicalId.zip"

    if (-not (Test-Path $SourcePath)) {
        Write-Error "  Source file not found: $SourcePath"
        return
    }

    Copy-Item $SourcePath $DestPath
    
    # Create Zip
    Compress-Archive -Path $DestPath -DestinationPath $ZipPath -Force

    # 3. Update Function Code
    Write-Host "  Uploading code..."
    try {
        aws lambda update-function-code --function-name $FunctionName --zip-file "fileb://$ZipPath" --output json | Out-Null
        Write-Host "  Success! Updated $LogicalId."
    }
    catch {
        Write-Error "  Failed to update function code."
        Write-Error $_
    }
    
    # Cleanup for next iteration
    Remove-Item $DestPath -Force
    Remove-Item $ZipPath -Force
}

# Update InitiateUploadFunction
Update-Lambda -LogicalId "InitiateUploadFunction" -SourceFile "initiate-upload.js"

# Update CompleteUploadFunction
Update-Lambda -LogicalId "CompleteUploadFunction" -SourceFile "complete-upload.js"

# Update GetPresignedUrlsFunction (Optional, but good for consistency)
Update-Lambda -LogicalId "GetPresignedUrlsFunction" -SourceFile "get-presigned-urls.js"

# Update AbortUploadFunction (Optional)
Update-Lambda -LogicalId "AbortUploadFunction" -SourceFile "abort-upload.js"

# Clean up temp dir
Remove-Item $TempDir -Recurse -Force
Write-Host "`nDone."
