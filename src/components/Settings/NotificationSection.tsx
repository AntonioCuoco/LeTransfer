import { BellOutlined } from "@ant-design/icons";
import { SettingsSection } from "./SettingsSection";
import { SettingsToggle } from "./SettingsToggle";
import { useSettings } from "@/src/hooks/useSettings";

export default function NotificationSection() {
    const {
        settings,
        updateNotifications,
    } = useSettings();

    return (
        <div className="flex flex-col gap-6">
            {/* Notifiche */}
            <SettingsSection
                title="Notifiche"
                description="Gestisci le tue preferenze di notifica"
                icon={<BellOutlined />}
            >
                <SettingsToggle
                    label="Notifiche Email"
                    description="Ricevi aggiornamenti via email"
                    checked={settings.notifications.emailNotifications}
                    onChange={(checked) => updateNotifications({ emailNotifications: checked })}
                />
                <SettingsToggle
                    label="Upload Completato"
                    description="Notifica quando un upload è completato"
                    checked={settings.notifications.uploadComplete}
                    onChange={(checked) => updateNotifications({ uploadComplete: checked })}
                    disabled={!settings.notifications.emailNotifications}
                />
                <SettingsToggle
                    label="Download Completato"
                    description="Notifica quando i tuoi file vengono scaricati"
                    checked={settings.notifications.downloadComplete}
                    onChange={(checked) => updateNotifications({ downloadComplete: checked })}
                    disabled={!settings.notifications.emailNotifications}
                />
                <SettingsToggle
                    label="File Ricevuto"
                    description="Notifica quando ricevi un file condiviso"
                    checked={settings.notifications.shareReceived}
                    onChange={(checked) => updateNotifications({ shareReceived: checked })}
                    disabled={!settings.notifications.emailNotifications}
                />
                <SettingsToggle
                    label="Link in Scadenza"
                    description="Avviso quando un link sta per scadere"
                    checked={settings.notifications.linkExpiring}
                    onChange={(checked) => updateNotifications({ linkExpiring: checked })}
                    disabled={!settings.notifications.emailNotifications}
                />
            </SettingsSection>
        </div>
    );
}