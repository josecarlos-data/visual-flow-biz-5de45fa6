import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useTheme } from "@/hooks/useTheme";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvisosCabecera } from "@/components/AvisosCabecera";

export function AppLayout({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="flex h-14 items-center border-b px-4 justify-between">
            <SidebarTrigger />
            <div className="flex items-center gap-1">
              <AvisosCabecera />
              <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8">
                {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </Button>
            </div>
          </header>
          <main className="flex-1 p-3 sm:p-6 overflow-x-hidden">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
