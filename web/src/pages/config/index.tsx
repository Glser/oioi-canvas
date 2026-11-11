import { useTranslation } from "react-i18next";
import { AppConfigPanel } from "@/components/layout/app-config-modal";
import styles from "@/components/layout/workbench.module.css";

export default function ConfigPage() {
    const { t } = useTranslation();
    return (
        <main className={styles.library}>
            <section className={`${styles.panel} ${styles.configPanel} min-h-full`}>
                <header className={styles.libraryHeader}>
                    <div><h1>{t("config.title")}</h1><p>{t("config.description")}</p></div>
                </header>
                <AppConfigPanel />
            </section>
        </main>
    );
}
