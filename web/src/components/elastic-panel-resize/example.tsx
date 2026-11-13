import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ElasticPanelResize } from "./ElasticPanelResize";

export default function App() {
    return <ElasticPanelResize />;
}

const root = createRoot(document.getElementById("app")!);
root.render(<StrictMode><App /></StrictMode>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
