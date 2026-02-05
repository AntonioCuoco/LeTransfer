import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Badge, Button, Popconfirm, Tooltip } from "antd";
import {
  FileTextOutlined,
  IeOutlined,
  VideoCameraAddOutlined,
  MinusOutlined,
  CiCircleOutlined,
  FileOutlined,
  DeleteOutlined,
  DownloadOutlined,
  ShareAltOutlined,
  TeamOutlined,
  UserOutlined
} from "@ant-design/icons";

import type { DynamoDBFile, SharedRecipient } from "../types";

interface FileData {
  id: string;
  name: string;
  type: string;
  size: string;
  status: 'uploaded' | 'downloaded' | 'sent' | 'received' | 'archived' | 'deleted';
  date: string;
  recipient?: string;
  originalFile?: DynamoDBFile;
  sharedWith?: SharedRecipient[];
  isShared?: boolean;
  isReceived?: boolean;
  senderEmail?: string;
}

interface FilesTableProps {
  files: FileData[];
  hideHeader?: boolean;
  onDeleteFile?: (fileId: string) => void;
  onDownloadFile?: (file: DynamoDBFile) => void;
  onShareFile?: (file: DynamoDBFile) => void;
}

const getFileIcon = (type: string) => {
  if (type.includes('image')) return <IeOutlined className="w-4 h-4 !text-white" />;
  if (type.includes('video')) return <VideoCameraAddOutlined className="w-4 h-4 !text-white" />;
  if (type.includes('audio')) return <MinusOutlined className="w-4 h-4 !text-white" />;
  if (type.includes('zip') || type.includes('rar')) return <CiCircleOutlined className="w-4 h-4 !text-white" />;
  if (type.includes('text') || type.includes('document')) return <FileTextOutlined className="w-4 h-4 !text-white" />;
  return <FileOutlined className="w-4 h-4 !text-white" />;
};

const getStatusBadge = (status: FileData['status']) => {
  const config = {
    uploaded: { label: 'Caricato', color: '#fff' },
    downloaded: { label: 'Scaricato', color: '#fff' },
    sent: { label: 'Inviato', color: '#fff' },
    received: { label: 'Ricevuto', color: '#52c41a' },
    archived: { label: 'Archiviato', color: '#fff' },
    deleted: { label: 'Eliminato', color: '#fff' }
  };

  const { label, color } = config[status];
  return <Badge color={color} className="!text-white">{label}</Badge>;
};

