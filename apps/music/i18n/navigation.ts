import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/** locale 感知的导航原语：站内链接/跳转一律用这里的版本 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
    createNavigation(routing);
