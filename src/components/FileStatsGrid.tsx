import { Card, CardContent } from "@/src/components/ui/card";
import {
  UploadOutlined,
  DownloadOutlined,
  SendOutlined,
  InboxOutlined,
  CiCircleOutlined,
  DeleteOutlined
} from "@ant-design/icons";

interface FileStats {
  uploaded: number;
  downloaded: number;
  sent: number;
  received: number;
  archived: number;
  deleted: number;
}

interface FileStatsGridProps {
  stats: FileStats;
}

const statsConfig = [
  {
    key: 'uploaded' as keyof FileStats,
    label: 'File Caricati',
    icon: UploadOutlined,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50'
  },
  {
    key: 'downloaded' as keyof FileStats,
    label: 'File Scaricati',
    icon: DownloadOutlined,
    color: 'text-green-600',
    bgColor: 'bg-green-50'
  },
  {
    key: 'sent' as keyof FileStats,
    label: 'File Inviati',
    icon: SendOutlined,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50'
  },
  {
    key: 'received' as keyof FileStats,
    label: 'File Ricevuti',
    icon: InboxOutlined,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50'
  },
  {
    key: 'archived' as keyof FileStats,
    label: 'File Archiviati',
    icon: CiCircleOutlined,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50'
  },
  {
    key: 'deleted' as keyof FileStats,
    label: 'File Eliminati',
    icon: DeleteOutlined,
    color: 'text-red-600',
    bgColor: 'bg-red-50'
  }
];

export function FileStatsGrid({ stats }: FileStatsGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-8">
      {statsConfig.map(({ key, label, icon: Icon, color, bgColor }) => (
        <Card key={key} className="group hover:shadow-card transition-all duration-300 hover:-translate-y-1 border-0 shadow-card bg-[#3c364c]">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className={`p-3 rounded-xl ${bgColor} group-hover:scale-110 transition-transform duration-300 flex items-center justify-center`}>
                <Icon className={`${color}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-[#DBD4D3]">{label}</p>
                <p className="text-2xl font-bold text-white">{stats[key].toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}