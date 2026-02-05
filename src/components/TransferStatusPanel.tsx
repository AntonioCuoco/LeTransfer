import React from 'react';
import { useTransfer } from '../contexts/TransferContext';
import {
    CloudUploadOutlined,
    CloudDownloadOutlined,
    PauseCircleOutlined,
    PlayCircleOutlined,
    StopOutlined,
    CheckCircleOutlined,
    DeleteOutlined
} from '@ant-design/icons';

export const TransferStatusPanel: React.FC = () => {
    const { transfers, pauseTransfer, resumeTransfer, cancelTransfer, clearCompleted } = useTransfer();

    // Calculate stats
    const activeCount = transfers.filter(t =>
        ['initializing', 'uploading', 'downloading', 'paused'].includes(t.status)
    ).length;

    const downloadsCount = transfers.filter(t => t.type === 'download' && ['initializing', 'downloading', 'paused'].includes(t.status)).length;

    // Helper to format bytes
    const formatBytes = (bytes: number, decimals = 2) => {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    };

    return (
        <div className="flex flex-col w-full gap-4 transition-all duration-300">
            <div className="flex justify-between items-center">
                <div>
                    <p className="font-semibold text-[#DBD4D3]">Stato Trasferimenti</p>
                    {downloadsCount > 0 && (
                        <p className="text-xs text-[#724CF9]">{downloadsCount} Download in corso</p>
                    )}
                </div>
                {transfers.some(t => ['completed', 'cancelled', 'error'].includes(t.status)) && (
                    <button
                        onClick={clearCompleted}
                        className="text-xs text-[#9ca3af] hover:text-white flex items-center gap-1"
                    >
                        <DeleteOutlined /> Pulisci
                    </button>
                )}
            </div>

            <div className="flex flex-col gap-3 overflow-y-auto pr-2 custom-scrollbar flex-1 min-h-0">
                {transfers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-[#4a4554] border border-dashed border-[#4a4554] rounded-lg">
                        <p>Nessun trasferimento attivo</p>
                    </div>
                ) : (
                    transfers.map(transfer => (
                        <div key={transfer.id} className="bg-[#2c2638] p-3 rounded border border-[#4a4554] flex flex-col gap-2 relative group">
                            {/* Header Row */}
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    {transfer.type === 'upload' ? (
                                        <CloudUploadOutlined className="!text-green-400" />
                                    ) : (
                                        <CloudDownloadOutlined className="!text-green-400" />
                                    )}
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-[#DBD4D3] font-medium text-sm truncate" title={transfer.name}>
                                            {transfer.name}
                                        </span>
                                        <span className="text-xs text-[#9ca3af]">
                                            {formatBytes(transfer.progress.loadedBytes)} / {formatBytes(transfer.progress.totalBytes)}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-xs font-mono text-white">
                                    {transfer.status === 'completed' ? '100%' : `${transfer.progress.percentage.toFixed(1)}%`}
                                </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="h-1.5 w-full bg-[#1a1625] rounded-full overflow-hidden">
                                <div
                                    className={`h-full transition-all duration-300 rounded-full 
                                        ${transfer.status === 'error' || transfer.status === 'cancelled' ? 'bg-red-500' :
                                            transfer.status === 'completed' ? 'bg-green-500' :
                                                transfer.type === 'download' ? 'bg-green-400' : 'bg-[#724CF9]'}
                                        ${(transfer.status === 'uploading' || transfer.status === 'downloading') ? 'animate-pulse' : ''}
                                    `}
                                    style={{ width: `${transfer.progress.percentage}%` }}
                                ></div>
                            </div>

                            {/* Status & Controls Row */}
                            <div className="flex justify-between items-center text-xs">
                                <div className="flex items-center gap-2">
                                    {transfer.status === 'uploading' || transfer.status === 'downloading' ? (
                                        <span className="text-[#9ca3af]">
                                            {transfer.progress.speed ? `${formatBytes(transfer.progress.speed)}/s` : 'Calcolo...'}
                                        </span>
                                    ) : (
                                        <span className={`capitalize ${transfer.status === 'error' ? 'text-red-400' :
                                            transfer.status === 'completed' ? 'text-green-400' : 'text-[#9ca3af]'
                                            }`}>
                                            {transfer.status === 'paused' ? 'In Pausa' :
                                                transfer.status === 'queued' ? 'In Coda' :
                                                    transfer.status === 'cancelled' ? 'Annullato' :
                                                        transfer.status === 'error' ? (transfer.error?.message || 'Errore') :
                                                            transfer.status === 'completed' ? 'Completato' : transfer.status}
                                        </span>
                                    )}
                                </div>

                                <div className="flex gap-2">
                                    {(transfer.status === 'uploading' || transfer.status === 'downloading') && (
                                        <>
                                            {/* Pause only available if control exists */}
                                            {transfer.controls?.pause && (
                                                <button onClick={() => pauseTransfer(transfer.id)} title="Pausa" className="text-yellow-500 hover:text-yellow-400">
                                                    <PauseCircleOutlined />
                                                </button>
                                            )}
                                            <button onClick={() => cancelTransfer(transfer.id)} title="Annulla" className="text-red-500 hover:text-red-400">
                                                <StopOutlined />
                                            </button>
                                        </>
                                    )}
                                    {transfer.status === 'paused' && (
                                        <button onClick={() => resumeTransfer(transfer.id)} title="Riprendi" className="text-green-500 hover:text-green-400">
                                            <PlayCircleOutlined />
                                        </button>
                                    )}
                                    {/* For completed/cancelled items, maybe a remove button specifically? clearCompleted handles it globally */}
                                    {['completed', 'cancelled', 'error'].includes(transfer.status) && (
                                        <CheckCircleOutlined className={transfer.status === 'completed' ? '!text-green-400' : '!text-transparent'} />
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
