import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/src/components/ui/table";
import { Button, Popconfirm, Tooltip, ConfigProvider, Modal, Input, DatePicker, message, Badge } from "antd";
import {
    CopyOutlined,
    ReloadOutlined,
    DeleteOutlined,
    LinkOutlined,
    SettingOutlined,
    LockOutlined,
    UnlockOutlined,
    ClockCircleOutlined,
    DownloadOutlined
} from "@ant-design/icons";
import { useState } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import weekday from "dayjs/plugin/weekday";
import localeData from "dayjs/plugin/localeData";
import type { SharedLink } from "../types";

dayjs.extend(relativeTime);
dayjs.extend(weekday);
dayjs.extend(localeData);

interface SharedLinksTableProps {
    links: SharedLink[];
    onRevoke: (id: string) => Promise<boolean>;
    onRegenerate: (id: string) => Promise<boolean>;
    onUpdate: (id: string, updates: Partial<SharedLink>) => Promise<boolean>;
    onDelete?: (id: string) => Promise<boolean>;
}

export function SharedLinksTable({ links, onRevoke, onRegenerate, onUpdate, onDelete }: SharedLinksTableProps) {
    const [settingsModalVisible, setSettingsModalVisible] = useState(false);
    const [currentLink, setCurrentLink] = useState<SharedLink | null>(null);


    // Settings Form State
    const [newPassword, setNewPassword] = useState("");
    const [newExpiry, setNewExpiry] = useState<dayjs.Dayjs | null>(null);
    const [updating, setUpdating] = useState(false);

    const handleCopyLink = (url: string) => {
        navigator.clipboard.writeText(url);
        message.success("Link copiato negli appunti!");
    };

    const openSettings = (link: SharedLink) => {
        setCurrentLink(link);
        setNewPassword(""); // Don't show current password
        setNewExpiry(link.expiresAt ? dayjs(link.expiresAt) : null);
        setSettingsModalVisible(true);
    };

    const handleSaveSettings = async () => {
        if (!currentLink) return;

        setUpdating(true);
        const updates: Partial<SharedLink> = {};
        if (newPassword) updates.isPasswordProtected = true;
        if (newExpiry) updates.expiresAt = newExpiry.toISOString();

        const success = await onUpdate(currentLink.id, {
            ...updates,
            // @ts-ignore: Assuming API accepts password field
            password: newPassword || undefined
        });

        setUpdating(false);
        if (success) {
            message.success("Impostazioni aggiornate");
            setSettingsModalVisible(false);
        } else {
            message.error("Errore durante l'aggiornamento");
        }
    };

    const renderStatus = (link: SharedLink) => {
        if (link.revokedAt) {
            return <Badge color="#ff4d4f" className="!text-[#DBD4D3]">Revocato</Badge>;
        }
        if (dayjs(link.expiresAt).isBefore(dayjs())) {
            return <Badge color="#eab308" className="!text-[#DBD4D3]">Scaduto</Badge>;
        }
        return <Badge color="#52c41a" className="!text-[#DBD4D3]">Attivo</Badge>;
    };

    return (
        <>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="text-white">File</TableHead>
                        <TableHead className="text-white text-center">Sicurezza</TableHead>
                        <TableHead className="text-white text-center">Download</TableHead>
                        <TableHead className="text-white">Scadenza</TableHead>
                        <TableHead className="text-white">Stato</TableHead>
                        <TableHead className="text-white">Creato il</TableHead>
                        <TableHead className="text-white">Azioni</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {links.map((link) => (
                        <TableRow key={link.id} className="hover:bg-muted/50">
                            <TableCell className="flex items-center space-x-3 overflow-hidden">
                                <LinkOutlined className="!text-white" />
                                <Tooltip title={link.url}>
                                    <span className="font-medium text-white truncate cursor-help max-w-[200px]">{link.fileName}</span>
                                </Tooltip>
                            </TableCell>
                            <TableCell className="text-center">
                                {link.isPasswordProtected ? (
                                    <Tooltip title="Protetto da password">
                                        <LockOutlined className="!text-white" />
                                    </Tooltip>
                                ) : (
                                    <Tooltip title="Nessuna password">
                                        <UnlockOutlined className="!text-white" />
                                    </Tooltip>
                                )}
                            </TableCell>
                            <TableCell className="text-[#DBD4D3]">
                                <div className="flex items-center justify-center gap-1">
                                    <DownloadOutlined /> {link.downloadCount}
                                    {link.maxDownloads ? ` / ${link.maxDownloads}` : ''}
                                </div>
                            </TableCell>
                            <TableCell className="text-[#DBD4D3] truncate">
                                <Tooltip title={dayjs(link.expiresAt).format("DD/MM/YYYY HH:mm")}>
                                    <span className="flex items-center gap-1 cursor-help">
                                        <ClockCircleOutlined /> {dayjs(link.expiresAt).fromNow()}
                                    </span>
                                </Tooltip>
                            </TableCell>
                            <TableCell>{renderStatus(link)}</TableCell>
                            <TableCell className="text-[#DBD4D3]">
                                {dayjs(link.createdAt).format("DD/MM/YYYY")}
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center space-x-2">
                                    {(!link.revokedAt && !dayjs(link.expiresAt).isBefore(dayjs())) ? (
                                        <>
                                            <Tooltip title="Copia Link">
                                                <Button
                                                    type="text"
                                                    icon={<CopyOutlined />}
                                                    className="!text-[#DBD4D3] hover:!text-white"
                                                    onClick={() => handleCopyLink(link.url)}
                                                />
                                            </Tooltip>

                                            <Tooltip title="Impostazioni">
                                                <Button
                                                    type="text"
                                                    icon={<SettingOutlined />}
                                                    className="!text-[#DBD4D3] hover:!text-[#724CF9]"
                                                    onClick={() => openSettings(link)}
                                                />
                                            </Tooltip>

                                            <Popconfirm
                                                title="Rigenera Link"
                                                description="Il vecchio link smetterà di funzionare. Continuare?"
                                                onConfirm={() => onRegenerate(link.id)}
                                            >
                                                <Tooltip title="Rigenera">
                                                    <Button
                                                        type="text"
                                                        icon={<ReloadOutlined />}
                                                        className="!text-[#DBD4D3] hover:!text-blue-400"
                                                    />
                                                </Tooltip>
                                            </Popconfirm>

                                            <Popconfirm
                                                title="Revoca Link"
                                                description="Il link non sarà più accessibile. Continuare?"
                                                onConfirm={() => onRevoke(link.id)}
                                                okButtonProps={{ danger: true }}
                                            >
                                                <Tooltip title="Revoca">
                                                    <Button
                                                        type="text"
                                                        danger
                                                        icon={<DeleteOutlined />}
                                                        className="!text-red-400 hover:!text-red-300"
                                                    />
                                                </Tooltip>
                                            </Popconfirm>
                                        </>
                                    ) : (
                                        <>
                                            <Popconfirm
                                                title="Rigenera Link"
                                                description="Verrà creato un nuovo link valido. Continuare?"
                                                onConfirm={() => onRegenerate(link.id)}
                                            >
                                                <Tooltip title="Rigenera">
                                                    <Button
                                                        type="text"
                                                        icon={<ReloadOutlined />}
                                                        className="!text-[#DBD4D3] hover:!text-blue-400"
                                                    />
                                                </Tooltip>
                                            </Popconfirm>

                                            <Popconfirm
                                                title="Elimina dalla lista"
                                                description="Il link verrà rimosso definitivamente dalla visualizzazione. Continuare?"
                                                onConfirm={() => onDelete?.(link.id)}
                                                okButtonProps={{ danger: true }}
                                            >
                                                <Tooltip title="Elimina">
                                                    <Button
                                                        type="text"
                                                        danger
                                                        icon={<DeleteOutlined />}
                                                        className="!text-red-400 hover:!text-red-300"
                                                    />
                                                </Tooltip>
                                            </Popconfirm>
                                        </>
                                    )}
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                    {links.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={7} className="text-center py-8 text-[#9ca3af]">
                                Nessun link generato trovato
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>

            <ConfigProvider
                theme={{
                    token: {
                        colorBgElevated: '#2c2638',
                        colorText: '#fff',
                        colorTextHeading: '#fff',
                        colorBorder: '#4a4554',
                        colorIcon: '#fff',
                        colorBgContainer: '#1a1625',
                    },
                    components: {
                        Modal: {
                            contentBg: '#2c2638',
                            headerBg: '#2c2638',
                        },
                        DatePicker: {
                            colorBgContainer: '#1a1625',
                            colorText: '#fff',
                            colorTextPlaceholder: '#676178',
                            colorBorder: '#4a4554',
                        },
                        Input: {
                            colorBgContainer: '#1a1625',
                            colorText: '#fff',
                            colorBorder: '#4a4554',
                            colorTextPlaceholder: '#676178'
                        }
                    }
                }}
            >
                <Modal
                    title="Impostazioni Link"
                    open={settingsModalVisible}
                    onCancel={() => setSettingsModalVisible(false)}
                    onOk={handleSaveSettings}
                    confirmLoading={updating}
                    okText="Salva"
                    cancelText="Annulla"
                    okButtonProps={{ className: '!bg-[#724CF9] shadow-none' }}
                    cancelButtonProps={{ className: 'hover:!border-[#724CF9] hover:!text-[#724CF9] shadow-none' }}
                    centered
                >
                    <div className="space-y-4 py-4">
                        <div>
                            <label className="block text-sm font-medium text-[#DBD4D3] mb-1">
                                Nuova Password (lascia vuoto per mantenere)
                            </label>
                            <Input.Password
                                placeholder="Inserisci nuova password"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#DBD4D3] mb-1">
                                Data di Scadenza
                            </label>
                            <DatePicker
                                className="w-full"
                                showTime
                                value={newExpiry}
                                onChange={val => setNewExpiry(val)}
                                minDate={dayjs()}
                            />
                        </div>
                    </div>
                </Modal>
            </ConfigProvider>
        </>
    );
}
