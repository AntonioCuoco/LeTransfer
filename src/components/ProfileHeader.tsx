import UploadCircle from "./UploadCircle/UploadCircle";
import { getCurrentUser } from "./getCurrentUser/getCurrentUser";

interface ProfileHeaderProps {
  user: {
    name: string;
    surname: string;
    email: string;
    role: string;
    joinDate: string;
  };
}

export function ProfileHeader() {

  const user = getCurrentUser();

  // Rimuovo la query per le immagini dato che ora usiamo S3 direttamente

  return (
    <div className="relative bg-gradient-subtle min-h-[300px] flex flex-col items-center justify-center p-8">
      {/* <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div> */}
      <div className="absolute inset-0 bg-gradient-primary opacity-5" />

      <div className="relative z-10 flex flex-col items-center space-y-6">
        {/* <Avatar className="w-32 h-32 border-4 border-white shadow-elegant">
          <AvatarImage src={''} alt={`${user.name} ${user.surname}`} className="w-full h-full" />
          <AvatarFallback className="text-2xl font-semibold bg-gradient-primary text-white">
            {user.name[0]}{user.surname[0]}
          </AvatarFallback>
        </Avatar> */}
        <UploadCircle isPreview={false} useS3={true} />

        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-white">
            {user?.name && user?.surname ? `${user.name} ${user.surname}` : user?.username}
          </h1>
          <p className="text-[#DBD4D3]">{user?.email}</p>
          <p className="text-sm text-[#DBD4D3]">
            Membro dal {user?.auth_time ? new Date(user.auth_time * 1000).toLocaleDateString('it-IT') : 'Data sconosciuta'}
          </p>
        </div>
      </div>
    </div>
  );
}