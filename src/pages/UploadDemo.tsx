import React from 'react';
import { MultipartFileUploader } from '../components/MultipartFileUploader';

const UploadDemo = () => {
    // NOTE: This URL comes from the CloudFormation Output 'ApiBaseUrl'
    // You must replace this with your actual deployed API Gateway URL.
    const API_BASE_URL = import.meta.env.VITE_API_MULTIPART_URL || 'https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com/dev/upload/multipart';

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-8">
            <div className="max-w-4xl w-full text-center mb-12">
                <h1 className="text-4xl font-bold mb-4">S3 Multipart Upload Demo</h1>
                <p className="text-gray-400 mb-8">
                    This page demonstrates the client-side multipart upload hook.
                    <br />
                    Please ensure you have deployed the backend stack and updated the API URL.
                </p>

                {API_BASE_URL.includes('YOUR_API_ID') && (
                    <div className="bg-yellow-500/10 border border-yellow-500/50 p-4 rounded-lg mb-8 text-yellow-200 text-left">
                        <strong>⚠️ Configuration Required:</strong><br />
                        1. Deploy the CloudFormation stack in <code>backend_infra/multipart-upload-stack.yaml</code>.<br />
                        2. Copy the <code>ApiBaseUrl</code> from the CloudFormation Outputs.<br />
                        3. Set it in your <code>.env</code> file as <code>VITE_API_MULTIPART_URL</code> or update this file.
                    </div>
                )}
            </div>

            <MultipartFileUploader
                apiBaseUrl={API_BASE_URL}
                onUploadComplete={(key) => alert(`Upload Success! File Key: ${key}`)}
            />
        </div>
    );
};

export default UploadDemo;