// Componente per il badge di condivisione con tooltip
const SharedBadge = ({ sharedWith }: { sharedWith: SharedRecipient[] }) => {
  const tooltipContent = (
    <div className="p-2">
      <p className="font-semibold mb-2 text-white">Condiviso con:</p>
      <ul className="list-none p-0 m-0 space-y-1">
        {sharedWith.map((recipient, index) => (
          <li key={index} className="flex items-center gap-2 text-sm">
            <UserOutlined className="text-[#724CF9]" />
            <span>{recipient.email}</span>
            <span className="text-[#9ca3af] text-xs">
              ({new Date(recipient.sharedAt).toLocaleDateString('it-IT')})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <Tooltip
      title={tooltipContent}
      placement="top"
      overlayInnerStyle={{
        backgroundColor: '#2c2638',
        border: '1px solid #4a4554',
        borderRadius: '8px'
      }}
    >
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#724CF9]/20 text-[#a78bfa] text-xs cursor-help ml-2">
        <TeamOutlined className="text-[#724CF9]" />
        <span>{sharedWith.length}</span>
      </span>
    </Tooltip>
  );
};

// Componente per il badge di file ricevuto
const ReceivedBadge = ({ senderEmail }: { senderEmail?: string }) => {
  return (
    <Tooltip
      title={`Ricevuto da: ${senderEmail || 'Utente sconosciuto'}`}
      placement="top"
      overlayInnerStyle={{
        backgroundColor: '#2c2638',
        border: '1px solid #4a4554',
        borderRadius: '8px'
      }}
    >
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs cursor-help ml-2">
        <UserOutlined className="text-green-500" />
        <span>Ricevuto</span>
      </span>
    </Tooltip>
  );
};

export function FilesTable({ files, hideHeader = false, onDeleteFile, onDownloadFile, onShareFile }: FilesTableProps) {
  // Renderizza il nome del file con badge appropriati
  const renderFileName = (file: FileData) => {
    const fileName = decodeURIComponent(file.name);

    return (
      <div className="flex items-center">
        <Tooltip title={fileName}>
          <span className="font-medium text-white truncate cursor-help max-w-[200px]">
            {fileName}
          </span>
        </Tooltip>
        {file.isShared && file.sharedWith && file.sharedWith.length > 0 && (
          <SharedBadge sharedWith={file.sharedWith} />
        )}
        {file.isReceived && (
          <ReceivedBadge senderEmail={file.senderEmail} />
        )}
      </div>
    );
  };

  // Renderizza le azioni per ogni file
  const renderActions = (file: FileData) => (
    <div className="flex items-center space-x-2">
      {onDownloadFile && file.originalFile && (
        <Tooltip title="Scarica file">
          <Button
            type="text"
            icon={<DownloadOutlined />}
            onClick={() => onDownloadFile(file.originalFile!)}
            className="!text-blue-400 hover:!text-blue-300"
          />
        </Tooltip>
      )}
      {/* Mostra il bottone condividi solo per i file propri (non ricevuti) */}
      {onShareFile && file.originalFile && !file.isReceived && (
        <Tooltip title="Condividi con un utente">
          <Button
            type="text"
            icon={<ShareAltOutlined />}
            onClick={() => onShareFile(file.originalFile!)}
            className="!text-[#724CF9] hover:!text-[#9d7bfa]"
          />
        </Tooltip>
      )}
      {onDeleteFile && !file.isReceived && (
        <Popconfirm
          title="Elimina file"
          description="Sei sicuro di voler eliminare questo file?"
          onConfirm={() => onDeleteFile(file.id)}
          okText="Sì"
          cancelText="No"
          okButtonProps={{ style: { backgroundColor: '#ff4d4f', borderColor: '#ff4d4f' } }}
        >
          <Tooltip title="Elimina file">
            <Button
              type="text"
              danger
              icon={< DeleteOutlined />}
              className="!text-red-400 hover:!text-red-300"
            />
          </Tooltip >
        </Popconfirm >
      )}
    </div >
  );

  if (hideHeader) {
    // Versione senza header per la pagina di profilo
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-white">File</TableHead>
            <TableHead className="text-white">Tipo</TableHead>
            <TableHead className="text-white">Dimensione</TableHead>
            <TableHead className="text-white">Stato</TableHead>
            <TableHead className="text-white">Data</TableHead>
            <TableHead className="text-white">Destinatario/Mittente</TableHead>
            {(onDeleteFile || onDownloadFile || onShareFile) && <TableHead className="text-white">Azioni</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.map((file) => (
            <TableRow key={file.id} className="hover:bg-muted/50">
              <TableCell className="flex items-center space-x-3 overflow-hidden">
                {getFileIcon(file.type)}
                {renderFileName(file)}
              </TableCell>
              <TableCell className="text-[#DBD4D3] truncate">
                <Tooltip title={file.type}>
                  <span className="cursor-help">{file.type}</span>
                </Tooltip>
              </TableCell>
              <TableCell className="text-[#DBD4D3]">{file.originalFile?.formattedSize}</TableCell>
              <TableCell>{getStatusBadge(file.status)}</TableCell>
              <TableCell className="text-[#DBD4D3]">{file.date}</TableCell>
              <TableCell className="text-[#DBD4D3]">
                {file.isReceived ? file.senderEmail || '-' : file.recipient || '-'}
              </TableCell>
              {(onDeleteFile || onDownloadFile || onShareFile) && (
                <TableCell>
                  {renderActions(file)}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  // Versione originale con header per altre pagine
  return (
    <div className="p-8">
      <Card className="shadow-card border-0 bg-[#3c364c]">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-white">Tutti i File</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-white">File</TableHead>
                <TableHead className="text-white">Tipo</TableHead>
                <TableHead className="text-white">Dimensione</TableHead>
                <TableHead className="text-white">Stato</TableHead>
                <TableHead className="text-white">Data</TableHead>
                <TableHead className="text-white">Destinatario/Mittente</TableHead>
                {(onDeleteFile || onDownloadFile || onShareFile) && <TableHead className="text-white">Azioni</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => (
                <TableRow key={file.id} className="hover:bg-muted/50">
                  <TableCell className="flex items-center space-x-3 overflow-hidden">
                    {getFileIcon(file.type)}
                    {renderFileName(file)}
                  </TableCell>
                  <TableCell className="text-[#DBD4D3] truncate">
                    <Tooltip title={file.type}>
                      <span className="cursor-help">{file.type}</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-[#DBD4D3]">{file.size}</TableCell>
                  <TableCell>{getStatusBadge(file.status)}</TableCell>
                  <TableCell className="text-[#DBD4D3]">{file.date}</TableCell>
                  <TableCell className="text-[#DBD4D3]">
                    {file.isReceived ? file.senderEmail || '-' : file.recipient || '-'}
                  </TableCell>
                  {(onDeleteFile || onDownloadFile || onShareFile) && (
                    <TableCell>
                      {renderActions(file)}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}