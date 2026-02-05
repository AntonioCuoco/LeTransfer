import * as React from "react";
import {
    Body,
    Container,
    Head,
    Heading,
    Hr,
    Html,
    Link,
    Preview,
    Text,
    Tailwind,
} from "@react-email/components";

interface TicketCreatedProps {
    senderName: string;
    username: string;
    fileName: string;
    downloadUrl?: string;
    viewUrl?: string;
    trackingPixelUrl?: string; // es. https://api.example.com/email/open.gif?tid=...
}

export const TicketCreated = ({ senderName, username, fileName, downloadUrl = "", viewUrl = "", trackingPixelUrl = "" }: TicketCreatedProps) => {
    return (
        <Html>
            <Head />
            <Preview>Support Ticket Confirmation Email 🎉</Preview>
            <Tailwind>
                <Body className='h-screen bg-white my-auto mx-auto font-sans px-2 flex flex-col items-center justify-center'>
                    <Container className='border border-solid border-[#eaeaea] rounded my-[40px] mx-auto p-[20px] max-w-[465px]'>
                        <Heading className='text-black text-[24px] font-normal text-center p-0 my-[30px] mx-0'>
                            User {senderName} has sent you a new file
                        </Heading>
                        <Text className='text-black text-[14px] leading-[24px]'>
                            Hello <strong>{username}</strong>,
                        </Text>
                        <Text className='text-black text-[14px] leading-[24px]'>
                            the user <strong>{senderName}</strong> has sent you a new file.
                        </Text>

                        <div className="border border-solid border-[#eaeaea] rounded-md p-4 gap-4 flex flex-col">
                            <p className="text-black text-sm leading-[24px] mt-0 mb-2 font-medium">{fileName}</p>
                            <div className="flex flex-col gap-3">
                                {downloadUrl && (
                                    <Link
                                        href={downloadUrl}
                                        className="bg-[#724CF9] text-white px-4 py-2 rounded-md text-center no-underline hover:bg-[#5a3fd4] transition-colors"
                                    >
                                        📥 Download File
                                    </Link>
                                )}
                                {viewUrl && viewUrl !== downloadUrl && (
                                    <Link
                                        href={viewUrl}
                                        className="bg-[#10b981] text-white px-4 py-2 rounded-md text-center no-underline hover:bg-[#059669] transition-colors"
                                    >
                                        👁️ View File
                                    </Link>
                                )}
                                {!downloadUrl && !viewUrl && (
                                    <p className="text-red-500 text-sm">⚠️ File links not available</p>
                                )}
                            </div>
                        </div>

                        <Hr className='border border-solid border-[#eaeaea] my-[26px] mx-0 w-full' />
                        <Text className='text-[#666666] text-[12px] leading-[24px]'>
                            This message was intended for{" "}
                            <span className='text-black'>{username}</span>. If you aren't the receiver of this file, please ignore this email.
                        </Text>

                        {/* Tracking pixel invisibile per apertura email (potrebbe essere bloccato dai client) */}
                        {trackingPixelUrl ? (
                            <img src={trackingPixelUrl} width="1" height="1" alt="" style={{ display: 'none' }} />
                        ) : null}
                    </Container>
                </Body>
            </Tailwind>
        </Html>
    );
};

TicketCreated.PreviewProps = {
    fileName: "file.pdf",
    senderName: "John Doe",
    username: "alanturing",
    downloadUrl: "https://example.com/share/abc",
    viewUrl: "https://example.com/view/abc",
    trackingPixelUrl: "https://api.example.com/email/open.gif?tid=preview",
} as TicketCreatedProps;

export default TicketCreated;